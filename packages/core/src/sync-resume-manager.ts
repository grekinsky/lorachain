/**
 * Sync Resume Manager
 *
 * Persists sync progress to disk and enables resuming interrupted synchronization.
 * UTXO-only implementation with no backwards compatibility.
 *
 * Implementation Notes:
 * - Uses type assertions (as any) to access private properties of UTXOPersistenceManager
 *   and UTXOSyncManager. This is acceptable for internal package usage where both
 *   classes are co-located in the same package and the implementation is tightly coupled.
 * - Future enhancement: Consider adding public accessor methods to eliminate type assertions
 *   if this becomes a maintenance issue or if these classes need to be used externally.
 */

import { EventEmitter } from 'events';
import type { UTXOPersistenceManager } from './persistence.js';
import type { UTXOSyncManager } from './sync-manager.js';
import type { UTXOSyncState, SyncProgress, SyncPeer } from './sync-types.js';
import { Logger } from '@lorachain/shared';
import crypto from 'crypto';

// Resume protocol version - breaking changes allowed
export const SYNC_RESUME_VERSION = '1.0.0';

/**
 * Detailed sync progress for resume capability
 */
export interface SyncResumeState extends SyncProgress {
  // Inherited from SyncProgress:
  // state: UTXOSyncState;
  // currentHeight: number;
  // targetHeight: number;
  // headersDownloaded: number;
  // blocksDownloaded: number;
  // utxosSynced: number;
  // bytesDownloaded: number;
  // bytesUploaded: number;
  // peersConnected: number;
  // estimatedTimeRemaining: number;

  // Additional resume-specific fields:
  resumeVersion: string; // Schema version for compatibility
  savedAt: number; // When progress was saved
  sessionId: string; // Unique sync session ID
  startTime: number; // When sync session started

  // Peer information
  activePeers: SyncPeer[];
  bestPeer?: SyncPeer;

  // Downloaded data tracking
  downloadedHeaders: number[]; // Block heights with headers downloaded
  downloadedBlocks: number[]; // Block heights with blocks downloaded
  downloadedUTXOs: string[]; // UTXO IDs downloaded

  // Strategy state
  activeStrategy: 'internet' | 'mesh' | 'hybrid';
  networkMode: 'internet' | 'mesh' | 'gateway';

  // Error tracking
  retryCount: number;
  lastError?: string;
}

/**
 * Configuration options for sync resume manager
 */
export interface SyncResumeOptions {
  checkpointInterval: number; // Save every N blocks (default: 100)
  maxRetries: number; // Max resume attempts (default: 3)
  validateOnLoad: boolean; // Validate saved state (default: true)
  maxProgressAge: number; // Max age in ms (default: 24 hours)
}

/**
 * Custom error classes
 */
export class SyncResumeError extends Error {
  constructor(
    message: string,
    public readonly progress?: SyncResumeState
  ) {
    super(message);
    this.name = 'SyncResumeError';
  }
}

export class ProgressValidationError extends Error {
  constructor(
    message: string,
    public readonly progress: SyncResumeState
  ) {
    super(message);
    this.name = 'ProgressValidationError';
  }
}

/**
 * Default max progress age in milliseconds (24 hours)
 * Progress saved longer than this will be considered stale
 */
const DEFAULT_MAX_PROGRESS_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Default configuration
 */
const DEFAULT_OPTIONS: SyncResumeOptions = {
  checkpointInterval: 100,
  maxRetries: 3,
  validateOnLoad: true,
  maxProgressAge: DEFAULT_MAX_PROGRESS_AGE_MS,
};

/**
 * SyncResumeManager - Handles sync progress persistence and resume capability
 */
export class SyncResumeManager extends EventEmitter {
  private persistence: UTXOPersistenceManager;
  private syncManager: UTXOSyncManager;
  private checkpointInterval: number;
  private maxRetries: number;
  private validateOnLoad: boolean;
  private maxProgressAge: number;

  private currentSession: string;
  private lastSaveHeight: number;
  private logger: Logger;

  constructor(
    persistence: UTXOPersistenceManager,
    syncManager: UTXOSyncManager,
    options?: Partial<SyncResumeOptions>
  ) {
    super();

    this.persistence = persistence;
    this.syncManager = syncManager;

    // Merge options with defaults
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.checkpointInterval = opts.checkpointInterval;
    this.maxRetries = opts.maxRetries;
    this.validateOnLoad = opts.validateOnLoad;
    this.maxProgressAge = opts.maxProgressAge;

    this.currentSession = this.generateSessionId();
    this.lastSaveHeight = 0;
    this.logger = Logger.getInstance();
  }

  /**
   * Save current sync progress to disk
   */
  async saveProgress(progress?: SyncProgress): Promise<void> {
    try {
      // 1. Get current progress (or use provided)
      const currentProgress = progress || this.syncManager.getSyncProgress();

      // 2. Check if checkpoint interval reached
      if (
        currentProgress.currentHeight <
        this.lastSaveHeight + this.checkpointInterval
      ) {
        return; // Too soon to save
      }

      // 3. Convert to resume state
      const resumeState = this.toResumeState(currentProgress);

      // 4. Save to persistence atomically
      const db = (this.persistence as any).db; // Access private db property
      const syncResumeSublevel = db.sublevel('sync_resume', {
        valueEncoding: 'json',
      });

      await syncResumeSublevel.put(
        `session:${this.currentSession}`,
        resumeState
      );
      await syncResumeSublevel.put('latest_session', this.currentSession);

      // 5. Update tracking
      this.lastSaveHeight = currentProgress.currentHeight;

      // 6. Emit event
      this.emit('progress_saved', resumeState);

      this.logger.debug(
        `Saved sync progress at height ${currentProgress.currentHeight}`,
        {}
      );
    } catch (error) {
      this.logger.error('Failed to save sync progress:', error as any);
      throw new SyncResumeError('Failed to save sync progress', undefined);
    }
  }

  /**
   * Load saved sync progress from disk
   */
  async loadProgress(): Promise<SyncResumeState | null> {
    try {
      const db = (this.persistence as any).db;
      const syncResumeSublevel = db.sublevel('sync_resume', {
        valueEncoding: 'json',
      });

      // Get latest session ID
      let latestSessionId: string;
      try {
        latestSessionId = await syncResumeSublevel.get('latest_session');
      } catch {
        // No saved progress
        this.logger.debug('No saved sync progress found', {});
        return null;
      }

      // Load progress for latest session
      const progress: SyncResumeState = await syncResumeSublevel.get(
        `session:${latestSessionId}`
      );

      // Validate if enabled
      if (this.validateOnLoad) {
        const isValid = await this.validateProgress(progress);
        if (!isValid) {
          this.logger.warn('Saved progress invalid - ignoring', {});
          return null;
        }
      }

      this.logger.info(
        `Loaded sync progress from session ${latestSessionId} at height ${progress.currentHeight}`,
        {}
      );
      return progress;
    } catch (error) {
      this.logger.error('Failed to load sync progress:', error as any);
      return null;
    }
  }

  /**
   * Resume sync from saved progress
   */
  async resumeSync(savedProgress?: SyncResumeState): Promise<boolean> {
    try {
      // 1. Load saved progress if not provided
      const progress = savedProgress || (await this.loadProgress());
      if (!progress) {
        this.logger.info('No saved progress - cannot resume', {});
        return false; // No saved progress
      }

      // 2. Validate progress
      if (this.validateOnLoad) {
        const isValid = await this.validateProgress(progress);
        if (!isValid) {
          this.logger.warn('Saved progress invalid - starting fresh sync', {});
          await this.clearSavedProgress();
          return false;
        }
      }

      // 3. Check retry limit
      if (progress.retryCount >= this.maxRetries) {
        this.logger.error(
          'Max resume retries exceeded - starting fresh sync',
          {}
        );
        await this.clearSavedProgress();
        return false;
      }

      // 4. Update retry count and save
      const updatedProgress: SyncProgress = {
        ...progress,
        state: 'discovering' as UTXOSyncState,
      };

      // Increment retry count in the resume state
      progress.retryCount++;
      await this.saveProgress(updatedProgress);

      // 5. Emit resume event
      this.emit('sync_resumed', progress);

      this.logger.info(
        `Resuming sync from height ${progress.currentHeight} (attempt ${progress.retryCount}/${this.maxRetries})`,
        {}
      );

      return true;
    } catch (error) {
      this.logger.error('Resume failed:', error as any);
      return false;
    }
  }

  /**
   * Clear saved progress (on successful completion or reset)
   */
  async clearSavedProgress(): Promise<void> {
    try {
      const db = (this.persistence as any).db;
      const syncResumeSublevel = db.sublevel('sync_resume', {
        valueEncoding: 'json',
      });

      // Get latest session ID
      let latestSessionId: string;
      try {
        latestSessionId = await syncResumeSublevel.get('latest_session');
      } catch {
        // Nothing to clear
        return;
      }

      // Delete session data
      await syncResumeSublevel.del(`session:${latestSessionId}`);
      await syncResumeSublevel.del('latest_session');

      this.logger.info('Cleared saved sync progress', {});
      this.emit('progress_cleared');
    } catch (error) {
      this.logger.error('Failed to clear saved progress:', error as any);
      throw new SyncResumeError('Failed to clear saved progress');
    }
  }

  /**
   * Check if resume is possible
   */
  async canResume(): Promise<boolean> {
    try {
      const progress = await this.loadProgress();
      if (!progress) {
        return false;
      }

      // Validate without throwing errors
      return await this.validateProgress(progress);
    } catch {
      return false;
    }
  }

  /**
   * Internal: Validate saved progress
   */
  private async validateProgress(progress: SyncResumeState): Promise<boolean> {
    try {
      // 1. Check version compatibility
      if (progress.resumeVersion !== SYNC_RESUME_VERSION) {
        this.logger.warn(
          `Incompatible resume version: ${progress.resumeVersion} !== ${SYNC_RESUME_VERSION}`,
          {}
        );
        return false;
      }

      // 2. Check if saved too long ago
      const ageMs = Date.now() - progress.savedAt;
      if (ageMs > this.maxProgressAge) {
        this.logger.warn(
          `Saved progress too old: ${Math.floor(ageMs / 1000 / 60 / 60)} hours`,
          {}
        );
        return false;
      }

      // 3. Validate blockchain consistency
      const currentHeight = (this.syncManager as any).blockchain.getHeight();
      if (currentHeight > progress.currentHeight) {
        this.logger.warn(
          `Blockchain advanced during downtime (current: ${currentHeight}, saved: ${progress.currentHeight})`,
          {}
        );
        // Could still resume if blocks match - not necessarily invalid
      }

      // 4. Check peer availability
      if (progress.activePeers.length === 0) {
        this.logger.warn('No active peers in saved progress', {});
        return false;
      }

      // 5. Check for valid state
      if (!progress.state) {
        this.logger.warn('Invalid sync state in saved progress', {});
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Progress validation failed:', error as any);
      return false;
    }
  }

  /**
   * Internal: Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `sync_${timestamp}_${random}`;
  }

  /**
   * Internal: Convert SyncProgress to SyncResumeState
   */
  private toResumeState(progress: SyncProgress): SyncResumeState {
    // Get additional data from sync manager
    const syncContext = (this.syncManager as any).syncContext;
    const peers = (this.syncManager as any).peers as Map<string, SyncPeer>;

    // Determine active strategy and network mode
    const activeStrategy = this.determineActiveStrategy();
    const networkMode = this.determineNetworkMode();

    // Build resume state
    const resumeState: SyncResumeState = {
      ...progress,
      resumeVersion: SYNC_RESUME_VERSION,
      savedAt: Date.now(),
      sessionId: this.currentSession,
      startTime: syncContext?.startTime || Date.now(),

      // Peer information
      activePeers: peers ? Array.from(peers.values()) : [],
      bestPeer: this.findBestPeer(peers),

      // Downloaded data tracking
      downloadedHeaders: this.getDownloadedHeaders(),
      downloadedBlocks: this.getDownloadedBlocks(),
      downloadedUTXOs: this.getDownloadedUTXOs(),

      // Strategy state
      activeStrategy,
      networkMode,

      // Error tracking
      retryCount: 0,
      lastError: undefined,
    };

    return resumeState;
  }

  /**
   * Helper: Determine active sync strategy
   */
  private determineActiveStrategy(): 'internet' | 'mesh' | 'hybrid' {
    // Check if sync manager has internet connectivity
    const hasInternet = (this.syncManager as any).checkInternetConnectivity
      ? (this.syncManager as any).checkInternetConnectivity()
      : false;

    // Check if mesh protocol is active
    const hasMesh = !!(this.syncManager as any).meshProtocol;

    if (hasInternet && hasMesh) {
      return 'hybrid';
    } else if (hasInternet) {
      return 'internet';
    } else {
      return 'mesh';
    }
  }

  /**
   * Helper: Determine network mode
   */
  private determineNetworkMode(): 'internet' | 'mesh' | 'gateway' {
    const hasInternet = (this.syncManager as any).checkInternetConnectivity
      ? (this.syncManager as any).checkInternetConnectivity()
      : false;
    const hasMesh = !!(this.syncManager as any).meshProtocol;

    if (hasInternet && hasMesh) {
      return 'gateway';
    } else if (hasInternet) {
      return 'internet';
    } else {
      return 'mesh';
    }
  }

  /**
   * Helper: Find best peer from peer map using weighted scoring algorithm
   *
   * Scoring Algorithm Rationale:
   * - Reliability (70% weight): Prioritized higher to ensure consistent connection
   *   and data integrity. A peer with 90% reliability is more valuable than one
   *   with 50% reliability even if the latter is slightly faster.
   * - Latency (30% weight): Secondary factor to optimize sync speed. We use
   *   inverse latency (1000/latency_ms) to give higher scores to faster peers.
   *   The 1000 multiplier normalizes latency to a similar scale as reliability (0-1).
   *
   * This weighting balances connection stability with performance, which is
   * critical for blockchain sync where data consistency is paramount but
   * speed still matters for user experience.
   */
  private findBestPeer(peers?: Map<string, SyncPeer>): SyncPeer | undefined {
    if (!peers || peers.size === 0) {
      return undefined;
    }

    // Find peer with highest combined score
    let bestPeer: SyncPeer | undefined;
    let bestScore = -1;

    for (const peer of peers.values()) {
      // Calculate weighted score: 70% reliability + 30% inverse latency
      const latencyScore = peer.latency > 0 ? 1000 / peer.latency : 0;
      const score = peer.reliability * 0.7 + latencyScore * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestPeer = peer;
      }
    }

    return bestPeer;
  }

  /**
   * Helper: Get downloaded header heights
   *
   * TODO: Implement download tracking in UTXOSyncManager
   * This method should query UTXOSyncManager's header tracking to return
   * an array of block heights where headers have been downloaded.
   * This enables more granular resume capability by skipping already-downloaded headers.
   *
   * Suggested implementation:
   * - Add a Set<number> in UTXOSyncManager to track downloaded header heights
   * - Update the set when headers are successfully downloaded
   * - Provide a public getter method to retrieve the tracking set
   * - Return Array.from(this.syncManager.getDownloadedHeaderHeights())
   */
  private getDownloadedHeaders(): number[] {
    // Placeholder - returns empty until tracking is implemented in UTXOSyncManager
    return [];
  }

  /**
   * Helper: Get downloaded block heights
   *
   * TODO: Implement download tracking in UTXOSyncManager
   * This method should query UTXOSyncManager's block tracking to return
   * an array of block heights where full blocks have been downloaded.
   * This enables more granular resume capability by skipping already-downloaded blocks.
   *
   * Suggested implementation:
   * - Add a Set<number> in UTXOSyncManager to track downloaded block heights
   * - Update the set when blocks are successfully downloaded and validated
   * - Provide a public getter method to retrieve the tracking set
   * - Return Array.from(this.syncManager.getDownloadedBlockHeights())
   */
  private getDownloadedBlocks(): number[] {
    // Placeholder - returns empty until tracking is implemented in UTXOSyncManager
    return [];
  }

  /**
   * Helper: Get downloaded UTXO IDs
   *
   * TODO: Implement download tracking in UTXOSyncManager
   * This method should query UTXOSyncManager's UTXO tracking to return
   * an array of UTXO IDs that have been downloaded and validated.
   * This enables more granular resume capability by skipping already-downloaded UTXOs.
   *
   * Suggested implementation:
   * - Add a Set<string> in UTXOSyncManager to track downloaded UTXO IDs
   * - Update the set when UTXOs are successfully downloaded and validated
   * - Provide a public getter method to retrieve the tracking set
   * - Return Array.from(this.syncManager.getDownloadedUTXOIds())
   *
   * Note: UTXO IDs should be in the format `${txHash}:${outputIndex}`
   */
  private getDownloadedUTXOs(): string[] {
    // Placeholder - returns empty until tracking is implemented in UTXOSyncManager
    return [];
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.currentSession;
  }

  /**
   * Get last save height
   */
  getLastSaveHeight(): number {
    return this.lastSaveHeight;
  }

  /**
   * Force a new session (useful for fresh sync)
   */
  startNewSession(): void {
    this.currentSession = this.generateSessionId();
    this.lastSaveHeight = 0;
    this.logger.info(`Started new sync session: ${this.currentSession}`, {});
    this.emit('new_session', this.currentSession);
  }
}

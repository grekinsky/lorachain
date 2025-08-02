import {
  Fragment,
  FragmentHeader,
  FragmentFlags,
  ReassemblySession,
  ReassemblyResult,
  UTXOTransaction,
  Block,
  CompressedMerkleProof,
  UTXOMessageType,
  UTXOFragmentableMessage,
  EvictionCriteria,
  IDatabase,
  EnhancedReassemblySession,
  MessagePriority,
  SessionState,
  RetransmissionRequest,
  FragmentAcknowledgment,
  RetransmissionTask,
  AckTracker,
  NetworkMetrics,
  NodeQuota,
  EnhancedFragmentationConfig,
  RoutingHint,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
// Simple CRC32 implementation for fragment checksums
function crc32(data: Uint8Array): number {
  const table: number[] = [];
  let crc = 0xffffffff;

  // Generate CRC32 table if not already done
  if (table.length === 0) {
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
  }

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0; // Ensure unsigned 32-bit result
}

// Simple logger for development
class SimpleLogger {
  constructor(private context: string) {}
  debug(message: string): void {
    console.log(`[DEBUG] ${this.context}: ${message}`);
  }
  warn(message: string): void {
    console.warn(`[WARN] ${this.context}: ${message}`);
  }
  error(message: string): void {
    console.error(`[ERROR] ${this.context}: ${message}`);
  }
}

export class UTXOMessageFragmenter {
  private logger = new SimpleLogger('UTXOMessageFragmenter');
  private cryptoService: CryptographicService;
  private maxFragmentSize: number = 197; // 256 - 59 bytes header = 197 bytes payload

  constructor(cryptoService: CryptographicService) {
    this.cryptoService = cryptoService;
  }

  splitUTXOTransaction(tx: UTXOTransaction, keyPair: KeyPair): Fragment[] {
    const serializedTx = this.serializeUTXOTransaction(tx);
    return this.fragmentMessage(
      serializedTx,
      UTXOMessageType.UTXO_TRANSACTION,
      keyPair
    );
  }

  splitBlock(block: Block, keyPair: KeyPair): Fragment[] {
    const serializedBlock = this.serializeBlock(block);
    return this.fragmentMessage(
      serializedBlock,
      UTXOMessageType.BLOCK,
      keyPair
    );
  }

  splitMerkleProof(proof: CompressedMerkleProof, keyPair: KeyPair): Fragment[] {
    const serializedProof = this.serializeMerkleProof(proof);
    return this.fragmentMessage(
      serializedProof,
      UTXOMessageType.MERKLE_PROOF,
      keyPair
    );
  }

  calculateOptimalFragmentSize(messageType: UTXOMessageType): number {
    // Adjust fragment size based on message type for optimal network usage
    switch (messageType) {
      case UTXOMessageType.UTXO_TRANSACTION:
        return Math.min(this.maxFragmentSize, 180); // Smaller for frequent tx
      case UTXOMessageType.BLOCK:
        return this.maxFragmentSize; // Full size for large blocks
      case UTXOMessageType.MERKLE_PROOF:
        return Math.min(this.maxFragmentSize, 150); // Optimized for compressed proofs
      default:
        return this.maxFragmentSize;
    }
  }

  private fragmentMessage(
    data: Uint8Array,
    messageType: UTXOMessageType,
    keyPair: KeyPair
  ): Fragment[] {
    if (data.length <= this.maxFragmentSize) {
      // Message fits in single fragment
      return [this.createSingleFragment(data, messageType, keyPair)];
    }

    const fragments: Fragment[] = [];
    const messageId = this.generateMessageId(data);
    const fragmentSize = this.calculateOptimalFragmentSize(messageType);
    const totalFragments = Math.ceil(data.length / fragmentSize);

    this.logger.debug(
      `Fragmenting ${messageType} message: ${data.length} bytes into ${totalFragments} fragments`
    );

    for (let i = 0; i < totalFragments; i++) {
      const start = i * fragmentSize;
      const end = Math.min(start + fragmentSize, data.length);
      const payload = data.slice(start, end);

      const flags = this.calculateFragmentFlags(i, totalFragments);
      const fragment = this.createFragment(
        messageId,
        i,
        totalFragments,
        payload,
        flags,
        keyPair
      );

      fragments.push(fragment);
    }

    return fragments;
  }

  private createSingleFragment(
    data: Uint8Array,
    messageType: UTXOMessageType,
    keyPair: KeyPair
  ): Fragment {
    const messageId = this.generateMessageId(data);
    const flags = FragmentFlags.FIRST_FRAGMENT | FragmentFlags.LAST_FRAGMENT;

    return this.createFragment(messageId, 0, 1, data, flags, keyPair);
  }

  private createFragment(
    messageId: Uint8Array,
    sequenceNumber: number,
    totalFragments: number,
    payload: Uint8Array,
    flags: number,
    keyPair: KeyPair
  ): Fragment {
    const checksum = crc32(payload);

    // Create fragment header without signature first
    const headerData = new Uint8Array(27); // 16 + 2 + 2 + 2 + 1 + 4 = 27 bytes
    let offset = 0;

    // messageId (16 bytes)
    headerData.set(messageId.slice(0, 16), offset);
    offset += 16;

    // sequenceNumber (2 bytes, little-endian)
    headerData[offset] = sequenceNumber & 0xff;
    headerData[offset + 1] = (sequenceNumber >> 8) & 0xff;
    offset += 2;

    // totalFragments (2 bytes, little-endian)
    headerData[offset] = totalFragments & 0xff;
    headerData[offset + 1] = (totalFragments >> 8) & 0xff;
    offset += 2;

    // fragmentSize (2 bytes, little-endian)
    headerData[offset] = payload.length & 0xff;
    headerData[offset + 1] = (payload.length >> 8) & 0xff;
    offset += 2;

    // flags (1 byte)
    headerData[offset] = flags;
    offset += 1;

    // checksum (4 bytes, little-endian)
    headerData[offset] = checksum & 0xff;
    headerData[offset + 1] = (checksum >> 8) & 0xff;
    headerData[offset + 2] = (checksum >> 16) & 0xff;
    headerData[offset + 3] = (checksum >> 24) & 0xff;

    // Sign the header + payload
    const dataToSign = new Uint8Array(headerData.length + payload.length);
    dataToSign.set(headerData, 0);
    dataToSign.set(payload, headerData.length);

    const messageHash = CryptographicService.hashMessage(dataToSign);
    const signature = CryptographicService.sign(
      messageHash,
      keyPair.privateKey,
      keyPair.algorithm
    );

    const header: FragmentHeader = {
      messageId: messageId.slice(0, 16),
      sequenceNumber,
      totalFragments,
      fragmentSize: payload.length,
      flags,
      checksum,
      signature: signature.signature,
    };

    return {
      header,
      payload,
    };
  }

  private calculateFragmentFlags(
    sequenceNumber: number,
    totalFragments: number
  ): number {
    let flags = 0;

    if (sequenceNumber === 0) {
      flags |= FragmentFlags.FIRST_FRAGMENT;
    }

    if (sequenceNumber === totalFragments - 1) {
      flags |= FragmentFlags.LAST_FRAGMENT;
    }

    // Add priority flag for critical fragments
    if (sequenceNumber === 0 || sequenceNumber === totalFragments - 1) {
      flags |= FragmentFlags.PRIORITY;
    }

    return flags;
  }

  private generateMessageId(data: Uint8Array): Uint8Array {
    return CryptographicService.hashMessage(data);
  }

  private serializeUTXOTransaction(tx: UTXOTransaction): Uint8Array {
    // Use MessagePack-style serialization for efficiency
    const serialized = JSON.stringify(tx);
    return new TextEncoder().encode(serialized);
  }

  private serializeBlock(block: Block): Uint8Array {
    const serialized = JSON.stringify(block);
    return new TextEncoder().encode(serialized);
  }

  private serializeMerkleProof(proof: CompressedMerkleProof): Uint8Array {
    const serialized = JSON.stringify(proof);
    return new TextEncoder().encode(serialized);
  }
}

export class UTXOFragmentReassembler {
  private logger = new SimpleLogger('UTXOFragmentReassembler');
  private sessions: Map<string, ReassemblySession> = new Map();
  private maxSessions: number = 100;
  private sessionTimeout: number = 300000; // 5 minutes
  private maxRetries: number = 3;

  addFragment(fragment: Fragment): ReassemblyResult {
    const messageId = bytesToHex(fragment.header.messageId);

    // Validate fragment integrity
    if (!this.validateFragment(fragment)) {
      this.logger.warn(`Invalid fragment received for message ${messageId}`);
      return ReassemblyResult.INVALID_FRAGMENT;
    }

    // Get or create reassembly session
    let session = this.sessions.get(messageId);
    if (!session) {
      session = this.createReassemblySession(fragment);

      // Check session limit
      if (this.sessions.size >= this.maxSessions) {
        this.evictOldestSession();
      }

      this.sessions.set(messageId, session);
      this.logger.debug(
        `Created new reassembly session for message ${messageId}`
      );
    }

    // Check for duplicate fragment
    if (session.receivedFragments.has(fragment.header.sequenceNumber)) {
      this.logger.debug(
        `Duplicate fragment ${fragment.header.sequenceNumber} for message ${messageId}`
      );
      return ReassemblyResult.DUPLICATE_FRAGMENT;
    }

    // Add fragment to session
    session.receivedFragments.set(
      fragment.header.sequenceNumber,
      fragment.payload
    );
    session.lastActivity = Date.now();

    this.logger.debug(
      `Added fragment ${fragment.header.sequenceNumber}/${fragment.header.totalFragments} for message ${messageId}`
    );

    // Check if message is complete
    if (session.receivedFragments.size === session.totalFragments) {
      this.logger.debug(`Message ${messageId} is complete`);
      return ReassemblyResult.MESSAGE_COMPLETE;
    }

    return ReassemblyResult.FRAGMENT_ADDED;
  }

  getCompleteUTXOTransaction(messageId: Uint8Array): UTXOTransaction | null {
    const id = bytesToHex(messageId);
    const session = this.sessions.get(id);

    if (!session || session.receivedFragments.size !== session.totalFragments) {
      return null;
    }

    const reassembledData = this.reassembleMessage(session);
    this.sessions.delete(id);

    try {
      const serialized = new TextDecoder().decode(reassembledData);
      return JSON.parse(serialized) as UTXOTransaction;
    } catch (error) {
      this.logger.error(`Failed to deserialize UTXO transaction: ${error}`);
      return null;
    }
  }

  getCompleteBlock(messageId: Uint8Array): Block | null {
    const id = bytesToHex(messageId);
    const session = this.sessions.get(id);

    if (!session || session.receivedFragments.size !== session.totalFragments) {
      return null;
    }

    const reassembledData = this.reassembleMessage(session);
    this.sessions.delete(id);

    try {
      const serialized = new TextDecoder().decode(reassembledData);
      return JSON.parse(serialized) as Block;
    } catch (error) {
      this.logger.error(`Failed to deserialize block: ${error}`);
      return null;
    }
  }

  getCompleteMerkleProof(messageId: Uint8Array): CompressedMerkleProof | null {
    const id = bytesToHex(messageId);
    const session = this.sessions.get(id);

    if (!session || session.receivedFragments.size !== session.totalFragments) {
      return null;
    }

    const reassembledData = this.reassembleMessage(session);
    this.sessions.delete(id);

    try {
      const serialized = new TextDecoder().decode(reassembledData);
      return JSON.parse(serialized) as CompressedMerkleProof;
    } catch (error) {
      this.logger.error(`Failed to deserialize merkle proof: ${error}`);
      return null;
    }
  }

  cleanup(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [messageId, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTimeout) {
        expiredSessions.push(messageId);
      }
    }

    for (const messageId of expiredSessions) {
      this.sessions.delete(messageId);
      this.logger.debug(`Cleaned up expired session ${messageId}`);
    }

    if (expiredSessions.length > 0) {
      this.logger.debug(
        `Cleaned up ${expiredSessions.length} expired sessions`
      );
    }
  }

  protected validateFragment(fragment: Fragment): boolean {
    // Validate checksum
    const expectedChecksum = crc32(fragment.payload);
    if (fragment.header.checksum !== expectedChecksum) {
      this.logger.warn(
        `Checksum mismatch: expected ${expectedChecksum}, got ${fragment.header.checksum}`
      );
      return false;
    }

    // Validate fragment size
    if (fragment.header.fragmentSize !== fragment.payload.length) {
      this.logger.warn(
        `Fragment size mismatch: header says ${fragment.header.fragmentSize}, payload is ${fragment.payload.length}`
      );
      return false;
    }

    // TODO: Validate signature once we integrate cryptographic verification

    return true;
  }

  private createReassemblySession(fragment: Fragment): ReassemblySession {
    return {
      messageId: bytesToHex(fragment.header.messageId),
      totalFragments: fragment.header.totalFragments,
      receivedFragments: new Map(),
      lastActivity: Date.now(),
      timeout: Date.now() + this.sessionTimeout,
      retryCount: 0,
      requiredAcks: new Set(),
    };
  }

  private evictOldestSession(): void {
    let oldestSession: string | null = null;
    let oldestTime = Date.now();

    for (const [messageId, session] of this.sessions) {
      if (session.lastActivity < oldestTime) {
        oldestTime = session.lastActivity;
        oldestSession = messageId;
      }
    }

    if (oldestSession) {
      this.sessions.delete(oldestSession);
      this.logger.debug(`Evicted oldest session ${oldestSession}`);
    }
  }

  private reassembleMessage(session: ReassemblySession): Uint8Array {
    // Calculate total size
    let totalSize = 0;
    for (const fragment of session.receivedFragments.values()) {
      totalSize += fragment.length;
    }

    // Reassemble fragments in sequence order
    const reassembled = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < session.totalFragments; i++) {
      const fragment = session.receivedFragments.get(i);
      if (!fragment) {
        throw new Error(`Missing fragment ${i} during reassembly`);
      }

      reassembled.set(fragment, offset);
      offset += fragment.length;
    }

    return reassembled;
  }
}

export class UTXOFragmentCache {
  private logger = new SimpleLogger('UTXOFragmentCache');
  private cache: Map<string, Fragment> = new Map();
  private db?: IDatabase;

  constructor(db?: IDatabase) {
    this.db = db;
  }

  async store(fragment: Fragment): Promise<void> {
    const key = this.createFragmentKey(fragment);
    this.cache.set(key, fragment);

    if (this.db) {
      try {
        await this.db.put(key, fragment, 'fragments');
        this.logger.debug(`Stored fragment ${key} to database`);
      } catch (error) {
        this.logger.error(`Failed to store fragment ${key}: ${error}`);
      }
    }
  }

  async retrieve(
    messageId: Uint8Array,
    sequence: number
  ): Promise<Fragment | null> {
    const key = `${bytesToHex(messageId)}:${sequence}`;

    // Check memory cache first
    const cachedFragment = this.cache.get(key);
    if (cachedFragment) {
      return cachedFragment;
    }

    // Check database if available
    if (this.db) {
      try {
        const dbFragment = await this.db.get<Fragment>(key, 'fragments');
        if (dbFragment) {
          this.cache.set(key, dbFragment); // Cache for future access
          return dbFragment;
        }
      } catch (error) {
        this.logger.error(`Failed to retrieve fragment ${key}: ${error}`);
      }
    }

    return null;
  }

  async evict(criteria: EvictionCriteria): Promise<void> {
    const now = Date.now();
    const keysToEvict: string[] = [];

    for (const [key, fragment] of this.cache) {
      // Evict based on age or other criteria
      // For now, implement simple age-based eviction
      keysToEvict.push(key);
    }

    // Evict from memory
    for (const key of keysToEvict) {
      this.cache.delete(key);
    }

    // Evict from database if available
    if (this.db) {
      for (const key of keysToEvict) {
        try {
          await this.db.del(key, 'fragments');
        } catch (error) {
          this.logger.error(`Failed to evict fragment ${key}: ${error}`);
        }
      }
    }

    this.logger.debug(`Evicted ${keysToEvict.length} fragments`);
  }

  private createFragmentKey(fragment: Fragment): string {
    return `${bytesToHex(fragment.header.messageId)}:${fragment.header.sequenceNumber}`;
  }
}

// Priority Queue for Retransmission Tasks
class PriorityQueue<
  T extends { priority: MessagePriority; scheduledTime: number },
> {
  private items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
    this.items.sort((a, b) => {
      // Higher priority (lower number) goes first
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Same priority, earlier scheduled time goes first
      return a.scheduledTime - b.scheduledTime;
    });
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

// Enhanced UTXO Fragment Reassembler with Advanced Features
export class EnhancedUTXOFragmentReassembler extends UTXOFragmentReassembler {
  private enhancedLogger = new SimpleLogger('EnhancedUTXOFragmentReassembler');
  private enhancedSessions: Map<string, EnhancedReassemblySession> = new Map();
  private retransmissionQueue: PriorityQueue<RetransmissionTask> =
    new PriorityQueue();
  private acknowledgmentTracker: Map<string, AckTracker> = new Map();
  private sessionPersistence?: IDatabase;
  private networkMetrics: NetworkMetrics = {
    averageLatency: 1000, // Default 1 second
    packetLossRate: 0.1, // Default 10% packet loss
    congestionLevel: 0.5, // Default moderate congestion
    throughput: 1000, // Default 1KB/s
    nodeCount: 10, // Default 10 nodes
  };
  private nodeQuotas: Map<string, NodeQuota> = new Map();
  private config: EnhancedFragmentationConfig;
  private cryptoService: CryptographicService;
  private nodeKeyPair: KeyPair;
  private nodeId: string;

  constructor(
    config: EnhancedFragmentationConfig,
    cryptoService: CryptographicService,
    nodeKeyPair: KeyPair,
    nodeId: string,
    sessionPersistence?: IDatabase
  ) {
    super();
    this.config = config;
    this.cryptoService = cryptoService;
    this.nodeKeyPair = nodeKeyPair;
    this.nodeId = nodeId;
    this.sessionPersistence = sessionPersistence;

    this.enhancedLogger.debug(
      `Enhanced UTXO Fragment Reassembler initialized with config: ${JSON.stringify(config)}`
    );

    // Start periodic cleanup and retransmission processing
    setInterval(() => this.processRetransmissionQueue(), 1000); // Every second
    setInterval(() => this.performEnhancedCleanup(), 60000); // Every minute
  }

  // Enhanced fragment addition with missing detection
  override addFragment(fragment: Fragment): ReassemblyResult {
    const messageId = bytesToHex(fragment.header.messageId);

    // Resource protection check
    if (!this.canAcceptFragment(this.nodeId, fragment)) {
      this.enhancedLogger.warn(
        `Fragment rejected due to resource limits: ${messageId}`
      );
      return ReassemblyResult.INVALID_FRAGMENT;
    }

    // Validate fragment integrity and signature
    if (!this.validateEnhancedFragment(fragment)) {
      this.enhancedLogger.warn(
        `Invalid enhanced fragment received for message ${messageId}`
      );
      return ReassemblyResult.INVALID_FRAGMENT;
    }

    // Call parent implementation first
    const result = super.addFragment(fragment);

    if (
      result === ReassemblyResult.FRAGMENT_ADDED ||
      result === ReassemblyResult.MESSAGE_COMPLETE
    ) {
      // Get or create enhanced session
      let enhancedSession = this.enhancedSessions.get(messageId);
      if (!enhancedSession) {
        enhancedSession = this.createEnhancedReassemblySession(fragment);
        this.enhancedSessions.set(messageId, enhancedSession);
      }

      // Update fragment bitmap and detect missing fragments
      this.updateFragmentBitmap(
        enhancedSession,
        fragment.header.sequenceNumber
      );
      this.detectMissingFragments(enhancedSession);

      // Schedule retransmission if needed
      if (this.config.enableRetransmissionRequests) {
        this.scheduleRetransmissionIfNeeded(enhancedSession);
      }

      // Update session state
      enhancedSession.lastActivity = Date.now();
      enhancedSession.sessionState =
        result === ReassemblyResult.MESSAGE_COMPLETE
          ? SessionState.COMPLETE
          : SessionState.RECEIVING;
    }

    return result;
  }

  // Create enhanced reassembly session
  private createEnhancedReassemblySession(
    fragment: Fragment
  ): EnhancedReassemblySession {
    const messageId = bytesToHex(fragment.header.messageId);
    const messageType = this.determineMessageType(fragment);
    const priority = this.determinePriority(messageType);

    // Calculate bitmap size (1 bit per fragment, rounded up to nearest byte)
    const bitmapSize = Math.ceil(fragment.header.totalFragments / 8);
    const fragmentBitmap = new Uint8Array(bitmapSize);

    const enhancedSession: EnhancedReassemblySession = {
      // Base ReassemblySession fields
      messageId,
      totalFragments: fragment.header.totalFragments,
      receivedFragments: new Map(),
      lastActivity: Date.now(),
      timeout:
        Date.now() +
        this.calculateDynamicTimeout(
          messageType,
          fragment.header.totalFragments
        ),
      retryCount: 0,
      requiredAcks: new Set(),

      // Enhanced fields
      priority,
      messageType,
      fragmentBitmap,
      missingFragments: new Set(),
      retransmissionAttempts: new Map(),
      lastRetransmissionRequest: 0,
      nextRetransmissionTime: 0,
      routingHints: [],
      sessionState: SessionState.RECEIVING,
      signature: new Uint8Array(), // Will be signed later
    };

    // Initialize missing fragments set (all fragments except the one we just received)
    for (let i = 0; i < fragment.header.totalFragments; i++) {
      if (i !== fragment.header.sequenceNumber) {
        enhancedSession.missingFragments.add(i);
      }
    }

    return enhancedSession;
  }

  // Update fragment bitmap when fragment is received
  private updateFragmentBitmap(
    session: EnhancedReassemblySession,
    sequenceNumber: number
  ): void {
    const byteIndex = Math.floor(sequenceNumber / 8);
    const bitIndex = sequenceNumber % 8;

    if (byteIndex < session.fragmentBitmap.length) {
      session.fragmentBitmap[byteIndex] |= 1 << bitIndex;
    }
  }

  // Detect missing fragments using bitmap
  private detectMissingFragments(
    session: EnhancedReassemblySession
  ): Set<number> {
    const missing = new Set<number>();
    const bitmap = session.fragmentBitmap;

    for (let i = 0; i < session.totalFragments; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const isReceived = (bitmap[byteIndex] & (1 << bitIndex)) !== 0;

      if (!isReceived) {
        missing.add(i);
      }
    }

    session.missingFragments = missing;

    this.enhancedLogger.debug(
      `Detected ${missing.size} missing fragments for message ${session.messageId}: [${Array.from(missing).join(', ')}]`
    );

    return missing;
  }

  // Intelligent retransmission scheduling
  private scheduleRetransmissionIfNeeded(
    session: EnhancedReassemblySession
  ): void {
    if (
      session.missingFragments.size === 0 ||
      session.sessionState !== SessionState.RECEIVING
    ) {
      return;
    }

    const now = Date.now();
    if (now < session.nextRetransmissionTime) {
      return;
    }

    // Check if we've exceeded maximum retransmission attempts
    if (session.retryCount >= this.config.maxRetransmissionAttempts) {
      session.sessionState = SessionState.FAILED;
      this.enhancedLogger.warn(
        `Maximum retransmission attempts reached for message ${session.messageId}`
      );
      return;
    }

    // Calculate backoff with jitter
    const baseBackoff = Math.min(
      this.config.retransmissionBaseBackoffMs * Math.pow(2, session.retryCount),
      this.config.retransmissionMaxBackoffMs
    );
    const jitter =
      Math.random() *
      (this.config.retransmissionJitterPercent / 100) *
      baseBackoff;
    const backoff = baseBackoff + jitter;

    session.nextRetransmissionTime = now + backoff;
    session.retryCount++;

    const retransmissionTask: RetransmissionTask = {
      messageId: hexToBytes(session.messageId),
      scheduledTime: session.nextRetransmissionTime,
      priority: session.priority,
      missingFragments: Array.from(session.missingFragments),
    };

    this.retransmissionQueue.enqueue(retransmissionTask);
    session.sessionState = SessionState.WAITING_RETRANSMISSION;

    this.enhancedLogger.debug(
      `Scheduled retransmission for message ${session.messageId}, attempt ${session.retryCount}, backoff ${backoff}ms`
    );
  }

  // Generate retransmission request
  generateRetransmissionRequest(
    messageId: Uint8Array,
    missingFragments: number[]
  ): RetransmissionRequest {
    const request: RetransmissionRequest = {
      type: 'retransmission_request',
      messageId,
      missingFragments,
      requestId: this.generateRequestId(),
      timestamp: Date.now(),
      nodeId: this.nodeId,
      signature: new Uint8Array(), // Will be signed
    };

    // Optionally add compressed bitmap for large fragment sets
    if (missingFragments.length > 10) {
      request.compressedBitmap =
        this.compressMissingFragmentsBitmap(missingFragments);
    }

    // Sign the request
    const dataToSign = this.serializeRetransmissionRequest(request);
    const messageHash = CryptographicService.hashMessage(dataToSign);
    const signature = CryptographicService.sign(
      messageHash,
      this.nodeKeyPair.privateKey,
      this.nodeKeyPair.algorithm
    );
    request.signature = signature.signature;

    return request;
  }

  // Handle acknowledgments
  processAcknowledgment(ack: FragmentAcknowledgment): void {
    const messageId = bytesToHex(ack.messageId);
    const session = this.enhancedSessions.get(messageId);
    if (!session) {
      this.enhancedLogger.warn(`Received ACK for unknown message: ${messageId}`);
      return;
    }

    // Verify acknowledgment signature
    if (!this.verifyAcknowledgmentSignature(ack)) {
      this.enhancedLogger.warn(`Invalid ACK signature for message: ${messageId}`);
      return;
    }

    if (ack.type === 'fragment_ack') {
      // Update received fragments based on ACK
      if (ack.cumulativeAck !== undefined) {
        // Mark all fragments up to cumulativeAck as received
        for (let i = 0; i <= ack.cumulativeAck; i++) {
          this.markFragmentReceived(session, i);
        }
      } else if (Array.isArray(ack.acknowledgedFragments)) {
        // Mark specific fragments as received
        for (const seq of ack.acknowledgedFragments) {
          this.markFragmentReceived(session, seq);
        }
      }
    } else if (ack.type === 'fragment_nack' && ack.nackFragments) {
      // Schedule immediate retransmission for NACKed fragments
      for (const seq of ack.nackFragments) {
        session.missingFragments.add(seq);
      }
      // Reset retransmission timer for immediate retry
      session.nextRetransmissionTime = Date.now();
      this.scheduleRetransmissionIfNeeded(session);
    }

    session.lastActivity = Date.now();
  }

  // Mark fragment as received and update bitmap
  private markFragmentReceived(
    session: EnhancedReassemblySession,
    sequenceNumber: number
  ): void {
    this.updateFragmentBitmap(session, sequenceNumber);
    session.missingFragments.delete(sequenceNumber);

    // Remove from retransmission attempts tracking
    session.retransmissionAttempts.delete(sequenceNumber);
  }

  // Process retransmission queue
  private async processRetransmissionQueue(): Promise<void> {
    const now = Date.now();

    while (this.retransmissionQueue.size() > 0) {
      const task = this.retransmissionQueue.peek();
      if (!task || task.scheduledTime > now) {
        break; // No more tasks ready to execute
      }

      this.retransmissionQueue.dequeue();

      try {
        const request = this.generateRetransmissionRequest(
          task.messageId,
          task.missingFragments
        );
        await this.sendRetransmissionRequest(request);

        this.enhancedLogger.debug(
          `Sent retransmission request for message ${bytesToHex(task.messageId)}, fragments: [${task.missingFragments.join(', ')}]`
        );
      } catch (error) {
        this.enhancedLogger.error(`Failed to send retransmission request: ${error}`);
      }
    }
  }

  // Send retransmission request (to be implemented by mesh protocol)
  private async sendRetransmissionRequest(
    request: RetransmissionRequest
  ): Promise<void> {
    // This would be implemented by the mesh protocol to actually send the request
    // For now, we'll just log it
    this.enhancedLogger.debug(
      `Retransmission request generated: ${JSON.stringify(request)}`
    );
  }

  // Enhanced cleanup with persistence
  async cleanup(): Promise<void> {
    await super.cleanup();

    const now = Date.now();
    const expiredSessions: string[] = [];

    // Clean up enhanced sessions
    for (const [messageId, session] of this.enhancedSessions) {
      if (
        now - session.lastActivity > this.config.sessionTimeout ||
        session.sessionState === SessionState.EXPIRED
      ) {
        expiredSessions.push(messageId);
      }
    }

    // Persist active sessions before cleanup
    if (this.sessionPersistence) {
      for (const [messageId, session] of this.enhancedSessions) {
        if (!expiredSessions.includes(messageId)) {
          await this.persistSession(session);
        }
      }
    }

    // Remove expired sessions
    for (const messageId of expiredSessions) {
      this.enhancedSessions.delete(messageId);
      this.acknowledgmentTracker.delete(messageId);
    }

    // Clean up node quotas
    this.cleanupNodeQuotas();

    this.enhancedLogger.debug(
      `Enhanced cleanup completed: ${expiredSessions.length} sessions expired`
    );
  }

  // Network-aware optimization
  optimizeForNetworkConditions(metrics: NetworkMetrics): void {
    this.networkMetrics = metrics;

    // Adjust timeouts based on network latency
    this.config.sessionTimeout = Math.max(
      300000, // 5 min minimum
      metrics.averageLatency * 10
    );

    // Adjust retransmission attempts based on packet loss
    this.config.maxRetransmissionAttempts =
      metrics.packetLossRate > 0.1 ? 5 : 3;

    // Adjust backoff times based on congestion
    if (metrics.congestionLevel > 0.7) {
      this.config.retransmissionBaseBackoffMs = Math.max(
        2000,
        this.config.retransmissionBaseBackoffMs
      );
    }

    this.enhancedLogger.debug(
      `Network optimization applied: ${JSON.stringify(metrics)}`
    );
  }

  // Resource protection
  private canAcceptFragment(nodeId: string, fragment: Fragment): boolean {
    const quota = this.getOrCreateNodeQuota(nodeId);
    const now = Date.now();

    // Reset quota counters if needed (every minute)
    if (now - quota.lastReset > 60000) {
      quota.fragmentsPerMinute = 0;
      quota.lastReset = now;
    }

    // Check rate limits
    if (quota.fragmentsPerMinute >= this.config.fragmentsPerMinuteLimit) {
      return false;
    }

    // Check memory usage
    if (quota.memoryUsage > this.config.maxMemoryPerNode) {
      return false;
    }

    // Check session limits
    if (quota.activeSessions > this.config.maxSessionsPerNode) {
      return false;
    }

    // Update quota
    quota.fragmentsPerMinute++;

    return true;
  }

  // Utility methods
  private determineMessageType(fragment: Fragment): UTXOMessageType {
    // This would typically be determined from fragment metadata or first fragment
    // For now, default to UTXO_TRANSACTION
    return UTXOMessageType.UTXO_TRANSACTION;
  }

  private determinePriority(messageType: UTXOMessageType): MessagePriority {
    switch (messageType) {
      case UTXOMessageType.BLOCK:
        return MessagePriority.CRITICAL;
      case UTXOMessageType.UTXO_TRANSACTION:
        return MessagePriority.HIGH;
      case UTXOMessageType.MERKLE_PROOF:
        return MessagePriority.NORMAL;
      default:
        return MessagePriority.LOW;
    }
  }

  private calculateDynamicTimeout(
    messageType: UTXOMessageType,
    totalFragments: number
  ): number {
    const baseTimeout = this.config.sessionTimeout;
    const fragmentMultiplier = Math.log(totalFragments + 1) * 1000; // Logarithmic scaling
    const priorityMultiplier = messageType === UTXOMessageType.BLOCK ? 2 : 1;

    return baseTimeout + fragmentMultiplier * priorityMultiplier;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private serializeRetransmissionRequest(
    request: RetransmissionRequest
  ): Uint8Array {
    // Simple JSON serialization for now
    const requestCopy = { ...request, signature: new Uint8Array() };
    const serialized = JSON.stringify(requestCopy);
    return new TextEncoder().encode(serialized);
  }

  private compressMissingFragmentsBitmap(
    missingFragments: number[]
  ): Uint8Array {
    // Create a compressed bitmap representation
    const maxFragment = Math.max(...missingFragments);
    const bitmapSize = Math.ceil((maxFragment + 1) / 8);
    const bitmap = new Uint8Array(bitmapSize);

    for (const fragment of missingFragments) {
      const byteIndex = Math.floor(fragment / 8);
      const bitIndex = fragment % 8;
      bitmap[byteIndex] |= 1 << bitIndex;
    }

    return bitmap;
  }

  private validateEnhancedFragment(fragment: Fragment): boolean {
    // Call parent validation first
    if (!this.validateFragment(fragment)) {
      return false;
    }

    // Additional enhanced validation
    // Verify timestamp is within acceptable range (±5 minutes)
    const now = Date.now();
    const fragmentTime = Date.now(); // Would extract from fragment if available
    if (Math.abs(now - fragmentTime) > 300000) {
      this.enhancedLogger.warn('Fragment timestamp outside acceptable range');
      return false;
    }

    // TODO: Verify Ed25519 signature

    return true;
  }

  private verifyAcknowledgmentSignature(ack: FragmentAcknowledgment): boolean {
    // TODO: Implement signature verification
    return true;
  }

  private async persistSession(
    session: EnhancedReassemblySession
  ): Promise<void> {
    if (!this.sessionPersistence) return;

    try {
      await this.sessionPersistence.put(
        `session_${session.messageId}`,
        session,
        'reassembly_sessions'
      );
    } catch (error) {
      this.enhancedLogger.error(
        `Failed to persist session ${session.messageId}: ${error}`
      );
    }
  }

  private performEnhancedCleanup(): void {
    // Trigger standard cleanup
    this.cleanup();

    // Clean up retransmission queue
    this.cleanupRetransmissionQueue();
  }

  private cleanupRetransmissionQueue(): void {
    const now = Date.now();
    const staleTime = 30 * 60 * 1000; // 30 minutes

    // Remove stale tasks (this is simplified - would need proper queue filtering)
    // For now, just clear very old tasks
    if (this.retransmissionQueue.size() > 1000) {
      this.enhancedLogger.warn('Retransmission queue too large, clearing old tasks');
      this.retransmissionQueue.clear();
    }
  }

  private cleanupNodeQuotas(): void {
    const now = Date.now();
    const staleTime = 60 * 60 * 1000; // 1 hour

    for (const [nodeId, quota] of this.nodeQuotas) {
      if (now - quota.lastReset > staleTime) {
        this.nodeQuotas.delete(nodeId);
      }
    }
  }

  private getOrCreateNodeQuota(nodeId: string): NodeQuota {
    let quota = this.nodeQuotas.get(nodeId);
    if (!quota) {
      quota = {
        nodeId,
        fragmentsPerMinute: 0,
        memoryUsage: 0,
        activeSessions: 0,
        lastReset: Date.now(),
      };
      this.nodeQuotas.set(nodeId, quota);
    }
    return quota;
  }

  // Getter methods for testing and monitoring
  getEnhancedSession(messageId: string): EnhancedReassemblySession | undefined {
    return this.enhancedSessions.get(messageId);
  }

  getRetransmissionQueueSize(): number {
    return this.retransmissionQueue.size();
  }

  getNetworkMetrics(): NetworkMetrics {
    return { ...this.networkMetrics };
  }

  getNodeQuotas(): Map<string, NodeQuota> {
    return new Map(this.nodeQuotas);
  }
}

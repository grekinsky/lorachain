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
      this.logger.debug(`Created new reassembly session for message ${messageId}`);
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
      this.logger.debug(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  private validateFragment(fragment: Fragment): boolean {
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

  async retrieve(messageId: Uint8Array, sequence: number): Promise<Fragment | null> {
    const key = `${bytesToHex(messageId)}:${sequence}`;
    
    // Check memory cache first
    let fragment = this.cache.get(key);
    if (fragment) {
      return fragment;
    }

    // Check database if available
    if (this.db) {
      try {
        fragment = await this.db.get<Fragment>(key, 'fragments');
        if (fragment) {
          this.cache.set(key, fragment); // Cache for future access
          return fragment;
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
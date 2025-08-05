/**
 * UTXO-Specific Compression Engines
 * 
 * Specialized compression engines optimized for UTXO blockchain data patterns
 * BREAKING CHANGE: UTXO-only support, no backwards compatibility
 */

import { createHash } from 'crypto';
import type {
  ICompressionEngine,
  ICompressionEngineOptions,
  IDictionaryManager
} from './compression-interfaces.js';
import type {
  CompressionAlgorithm,
  CompressionLevel,
  MessageType,
  CompressedData,
  CompressionOptions,
  UTXOContext,
  CompressionDictionary,
  DictionaryEntry,
  CompressionMetadata
} from './compression-types.js';

/**
 * UTXO Custom Compression Engine
 * Specialized compression for UTXO transactions and blockchain data
 */
export class UTXOCustomCompressionEngine implements ICompressionEngine {
  private algorithm = CompressionAlgorithm.UTXO_CUSTOM;
  private level = CompressionLevel.BALANCED;
  private supportedTypes: MessageType[] = [
    MessageType.UTXO_TRANSACTION,
    MessageType.UTXO_BLOCK,
    MessageType.BLOCKCHAIN_SYNC
  ];
  private options: ICompressionEngineOptions = {};
  
  // UTXO-specific compression context
  private addressMap = new Map<string, number>();
  private commonAmounts: number[] = [];
  private feeStructure = { tiers: [1, 10, 100, 1000, 10000] };
  private recentTransactions: any[] = [];

  compress(data: Uint8Array, options?: CompressionOptions): CompressedData {
    try {
      const startTime = performance.now();
      
      // Parse JSON data
      const jsonData = JSON.parse(new TextDecoder().decode(data));
      
      // Determine data type
      const type = this.inferDataType(jsonData);
      let compressed: Uint8Array;
      
      switch (type) {
        case MessageType.UTXO_TRANSACTION:
          compressed = this.compressUTXOTransaction(jsonData);
          break;
        case MessageType.UTXO_BLOCK:
          compressed = this.compressUTXOBlock(jsonData);
          break;
        default:
          compressed = this.compressGeneric(jsonData);
      }
      
      const compressionTime = performance.now() - startTime;
      const metadata = this.createMetadata(data.length, compressed.length, type);
      metadata.compressionTime = compressionTime;

      return {
        algorithm: this.algorithm,
        data: compressed,
        originalSize: data.length,
        metadata,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`UTXO custom compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  decompress(compressedData: CompressedData): Uint8Array {
    try {
      const type = compressedData.metadata.type;
      let decompressed: any;
      
      switch (type) {
        case MessageType.UTXO_TRANSACTION:
          decompressed = this.decompressUTXOTransaction(compressedData.data);
          break;
        case MessageType.UTXO_BLOCK:
          decompressed = this.decompressUTXOBlock(compressedData.data);
          break;
        default:
          decompressed = this.decompressGeneric(compressedData.data);
      }
      
      return new TextEncoder().encode(JSON.stringify(decompressed));
    } catch (error) {
      throw new Error(`UTXO custom decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getAlgorithmName(): CompressionAlgorithm {
    return this.algorithm;
  }

  getSupportedTypes(): MessageType[] {
    return [...this.supportedTypes];
  }

  getCompressionLevel(): CompressionLevel {
    return this.level;
  }

  getExpectedRatio(dataSize: number, type?: MessageType): number {
    switch (type) {
      case MessageType.UTXO_TRANSACTION:
        return 0.25; // 75% compression for UTXO transactions
      case MessageType.UTXO_BLOCK:
        return 0.4;  // 60% compression for UTXO blocks
      default:
        return 0.5;  // 50% compression for other data
    }
  }

  getCompressionSpeed(): number {
    return 1.5 * 1024 * 1024; // 1.5 MB/s
  }

  getDecompressionSpeed(): number {
    return 3 * 1024 * 1024; // 3 MB/s
  }

  configure(options: ICompressionEngineOptions): void {
    this.options = { ...this.options, ...options };
    if (options.level) {
      this.level = options.level;
    }
  }

  getConfiguration(): ICompressionEngineOptions {
    return { ...this.options };
  }

  optimizeForUTXO(context: UTXOContext): void {
    if (context.transactionCount) {
      this.recentTransactions = this.recentTransactions.slice(-context.transactionCount);
    }
    
    // Update common amounts based on context
    if (context.inputCount && context.outputCount) {
      this.updateCommonAmounts();
    }
  }

  supportsDutyCyclePlanning(): boolean {
    return true;
  }

  private inferDataType(data: any): MessageType {
    if (data.inputs && data.outputs) {
      return MessageType.UTXO_TRANSACTION;
    }
    if (data.transactions && data.merkleRoot) {
      return MessageType.UTXO_BLOCK;
    }
    return MessageType.BLOCKCHAIN_SYNC;
  }

  private compressUTXOTransaction(tx: any): Uint8Array {
    const buffer = new ArrayBuffer(512); // Increased buffer for UTXO data
    const view = new DataView(buffer);
    let offset = 0;

    // Transaction ID (16 bytes - UUID compression)
    const txIdBytes = this.compressUUID(tx.id);
    new Uint8Array(buffer, offset, 16).set(txIdBytes);
    offset += 16;

    // Number of inputs (varint)
    offset += this.writeVarint(view, offset, tx.inputs?.length || 0);

    // Compress inputs
    for (const input of tx.inputs || []) {
      // Previous transaction ID (8 bytes - truncated hash)
      const prevTxHash = this.compressHash(input.previousTxId);
      new Uint8Array(buffer, offset, 8).set(prevTxHash);
      offset += 8;

      // Output index (4 bytes)
      view.setUint32(offset, input.outputIndex || 0, true);
      offset += 4;

      // Unlocking script (compressed)
      const scriptBytes = this.compressScript(input.unlockingScript || '');
      view.setUint16(offset, scriptBytes.length, true);
      offset += 2;
      new Uint8Array(buffer, offset, scriptBytes.length).set(scriptBytes);
      offset += scriptBytes.length;
    }

    // Number of outputs (varint)
    offset += this.writeVarint(view, offset, tx.outputs?.length || 0);

    // Compress outputs
    for (const output of tx.outputs || []) {
      // Amount (varint with common value compression)
      offset += this.writeCompressedAmount(view, offset, output.value || 0);

      // Locking script (compressed address)
      const addressId = this.compressAddress(output.lockingScript || '');
      view.setUint32(offset, addressId, true);
      offset += 4;
    }

    // Fee (compressed using fee tiers)
    view.setUint8(offset, this.compressFee(tx.fee || 0));
    offset += 1;

    // Timestamp (delta encoding)
    view.setUint32(offset, this.compressTimestamp(tx.timestamp || Date.now()), true);
    offset += 4;

    // Lock time
    view.setUint32(offset, tx.lockTime || 0, true);
    offset += 4;

    return new Uint8Array(buffer, 0, offset);
  }

  private decompressUTXOTransaction(data: Uint8Array): any {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    // Transaction ID
    const txIdBytes = data.slice(offset, offset + 16);
    const id = this.decompressUUID(txIdBytes);
    offset += 16;

    // Number of inputs
    const [inputCount, inputCountBytes] = this.readVarint(view, offset);
    offset += inputCountBytes;

    // Decompress inputs
    const inputs = [];
    for (let i = 0; i < inputCount; i++) {
      const prevTxHash = this.decompressHash(data.slice(offset, offset + 8));
      offset += 8;

      const outputIndex = view.getUint32(offset, true);
      offset += 4;

      const scriptLength = view.getUint16(offset, true);
      offset += 2;

      const unlockingScript = this.decompressScript(data.slice(offset, offset + scriptLength));
      offset += scriptLength;

      inputs.push({
        previousTxId: prevTxHash,
        outputIndex,
        unlockingScript,
        sequence: 0
      });
    }

    // Number of outputs
    const [outputCount, outputCountBytes] = this.readVarint(view, offset);
    offset += outputCountBytes;

    // Decompress outputs
    const outputs = [];
    for (let i = 0; i < outputCount; i++) {
      const [amount, amountBytes] = this.readCompressedAmount(view, offset);
      offset += amountBytes;

      const addressId = view.getUint32(offset, true);
      offset += 4;

      const lockingScript = this.decompressAddress(addressId);

      outputs.push({
        value: amount,
        lockingScript,
        outputIndex: i
      });
    }

    // Fee
    const fee = this.decompressFee(view.getUint8(offset));
    offset += 1;

    // Timestamp
    const timestamp = this.decompressTimestamp(view.getUint32(offset, true));
    offset += 4;

    // Lock time
    const lockTime = view.getUint32(offset, true);
    offset += 4;

    return {
      id,
      inputs,
      outputs,
      fee,
      timestamp,
      lockTime
    };
  }

  private compressUTXOBlock(block: any): Uint8Array {
    const buffer = new ArrayBuffer(2048); // Larger buffer for block data
    const view = new DataView(buffer);
    let offset = 0;

    // Block index (4 bytes)
    view.setUint32(offset, block.index || 0, true);
    offset += 4;

    // Timestamp (4 bytes)
    view.setUint32(offset, this.compressTimestamp(block.timestamp || Date.now()), true);
    offset += 4;

    // Previous hash (32 bytes)
    const prevHashBytes = this.hexToBytes(block.previousHash || '');
    new Uint8Array(buffer, offset, 32).set(prevHashBytes);
    offset += 32;

    // Current hash (32 bytes)
    const hashBytes = this.hexToBytes(block.hash || '');
    new Uint8Array(buffer, offset, 32).set(hashBytes);
    offset += 32;

    // Merkle root (32 bytes)
    const merkleBytes = this.hexToBytes(block.merkleRoot || '');
    new Uint8Array(buffer, offset, 32).set(merkleBytes);
    offset += 32;

    // Nonce (4 bytes)
    view.setUint32(offset, block.nonce || 0, true);
    offset += 4;

    // Difficulty (4 bytes)
    view.setUint32(offset, block.difficulty || 0, true);
    offset += 4;

    // Number of transactions (varint)
    offset += this.writeVarint(view, offset, block.transactions?.length || 0);

    // Transaction hashes only (for space efficiency)
    for (const tx of block.transactions || []) {
      const txHash = this.compressHash(tx.id);
      new Uint8Array(buffer, offset, 8).set(txHash);
      offset += 8;
    }

    return new Uint8Array(buffer, 0, offset);
  }

  private decompressUTXOBlock(data: Uint8Array): any {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    // Block index
    const index = view.getUint32(offset, true);
    offset += 4;

    // Timestamp
    const timestamp = this.decompressTimestamp(view.getUint32(offset, true));
    offset += 4;

    // Previous hash
    const previousHash = this.bytesToHex(data.slice(offset, offset + 32));
    offset += 32;

    // Current hash
    const hash = this.bytesToHex(data.slice(offset, offset + 32));
    offset += 32;

    // Merkle root
    const merkleRoot = this.bytesToHex(data.slice(offset, offset + 32));
    offset += 32;

    // Nonce
    const nonce = view.getUint32(offset, true);
    offset += 4;

    // Difficulty
    const difficulty = view.getUint32(offset, true);
    offset += 4;

    // Number of transactions
    const [txCount, txCountBytes] = this.readVarint(view, offset);
    offset += txCountBytes;

    // Transaction hashes (would need to fetch full transactions separately)
    const transactions = [];
    for (let i = 0; i < txCount; i++) {
      const txHash = this.decompressHash(data.slice(offset, offset + 8));
      offset += 8;
      
      // In a full implementation, would fetch complete transaction data
      transactions.push({ id: txHash });
    }

    return {
      index,
      timestamp,
      previousHash,
      hash,
      merkleRoot,
      nonce,
      difficulty,
      transactions
    };
  }

  private compressGeneric(data: any): Uint8Array {
    // Fallback to simple JSON compression
    const jsonString = JSON.stringify(data);
    return new TextEncoder().encode(jsonString);
  }

  private decompressGeneric(data: Uint8Array): any {
    const jsonString = new TextDecoder().decode(data);
    return JSON.parse(jsonString);
  }

  // Helper methods for UTXO-specific compression

  private compressUUID(uuid: string): Uint8Array {
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  private decompressUUID(bytes: Uint8Array): string {
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
  }

  private compressHash(hash: string): Uint8Array {
    // Use first 8 bytes of hash for compression
    const fullBytes = this.hexToBytes(hash.padStart(64, '0'));
    return fullBytes.slice(0, 8);
  }

  private decompressHash(bytes: Uint8Array): string {
    return this.bytesToHex(bytes).padEnd(64, '0');
  }

  private compressAddress(address: string): number {
    let id = this.addressMap.get(address);
    if (id === undefined) {
      id = this.addressMap.size;
      this.addressMap.set(address, id);
    }
    return id;
  }

  private decompressAddress(id: number): string {
    // In real implementation, would have reverse lookup
    return `compressed_address_${id}`;
  }

  private compressScript(script: string): Uint8Array {
    // Simple script compression - could be enhanced with script templates
    return new TextEncoder().encode(script);
  }

  private decompressScript(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
  }

  private compressFee(fee: number): number {
    // Map fee to predefined fee tiers
    for (let i = 0; i < this.feeStructure.tiers.length; i++) {
      if (fee <= this.feeStructure.tiers[i]) {
        return i;
      }
    }
    return this.feeStructure.tiers.length - 1;
  }

  private decompressFee(tier: number): number {
    if (tier < this.feeStructure.tiers.length) {
      return this.feeStructure.tiers[tier];
    }
    return this.feeStructure.tiers[this.feeStructure.tiers.length - 1];
  }

  private compressTimestamp(timestamp: number): number {
    // Use relative timestamp from Unix epoch in seconds
    return Math.floor(timestamp / 1000);
  }

  private decompressTimestamp(compressed: number): number {
    return compressed * 1000;
  }

  private writeCompressedAmount(view: DataView, offset: number, amount: number): number {
    // Check if amount is in common amounts list
    const commonIndex = this.commonAmounts.indexOf(amount);
    if (commonIndex !== -1 && commonIndex < 128) {
      // Use single byte for common amounts
      view.setUint8(offset, 0x80 | commonIndex);
      return 1;
    } else {
      // Use varint for uncommon amounts
      view.setUint8(offset, 0x00); // Marker for varint
      return 1 + this.writeVarint(view, offset + 1, amount);
    }
  }

  private readCompressedAmount(view: DataView, offset: number): [number, number] {
    const marker = view.getUint8(offset);
    if (marker & 0x80) {
      // Common amount
      const index = marker & 0x7F;
      return [this.commonAmounts[index] || 0, 1];
    } else {
      // Varint amount
      const [amount, bytes] = this.readVarint(view, offset + 1);
      return [amount, 1 + bytes];
    }
  }

  private writeVarint(view: DataView, offset: number, value: number): number {
    let bytesWritten = 0;
    while (value >= 0x80) {
      view.setUint8(offset + bytesWritten, (value & 0xFF) | 0x80);
      value >>>= 7;
      bytesWritten++;
    }
    view.setUint8(offset + bytesWritten, value & 0xFF);
    return bytesWritten + 1;
  }

  private readVarint(view: DataView, offset: number): [number, number] {
    let value = 0;
    let shift = 0;
    let bytesRead = 0;
    
    while (true) {
      const byte = view.getUint8(offset + bytesRead);
      value |= (byte & 0x7F) << shift;
      bytesRead++;
      
      if (!(byte & 0x80)) {
        break;
      }
      
      shift += 7;
    }
    
    return [value, bytesRead];
  }

  private hexToBytes(hex: string): Uint8Array {
    const normalized = hex.padStart(Math.ceil(hex.length / 2) * 2, '0');
    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < normalized.length; i += 2) {
      bytes[i / 2] = parseInt(normalized.substr(i, 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private updateCommonAmounts(): void {
    // Analyze recent transactions to update common amounts
    const amountFreq = new Map<number, number>();
    
    for (const tx of this.recentTransactions) {
      for (const output of tx.outputs || []) {
        const amount = output.value;
        amountFreq.set(amount, (amountFreq.get(amount) || 0) + 1);
      }
    }
    
    // Update common amounts list
    this.commonAmounts = Array.from(amountFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 128)
      .map(([amount]) => amount);
  }

  private createMetadata(originalSize: number, compressedSize: number, type?: MessageType): CompressionMetadata {
    return {
      version: 1,
      algorithm: this.algorithm,
      originalSize,
      compressedSize,
      type,
      compressionLevel: this.level
    };
  }
}

/**
 * Dictionary-based Compression Engine
 * Uses shared dictionaries for pattern-based compression
 */
export class DictionaryCompressionEngine implements ICompressionEngine, IDictionaryManager {
  private algorithm = CompressionAlgorithm.UTXO_DICTIONARY;
  private level = CompressionLevel.BALANCED;
  private supportedTypes: MessageType[] = Object.values(MessageType);
  private options: ICompressionEngineOptions = {};
  
  private dictionaries = new Map<string, CompressionDictionary>();
  private maxDictionaries = 10;
  private maxDictionarySize = 1000; // Reduced for LoRa constraints

  compress(data: Uint8Array, options?: CompressionOptions): CompressedData {
    try {
      const startTime = performance.now();
      const dictionaryId = options?.dictionaryId || 'default';
      
      const dictionary = this.dictionaries.get(dictionaryId);
      if (!dictionary) {
        throw new Error(`Dictionary not found: ${dictionaryId}`);
      }
      
      const compressed = this.compressWithDictionary(data, dictionary);
      const compressionTime = performance.now() - startTime;
      
      const metadata: CompressionMetadata = {
        version: 1,
        algorithm: this.algorithm,
        originalSize: data.length,
        compressedSize: compressed.length,
        compressionLevel: this.level,
        dictionaryId,
        compressionTime
      };

      return {
        algorithm: this.algorithm,
        data: compressed,
        originalSize: data.length,
        metadata,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Dictionary compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  decompress(compressedData: CompressedData): Uint8Array {
    try {
      const dictionaryId = compressedData.metadata.dictionaryId;
      if (!dictionaryId) {
        throw new Error('No dictionary ID in compressed data metadata');
      }
      
      const dictionary = this.dictionaries.get(dictionaryId);
      if (!dictionary) {
        throw new Error(`Dictionary not found: ${dictionaryId}`);
      }
      
      return this.decompressWithDictionary(compressedData.data, dictionary);
    } catch (error) {
      throw new Error(`Dictionary decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // IDictionaryManager implementation
  createDictionary(samples: Uint8Array[], id: string): CompressionDictionary {
    const patterns = this.extractPatterns(samples);
    const frequency = this.calculateFrequency(patterns);
    const entries = this.selectBestEntries(frequency);

    const dictionary: CompressionDictionary = {
      id,
      version: 1,
      entries: new Map(entries.map((pattern, index) => [pattern, index])),
      reverseEntries: new Map(entries.map((pattern, index) => [index, pattern])),
      frequency,
      size: entries.length,
      compressionRatio: this.estimateCompressionRatio(samples, entries),
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    this.dictionaries.set(id, dictionary);
    this.evictOldDictionaries();
    
    return dictionary;
  }

  updateDictionary(id: string, newSamples: Uint8Array[]): void {
    const dictionary = this.dictionaries.get(id);
    if (!dictionary) {
      throw new Error(`Dictionary not found: ${id}`);
    }

    const newPatterns = this.extractPatterns(newSamples);
    for (const pattern of newPatterns) {
      const currentFreq = dictionary.frequency.get(pattern) || 0;
      dictionary.frequency.set(pattern, currentFreq + 1);
    }

    // Rebuild dictionary entries
    const entries = this.selectBestEntries(dictionary.frequency);
    dictionary.entries = new Map(entries.map((pattern, index) => [pattern, index]));
    dictionary.reverseEntries = new Map(entries.map((pattern, index) => [index, pattern]));
    dictionary.size = entries.length;
    dictionary.lastUpdated = Date.now();
    dictionary.version++;
  }

  deleteDictionary(id: string): boolean {
    return this.dictionaries.delete(id);
  }

  getDictionary(id: string): CompressionDictionary | null {
    return this.dictionaries.get(id) || null;
  }

  listDictionaries(): string[] {
    return Array.from(this.dictionaries.keys());
  }

  getDictionaryStats(id: string): any {
    const dictionary = this.dictionaries.get(id);
    if (!dictionary) {
      return null;
    }
    
    return {
      id: dictionary.id,
      version: dictionary.version,
      size: dictionary.size,
      compressionRatio: dictionary.compressionRatio,
      createdAt: dictionary.createdAt,
      lastUpdated: dictionary.lastUpdated,
      entryCount: dictionary.entries.size
    };
  }

  createUTXODictionary(utxoSamples: any[], id: string): CompressionDictionary {
    const samples = utxoSamples.map(sample => 
      new TextEncoder().encode(JSON.stringify(sample))
    );
    return this.createDictionary(samples, id);
  }

  optimizeDictionaryForRegion(id: string, region: string): void {
    const dictionary = this.dictionaries.get(id);
    if (!dictionary) {
      return;
    }
    
    // Regional optimization could include locale-specific patterns
    // For now, just mark that it's been optimized
    dictionary.lastUpdated = Date.now();
  }

  async saveDictionary(dictionary: CompressionDictionary): Promise<void> {
    // In a real implementation, would persist to storage
    this.dictionaries.set(dictionary.id, dictionary);
  }

  async loadDictionary(id: string): Promise<CompressionDictionary | null> {
    // In a real implementation, would load from storage
    return this.dictionaries.get(id) || null;
  }

  // ICompressionEngine implementation
  getAlgorithmName(): CompressionAlgorithm {
    return this.algorithm;
  }

  getSupportedTypes(): MessageType[] {
    return [...this.supportedTypes];
  }

  getCompressionLevel(): CompressionLevel {
    return this.level;
  }

  getExpectedRatio(dataSize: number, type?: MessageType): number {
    // Dictionary compression can achieve very high ratios with repetitive data
    return 0.2; // 80% compression for repetitive blockchain data
  }

  getCompressionSpeed(): number {
    return 800 * 1024; // 800 KB/s - slower due to dictionary lookup
  }

  getDecompressionSpeed(): number {
    return 1.5 * 1024 * 1024; // 1.5 MB/s
  }

  configure(options: ICompressionEngineOptions): void {
    this.options = { ...this.options, ...options };
    if (options.level) {
      this.level = options.level;
    }
  }

  getConfiguration(): ICompressionEngineOptions {
    return { ...this.options };
  }

  optimizeForUTXO(context: UTXOContext): void {
    // Create UTXO-specific patterns if needed
    if (context.commonPatterns && context.commonPatterns.length > 0) {
      const samples = context.commonPatterns.map(pattern => 
        new TextEncoder().encode(pattern)
      );
      this.createDictionary(samples, 'utxo_optimized');
    }
  }

  supportsDutyCyclePlanning(): boolean {
    return true;
  }

  // Dictionary compression implementation
  private compressWithDictionary(data: Uint8Array, dictionary: CompressionDictionary): Uint8Array {
    const text = new TextDecoder().decode(data);
    const result: number[] = [];
    let i = 0;

    while (i < text.length) {
      let bestMatch = '';
      let bestLength = 0;

      // Find longest matching pattern
      for (const [pattern, id] of dictionary.entries) {
        if (text.substr(i, pattern.length) === pattern && pattern.length > bestLength) {
          bestMatch = pattern;
          bestLength = pattern.length;
        }
      }

      if (bestLength > 0) {
        // Use dictionary reference
        const id = dictionary.entries.get(bestMatch)!;
        result.push(0x80 | (id >> 8), id & 0xFF); // High bit indicates dictionary reference
        i += bestLength;
      } else {
        // Literal character
        result.push(text.charCodeAt(i));
        i++;
      }
    }

    return new Uint8Array(result);
  }

  private decompressWithDictionary(data: Uint8Array, dictionary: CompressionDictionary): Uint8Array {
    const result: string[] = [];
    let i = 0;

    while (i < data.length) {
      const byte = data[i];
      
      if (byte & 0x80) {
        // Dictionary reference
        if (i + 1 >= data.length) {
          throw new Error('Incomplete dictionary reference');
        }
        
        const id = ((byte & 0x7F) << 8) | data[i + 1];
        const pattern = dictionary.reverseEntries.get(id);
        
        if (!pattern) {
          throw new Error(`Dictionary pattern not found: ${id}`);
        }
        
        result.push(pattern);
        i += 2;
      } else {
        // Literal character
        result.push(String.fromCharCode(byte));
        i++;
      }
    }

    return new TextEncoder().encode(result.join(''));
  }

  private extractPatterns(samples: Uint8Array[]): string[] {
    const patterns = new Set<string>();

    for (const sample of samples) {
      const text = new TextDecoder().decode(sample);

      // Extract n-grams of various lengths
      for (let len = 2; len <= 8; len++) {
        for (let i = 0; i <= text.length - len; i++) {
          const pattern = text.substr(i, len);
          if (pattern.trim().length > 1) { // Skip whitespace-only patterns
            patterns.add(pattern);
          }
        }
      }
    }

    return Array.from(patterns);
  }

  private calculateFrequency(patterns: string[]): Map<string, number> {
    const frequency = new Map<string, number>();

    for (const pattern of patterns) {
      frequency.set(pattern, (frequency.get(pattern) || 0) + 1);
    }

    return frequency;
  }

  private selectBestEntries(frequency: Map<string, number>): string[] {
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by frequency descending
      .slice(0, this.maxDictionarySize)
      .map(([pattern]) => pattern);
  }

  private estimateCompressionRatio(samples: Uint8Array[], entries: string[]): number {
    let totalOriginal = 0;
    let totalCompressed = 0;

    for (const sample of samples) {
      totalOriginal += sample.length;
      totalCompressed += sample.length * 0.3; // Estimate 70% compression
    }

    return totalCompressed / totalOriginal;
  }

  private evictOldDictionaries(): void {
    if (this.dictionaries.size <= this.maxDictionaries) {
      return;
    }

    // Remove oldest dictionary
    let oldestId = '';
    let oldestTime = Date.now();

    for (const [id, dictionary] of this.dictionaries) {
      if (dictionary.lastUpdated < oldestTime) {
        oldestTime = dictionary.lastUpdated;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.dictionaries.delete(oldestId);
    }
  }
}
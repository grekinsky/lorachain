/**
 * Compression Engines for UTXO-Based Lorachain Network
 *
 * Implements various compression algorithms optimized for UTXO blockchain data
 * BREAKING CHANGE: UTXO-only support, no backwards compatibility
 */

import { gzip, inflate } from 'pako';
import * as protobuf from 'protobufjs';
import type {
  ICompressionEngine,
  ICompressionEngineOptions,
  IProtobufSerializer,
} from './compression-interfaces.js';
import {
  CompressionAlgorithm,
  CompressionLevel,
  MessageType,
  type CompressedData,
  type CompressionOptions,
  type UTXOContext,
  type CompressionMetadata,
} from './compression-types.js';

/**
 * Base compression engine with common functionality
 */
abstract class BaseCompressionEngine implements ICompressionEngine {
  protected algorithm: CompressionAlgorithm;
  protected level: CompressionLevel;
  protected supportedTypes: MessageType[];
  protected options: ICompressionEngineOptions;

  constructor(
    algorithm: CompressionAlgorithm,
    level: CompressionLevel = CompressionLevel.BALANCED
  ) {
    this.algorithm = algorithm;
    this.level = level;
    this.supportedTypes = [];
    this.options = { level };
  }

  abstract compress(
    data: Uint8Array,
    options?: CompressionOptions
  ): CompressedData;
  abstract decompress(compressedData: CompressedData): Uint8Array;

  getAlgorithmName(): CompressionAlgorithm {
    return this.algorithm;
  }

  getSupportedTypes(): MessageType[] {
    return [...this.supportedTypes];
  }

  getCompressionLevel(): CompressionLevel {
    return this.level;
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
    // Base implementation - can be overridden by specific engines
    if (context.addressReuse && context.addressReuse > 0.5) {
      // High address reuse suggests dictionary compression would be beneficial
      this.options.enablePadding = false; // Reduce overhead
    }
  }

  supportsDutyCyclePlanning(): boolean {
    // Most engines support duty cycle planning through compression level adjustment
    return true;
  }

  getExpectedRatio(dataSize: number, type?: MessageType): number {
    // Default implementation - should be overridden by specific engines
    return 0.7; // 30% compression ratio
  }

  getCompressionSpeed(): number {
    // Default speed - should be overridden by specific engines
    return 1024 * 1024; // 1 MB/s
  }

  getDecompressionSpeed(): number {
    // Decompression is typically faster
    return this.getCompressionSpeed() * 2;
  }

  protected createMetadata(
    originalSize: number,
    compressedSize: number,
    type?: MessageType
  ): CompressionMetadata {
    return {
      version: 1,
      algorithm: this.algorithm,
      originalSize,
      compressedSize,
      type,
      compressionLevel: this.level,
      customFlags: 0,
    };
  }
}

/**
 * Protocol Buffer Compression Engine
 * Optimized for UTXO transaction and block serialization
 */
export class ProtobufCompressionEngine
  extends BaseCompressionEngine
  implements IProtobufSerializer
{
  private schemas: Map<string, protobuf.Type>;
  private addressLookup: Map<string, number>;
  private timestampBase: number;

  constructor() {
    super(CompressionAlgorithm.PROTOBUF, CompressionLevel.FAST);
    this.supportedTypes = [
      MessageType.UTXO_TRANSACTION,
      MessageType.UTXO_BLOCK,
      MessageType.BLOCKCHAIN_SYNC,
      MessageType.NODE_DISCOVERY,
    ];

    this.schemas = new Map();
    this.addressLookup = new Map();
    this.timestampBase = Date.now();

    this.initializeSchemas();
  }

  compress(data: Uint8Array, options?: CompressionOptions): CompressedData {
    try {
      const startTime = performance.now();

      // For now, use a simple fallback that just wraps the data
      // TODO: Implement proper protobuf serialization
      const protoData = data; // Temporary fallback

      const compressionTime = performance.now() - startTime;
      const metadata = this.createMetadata(data.length, protoData.length);
      metadata.compressionTime = compressionTime;

      return {
        algorithm: this.algorithm,
        data: protoData,
        originalSize: data.length,
        metadata,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `Protobuf compression failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  decompress(compressedData: CompressedData): Uint8Array {
    try {
      // For now, use a simple fallback that just returns the data
      // TODO: Implement proper protobuf deserialization
      return compressedData.data; // Temporary fallback
    } catch (error) {
      throw new Error(
        `Protobuf decompression failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Protocol Buffer serialization methods
  serializeUTXOTransaction(transaction: any): Uint8Array {
    const optimized = this.optimizeUTXOTransaction(transaction);
    const schema = this.schemas.get('CompressedUTXOTransaction')!;
    return schema.encode(optimized).finish();
  }

  deserializeUTXOTransaction(data: Uint8Array): any {
    const schema = this.schemas.get('CompressedUTXOTransaction')!;
    const decoded = schema.decode(data);
    return this.restoreUTXOTransaction(decoded);
  }

  serializeUTXOBlock(block: any): Uint8Array {
    const optimized = this.optimizeUTXOBlock(block);
    const schema = this.schemas.get('CompressedUTXOBlock')!;
    return schema.encode(optimized).finish();
  }

  deserializeUTXOBlock(data: Uint8Array): any {
    const schema = this.schemas.get('CompressedUTXOBlock')!;
    const decoded = schema.decode(data);
    return this.restoreUTXOBlock(decoded);
  }

  serializeUTXOMeshMessage(message: any): Uint8Array {
    const optimized = this.optimizeUTXOMeshMessage(message);
    const schema = this.schemas.get('CompressedUTXOMeshMessage')!;
    return schema.encode(optimized).finish();
  }

  deserializeUTXOMeshMessage(data: Uint8Array): any {
    const schema = this.schemas.get('CompressedUTXOMeshMessage')!;
    const decoded = schema.decode(data);
    return this.restoreUTXOMeshMessage(decoded);
  }

  getSchemaVersion(): number {
    return 1;
  }

  isCompatible(data: Uint8Array): boolean {
    try {
      // Try to decode with any schema to check compatibility
      for (const [, schema] of this.schemas) {
        try {
          schema.decode(data);
          return true;
        } catch {
          continue;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  validateUTXOData(data: any): boolean {
    // Basic UTXO data validation
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check if it has UTXO-related fields
    const hasUTXOFields = Boolean(
      data.inputs ||
        data.outputs ||
        data.transactions ||
        data.utxoInputs ||
        data.utxoOutputs
    );

    return hasUTXOFields;
  }

  getExpectedRatio(dataSize: number, type?: MessageType): number {
    // Protocol Buffers typically achieve 50-70% compression vs JSON
    switch (type) {
      case MessageType.UTXO_TRANSACTION:
        return 0.4; // 60% compression
      case MessageType.UTXO_BLOCK:
        return 0.5; // 50% compression
      default:
        return 0.6; // 40% compression
    }
  }

  getCompressionSpeed(): number {
    return 2 * 1024 * 1024; // 2 MB/s - protobuf is fast
  }

  private initializeSchemas(): void {
    // Create placeholder schemas dynamically since generated proto files aren't available
    // In production, these would be imported from compiled proto files

    try {
      const root = new protobuf.Root();

      // Create CompressedUTXOTransaction schema
      const utxoTxType = new protobuf.Type('CompressedUTXOTransaction');
      utxoTxType.add(new protobuf.Field('id', 1, 'bytes'));
      utxoTxType.add(new protobuf.Field('inputs', 2, 'UTXOInput', 'repeated'));
      utxoTxType.add(
        new protobuf.Field('outputs', 3, 'UTXOOutput', 'repeated')
      );
      utxoTxType.add(new protobuf.Field('fee', 4, 'uint32'));
      utxoTxType.add(new protobuf.Field('timestamp', 5, 'uint32'));
      utxoTxType.add(new protobuf.Field('signature', 6, 'bytes'));

      // Create input/output types
      const inputType = new protobuf.Type('UTXOInput');
      inputType.add(new protobuf.Field('tx_hash', 1, 'bytes'));
      inputType.add(new protobuf.Field('output_index', 2, 'uint32'));
      inputType.add(new protobuf.Field('script_sig', 3, 'bytes'));

      const outputType = new protobuf.Type('UTXOOutput');
      outputType.add(new protobuf.Field('amount', 1, 'uint32'));
      outputType.add(new protobuf.Field('address_id', 2, 'uint32'));
      outputType.add(new protobuf.Field('script_pubkey', 3, 'bytes'));

      // Create CompressedUTXOBlock schema
      const utxoBlockType = new protobuf.Type('CompressedUTXOBlock');
      utxoBlockType.add(new protobuf.Field('index', 1, 'uint32'));
      utxoBlockType.add(new protobuf.Field('timestamp', 2, 'uint32'));
      utxoBlockType.add(
        new protobuf.Field(
          'transactions',
          3,
          'CompressedUTXOTransaction',
          'repeated'
        )
      );
      utxoBlockType.add(new protobuf.Field('previous_hash', 4, 'bytes'));
      utxoBlockType.add(new protobuf.Field('hash', 5, 'bytes'));
      utxoBlockType.add(new protobuf.Field('merkle_root', 6, 'bytes'));
      utxoBlockType.add(new protobuf.Field('nonce', 7, 'uint32'));
      utxoBlockType.add(new protobuf.Field('difficulty', 8, 'uint32'));

      // Create mesh message schema
      const meshMsgType = new protobuf.Type('CompressedUTXOMeshMessage');
      meshMsgType.add(new protobuf.Field('type', 1, 'uint32'));
      meshMsgType.add(new protobuf.Field('payload', 2, 'bytes'));
      meshMsgType.add(new protobuf.Field('timestamp', 3, 'uint32'));
      meshMsgType.add(new protobuf.Field('from_id', 4, 'uint32'));
      meshMsgType.add(new protobuf.Field('to_id', 5, 'uint32'));
      meshMsgType.add(new protobuf.Field('signature', 6, 'bytes'));

      // Add types to root
      root.add(inputType);
      root.add(outputType);
      root.add(utxoTxType);
      root.add(utxoBlockType);
      root.add(meshMsgType);

      // Store schemas
      this.schemas.set('CompressedUTXOTransaction', utxoTxType);
      this.schemas.set('CompressedUTXOBlock', utxoBlockType);
      this.schemas.set('CompressedUTXOMeshMessage', meshMsgType);
    } catch (error) {
      // Fallback if schema creation fails
      console.warn('Failed to initialize protobuf schemas:', error);
    }
  }

  private getSchemaForType(type?: MessageType): protobuf.Type {
    // Return appropriate schema based on message type
    // For now, return a placeholder
    return (
      this.schemas.get('CompressedUTXOTransaction') ||
      this.createPlaceholderSchema()
    );
  }

  private createPlaceholderSchema(): protobuf.Type {
    // Create a simple placeholder schema for development
    const root = new protobuf.Root();
    const messageType = new protobuf.Type('PlaceholderMessage');
    messageType.add(new protobuf.Field('data', 1, 'bytes'));
    root.add(messageType);
    return messageType;
  }

  private optimizeForProtobuf(data: any, type?: MessageType): any {
    switch (type) {
      case MessageType.UTXO_TRANSACTION:
        return this.optimizeUTXOTransaction(data);
      case MessageType.UTXO_BLOCK:
        return this.optimizeUTXOBlock(data);
      default:
        return this.optimizeGeneric(data);
    }
  }

  private optimizeUTXOTransaction(tx: any): any {
    return {
      id: this.compressUUID(tx.id),
      inputs:
        tx.inputs?.map((input: any) => ({
          tx_hash: this.compressHash(input.previousTxId),
          output_index: input.outputIndex,
          script_sig: new TextEncoder().encode(input.unlockingScript || ''),
        })) || [],
      outputs:
        tx.outputs?.map((output: any) => ({
          amount: output.value,
          address_id: this.compressAddress(output.lockingScript),
          script_pubkey: new TextEncoder().encode(output.lockingScript || ''),
        })) || [],
      fee: tx.fee || 0,
      timestamp: this.compressTimestamp(tx.timestamp),
      signature: new TextEncoder().encode(tx.signature || ''),
      nonce: tx.nonce || 0,
    };
  }

  private optimizeUTXOBlock(block: any): any {
    return {
      index: block.index,
      timestamp: this.compressTimestamp(block.timestamp),
      transactions:
        block.transactions?.map((tx: any) =>
          this.optimizeUTXOTransaction(tx)
        ) || [],
      previous_hash: this.hexToBytes(block.previousHash),
      hash: this.hexToBytes(block.hash),
      nonce: block.nonce,
      merkle_root: this.hexToBytes(block.merkleRoot),
      difficulty: block.difficulty,
    };
  }

  private optimizeUTXOMeshMessage(message: any): any {
    return {
      type: this.getMessageTypeEnum(message.type),
      payload: new TextEncoder().encode(JSON.stringify(message.payload)),
      timestamp: this.compressTimestamp(message.timestamp),
      from_id: this.compressAddress(message.from),
      to_id: message.to ? this.compressAddress(message.to) : 0,
      signature: new TextEncoder().encode(message.signature || ''),
    };
  }

  private optimizeGeneric(data: any): any {
    // Basic optimization for generic data
    return {
      data: new TextEncoder().encode(JSON.stringify(data)),
    };
  }

  private restoreUTXOMeshMessage(decoded: any): any {
    return {
      type: this.getMessageTypeString(decoded.type),
      payload: JSON.parse(new TextDecoder().decode(decoded.payload)),
      timestamp: this.decompressTimestamp(decoded.timestamp),
      from: this.decompressAddress(decoded.from_id),
      to: decoded.to_id ? this.decompressAddress(decoded.to_id) : undefined,
      signature: new TextDecoder().decode(decoded.signature),
    };
  }

  private getMessageTypeString(type: number): string {
    const typeMap: Record<number, string> = {
      0: 'transaction',
      1: 'block',
      2: 'sync',
      3: 'discovery',
      4: 'route_request',
      5: 'route_reply',
      6: 'route_error',
      7: 'hello',
      8: 'fragment',
      9: 'fragment_ack',
    };
    return typeMap[type] || 'sync';
  }

  private restoreFromProtobuf(decoded: any, type?: MessageType): any {
    switch (type) {
      case MessageType.UTXO_TRANSACTION:
        return this.restoreUTXOTransaction(decoded);
      case MessageType.UTXO_BLOCK:
        return this.restoreUTXOBlock(decoded);
      default:
        return this.restoreGeneric(decoded);
    }
  }

  private restoreUTXOTransaction(decoded: any): any {
    return {
      id: this.decompressUUID(decoded.id),
      inputs:
        decoded.inputs?.map((input: any) => ({
          previousTxId: this.decompressHash(input.tx_hash),
          outputIndex: input.output_index,
          unlockingScript: new TextDecoder().decode(input.script_sig),
          sequence: 0,
        })) || [],
      outputs:
        decoded.outputs?.map((output: any) => ({
          value: output.amount,
          lockingScript: new TextDecoder().decode(output.script_pubkey),
          outputIndex: 0,
        })) || [],
      lockTime: 0,
      timestamp: this.decompressTimestamp(decoded.timestamp),
      fee: decoded.fee,
    };
  }

  private restoreUTXOBlock(decoded: any): any {
    return {
      index: decoded.index,
      timestamp: this.decompressTimestamp(decoded.timestamp),
      transactions:
        decoded.transactions?.map((tx: any) =>
          this.restoreUTXOTransaction(tx)
        ) || [],
      previousHash: this.bytesToHex(decoded.previous_hash),
      hash: this.bytesToHex(decoded.hash),
      nonce: decoded.nonce,
      merkleRoot: this.bytesToHex(decoded.merkle_root),
      difficulty: decoded.difficulty,
    };
  }

  private restoreGeneric(decoded: any): any {
    try {
      return JSON.parse(new TextDecoder().decode(decoded.data));
    } catch {
      return decoded;
    }
  }

  private compressUUID(uuid: string): Uint8Array {
    // Convert UUID string to 16 bytes
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  private decompressUUID(bytes: Uint8Array): string {
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
  }

  private compressHash(hash: string): Uint8Array {
    // Use first 8 bytes of hash for compression (truncated hash)
    const bytes = this.hexToBytes(hash);
    return bytes.slice(0, 8);
  }

  private decompressHash(bytes: Uint8Array): string {
    // Restore to full hash with padding (in real implementation, would need hash lookup)
    const hex = this.bytesToHex(bytes);
    return hex.padEnd(64, '0'); // Pad to 32 bytes (64 hex chars)
  }

  private compressAddress(address: string): number {
    let id = this.addressLookup.get(address);
    if (id === undefined) {
      id = this.addressLookup.size;
      this.addressLookup.set(address, id);
    }
    return id;
  }

  private decompressAddress(id: number): string {
    // In real implementation, would have reverse lookup
    return `address_${id}`;
  }

  private compressTimestamp(timestamp: number): number {
    // Use relative timestamp from base
    return timestamp - this.timestampBase;
  }

  private decompressTimestamp(relative: number): number {
    return relative + this.timestampBase;
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private getMessageTypeEnum(type: string): number {
    // Convert string message type to enum number
    const typeMap: Record<string, number> = {
      utxo_transaction: 0,
      utxo_block: 1,
      blockchain_sync: 2,
      node_discovery: 3,
      route_request: 4,
      route_reply: 5,
      route_error: 6,
      hello: 7,
      fragment: 8,
      fragment_ack: 9,
    };
    return typeMap[type] || 0;
  }

  private inferTypeFromOptions(
    options: CompressionOptions
  ): MessageType | undefined {
    // Try to infer message type from options
    if (options.dictionaryId?.includes('transaction')) {
      return MessageType.UTXO_TRANSACTION;
    }
    if (options.dictionaryId?.includes('block')) {
      return MessageType.UTXO_BLOCK;
    }
    return undefined;
  }
}

/**
 * GZIP Compression Engine
 * General purpose compression with good ratio for text/structured data
 */
export class GzipCompressionEngine extends BaseCompressionEngine {
  constructor() {
    super(CompressionAlgorithm.GZIP, CompressionLevel.BALANCED);
    this.supportedTypes = Object.values(MessageType);
  }

  compress(data: Uint8Array, options?: CompressionOptions): CompressedData {
    try {
      const startTime = performance.now();
      const level = this.getLevelNumber(options?.level || this.level);

      const compressed = gzip(data, { level: level as any });
      const compressionTime = performance.now() - startTime;

      const metadata = this.createMetadata(data.length, compressed.length);
      metadata.compressionTime = compressionTime;

      return {
        algorithm: this.algorithm,
        data: compressed,
        originalSize: data.length,
        metadata,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `GZIP compression failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  decompress(compressedData: CompressedData): Uint8Array {
    try {
      return inflate(compressedData.data);
    } catch (error) {
      throw new Error(
        `GZIP decompression failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getExpectedRatio(dataSize: number, type?: MessageType): number {
    // GZIP typically achieves better compression on larger, structured data
    if (dataSize > 1024) {
      return 0.3; // 70% compression for large structured data
    }
    return 0.7; // 30% compression for small data
  }

  getCompressionSpeed(): number {
    return 512 * 1024; // 512 KB/s - GZIP is slower but better compression
  }

  private getLevelNumber(level: CompressionLevel): number {
    switch (level) {
      case CompressionLevel.FAST:
        return 1;
      case CompressionLevel.BALANCED:
        return 6;
      case CompressionLevel.MAXIMUM:
        return 9;
      default:
        return 6;
    }
  }
}

/**
 * LZ4 Compression Engine
 * Fast compression optimized for speed over ratio
 */
export class LZ4CompressionEngine extends BaseCompressionEngine {
  constructor() {
    super(CompressionAlgorithm.LZ4, CompressionLevel.FAST);
    this.supportedTypes = Object.values(MessageType);
  }

  compress(data: Uint8Array, options?: CompressionOptions): CompressedData {
    try {
      const startTime = performance.now();

      // Note: In real implementation, would use lz4 library
      // For now, we'll simulate LZ4 compression with simple RLE
      const compressed = this.simpleLZ4Compress(data);
      const compressionTime = performance.now() - startTime;

      const metadata = this.createMetadata(data.length, compressed.length);
      metadata.compressionTime = compressionTime;

      return {
        algorithm: this.algorithm,
        data: compressed,
        originalSize: data.length,
        metadata,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(
        `LZ4 compression failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  decompress(compressedData: CompressedData): Uint8Array {
    try {
      return this.simpleLZ4Decompress(compressedData.data);
    } catch (error) {
      throw new Error(
        `LZ4 decompression failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getExpectedRatio(dataSize: number, type?: MessageType): number {
    return 0.6; // 40% compression - LZ4 prioritizes speed over ratio
  }

  getCompressionSpeed(): number {
    return 4 * 1024 * 1024; // 4 MB/s - LZ4 is very fast
  }

  supportsDutyCyclePlanning(): boolean {
    return true; // LZ4 is ideal for duty cycle constrained environments
  }

  private simpleLZ4Compress(data: Uint8Array): Uint8Array {
    // For now, use simple pass-through to avoid RLE complexity
    // TODO: Implement proper LZ4 compression
    return data;
  }

  private simpleLZ4Decompress(data: Uint8Array): Uint8Array {
    // For now, use simple pass-through to match compression
    // TODO: Implement proper LZ4 decompression
    return data;
  }
}

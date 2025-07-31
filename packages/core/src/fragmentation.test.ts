import { describe, it, expect, beforeEach } from 'vitest';
import {
  UTXOMessageFragmenter,
  UTXOFragmentReassembler,
  UTXOFragmentCache,
} from './fragmentation.js';
import { CryptographicService } from './cryptographic.js';
import type { 
  UTXOTransaction, 
  Block, 
  CompressedMerkleProof,
  Fragment,
} from './types.js';

describe('UTXOMessageFragmenter', () => {
  let fragmenter: UTXOMessageFragmenter;
  let keyPair: any;

  beforeEach(() => {
    const cryptoService = new CryptographicService();
    fragmenter = new UTXOMessageFragmenter(cryptoService);
    keyPair = CryptographicService.generateKeyPair('ed25519');
  });

  describe('UTXO Transaction Fragmentation', () => {
    it('should create single fragment for small UTXO transaction', () => {
      const smallTx: UTXOTransaction = {
        id: 'test-tx-1',
        inputs: [],
        outputs: [
          {
            value: 100,
            lockingScript: 'test-address',
            outputIndex: 0,
          },
        ],
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0.001,
      };

      const fragments = fragmenter.splitUTXOTransaction(smallTx, keyPair);

      expect(fragments).toHaveLength(1);
      expect(fragments[0].header.totalFragments).toBe(1);
      expect(fragments[0].header.sequenceNumber).toBe(0);
    });

    it('should create multiple fragments for large UTXO transaction', () => {
      // Create a large transaction by adding many outputs
      const largeOutputs = Array.from({ length: 50 }, (_, i) => ({
        value: 100,
        lockingScript: `very-long-address-${i}-${'x'.repeat(50)}`,
        outputIndex: i,
      }));

      const largeTx: UTXOTransaction = {
        id: 'large-tx-1',
        inputs: [],
        outputs: largeOutputs,
        lockTime: 0,
        timestamp: Date.now(),
        fee: 0.001,
      };

      const fragments = fragmenter.splitUTXOTransaction(largeTx, keyPair);

      expect(fragments.length).toBeGreaterThan(1);
      
      // Verify fragment headers
      fragments.forEach((fragment, index) => {
        expect(fragment.header.sequenceNumber).toBe(index);
        expect(fragment.header.totalFragments).toBe(fragments.length);
        expect(fragment.header.signature).toBeInstanceOf(Uint8Array);
        expect(fragment.header.signature.length).toBe(64); // Ed25519 signature length
      });
    });

    it('should calculate optimal fragment size for UTXO transactions', () => {
      const optimalSize = fragmenter.calculateOptimalFragmentSize('utxo_transaction');
      expect(optimalSize).toBe(180); // Per specification
    });
  });

  describe('Block Fragmentation', () => {
    it('should fragment blocks correctly', () => {
      const testBlock: Block = {
        index: 1,
        timestamp: Date.now(),
        transactions: Array.from({ length: 10 }, (_, i) => ({
          id: `tx-${i}`,
          from: `address-${i}`,
          to: `address-${i + 1}`,
          amount: 100,
          fee: 0.001,
          timestamp: Date.now(),
          signature: 'signature',
          nonce: i,
        })),
        previousHash: 'prev-hash',
        hash: 'block-hash',
        nonce: 12345,
        merkleRoot: 'merkle-root',
        difficulty: 2,
      };

      const fragments = fragmenter.splitBlock(testBlock, keyPair);

      expect(fragments.length).toBeGreaterThan(1);
      expect(fragments[0].header.totalFragments).toBe(fragments.length);
    });

    it('should calculate optimal fragment size for blocks', () => {
      const optimalSize = fragmenter.calculateOptimalFragmentSize('block');
      expect(optimalSize).toBe(197); // Full size for large blocks
    });
  });

  describe('Merkle Proof Fragmentation', () => {
    it('should fragment merkle proofs correctly', () => {
      const testProof: CompressedMerkleProof = {
        txId: 'test-tx-1',
        txHash: 'tx-hash',
        root: 'merkle-root',
        path: 'x'.repeat(300), // Long compressed path
        index: 0,
      };

      const fragments = fragmenter.splitMerkleProof(testProof, keyPair);

      expect(fragments.length).toBeGreaterThan(1);
      expect(fragments[0].header.totalFragments).toBe(fragments.length);
    });

    it('should calculate optimal fragment size for merkle proofs', () => {
      const optimalSize = fragmenter.calculateOptimalFragmentSize('merkle_proof');
      expect(optimalSize).toBe(150); // Optimized for compressed proofs
    });
  });
});

describe('UTXOFragmentReassembler', () => {
  let reassembler: UTXOFragmentReassembler;
  let fragmenter: UTXOMessageFragmenter;
  let keyPair: any;

  beforeEach(() => {
    reassembler = new UTXOFragmentReassembler();
    const cryptoService = new CryptographicService();
    fragmenter = new UTXOMessageFragmenter(cryptoService);
    keyPair = CryptographicService.generateKeyPair('ed25519');
  });

  it('should reassemble fragmented UTXO transaction', () => {
    const originalTx: UTXOTransaction = {
      id: 'test-tx-1',
      inputs: [],
      outputs: Array.from({ length: 20 }, (_, i) => ({
        value: 100,
        lockingScript: `address-${i}`,
        outputIndex: i,
      })),
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0.001,
    };

    const fragments = fragmenter.splitUTXOTransaction(originalTx, keyPair);
    
    // Add fragments in order
    fragments.forEach((fragment) => {
      const result = reassembler.addFragment(fragment);
      if (fragment.header.sequenceNumber === fragments.length - 1) {
        expect(result).toBe('message_complete');
      } else {
        expect(result).toBe('fragment_added');
      }
    });

    // Retrieve complete transaction
    const reassembledTx = reassembler.getCompleteUTXOTransaction(fragments[0].header.messageId);
    expect(reassembledTx).toBeTruthy();
    expect(reassembledTx?.id).toBe(originalTx.id);
    expect(reassembledTx?.outputs).toHaveLength(originalTx.outputs.length);
  });

  it('should handle duplicate fragments', () => {
    const originalTx: UTXOTransaction = {
      id: 'test-tx-1',
      inputs: [],
      outputs: [{ value: 100, lockingScript: 'test-address', outputIndex: 0 }],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0.001,
    };

    const fragments = fragmenter.splitUTXOTransaction(originalTx, keyPair);
    
    // Add first fragment twice
    const result1 = reassembler.addFragment(fragments[0]);
    const result2 = reassembler.addFragment(fragments[0]);
    
    expect(result1).toBe('fragment_added');
    expect(result2).toBe('duplicate_fragment');
  });

  it('should handle out-of-order fragments', () => {
    const originalTx: UTXOTransaction = {
      id: 'test-tx-1',
      inputs: [],
      outputs: Array.from({ length: 10 }, (_, i) => ({
        value: 100,
        lockingScript: `address-${i}`,
        outputIndex: i,
      })),
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0.001,
    };

    const fragments = fragmenter.splitUTXOTransaction(originalTx, keyPair);
    
    if (fragments.length > 1) {
      // Add fragments in reverse order
      for (let i = fragments.length - 1; i >= 0; i--) {
        const result = reassembler.addFragment(fragments[i]);
        if (i === 0) {
          expect(result).toBe('message_complete');
        } else {
          expect(result).toBe('fragment_added');
        }
      }

      // Should still reassemble correctly
      const reassembledTx = reassembler.getCompleteUTXOTransaction(fragments[0].header.messageId);
      expect(reassembledTx).toBeTruthy();
      expect(reassembledTx?.id).toBe(originalTx.id);
    }
  });

  it('should clean up expired sessions', () => {
    // Create fragments but don't complete assembly
    const originalTx: UTXOTransaction = {
      id: 'test-tx-1',
      inputs: [],
      outputs: [{ value: 100, lockingScript: 'test-address', outputIndex: 0 }],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0.001,
    };

    const fragments = fragmenter.splitUTXOTransaction(originalTx, keyPair);
    
    // Add only first fragment
    reassembler.addFragment(fragments[0]);
    
    // Force cleanup
    reassembler.cleanup();
    
    // This should work without throwing errors
    expect(() => reassembler.cleanup()).not.toThrow();
  });
});

describe('UTXOFragmentCache', () => {
  let cache: UTXOFragmentCache;
  let fragmenter: UTXOMessageFragmenter;
  let keyPair: any;

  beforeEach(() => {
    cache = new UTXOFragmentCache();
    const cryptoService = new CryptographicService();
    fragmenter = new UTXOMessageFragmenter(cryptoService);
    keyPair = CryptographicService.generateKeyPair('ed25519');
  });

  it('should store and retrieve fragments', async () => {
    const originalTx: UTXOTransaction = {
      id: 'test-tx-1',
      inputs: [],
      outputs: [{ value: 100, lockingScript: 'test-address', outputIndex: 0 }],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0.001,
    };

    const fragments = fragmenter.splitUTXOTransaction(originalTx, keyPair);
    const fragment = fragments[0];

    // Store fragment
    await cache.store(fragment);

    // Retrieve fragment
    const retrieved = await cache.retrieve(fragment.header.messageId, fragment.header.sequenceNumber);
    
    expect(retrieved).toBeTruthy();
    expect(retrieved?.header.messageId).toEqual(fragment.header.messageId);
    expect(retrieved?.header.sequenceNumber).toBe(fragment.header.sequenceNumber);
  });

  it('should return null for non-existent fragments', async () => {
    const fakeMessageId = new Uint8Array(16).fill(0);
    
    const retrieved = await cache.retrieve(fakeMessageId, 0);
    
    expect(retrieved).toBeNull();
  });

  it('should evict fragments based on criteria', async () => {
    const originalTx: UTXOTransaction = {
      id: 'test-tx-1',
      inputs: [],
      outputs: [{ value: 100, lockingScript: 'test-address', outputIndex: 0 }],
      lockTime: 0,
      timestamp: Date.now(),
      fee: 0.001,
    };

    const fragments = fragmenter.splitUTXOTransaction(originalTx, keyPair);
    
    // Store fragments
    for (const fragment of fragments) {
      await cache.store(fragment);
    }

    // Evict all fragments
    await cache.evict({
      maxAge: 0, // Evict everything
      maxSessions: 0,
      memoryThreshold: 0,
    });

    // Should not be able to retrieve after eviction
    const retrieved = await cache.retrieve(fragments[0].header.messageId, 0);
    expect(retrieved).toBeNull();
  });
});
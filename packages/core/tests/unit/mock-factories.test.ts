import { describe, it, expect } from 'vitest';
import {
  createValidMockBlock,
  createMockBlockChain,
  createForkingChains,
  createMockGenesisBlock,
  createMockBlockWithTransactions,
} from '../shared/fixtures/mock-block-factory.js';
import {
  createValidMockUTXOTransaction,
  createMockUTXOTransactionBatch,
  createMockUTXOTransactionWithInputs,
  createMockUTXO,
  createMockUTXOBatch,
  createCoinbaseTransaction,
  createMultiOutputTransaction,
  generateTxId,
} from '../shared/fixtures/mock-transaction-factory.js';
import {
  createCompleteGenesisConfig,
  createDevnetGenesisConfig,
  createTestnetGenesisConfig,
  createMainnetGenesisConfig,
  createPrivateGenesisConfig,
  createMinimalGenesisConfig,
  createGenesisConfigWithAllocations,
  TEST_GENESIS_CONFIGS,
} from '../shared/fixtures/mock-genesis-config.js';
import {
  validateMockBlock,
  validateMockUTXOTransaction,
  validateMockChain,
  validateMockGenesisConfig,
  isValidMockBlock,
  isValidMockUTXOTransaction,
  isValidMockChain,
  isValidMockGenesisConfig,
} from '../shared/fixtures/mock-validation.js';

describe('Mock Factories', () => {
  describe('Block Factory', () => {
    describe('createValidMockBlock', () => {
      it('should create a block that passes validation', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'genesis-hash',
          difficulty: 2,
        });

        expect(() => validateMockBlock(block)).not.toThrow();
        expect(block.index).toBe(1);
        expect(block.previousHash).toBe('genesis-hash');
        expect(block.difficulty).toBe(2);
      });

      it('should create block with valid hash meeting difficulty', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test-hash',
          difficulty: 3,
        });

        expect(block.hash.startsWith('000')).toBe(true);
        expect(() => validateMockBlock(block)).not.toThrow();
      });

      it('should create block with proper merkle root', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test-hash',
        });

        expect(block.merkleRoot).toBeDefined();
        expect(block.merkleRoot.length).toBeGreaterThan(0);
      });

      it('should use default values for optional parameters', () => {
        const block = createValidMockBlock({
          index: 0,
          previousHash: '0',
        });

        expect(block.difficulty).toBe(2);
        expect(block.validator).toBe('test-validator');
        expect(block.transactions).toEqual([]);
      });

      it('should create block with custom validator', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test',
          validator: 'custom-validator',
        });

        expect(block.validator).toBe('custom-validator');
      });
    });

    describe('createMockBlockChain', () => {
      it('should create a valid chain of blocks', () => {
        const chain = createMockBlockChain(5, 2);

        expect(chain.length).toBe(5);
        expect(() => validateMockChain(chain)).not.toThrow();
      });

      it('should create chain with proper hash linking', () => {
        const chain = createMockBlockChain(3, 2);

        expect(chain[1].previousHash).toBe(chain[0].hash);
        expect(chain[2].previousHash).toBe(chain[1].hash);
      });

      it('should create chain with sequential indices', () => {
        const chain = createMockBlockChain(4, 2);

        expect(chain[0].index).toBe(0);
        expect(chain[1].index).toBe(1);
        expect(chain[2].index).toBe(2);
        expect(chain[3].index).toBe(3);
      });

      it('should return empty array for length < 1', () => {
        const chain = createMockBlockChain(0, 2);
        expect(chain).toEqual([]);
      });

      it('should use custom genesis hash if provided', () => {
        const customHash = 'custom-genesis-hash';
        const chain = createMockBlockChain(2, 2, customHash);

        expect(chain[0].hash).toBe(customHash);
        expect(chain[1].previousHash).toBe(customHash);
      });
    });

    describe('createForkingChains', () => {
      it('should create two branches from common ancestor', () => {
        const { common, branch1, branch2 } = createForkingChains(2, 3, 2, 2);

        expect(common.length).toBe(3); // Index 0, 1, 2
        expect(branch1.length).toBe(3);
        expect(branch2.length).toBe(2);
      });

      it('should have both branches starting from same previousHash', () => {
        const { common, branch1, branch2 } = createForkingChains(1, 2, 2, 2);

        const forkPoint = common[common.length - 1];
        expect(branch1[0].previousHash).toBe(forkPoint.hash);
        expect(branch2[0].previousHash).toBe(forkPoint.hash);
      });

      it('should create branches with same indices but different hashes', () => {
        const { branch1, branch2 } = createForkingChains(0, 2, 2, 2);

        expect(branch1[0].index).toBe(branch2[0].index);
        expect(branch1[0].hash).not.toBe(branch2[0].hash);
      });

      it('should validate common chain', () => {
        const { common } = createForkingChains(3, 2, 2, 2);

        expect(() => validateMockChain(common)).not.toThrow();
      });

      it('should create branches with different validators', () => {
        const { branch1, branch2 } = createForkingChains(1, 1, 1, 2);

        expect(branch1[0].validator).toBe('branch1-validator');
        expect(branch2[0].validator).toBe('branch2-validator');
      });
    });

    describe('createMockGenesisBlock', () => {
      it('should create valid genesis block', () => {
        const genesis = createMockGenesisBlock();

        expect(genesis.index).toBe(0);
        expect(genesis.previousHash).toBe('0');
        expect(() => validateMockBlock(genesis)).not.toThrow();
      });

      it('should create genesis with custom difficulty', () => {
        const genesis = createMockGenesisBlock(4);

        expect(genesis.difficulty).toBe(4);
        expect(genesis.hash.startsWith('0000')).toBe(true);
      });
    });

    describe('createMockBlockWithTransactions', () => {
      it('should create block with transactions', () => {
        const tx1 = createValidMockUTXOTransaction();
        const tx2 = createValidMockUTXOTransaction();

        const block = createMockBlockWithTransactions(
          1,
          'prev-hash',
          [tx1, tx2],
          2
        );

        expect(block.transactions).toHaveLength(2);
        expect(block.transactions[0]).toBe(tx1);
        expect(block.transactions[1]).toBe(tx2);
        expect(() => validateMockBlock(block)).not.toThrow();
      });
    });
  });

  describe('Transaction Factory', () => {
    describe('createValidMockUTXOTransaction', () => {
      it('should create transaction that passes validation', () => {
        const tx = createValidMockUTXOTransaction();

        expect(() => validateMockUTXOTransaction(tx)).not.toThrow();
      });

      it('should create transaction with valid signature by default', () => {
        const tx = createValidMockUTXOTransaction();

        expect(tx.signature).toBeDefined();
        expect(tx.publicKey).toBeDefined();
      });

      it('should create transaction without signature if requested', () => {
        const tx = createValidMockUTXOTransaction({ withSignature: false });

        expect(tx.signature).toBeUndefined();
        expect(tx.publicKey).toBeUndefined();
      });

      it('should use custom inputs and outputs', () => {
        const customInputs = [
          { txId: 'custom-tx', outputIndex: 0, unlockingScript: 'sig' },
        ];
        const customOutputs = [
          { value: 50, lockingScript: 'addr', outputIndex: 0 },
        ];

        const tx = createValidMockUTXOTransaction({
          inputs: customInputs,
          outputs: customOutputs,
        });

        expect(tx.inputs).toEqual(customInputs);
        expect(tx.outputs).toEqual(customOutputs);
      });

      it('should generate unique transaction IDs', () => {
        const tx1 = createValidMockUTXOTransaction();
        const tx2 = createValidMockUTXOTransaction();

        expect(tx1.id).not.toBe(tx2.id);
      });

      it('should support different signature algorithms', () => {
        const txSecp = createValidMockUTXOTransaction({
          signatureAlgorithm: 'secp256k1',
        });
        const txEd = createValidMockUTXOTransaction({
          signatureAlgorithm: 'ed25519',
        });

        expect(txSecp.signature).toBeDefined();
        expect(txEd.signature).toBeDefined();
      });
    });

    describe('generateTxId', () => {
      it('should generate unique IDs', () => {
        const id1 = generateTxId();
        const id2 = generateTxId();

        expect(id1).not.toBe(id2);
        expect(id1).toContain('tx-');
        expect(id2).toContain('tx-');
      });
    });

    describe('createMockUTXOTransactionBatch', () => {
      it('should create specified number of transactions', () => {
        const batch = createMockUTXOTransactionBatch(5);

        expect(batch).toHaveLength(5);
      });

      it('should create transactions with staggered timestamps', () => {
        const batch = createMockUTXOTransactionBatch(3);

        expect(batch[0].timestamp).toBeLessThan(batch[1].timestamp);
        expect(batch[1].timestamp).toBeLessThan(batch[2].timestamp);
      });

      it('should create all valid transactions', () => {
        const batch = createMockUTXOTransactionBatch(3);

        batch.forEach(tx => {
          expect(() => validateMockUTXOTransaction(tx)).not.toThrow();
        });
      });
    });

    describe('createMockUTXOTransactionWithInputs', () => {
      it('should create transaction spending UTXOs', () => {
        const utxos = [
          createMockUTXO('tx1', 100, 'addr1'),
          createMockUTXO('tx2', 50, 'addr1'),
        ];

        const tx = createMockUTXOTransactionWithInputs(
          'addr1',
          'addr2',
          120,
          utxos
        );

        expect(tx.inputs).toHaveLength(2);
        expect(tx.outputs[0].value).toBe(120);
        expect(() => validateMockUTXOTransaction(tx)).not.toThrow();
      });

      it('should include change output when appropriate', () => {
        const utxos = [createMockUTXO('tx1', 100, 'addr1')];

        const tx = createMockUTXOTransactionWithInputs(
          'addr1',
          'addr2',
          50,
          utxos
        );

        expect(tx.outputs).toHaveLength(2); // Payment + change
        expect(tx.outputs[0].value).toBe(50); // Payment
        expect(tx.outputs[1].lockingScript).toBe('addr1'); // Change to sender
      });

      it('should calculate fee correctly', () => {
        const utxos = [createMockUTXO('tx1', 1000, 'addr1')];

        const tx = createMockUTXOTransactionWithInputs(
          'addr1',
          'addr2',
          500,
          utxos
        );

        const totalInput = 1000;
        const totalOutput = tx.outputs.reduce((sum, o) => sum + o.value, 0);
        const fee = totalInput - totalOutput;

        expect(fee).toBeGreaterThan(0);
        expect(tx.fee).toBe(fee);
      });
    });

    describe('createMockUTXO', () => {
      it('should create valid UTXO', () => {
        const utxo = createMockUTXO('tx1', 100, 'addr1', 0, 1);

        expect(utxo.txId).toBe('tx1');
        expect(utxo.value).toBe(100);
        expect(utxo.lockingScript).toBe('addr1');
        expect(utxo.outputIndex).toBe(0);
        expect(utxo.blockHeight).toBe(1);
        expect(utxo.isSpent).toBe(false);
      });
    });

    describe('createMockUTXOBatch', () => {
      it('should create multiple UTXOs', () => {
        const utxos = createMockUTXOBatch('addr1', 5, 100);

        expect(utxos).toHaveLength(5);
        expect(utxos[0].lockingScript).toBe('addr1');
      });
    });

    describe('createCoinbaseTransaction', () => {
      it('should create coinbase with no inputs', () => {
        const coinbase = createCoinbaseTransaction('miner-addr', 50, 1);

        expect(coinbase.inputs).toHaveLength(0);
        expect(coinbase.outputs).toHaveLength(1);
        expect(coinbase.outputs[0].value).toBe(50);
        expect(coinbase.fee).toBe(0);
      });

      it('should create coinbase without signature', () => {
        const coinbase = createCoinbaseTransaction('miner-addr', 50, 1);

        expect(coinbase.signature).toBeUndefined();
      });
    });

    describe('createMultiOutputTransaction', () => {
      it('should create transaction with multiple recipients', () => {
        const recipients = [
          { address: 'addr1', amount: 30 },
          { address: 'addr2', amount: 20 },
          { address: 'addr3', amount: 10 },
        ];
        const utxos = [createMockUTXO('tx1', 100, 'sender')];

        const tx = createMultiOutputTransaction(recipients, utxos, 'sender');

        expect(tx.outputs.length).toBeGreaterThanOrEqual(3);
        expect(tx.outputs[0].value).toBe(30);
        expect(tx.outputs[1].value).toBe(20);
        expect(tx.outputs[2].value).toBe(10);
      });
    });
  });

  describe('Genesis Config Factory', () => {
    describe('createCompleteGenesisConfig', () => {
      it('should create config that passes validation', () => {
        const config = createCompleteGenesisConfig();

        expect(() => validateMockGenesisConfig(config)).not.toThrow();
      });

      it('should include all required metadata', () => {
        const config = createCompleteGenesisConfig();

        expect(config.metadata.creator).toBeDefined();
        expect(config.metadata.creator.length).toBeGreaterThanOrEqual(3);
        expect(config.metadata.description).toBeDefined();
        expect(config.metadata.networkType).toBeDefined();
        expect(config.metadata.timestamp).toBeGreaterThan(0);
      });

      it('should allow overriding defaults', () => {
        const config = createCompleteGenesisConfig({
          chainId: 'custom-chain',
          networkName: 'Custom Network',
        });

        expect(config.chainId).toBe('custom-chain');
        expect(config.networkName).toBe('Custom Network');
      });

      it('should have valid network parameters', () => {
        const config = createCompleteGenesisConfig();

        expect(config.networkParams.initialDifficulty).toBeGreaterThanOrEqual(
          0
        );
        expect(config.networkParams.targetBlockTime).toBeGreaterThan(0);
        expect(config.networkParams.adjustmentPeriod).toBeGreaterThan(0);
      });
    });

    describe('Network-specific configs', () => {
      it('should create valid devnet config', () => {
        const config = createDevnetGenesisConfig();

        expect(config.metadata.networkType).toBe('devnet');
        expect(() => validateMockGenesisConfig(config)).not.toThrow();
      });

      it('should create valid testnet config', () => {
        const config = createTestnetGenesisConfig();

        expect(config.metadata.networkType).toBe('testnet');
        expect(() => validateMockGenesisConfig(config)).not.toThrow();
      });

      it('should create valid mainnet config', () => {
        const config = createMainnetGenesisConfig();

        expect(config.metadata.networkType).toBe('mainnet');
        expect(() => validateMockGenesisConfig(config)).not.toThrow();
      });

      it('should create valid private config', () => {
        const config = createPrivateGenesisConfig();

        expect(config.metadata.networkType).toBe('private');
        expect(() => validateMockGenesisConfig(config)).not.toThrow();
      });
    });

    describe('createMinimalGenesisConfig', () => {
      it('should create minimal but valid config', () => {
        const config = createMinimalGenesisConfig();

        expect(() => validateMockGenesisConfig(config)).not.toThrow();
      });
    });

    describe('createGenesisConfigWithAllocations', () => {
      it('should create config with custom allocations', () => {
        const allocations = [
          { address: 'addr1', amount: 1000 },
          { address: 'addr2', amount: 2000 },
        ];

        const config = createGenesisConfigWithAllocations(allocations);

        expect(config.initialAllocations).toEqual(allocations);
        expect(config.totalSupply).toBe(3000);
      });
    });

    describe('TEST_GENESIS_CONFIGS', () => {
      it('should have all predefined configs valid', () => {
        Object.values(TEST_GENESIS_CONFIGS).forEach(config => {
          expect(() => validateMockGenesisConfig(config)).not.toThrow();
        });
      });
    });
  });

  describe('Validation Helpers', () => {
    describe('validateMockBlock', () => {
      it('should not throw for valid block', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test',
        });

        expect(() => validateMockBlock(block)).not.toThrow();
      });

      it('should throw for invalid difficulty', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test',
        });
        block.difficulty = -1;

        expect(() => validateMockBlock(block)).toThrow(/difficulty/);
      });

      it('should throw for missing merkle root', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test',
        });
        block.merkleRoot = '';

        expect(() => validateMockBlock(block)).toThrow(/merkle root/);
      });
    });

    describe('isValidMockBlock', () => {
      it('should return true for valid block', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test',
        });

        expect(isValidMockBlock(block)).toBe(true);
      });

      it('should return false for invalid block', () => {
        const block = createValidMockBlock({
          index: 1,
          previousHash: 'test',
        });
        block.difficulty = -1;

        expect(isValidMockBlock(block)).toBe(false);
      });
    });

    describe('isValidMockUTXOTransaction', () => {
      it('should return true for valid transaction', () => {
        const tx = createValidMockUTXOTransaction();

        expect(isValidMockUTXOTransaction(tx)).toBe(true);
      });
    });

    describe('isValidMockChain', () => {
      it('should return true for valid chain', () => {
        const chain = createMockBlockChain(3, 2);

        expect(isValidMockChain(chain)).toBe(true);
      });
    });

    describe('isValidMockGenesisConfig', () => {
      it('should return true for valid config', () => {
        const config = createCompleteGenesisConfig();

        expect(isValidMockGenesisConfig(config)).toBe(true);
      });
    });
  });
});

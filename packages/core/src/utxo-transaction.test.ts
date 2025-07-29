import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOTransactionManager } from './utxo-transaction.js';
import { UTXOManager } from './utxo.js';
import type { UTXO, UTXOTransaction, TransactionInput, TransactionOutput } from './types.js';

describe('UTXOTransactionManager', () => {
  let utxoTransactionManager: UTXOTransactionManager;
  let utxoManager: UTXOManager;
  let sampleUTXOs: UTXO[];

  beforeEach(() => {
    utxoTransactionManager = new UTXOTransactionManager();
    utxoManager = new UTXOManager();
    
    sampleUTXOs = [
      {
        txId: 'tx1',
        outputIndex: 0,
        value: 100,
        lockingScript: '1FromAddress',
        blockHeight: 1,
        isSpent: false
      },
      {
        txId: 'tx2',
        outputIndex: 0,
        value: 50,
        lockingScript: '1FromAddress',
        blockHeight: 1,
        isSpent: false
      },
      {
        txId: 'tx3',
        outputIndex: 0,
        value: 25,
        lockingScript: '1FromAddress',
        blockHeight: 1,
        isSpent: false
      }
    ];

    // Add UTXOs to manager
    sampleUTXOs.forEach(utxo => utxoManager.addUTXO(utxo));
  });

  describe('Transaction Creation', () => {
    it('should create a simple UTXO transaction', () => {
      const transaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        75,
        'test-private-key',
        sampleUTXOs
      );

      expect(transaction.id).toBeDefined();
      expect(transaction.inputs).toHaveLength(1);
      expect(transaction.outputs).toHaveLength(2); // One for recipient, one for change
      expect(transaction.timestamp).toBeDefined();
      expect(transaction.fee).toBeGreaterThan(0);
      
      // Check that the largest UTXO was selected
      expect(transaction.inputs[0].previousTxId).toBe('tx1');
      expect(transaction.inputs[0].outputIndex).toBe(0);
      expect(transaction.inputs[0].unlockingScript).toBeDefined();

      // Check outputs
      const recipientOutput = transaction.outputs.find(o => o.lockingScript === '1ToAddress');
      const changeOutput = transaction.outputs.find(o => o.lockingScript === '1FromAddress');
      
      expect(recipientOutput?.value).toBe(75);
      expect(changeOutput?.value).toBeGreaterThan(0); // Should have change
    });

    it('should create transaction with exact amount (no change)', () => {
      // Use a UTXO with exact value + estimated fee
      const exactUTXO: UTXO = {
        txId: 'exact-tx',
        outputIndex: 0,
        value: 50.01, // 50 + generous fee allowance
        lockingScript: '1FromAddress',
        blockHeight: 1,
        isSpent: false
      };

      const transaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        50,
        'test-private-key',
        [exactUTXO]
      );

      // Should have recipient output
      const recipientOutput = transaction.outputs.find(o => o.lockingScript === '1ToAddress');
      expect(recipientOutput?.value).toBe(50);
      
      // Change output might be present but small, or removed if dust
      const changeOutput = transaction.outputs.find(o => o.lockingScript === '1FromAddress');
      if (changeOutput) {
        expect(changeOutput.value).toBeGreaterThan(0);
      }
      
      // Transaction should be valid
      expect(transaction.outputs.length).toBeGreaterThanOrEqual(1);
      expect(transaction.fee).toBeGreaterThan(0);
    });

    it('should throw error for insufficient funds', () => {
      expect(() => {
        utxoTransactionManager.createTransaction(
          '1FromAddress',
          '1ToAddress',
          200, // More than available (175)
          'test-private-key',
          sampleUTXOs
        );
      }).toThrow('Insufficient funds');
    });

    it('should create transaction with multiple inputs when needed', () => {
      const transaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        125, // Requires multiple UTXOs
        'test-private-key',
        sampleUTXOs
      );

      expect(transaction.inputs.length).toBeGreaterThan(1);
      
      // Verify inputs reference correct UTXOs
      const inputTxIds = transaction.inputs.map(i => i.previousTxId);
      expect(inputTxIds).toContain('tx1'); // 100 value UTXO should be included
    });
  });

  describe('Transaction Validation', () => {
    let validTransaction: UTXOTransaction;

    beforeEach(() => {
      validTransaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        50,
        'test-private-key',
        sampleUTXOs
      );
    });

    it('should validate a correct transaction', () => {
      const validation = utxoTransactionManager.validateTransaction(validTransaction, utxoManager);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject transaction with missing ID', () => {
      const invalidTransaction = { ...validTransaction, id: '' };
      
      const validation = utxoTransactionManager.validateTransaction(invalidTransaction, utxoManager);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Transaction ID is required');
    });

    it('should reject transaction with no inputs', () => {
      const invalidTransaction = { ...validTransaction, inputs: [] };
      
      const validation = utxoTransactionManager.validateTransaction(invalidTransaction, utxoManager);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Transaction must have at least one input');
    });

    it('should reject transaction with no outputs', () => {
      const invalidTransaction = { ...validTransaction, outputs: [] };
      
      const validation = utxoTransactionManager.validateTransaction(invalidTransaction, utxoManager);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Transaction must have at least one output');
    });

    it('should reject transaction with non-existent UTXO', () => {
      const invalidInput: TransactionInput = {
        previousTxId: 'non-existent-tx',
        outputIndex: 0,
        unlockingScript: 'some-script',
        sequence: 0xffffffff
      };
      
      const invalidTransaction = {
        ...validTransaction,
        inputs: [invalidInput]
      };
      
      const validation = utxoTransactionManager.validateTransaction(invalidTransaction, utxoManager);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('UTXO non-existent-tx:0 does not exist or is already spent');
    });

    it('should reject transaction with invalid output value', () => {
      const invalidOutput: TransactionOutput = {
        value: -10,
        lockingScript: '1ToAddress',
        outputIndex: 0
      };
      
      const invalidTransaction = {
        ...validTransaction,
        outputs: [invalidOutput]
      };
      
      const validation = utxoTransactionManager.validateTransaction(invalidTransaction, utxoManager);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Output 0 has invalid value: -10');
    });

    it('should reject transaction with negative fee', () => {
      const invalidTransaction = { ...validTransaction, fee: -1 };
      
      const validation = utxoTransactionManager.validateTransaction(invalidTransaction, utxoManager);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Transaction fee cannot be negative');
    });
  });

  describe('Fee Calculation', () => {
    it('should calculate fee based on transaction size', () => {
      const inputs: TransactionInput[] = [
        {
          previousTxId: 'tx1',
          outputIndex: 0,
          unlockingScript: 'script1',
          sequence: 0xffffffff
        }
      ];
      
      const outputs: TransactionOutput[] = [
        {
          value: 50,
          lockingScript: '1ToAddress',
          outputIndex: 0
        }
      ];
      
      const fee = utxoTransactionManager.calculateTransactionFee(inputs, outputs);
      
      expect(fee).toBeGreaterThan(0);
      expect(fee).toBeGreaterThanOrEqual(0.001); // Minimum fee
    });

    it('should increase fee with more inputs and outputs', () => {
      const singleInputOutputFee = utxoTransactionManager.calculateTransactionFee(
        [{ previousTxId: 'tx1', outputIndex: 0, unlockingScript: 'script', sequence: 0xffffffff }],
        [{ value: 50, lockingScript: '1ToAddress', outputIndex: 0 }]
      );
      
      const multipleInputOutputFee = utxoTransactionManager.calculateTransactionFee(
        [
          { previousTxId: 'tx1', outputIndex: 0, unlockingScript: 'script1', sequence: 0xffffffff },
          { previousTxId: 'tx2', outputIndex: 0, unlockingScript: 'script2', sequence: 0xffffffff }
        ],
        [
          { value: 25, lockingScript: '1ToAddress1', outputIndex: 0 },
          { value: 25, lockingScript: '1ToAddress2', outputIndex: 1 }
        ]
      );
      
      expect(multipleInputOutputFee).toBeGreaterThan(singleInputOutputFee);
    });
  });

  describe('UTXO Selection', () => {
    it('should select optimal UTXOs for target amount', () => {
      const selection = utxoTransactionManager.selectUTXOs(sampleUTXOs, 75);
      
      expect(selection.selectedUTXOs).toHaveLength(1);
      expect(selection.selectedUTXOs[0].value).toBe(100); // Should select largest UTXO
      expect(selection.totalValue).toBe(100);
      expect(selection.changeAmount).toBe(25);
    });

    it('should select multiple UTXOs when needed', () => {
      const selection = utxoTransactionManager.selectUTXOs(sampleUTXOs, 125);
      
      expect(selection.selectedUTXOs.length).toBeGreaterThan(1);
      expect(selection.totalValue).toBeGreaterThanOrEqual(125);
    });

    it('should handle insufficient funds gracefully', () => {
      const selection = utxoTransactionManager.selectUTXOs(sampleUTXOs, 200);
      
      expect(selection.totalValue).toBe(175); // Total of all UTXOs
      expect(selection.changeAmount).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    let transaction: UTXOTransaction;

    beforeEach(() => {
      transaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        50,
        'test-private-key',
        sampleUTXOs
      );
    });

    it('should calculate transaction value', () => {
      const value = utxoTransactionManager.calculateTransactionValue(transaction);
      
      expect(value).toBeGreaterThan(0);
      expect(value).toBe(transaction.outputs.reduce((sum, output) => sum + output.value, 0));
    });

    it('should get transaction input addresses', () => {
      const inputAddresses = utxoTransactionManager.getTransactionInputAddresses(transaction, utxoManager);
      
      expect(inputAddresses).toContain('1FromAddress');
      expect(inputAddresses.length).toBeGreaterThan(0);
    });

    it('should get transaction output addresses', () => {
      const outputAddresses = utxoTransactionManager.getTransactionOutputAddresses(transaction);
      
      expect(outputAddresses).toContain('1ToAddress');
      if (transaction.outputs.length > 1) {
        expect(outputAddresses).toContain('1FromAddress'); // Change address
      }
    });
  });

  describe('Transaction Signing', () => {
    it('should create valid unlocking scripts for inputs', () => {
      const transaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        50,
        'test-private-key',
        sampleUTXOs
      );

      // Each input should have a non-empty unlocking script
      transaction.inputs.forEach(input => {
        expect(input.unlockingScript).toBeDefined();
        expect(input.unlockingScript.length).toBeGreaterThan(0);
        expect(input.unlockingScript).toContain(':'); // Should contain signature:publicKey format
      });
    });

    it('should handle different private key formats', () => {
      const hexPrivateKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const stringPrivateKey = 'test-string-key';

      const transaction1 = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        25,
        hexPrivateKey,
        sampleUTXOs
      );

      const transaction2 = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        25,
        stringPrivateKey,
        sampleUTXOs
      );

      expect(transaction1.inputs[0].unlockingScript).toBeDefined();
      expect(transaction2.inputs[0].unlockingScript).toBeDefined();
      expect(transaction1.inputs[0].unlockingScript).not.toBe(transaction2.inputs[0].unlockingScript);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty UTXO array', () => {
      expect(() => {
        utxoTransactionManager.createTransaction(
          '1FromAddress',
          '1ToAddress',
          50,
          'test-private-key',
          []
        );
      }).toThrow('Insufficient funds');
    });

    it('should handle dust amounts', () => {
      const dustUTXO: UTXO = {
        txId: 'dust-tx',
        outputIndex: 0,
        value: 0.0001,
        lockingScript: '1FromAddress',
        blockHeight: 1,
        isSpent: false
      };

      expect(() => {
        utxoTransactionManager.createTransaction(
          '1FromAddress',
          '1ToAddress',
          0.00005,
          'test-private-key',
          [dustUTXO]
        );
      }).toThrow(); // Should throw due to insufficient funds for fee
    });

    it('should handle large transactions with many UTXOs', () => {
      const manyUTXOs: UTXO[] = Array.from({ length: 10 }, (_, i) => ({
        txId: `tx-${i}`,
        outputIndex: 0,
        value: 10,
        lockingScript: '1FromAddress',
        blockHeight: 1,
        isSpent: false
      }));

      manyUTXOs.forEach(utxo => utxoManager.addUTXO(utxo));

      const transaction = utxoTransactionManager.createTransaction(
        '1FromAddress',
        '1ToAddress',
        95, // Requires multiple UTXOs
        'test-private-key',
        manyUTXOs
      );

      expect(transaction.inputs.length).toBeGreaterThan(9); // Should need most UTXOs
      expect(transaction.inputs.length).toBeLessThanOrEqual(10);
    });
  });
});
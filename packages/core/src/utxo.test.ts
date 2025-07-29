import { describe, it, expect, beforeEach } from 'vitest';
import { UTXOManager } from './utxo.js';
import type { UTXO } from './types.js';

describe('UTXOManager', () => {
  let utxoManager: UTXOManager;
  let sampleUTXO1: UTXO;
  let sampleUTXO2: UTXO;
  let sampleUTXO3: UTXO;

  beforeEach(() => {
    utxoManager = new UTXOManager();
    
    sampleUTXO1 = {
      txId: 'tx1',
      outputIndex: 0,
      value: 100,
      lockingScript: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      blockHeight: 1,
      isSpent: false
    };
    
    sampleUTXO2 = {
      txId: 'tx2',
      outputIndex: 0,
      value: 50,
      lockingScript: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      blockHeight: 1,
      isSpent: false
    };
    
    sampleUTXO3 = {
      txId: 'tx1',
      outputIndex: 1,
      value: 25,
      lockingScript: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      blockHeight: 1,
      isSpent: false
    };
  });

  describe('UTXO Management', () => {
    it('should add UTXO to the set', () => {
      utxoManager.addUTXO(sampleUTXO1);
      
      const retrievedUTXO = utxoManager.getUTXO('tx1', 0);
      expect(retrievedUTXO).toEqual(sampleUTXO1);
      expect(utxoManager.getUTXOSetSize()).toBe(1);
    });

    it('should handle duplicate UTXO additions', () => {
      utxoManager.addUTXO(sampleUTXO1);
      utxoManager.addUTXO(sampleUTXO1); // Adding same UTXO again
      
      expect(utxoManager.getUTXOSetSize()).toBe(1);
      const retrievedUTXO = utxoManager.getUTXO('tx1', 0);
      expect(retrievedUTXO).toEqual(sampleUTXO1);
    });

    it('should remove UTXO from the set', () => {
      utxoManager.addUTXO(sampleUTXO1);
      utxoManager.addUTXO(sampleUTXO2);
      
      const removed = utxoManager.removeUTXO('tx1', 0);
      expect(removed).toBe(true);
      expect(utxoManager.getUTXOSetSize()).toBe(1);
      expect(utxoManager.getUTXO('tx1', 0)).toBeNull();
    });

    it('should return false when removing non-existent UTXO', () => {
      const removed = utxoManager.removeUTXO('nonexistent', 0);
      expect(removed).toBe(false);
    });

    it('should get UTXO by transaction ID and output index', () => {
      utxoManager.addUTXO(sampleUTXO1);
      utxoManager.addUTXO(sampleUTXO3);
      
      const utxo1 = utxoManager.getUTXO('tx1', 0);
      const utxo3 = utxoManager.getUTXO('tx1', 1);
      const nonExistent = utxoManager.getUTXO('tx1', 2);
      
      expect(utxo1).toEqual(sampleUTXO1);
      expect(utxo3).toEqual(sampleUTXO3);
      expect(nonExistent).toBeNull();
    });
  });

  describe('Address Queries', () => {
    beforeEach(() => {
      utxoManager.addUTXO(sampleUTXO1);
      utxoManager.addUTXO(sampleUTXO2);
      utxoManager.addUTXO(sampleUTXO3);
    });

    it('should get UTXOs for address', () => {
      const utxos = utxoManager.getUTXOsForAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      
      expect(utxos).toHaveLength(2);
      expect(utxos).toContainEqual(sampleUTXO1);
      expect(utxos).toContainEqual(sampleUTXO2);
      // Should be sorted by value descending
      expect(utxos[0].value).toBeGreaterThan(utxos[1].value);
    });

    it('should return empty array for address with no UTXOs', () => {
      const utxos = utxoManager.getUTXOsForAddress('1NonExistentAddress');
      expect(utxos).toEqual([]);
    });

    it('should calculate balance for address', () => {
      const balance1 = utxoManager.calculateBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      const balance2 = utxoManager.calculateBalance('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
      const balance3 = utxoManager.calculateBalance('1NonExistentAddress');
      
      expect(balance1).toBe(150); // 100 + 50
      expect(balance2).toBe(25);
      expect(balance3).toBe(0);
    });

    it('should get spendable UTXOs for amount', () => {
      const spendableUTXOs = utxoManager.getSpendableUTXOs('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 75);
      
      expect(spendableUTXOs).toHaveLength(1);
      expect(spendableUTXOs[0]).toEqual(sampleUTXO1); // Should select the largest UTXO (100)
    });

    it('should return multiple UTXOs when single UTXO is insufficient', () => {
      const spendableUTXOs = utxoManager.getSpendableUTXOs('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 125);
      
      expect(spendableUTXOs).toHaveLength(2);
      expect(spendableUTXOs).toContainEqual(sampleUTXO1);
      expect(spendableUTXOs).toContainEqual(sampleUTXO2);
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      utxoManager.addUTXO(sampleUTXO1);
    });

    it('should validate UTXO exists', () => {
      expect(utxoManager.validateUTXOExists('tx1', 0)).toBe(true);
      expect(utxoManager.validateUTXOExists('tx1', 1)).toBe(false);
      expect(utxoManager.validateUTXOExists('tx2', 0)).toBe(false);
    });

    it('should validate UTXO ownership', () => {
      // This test assumes the implementation of validateUTXOOwnership
      // In a real scenario, you would need actual public keys and addresses
      const mockPublicKey = '0404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404040404';
      
      // This will depend on the actual implementation
      // For now, we'll test that it doesn't throw an error
      expect(() => {
        utxoManager.validateUTXOOwnership(sampleUTXO1, mockPublicKey);
      }).not.toThrow();
    });
  });

  describe('Batch Operations', () => {
    it('should apply batch UTXO updates', () => {
      const utxosToAdd = [sampleUTXO1, sampleUTXO2];
      const utxosToRemove = [{ txId: 'tx3', outputIndex: 0 }];
      
      // Add a UTXO that will be removed
      const utxoToRemove: UTXO = {
        txId: 'tx3',
        outputIndex: 0,
        value: 75,
        lockingScript: '1TestAddress',
        blockHeight: 1,
        isSpent: false
      };
      utxoManager.addUTXO(utxoToRemove);
      
      expect(utxoManager.getUTXOSetSize()).toBe(1);
      
      utxoManager.applyUTXOUpdates(utxosToAdd, utxosToRemove);
      
      expect(utxoManager.getUTXOSetSize()).toBe(2);
      expect(utxoManager.getUTXO('tx1', 0)).toEqual(sampleUTXO1);
      expect(utxoManager.getUTXO('tx2', 0)).toEqual(sampleUTXO2);
      expect(utxoManager.getUTXO('tx3', 0)).toBeNull();
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      utxoManager.addUTXO(sampleUTXO1);
      utxoManager.addUTXO(sampleUTXO2);
      utxoManager.addUTXO(sampleUTXO3);
    });

    it('should return correct UTXO set size', () => {
      expect(utxoManager.getUTXOSetSize()).toBe(3);
    });

    it('should calculate total value', () => {
      expect(utxoManager.getTotalValue()).toBe(175); // 100 + 50 + 25
    });

    it('should exclude spent UTXOs from total value', () => {
      const spentUTXO: UTXO = {
        ...sampleUTXO1,
        isSpent: true
      };
      utxoManager.removeUTXO('tx1', 0);
      utxoManager.addUTXO(spentUTXO);
      
      expect(utxoManager.getTotalValue()).toBe(75); // 50 + 25 (excluding spent 100)
    });
  });

  describe('UTXO Selection Algorithm', () => {
    beforeEach(() => {
      utxoManager.addUTXO(sampleUTXO1); // 100
      utxoManager.addUTXO(sampleUTXO2); // 50
      utxoManager.addUTXO(sampleUTXO3); // 25
    });

    it('should select UTXOs using greedy algorithm', () => {
      const utxos = utxoManager.getUTXOsForAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      const selection = utxoManager.selectUTXOs(utxos, 75);
      
      expect(selection.selectedUTXOs).toHaveLength(1);
      expect(selection.selectedUTXOs[0]).toEqual(sampleUTXO1);
      expect(selection.totalValue).toBe(100);
      expect(selection.changeAmount).toBe(25);
    });

    it('should select multiple UTXOs when needed', () => {
      const utxos = utxoManager.getUTXOsForAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      const selection = utxoManager.selectUTXOs(utxos, 125);
      
      expect(selection.selectedUTXOs).toHaveLength(2);
      expect(selection.totalValue).toBe(150);
      expect(selection.changeAmount).toBe(25);
    });

    it('should handle insufficient funds', () => {
      const utxos = utxoManager.getUTXOsForAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      const selection = utxoManager.selectUTXOs(utxos, 200);
      
      expect(selection.selectedUTXOs).toHaveLength(2);
      expect(selection.totalValue).toBe(150);
      expect(selection.changeAmount).toBe(0);
    });
  });

  describe('Debug Methods', () => {
    beforeEach(() => {
      utxoManager.addUTXO(sampleUTXO1);
      utxoManager.addUTXO(sampleUTXO2);
    });

    it('should provide UTXO set snapshot', () => {
      const snapshot = utxoManager.getUTXOSetSnapshot();
      
      expect(snapshot.size).toBe(2);
      expect(snapshot.get('tx1:0')).toEqual(sampleUTXO1);
      expect(snapshot.get('tx2:0')).toEqual(sampleUTXO2);
    });

    it('should provide address index snapshot', () => {
      const snapshot = utxoManager.getAddressIndexSnapshot();
      
      expect(snapshot.has('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
      const addressUTXOs = snapshot.get('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(addressUTXOs?.has('tx1:0')).toBe(true);
      expect(addressUTXOs?.has('tx2:0')).toBe(true);
    });
  });
});
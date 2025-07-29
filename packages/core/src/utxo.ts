import type { UTXO, IUTXOManager, UTXOSelectionResult } from './types.js';
import { CryptographicService } from './cryptographic.js';
import { Logger } from '@lorachain/shared';

export class UTXOManager implements IUTXOManager {
  private utxoSet: Map<string, UTXO> = new Map();
  private addressIndex: Map<string, Set<string>> = new Map();
  private logger = new Logger('UTXOManager');

  // UTXO Management
  addUTXO(utxo: UTXO): void {
    const utxoKey = this.createUTXOKey(utxo.txId, utxo.outputIndex);
    
    if (this.utxoSet.has(utxoKey)) {
      this.logger.warn(`UTXO ${utxoKey} already exists, replacing`);
    }

    this.utxoSet.set(utxoKey, utxo);
    
    // Update address index
    const address = this.extractAddressFromLockingScript(utxo.lockingScript);
    if (address) {
      if (!this.addressIndex.has(address)) {
        this.addressIndex.set(address, new Set());
      }
      this.addressIndex.get(address)!.add(utxoKey);
    }

    this.logger.debug(`Added UTXO: ${utxoKey}, value: ${utxo.value}`);
  }

  removeUTXO(txId: string, outputIndex: number): boolean {
    const utxoKey = this.createUTXOKey(txId, outputIndex);
    const utxo = this.utxoSet.get(utxoKey);
    
    if (!utxo) {
      this.logger.warn(`Attempted to remove non-existent UTXO: ${utxoKey}`);
      return false;
    }

    // Remove from UTXO set
    this.utxoSet.delete(utxoKey);
    
    // Update address index
    const address = this.extractAddressFromLockingScript(utxo.lockingScript);
    if (address && this.addressIndex.has(address)) {
      this.addressIndex.get(address)!.delete(utxoKey);
      // Clean up empty address indexes
      if (this.addressIndex.get(address)!.size === 0) {
        this.addressIndex.delete(address);
      }
    }

    this.logger.debug(`Removed UTXO: ${utxoKey}, value: ${utxo.value}`);
    return true;
  }

  getUTXO(txId: string, outputIndex: number): UTXO | null {
    const utxoKey = this.createUTXOKey(txId, outputIndex);
    return this.utxoSet.get(utxoKey) || null;
  }

  // Address Queries
  getUTXOsForAddress(address: string): UTXO[] {
    const utxoKeys = this.addressIndex.get(address);
    if (!utxoKeys) {
      return [];
    }

    const utxos: UTXO[] = [];
    for (const utxoKey of utxoKeys) {
      const utxo = this.utxoSet.get(utxoKey);
      if (utxo && !utxo.isSpent) {
        utxos.push(utxo);
      }
    }

    return utxos.sort((a, b) => b.value - a.value); // Sort by value descending
  }

  calculateBalance(address: string): number {
    const utxos = this.getUTXOsForAddress(address);
    return utxos.reduce((total, utxo) => total + utxo.value, 0);
  }

  getSpendableUTXOs(address: string, amount: number): UTXO[] {
    const availableUTXOs = this.getUTXOsForAddress(address);
    const selection = this.selectUTXOs(availableUTXOs, amount);
    return selection.selectedUTXOs;
  }

  // Validation
  validateUTXOExists(txId: string, outputIndex: number): boolean {
    const utxoKey = this.createUTXOKey(txId, outputIndex);
    const utxo = this.utxoSet.get(utxoKey);
    return utxo !== undefined && !utxo.isSpent;
  }

  validateUTXOOwnership(utxo: UTXO, publicKey: string): boolean {
    try {
      // Extract address from public key
      const publicKeyBytes = typeof publicKey === 'string' 
        ? Buffer.from(publicKey, 'hex') 
        : publicKey;
      const address = CryptographicService.generateAddress(
        new Uint8Array(publicKeyBytes), 
        'secp256k1'
      );
      
      // Check if the UTXO's locking script corresponds to this address
      const utxoAddress = this.extractAddressFromLockingScript(utxo.lockingScript);
      return utxoAddress === address;
    } catch (error) {
      this.logger.error(`Error validating UTXO ownership: ${error}`);
      return false;
    }
  }

  // Batch Operations
  applyUTXOUpdates(
    additions: UTXO[], 
    removals: Array<{txId: string, outputIndex: number}>
  ): void {
    this.logger.debug(`Applying batch UTXO updates: ${additions.length} additions, ${removals.length} removals`);
    
    // Apply removals first to prevent conflicts
    for (const removal of removals) {
      this.removeUTXO(removal.txId, removal.outputIndex);
    }
    
    // Apply additions
    for (const utxo of additions) {
      this.addUTXO(utxo);
    }
  }

  // Statistics
  getUTXOSetSize(): number {
    return this.utxoSet.size;
  }

  getTotalValue(): number {
    let total = 0;
    for (const utxo of this.utxoSet.values()) {
      if (!utxo.isSpent) {
        total += utxo.value;
      }
    }
    return total;
  }

  // UTXO Selection Algorithm (Simple Greedy)
  selectUTXOs(availableUTXOs: UTXO[], targetAmount: number): UTXOSelectionResult {
    // Sort UTXOs by value descending for efficient selection
    const sortedUTXOs = [...availableUTXOs].sort((a, b) => b.value - a.value);
    
    const selectedUTXOs: UTXO[] = [];
    let totalValue = 0;
    
    // Greedy selection: pick largest UTXOs first
    for (const utxo of sortedUTXOs) {
      if (totalValue >= targetAmount) {
        break;
      }
      
      selectedUTXOs.push(utxo);
      totalValue += utxo.value;
    }
    
    // Calculate change amount
    const changeAmount = totalValue > targetAmount ? totalValue - targetAmount : 0;
    
    if (totalValue < targetAmount) {
      this.logger.warn(`Insufficient funds: need ${targetAmount}, have ${totalValue}`);
    }
    
    return {
      selectedUTXOs,
      totalValue,
      changeAmount
    };
  }

  // Utility Methods
  private createUTXOKey(txId: string, outputIndex: number): string {
    return `${txId}:${outputIndex}`;
  }

  private extractAddressFromLockingScript(lockingScript: string): string | null {
    // For now, we'll assume the locking script IS the address
    // In a full implementation, this would parse the actual script
    try {
      if (CryptographicService.validateAddress(lockingScript)) {
        return lockingScript;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Debug Methods
  getUTXOSetSnapshot(): Map<string, UTXO> {
    return new Map(this.utxoSet);
  }

  getAddressIndexSnapshot(): Map<string, Set<string>> {
    const snapshot = new Map<string, Set<string>>();
    for (const [address, utxoKeys] of this.addressIndex) {
      snapshot.set(address, new Set(utxoKeys));
    }
    return snapshot;
  }
}
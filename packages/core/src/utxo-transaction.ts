import type {
  UTXOTransaction,
  TransactionInput,
  TransactionOutput,
  UTXO,
  IUTXOTransactionManager,
  IUTXOManager,
  ValidationResult,
  UTXOSelectionResult,
} from './types.js';
import { CryptographicService, type KeyPair } from './cryptographic.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Simple logger for development
class SimpleLogger {
  constructor(private context: string) {}
  debug(message: string) {
    console.log(`[DEBUG] ${this.context}: ${message}`);
  }
  warn(message: string) {
    console.warn(`[WARN] ${this.context}: ${message}`);
  }
  error(message: string) {
    console.error(`[ERROR] ${this.context}: ${message}`);
  }
}

export class UTXOTransactionManager implements IUTXOTransactionManager {
  private logger = new SimpleLogger('UTXOTransactionManager');

  createTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    privateKey: string,
    availableUTXOs: UTXO[]
  ): UTXOTransaction {
    this.logger.debug(
      `Creating UTXO transaction: ${fromAddress} -> ${toAddress}, amount: ${amount}`
    );

    // Generate transaction ID
    const txId = this.generateTransactionId();

    // Select UTXOs to cover the amount + estimated fee
    const estimatedFee = this.estimateFee(1, 2); // Rough estimate for 1 input, 2 outputs
    const requiredAmount = amount + estimatedFee;

    const utxoSelection = this.selectUTXOs(availableUTXOs, requiredAmount);

    if (utxoSelection.totalValue < requiredAmount) {
      throw new Error(
        `Insufficient funds: need ${requiredAmount}, have ${utxoSelection.totalValue}`
      );
    }

    // Create transaction inputs
    const inputs: TransactionInput[] = utxoSelection.selectedUTXOs.map(
      (utxo, index) => ({
        previousTxId: utxo.txId,
        outputIndex: utxo.outputIndex,
        unlockingScript: '', // Will be filled during signing
        sequence: 0xffffffff - index, // Standard sequence number
      })
    );

    // Create transaction outputs
    const outputs: TransactionOutput[] = [];

    // Primary output to recipient
    outputs.push({
      value: amount,
      lockingScript: toAddress, // For simplicity, using address as locking script
      outputIndex: 0,
    });

    // Change output (if needed)
    if (utxoSelection.changeAmount > 0) {
      outputs.push({
        value: utxoSelection.changeAmount,
        lockingScript: fromAddress, // Send change back to sender
        outputIndex: 1,
      });
    }

    // Calculate actual fee
    const actualFee = this.calculateTransactionFee(inputs, outputs);

    // Adjust change output if fee was underestimated
    if (outputs.length > 1) {
      const changeOutput = outputs[1];
      changeOutput.value =
        utxoSelection.changeAmount - (actualFee - estimatedFee);

      // Remove change output if it becomes dust
      if (changeOutput.value <= 0) {
        outputs.pop();
      }
    }

    const transaction: UTXOTransaction = {
      id: txId,
      inputs,
      outputs,
      lockTime: 0,
      timestamp: Date.now(),
      fee: actualFee,
    };

    // Sign the transaction
    this.signTransaction(transaction, privateKey, utxoSelection.selectedUTXOs);

    this.logger.debug(
      `Created UTXO transaction ${txId} with ${inputs.length} inputs and ${outputs.length} outputs`
    );
    return transaction;
  }

  validateTransaction(
    transaction: UTXOTransaction,
    utxoManager: IUTXOManager
  ): ValidationResult {
    const errors: string[] = [];

    // Basic validation
    if (!transaction.id) {
      errors.push('Transaction ID is required');
    }

    if (!transaction.inputs || transaction.inputs.length === 0) {
      errors.push('Transaction must have at least one input');
    }

    if (!transaction.outputs || transaction.outputs.length === 0) {
      errors.push('Transaction must have at least one output');
    }

    if (transaction.timestamp <= 0) {
      errors.push('Invalid timestamp');
    }

    // Validate inputs
    let inputValue = 0;
    for (const input of transaction.inputs) {
      // Check if UTXO exists and is unspent
      if (
        !utxoManager.validateUTXOExists(input.previousTxId, input.outputIndex)
      ) {
        errors.push(
          `UTXO ${input.previousTxId}:${input.outputIndex} does not exist or is already spent`
        );
        continue;
      }

      const utxo = utxoManager.getUTXO(input.previousTxId, input.outputIndex);
      if (utxo) {
        inputValue += utxo.value;

        // Validate signature (simplified - in real implementation, would verify cryptographic signature)
        if (!input.unlockingScript || input.unlockingScript.length === 0) {
          errors.push(
            `Input ${input.previousTxId}:${input.outputIndex} missing unlocking script`
          );
        }
      }
    }

    // Validate outputs
    let outputValue = 0;
    for (let i = 0; i < transaction.outputs.length; i++) {
      const output = transaction.outputs[i];

      if (output.value <= 0) {
        errors.push(`Output ${i} has invalid value: ${output.value}`);
      }

      if (!output.lockingScript) {
        errors.push(`Output ${i} missing locking script`);
      }

      if (output.outputIndex !== i) {
        errors.push(
          `Output ${i} has incorrect output index: ${output.outputIndex}`
        );
      }

      outputValue += output.value;
    }

    // Validate fee
    const expectedFee = inputValue - outputValue;
    if (Math.abs(expectedFee - transaction.fee) > 0.001) {
      errors.push(
        `Fee mismatch: expected ${expectedFee}, got ${transaction.fee}`
      );
    }

    if (transaction.fee < 0) {
      errors.push('Transaction fee cannot be negative');
    }

    // Validate balance
    if (inputValue < outputValue) {
      errors.push(
        `Insufficient input value: inputs=${inputValue}, outputs=${outputValue}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  calculateTransactionFee(
    inputs: TransactionInput[],
    outputs: TransactionOutput[]
  ): number {
    // Simple fee calculation based on transaction size
    const baseSize = 32; // Base transaction overhead
    const inputSize = inputs.length * 150; // ~150 bytes per input
    const outputSize = outputs.length * 34; // ~34 bytes per output
    const totalSize = baseSize + inputSize + outputSize;

    // Fee rate: 0.00001 per byte (adjustable)
    const feeRate = 0.00001;
    return Math.max(0.001, totalSize * feeRate); // Minimum fee of 0.001
  }

  selectUTXOs(
    availableUTXOs: UTXO[],
    targetAmount: number
  ): UTXOSelectionResult {
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

    const changeAmount =
      totalValue > targetAmount ? totalValue - targetAmount : 0;

    return {
      selectedUTXOs,
      totalValue,
      changeAmount,
    };
  }

  // Private helper methods
  private generateTransactionId(): string {
    const random = CryptographicService['generateSecureRandom'](32);
    return bytesToHex(random);
  }

  private estimateFee(inputCount: number, outputCount: number): number {
    const baseSize = 32;
    const inputSize = inputCount * 150;
    const outputSize = outputCount * 34;
    const estimatedSize = baseSize + inputSize + outputSize;

    const feeRate = 0.00001;
    return Math.max(0.001, estimatedSize * feeRate);
  }

  private signTransaction(
    transaction: UTXOTransaction,
    privateKey: string,
    utxos: UTXO[]
  ): void {
    // Generate key pair from private key
    let keyPair: KeyPair;
    try {
      const privateKeyBytes = hexToBytes(privateKey.padStart(64, '0'));
      keyPair = CryptographicService.generateKeyPairFromSeed(
        privateKeyBytes,
        'secp256k1'
      );
    } catch {
      const privateKeyBytes = CryptographicService.hashMessage(privateKey);
      keyPair = CryptographicService.generateKeyPairFromSeed(
        privateKeyBytes,
        'secp256k1'
      );
    }

    // Sign each input
    for (let i = 0; i < transaction.inputs.length; i++) {
      const input = transaction.inputs[i];
      const utxo = utxos.find(
        u =>
          u.txId === input.previousTxId && u.outputIndex === input.outputIndex
      );

      if (!utxo) {
        throw new Error(`UTXO not found for input ${i}`);
      }

      // Create message to sign (simplified - in real implementation would be more complex)
      const messageData = JSON.stringify({
        txId: transaction.id,
        inputIndex: i,
        previousTxId: input.previousTxId,
        outputIndex: input.outputIndex,
        outputs: transaction.outputs,
        timestamp: transaction.timestamp,
      });

      const messageHash = CryptographicService.hashMessage(messageData);
      const signature = CryptographicService.sign(
        messageHash,
        keyPair.privateKey,
        'secp256k1'
      );

      // Create unlocking script (signature + public key)
      const unlockingScript = `${bytesToHex(signature.signature)}:${bytesToHex(keyPair.publicKey)}`;
      input.unlockingScript = unlockingScript;
    }

    this.logger.debug(
      `Signed transaction ${transaction.id} with ${transaction.inputs.length} inputs`
    );
  }

  // Utility methods for transaction analysis
  calculateTransactionValue(transaction: UTXOTransaction): number {
    return transaction.outputs.reduce(
      (total, output) => total + output.value,
      0
    );
  }

  getTransactionInputAddresses(
    transaction: UTXOTransaction,
    utxoManager: IUTXOManager
  ): string[] {
    const addresses: string[] = [];

    for (const input of transaction.inputs) {
      const utxo = utxoManager.getUTXO(input.previousTxId, input.outputIndex);
      if (utxo) {
        addresses.push(utxo.lockingScript); // Assuming lockingScript is the address
      }
    }

    return addresses;
  }

  getTransactionOutputAddresses(transaction: UTXOTransaction): string[] {
    return transaction.outputs.map(output => output.lockingScript);
  }
}

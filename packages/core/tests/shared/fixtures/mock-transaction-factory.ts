import {
  type UTXOTransaction,
  type TransactionInput,
  type TransactionOutput,
  type UTXO,
  type SignatureAlgorithm,
} from '../../../src/types.js';
import { CryptographicService } from '../../../src/cryptographic.js';

/**
 * Default fee rate for mock transactions (0.1% of input value)
 */
const DEFAULT_FEE_RATE = 0.001;

/**
 * Options for creating a mock UTXO transaction
 */
export interface MockUTXOTransactionOptions {
  id?: string;
  inputs?: TransactionInput[];
  outputs?: TransactionOutput[];
  lockTime?: number;
  timestamp?: number;
  fee?: number;
  signatureAlgorithm?: SignatureAlgorithm;
  withSignature?: boolean;
}

/**
 * Creates a valid mock UTXO transaction with proper cryptographic signature.
 *
 * This factory ensures:
 * - Valid transaction structure with inputs and outputs
 * - Cryptographic signature using CryptographicService
 * - Proper fee calculation
 * - All required fields are populated
 *
 * @param options - Configuration for the mock transaction
 * @returns A valid UTXOTransaction object
 */
export function createValidMockUTXOTransaction(
  options: MockUTXOTransactionOptions = {}
): UTXOTransaction {
  const {
    id = generateTxId(),
    inputs = createDefaultInputs(),
    outputs = createDefaultOutputs(),
    lockTime = 0,
    timestamp = Date.now(),
    fee = 1,
    signatureAlgorithm = 'secp256k1',
    withSignature = true,
  } = options;

  const tx: UTXOTransaction = {
    id,
    inputs,
    outputs,
    lockTime,
    timestamp,
    fee,
  };

  // Add cryptographic signature if requested
  if (withSignature) {
    const keyPair = CryptographicService.generateKeyPair(signatureAlgorithm);

    // Create transaction data for signing (excluding signature)
    const txData = CryptographicService.hashTransaction(tx);

    // Sign the transaction
    tx.signature = CryptographicService.sign(
      txData,
      keyPair.privateKey,
      signatureAlgorithm
    );
    tx.publicKey = keyPair.publicKey;
  }

  return tx;
}

/**
 * Generates a unique transaction ID.
 *
 * @returns A unique transaction ID string
 */
export function generateTxId(): string {
  return `tx-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Creates default transaction inputs for testing.
 *
 * @param count - Number of inputs to create
 * @returns Array of transaction inputs
 */
export function createDefaultInputs(count: number = 1): TransactionInput[] {
  const inputs: TransactionInput[] = [];

  for (let i = 0; i < count; i++) {
    inputs.push({
      txId: `prev-tx-${i}`,
      outputIndex: i,
      unlockingScript: `signature-${i}`,
    });
  }

  return inputs;
}

/**
 * Creates default transaction outputs for testing.
 *
 * @param count - Number of outputs to create
 * @param value - Value for each output
 * @returns Array of transaction outputs
 */
export function createDefaultOutputs(
  count: number = 1,
  value: number = 100
): TransactionOutput[] {
  const outputs: TransactionOutput[] = [];

  for (let i = 0; i < count; i++) {
    outputs.push({
      value: value - i, // Slightly different values
      lockingScript: `address-${i}`,
      outputIndex: i,
    });
  }

  return outputs;
}

/**
 * Creates a batch of mock UTXO transactions.
 *
 * @param count - Number of transactions to create
 * @param withSignature - Whether to include signatures
 * @returns Array of valid UTXO transactions
 */
export function createMockUTXOTransactionBatch(
  count: number,
  withSignature: boolean = true
): UTXOTransaction[] {
  const transactions: UTXOTransaction[] = [];

  for (let i = 0; i < count; i++) {
    transactions.push(
      createValidMockUTXOTransaction({
        withSignature,
        timestamp: Date.now() + i * 1000, // Stagger timestamps
      })
    );
  }

  return transactions;
}

/**
 * Creates a mock UTXO transaction with specific inputs and outputs.
 *
 * @param fromAddress - Source address
 * @param toAddress - Destination address
 * @param amount - Amount to transfer
 * @param utxos - Available UTXOs to spend
 * @param signatureAlgorithm - Algorithm for signing
 * @returns A valid UTXO transaction
 */
export function createMockUTXOTransactionWithInputs(
  fromAddress: string,
  toAddress: string,
  amount: number,
  utxos: UTXO[],
  signatureAlgorithm: SignatureAlgorithm = 'secp256k1'
): UTXOTransaction {
  const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
  const fee = Math.max(1, Math.floor(totalInput * DEFAULT_FEE_RATE)); // 0.1% fee, minimum 1
  const change = totalInput - amount - fee;

  // Create outputs
  const outputs: TransactionOutput[] = [
    {
      value: amount,
      lockingScript: toAddress,
      outputIndex: 0,
    },
  ];

  // Add change output if there's change
  if (change > 0) {
    outputs.push({
      value: change,
      lockingScript: fromAddress,
      outputIndex: 1,
    });
  }

  // Create inputs from UTXOs
  const inputs: TransactionInput[] = utxos.map(utxo => ({
    txId: utxo.txId,
    outputIndex: utxo.outputIndex,
    unlockingScript: `signature-for-${fromAddress}`,
  }));

  return createValidMockUTXOTransaction({
    inputs,
    outputs,
    fee,
    signatureAlgorithm,
    withSignature: true,
  });
}

/**
 * Creates a mock UTXO for testing.
 *
 * @param txId - Transaction ID
 * @param value - UTXO value
 * @param address - Locking script address
 * @param outputIndex - Output index in transaction
 * @param blockHeight - Block height where UTXO was created
 * @returns A valid UTXO object
 */
export function createMockUTXO(
  txId: string,
  value: number,
  address: string,
  outputIndex: number = 0,
  blockHeight: number = 1
): UTXO {
  return {
    txId,
    outputIndex,
    value,
    lockingScript: address,
    blockHeight,
    isSpent: false,
  };
}

/**
 * Creates a batch of mock UTXOs for testing.
 *
 * @param address - Address for all UTXOs
 * @param count - Number of UTXOs to create
 * @param value - Value for each UTXO
 * @returns Array of UTXO objects
 */
export function createMockUTXOBatch(
  address: string,
  count: number,
  value: number = 100
): UTXO[] {
  const utxos: UTXO[] = [];

  for (let i = 0; i < count; i++) {
    utxos.push(createMockUTXO(`tx-${i}`, value + i * 10, address, 0, i + 1));
  }

  return utxos;
}

/**
 * Creates a coinbase transaction (mining reward).
 *
 * @param minerAddress - Address to receive mining reward
 * @param reward - Mining reward amount
 * @param blockHeight - Block height
 * @returns A valid coinbase transaction
 */
export function createCoinbaseTransaction(
  minerAddress: string,
  reward: number,
  blockHeight: number
): UTXOTransaction {
  return createValidMockUTXOTransaction({
    id: `coinbase-${blockHeight}`,
    inputs: [], // Coinbase has no inputs
    outputs: [
      {
        value: reward,
        lockingScript: minerAddress,
        outputIndex: 0,
      },
    ],
    fee: 0, // Coinbase has no fee
    withSignature: false, // Coinbase doesn't need signature
  });
}

/**
 * Creates a transaction with multiple outputs (payment splitting).
 *
 * @param recipients - Array of {address, amount} pairs
 * @param utxos - Available UTXOs to spend
 * @param changeAddress - Address for change
 * @returns A valid multi-output transaction
 */
export function createMultiOutputTransaction(
  recipients: Array<{ address: string; amount: number }>,
  utxos: UTXO[],
  changeAddress: string
): UTXOTransaction {
  const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
  const totalOutput = recipients.reduce((sum, r) => sum + r.amount, 0);
  const fee = Math.max(1, Math.floor(totalInput * DEFAULT_FEE_RATE));
  const change = totalInput - totalOutput - fee;

  // Create outputs for each recipient
  const outputs: TransactionOutput[] = recipients.map((recipient, index) => ({
    value: recipient.amount,
    lockingScript: recipient.address,
    outputIndex: index,
  }));

  // Add change output if there's change
  if (change > 0) {
    outputs.push({
      value: change,
      lockingScript: changeAddress,
      outputIndex: outputs.length,
    });
  }

  // Create inputs from UTXOs
  const inputs: TransactionInput[] = utxos.map(utxo => ({
    txId: utxo.txId,
    outputIndex: utxo.outputIndex,
    unlockingScript: `signature-for-utxo-${utxo.txId}`,
  }));

  return createValidMockUTXOTransaction({
    inputs,
    outputs,
    fee,
    withSignature: true,
  });
}

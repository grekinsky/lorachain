import type { UTXOTransaction, UTXO, Transaction } from '../../../src/types.js';

/**
 * Test fixtures for UTXO transactions
 */
export const createMockUTXOTransaction = (
  id?: string,
  value: number = 100
): UTXOTransaction => ({
  id: id || `tx-${Date.now()}-${Math.random()}`,
  inputs: [],
  outputs: [
    {
      value,
      lockingScript: 'to-address',
      outputIndex: 0,
    },
  ],
  lockTime: 0,
  timestamp: Date.now(),
  fee: 0,
});

export const createMockUTXOTransactionWithInputs = (
  fromAddress: string,
  toAddress: string,
  amount: number,
  utxos: UTXO[]
): UTXOTransaction => {
  const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
  const fee = Math.floor(totalInput * 0.01); // 1% fee
  const change = totalInput - amount - fee;

  const outputs = [
    {
      value: amount,
      lockingScript: toAddress,
      outputIndex: 0,
    },
  ];

  if (change > 0) {
    outputs.push({
      value: change,
      lockingScript: fromAddress,
      outputIndex: 1,
    });
  }

  return {
    id: `tx-${Date.now()}-${Math.random()}`,
    inputs: utxos.map(utxo => ({
      txId: utxo.txId,
      outputIndex: utxo.outputIndex,
      unlockingScript: `signature-for-${fromAddress}`,
    })),
    outputs,
    lockTime: 0,
    timestamp: Date.now(),
    fee,
  };
};

export const createMockUTXO = (
  txId: string,
  value: number,
  address: string,
  outputIndex: number = 0
): UTXO => ({
  txId,
  outputIndex,
  value,
  lockingScript: address,
  blockHeight: 1,
  isSpent: false,
});

export const createMockLegacyTransaction = (
  from: string,
  to: string,
  amount: number
): Transaction => ({
  id: `tx-${Date.now()}-${Math.random()}`,
  from,
  to,
  amount,
  fee: Math.floor(amount * 0.01),
  timestamp: Date.now(),
  signature: 'mock-signature',
  nonce: 0,
});

// Pre-defined test transactions for consistent testing
export const TEST_TRANSACTIONS = {
  genesis: createMockUTXOTransaction('genesis-tx', 1000000),

  simple: createMockUTXOTransaction('simple-tx', 100),

  withFee: {
    ...createMockUTXOTransaction('fee-tx', 100),
    fee: 10,
  },

  multiOutput: {
    id: 'multi-output-tx',
    inputs: [],
    outputs: [
      { value: 50, lockingScript: 'address-1', outputIndex: 0 },
      { value: 30, lockingScript: 'address-2', outputIndex: 1 },
      { value: 20, lockingScript: 'address-3', outputIndex: 2 },
    ],
    lockTime: 0,
    timestamp: Date.now(),
    fee: 5,
  } as UTXOTransaction,
};

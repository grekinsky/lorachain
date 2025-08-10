import type { CryptoKeyPair } from '../../../src/types.js';

/**
 * Test fixtures for cryptographic keys
 */
export const createMockKeyPair = (
  algorithm: 'secp256k1' | 'ed25519' = 'secp256k1',
  suffix: string = ''
): CryptoKeyPair => ({
  publicKey: `mock-public-key-${algorithm}${suffix}`,
  privateKey: `mock-private-key-${algorithm}${suffix}`,
  algorithm,
});

// Pre-defined test key pairs for consistent testing
export const TEST_KEY_PAIRS = {
  alice: {
    secp256k1: createMockKeyPair('secp256k1', '-alice'),
    ed25519: createMockKeyPair('ed25519', '-alice'),
  },

  bob: {
    secp256k1: createMockKeyPair('secp256k1', '-bob'),
    ed25519: createMockKeyPair('ed25519', '-bob'),
  },

  charlie: {
    secp256k1: createMockKeyPair('secp256k1', '-charlie'),
    ed25519: createMockKeyPair('ed25519', '-charlie'),
  },

  miner: {
    secp256k1: createMockKeyPair('secp256k1', '-miner'),
    ed25519: createMockKeyPair('ed25519', '-miner'),
  },

  validator: {
    secp256k1: createMockKeyPair('secp256k1', '-validator'),
    ed25519: createMockKeyPair('ed25519', '-validator'),
  },
};

// Test addresses derived from keys
export const TEST_ADDRESSES = {
  alice: 'lora1alice00000000000000000000000000000000',
  bob: 'lora1bob0000000000000000000000000000000000',
  charlie: 'lora1charlie000000000000000000000000000000',
  miner: 'lora1miner00000000000000000000000000000000',
  validator: 'lora1validator0000000000000000000000000000',
  network: 'network',
};

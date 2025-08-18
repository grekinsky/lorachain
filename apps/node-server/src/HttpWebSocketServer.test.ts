import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { HttpWebSocketServer } from './HttpWebSocketServer.js';
import { ServerConfig } from './types.js';
import { LorachainNode } from '@lorachain/node';

// Mock dependencies
vi.mock('@lorachain/node');
vi.mock('@lorachain/core', () => ({
  UTXOCompressionManager: vi.fn().mockImplementation(() => ({
    compressMessage: vi
      .fn()
      .mockResolvedValue({ compressed: true, data: new Uint8Array() }),
    decompressMessage: vi
      .fn()
      .mockResolvedValue({ decompressed: true, data: new Uint8Array() }),
  })),
  CryptographicService: vi.fn().mockImplementation(() => ({
    generateKeyPair: vi.fn().mockReturnValue({
      publicKey: 'test-public-key',
      privateKey: 'test-private-key',
    }),
    sign: vi.fn().mockReturnValue('test-signature'),
    verify: vi.fn().mockReturnValue(true),
  })),
  CompressionAlgorithm: { GZIP: 'gzip' },
  CompressionLevel: { BALANCED: 'balanced' },
}));

describe('HttpWebSocketServer', () => {
  let server: HttpWebSocketServer;
  let mockNode: LorachainNode;
  let config: ServerConfig;

  beforeEach(() => {
    // Create mock node
    mockNode = {
      getBlockchain: vi.fn().mockReturnValue({
        getBlocks: vi.fn().mockReturnValue([]),
        getDifficulty: vi.fn().mockReturnValue(1),
        getMiningReward: vi.fn().mockReturnValue(5000000000),
        getPendingTransactions: vi.fn().mockReturnValue([]),
        addTransaction: vi.fn(),
      }),
      isNodeRunning: vi.fn().mockReturnValue(true),
    } as any;

    // Create server config
    config = {
      port: 0, // Use random port for testing
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      rateLimiting: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 100,
        utxoPriorityBoost: true,
      },
      auth: {
        jwtSecret: 'test-secret',
        jwtExpiration: '1h',
        signatureAlgorithm: 'ed25519',
        challengeExpiration: 60000,
      },
      websocket: {
        enabled: false, // Disable for HTTP-only tests
        path: '/socket.io',
        maxConnections: 1000,
        compressionEnabled: true,
        compressionEngine: 'gzip',
      },
      utxo: {
        maxInputsPerTransaction: 500,
        maxOutputsPerTransaction: 500,
        minRelayFee: BigInt(1000),
        mempoolMaxSize: 10000,
      },
    };

    server = new HttpWebSocketServer(mockNode, config);
  });

  afterEach(async () => {
    if (server.isServerRunning()) {
      await server.stop();
    }
  });

  describe('Server Lifecycle', () => {
    it('should start and stop successfully', async () => {
      expect(server.isServerRunning()).toBe(false);

      await server.start();
      expect(server.isServerRunning()).toBe(true);

      await server.stop();
      expect(server.isServerRunning()).toBe(false);
    });

    it('should not start if already running', async () => {
      await server.start();
      expect(server.isServerRunning()).toBe(true);

      // Should not throw when starting again
      await server.start();
      expect(server.isServerRunning()).toBe(true);
    });

    it('should not stop if not running', async () => {
      expect(server.isServerRunning()).toBe(false);

      // Should not throw when stopping while not running
      await server.stop();
      expect(server.isServerRunning()).toBe(false);
    });
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      await server.start();
      const app = (server as any).app;

      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          uptime: expect.any(Number),
          timestamp: expect.any(Number),
        },
        timestamp: expect.any(Number),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
    });
  });

  describe('Authentication Endpoints', () => {
    let app: any;

    beforeEach(async () => {
      await server.start();
      app = (server as any).app;
    });

    it('should generate authentication challenge', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ algorithm: 'ed25519' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          challengeId: expect.any(String),
          challenge: expect.any(String),
          algorithm: 'ed25519',
          expiresAt: expect.any(Number),
          nodePublicKey: expect.any(String),
        },
        timestamp: expect.any(Number),
      });
    });

    it('should reject invalid algorithm for challenge', async () => {
      const response = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ algorithm: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
    });

    it('should verify signature and return JWT', async () => {
      // First get a challenge
      const challengeResponse = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ algorithm: 'ed25519' });

      const { challengeId } = challengeResponse.body.data;

      // Then verify with dummy signature (our implementation accepts any non-empty signature for testing)
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          challengeId,
          signature: 'dummy-signature',
          publicKey: 'dummy-public-key',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          token: expect.any(String),
          expiresIn: '1h',
          clientId: expect.any(String),
          permissions: expect.arrayContaining(['read', 'write']),
        },
      });
    });

    it('should reject verification with missing data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          challengeId: 'invalid',
          // Missing signature and publicKey
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_INVALID_INPUT');
    });
  });

  describe('Protected Endpoints', () => {
    let app: any;
    let authToken: string;

    beforeEach(async () => {
      await server.start();
      app = (server as any).app;

      // Get authentication token
      const challengeResponse = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ algorithm: 'ed25519' });

      const { challengeId } = challengeResponse.body.data;

      const authResponse = await request(app).post('/api/v1/auth/verify').send({
        challengeId,
        signature: 'dummy-signature',
        publicKey: 'dummy-public-key',
      });

      authToken = authResponse.body.data.token;
    });

    it('should require authentication for blockchain info', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/info')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UTXO_UNAUTHORIZED');
    });

    it('should return blockchain info with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/blockchain/info')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          height: expect.any(Number),
          latestBlockHash: expect.any(String),
          difficulty: expect.any(Number),
          targetDifficulty: expect.any(Number),
        },
      });
    });

    it('should return authentication status', async () => {
      const response = await request(app)
        .get('/api/v1/auth/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          authenticated: true,
          clientId: expect.any(String),
          algorithm: 'ed25519',
          permissions: expect.arrayContaining(['read', 'write']),
        },
      });
    });

    it('should refresh JWT token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          token: expect.any(String),
          expiresIn: '1h',
        },
      });
    });

    it('should logout and invalidate session', async () => {
      const response = await request(app)
        .delete('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Successfully logged out',
        },
      });

      // Token should now be invalid
      await request(app)
        .get('/api/v1/auth/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);
    });
  });

  describe('UTXO Transaction Endpoints', () => {
    let app: any;
    let authToken: string;

    beforeEach(async () => {
      await server.start();
      app = (server as any).app;

      // Get authentication token
      const challengeResponse = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ algorithm: 'ed25519' });

      const { challengeId } = challengeResponse.body.data;

      const authResponse = await request(app).post('/api/v1/auth/verify').send({
        challengeId,
        signature: 'dummy-signature',
        publicKey: 'dummy-public-key',
      });

      authToken = authResponse.body.data.token;
    });

    it('should submit UTXO transaction', async () => {
      const transaction = {
        inputs: [
          {
            previousTxId: 'prev-tx-id',
            outputIndex: 0,
            value: 10000,
            unlockingScript: 'signature',
            sequence: 0,
          },
        ],
        outputs: [
          {
            value: 9000,
            lockingScript: 'recipient-address',
          },
        ],
        signature: 'transaction-signature',
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transaction)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          transactionId: expect.any(String),
          status: 'pending',
          inputCount: 1,
          outputCount: 1,
          fee: expect.any(Number),
        },
      });

      expect(mockNode.getBlockchain().addTransaction).toHaveBeenCalled();
    });

    it('should validate transaction without submitting', async () => {
      const transaction = {
        inputs: [
          {
            txId: 'prev-tx-id',
            outputIndex: 0,
            value: 10000,
          },
        ],
        outputs: [
          {
            value: 9000,
            lockingScript: 'recipient-address',
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/utxo-transactions/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transaction)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isValid: true,
          errors: [],
          warnings: expect.any(Array),
          fee: expect.any(Number),
          inputCount: 1,
          outputCount: 1,
        },
      });
    });

    it('should get pending transactions', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/pending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          transactions: expect.any(Array),
          total: expect.any(Number),
          limit: expect.any(Number),
          offset: expect.any(Number),
        },
      });
    });

    it('should get fee estimates', async () => {
      const response = await request(app)
        .get('/api/v1/utxo-transactions/fee-estimate')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          estimates: {
            slow: expect.any(Object),
            medium: expect.any(Object),
            fast: expect.any(Object),
          },
          feeEstimates: {
            slow: expect.any(Number),
            medium: expect.any(Number),
            fast: expect.any(Number),
          },
        },
      });
    });
  });

  describe('Node Information Endpoints', () => {
    let app: any;
    let authToken: string;

    beforeEach(async () => {
      await server.start();
      app = (server as any).app;

      // Get authentication token
      const challengeResponse = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ algorithm: 'ed25519' });

      const { challengeId } = challengeResponse.body.data;

      const authResponse = await request(app).post('/api/v1/auth/verify').send({
        challengeId,
        signature: 'dummy-signature',
        publicKey: 'dummy-public-key',
      });

      authToken = authResponse.body.data.token;
    });

    it('should get node info', async () => {
      const response = await request(app)
        .get('/api/v1/node/info')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          nodeId: expect.any(String),
          version: '1.0.0',
          network: 'lorachain-mainnet',
          uptime: expect.any(Number),
          isRunning: true,
          connections: expect.any(Object),
          blockchain: expect.any(Object),
          httpServer: expect.any(Object),
        },
      });
    });

    it('should get node health', async () => {
      const response = await request(app)
        .get('/api/v1/node/health')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.any(String),
          checks: {
            blockchain: expect.any(Object),
            httpServer: expect.any(Object),
            websocket: expect.any(Object),
            memory: expect.any(Object),
          },
          uptime: expect.any(Number),
        },
      });
    });
  });

  describe('Configuration and Metrics', () => {
    it('should return server metrics', () => {
      const metrics = server.getMetrics();

      expect(metrics).toMatchObject({
        utxoOperations: {
          queries: expect.any(Number),
          creates: expect.any(Number),
          spends: expect.any(Number),
          doubleSpendAttempts: expect.any(Number),
        },
        compression: {
          totalCompressed: expect.any(Number),
          averageRatio: expect.any(Number),
          engineUsage: expect.any(Object),
        },
        authentication: {
          ed25519Verifications: expect.any(Number),
          secp256k1Verifications: expect.any(Number),
          challengesIssued: expect.any(Number),
          failedAuthentications: expect.any(Number),
        },
        meshIntegration: {
          dutyCycleWarnings: expect.any(Number),
          priorityTransactions: expect.any(Number),
          reliableDeliveryAcks: expect.any(Number),
        },
      });
    });

    it('should return server configuration', () => {
      const returnedConfig = server.getConfig();

      expect(returnedConfig).toEqual(config);
      expect(returnedConfig).not.toBe(config); // Should be a copy
    });
  });
});

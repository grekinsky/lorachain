import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt, { SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';

import { LorachainNode } from '@lorachain/node';
import {
  UTXOCompressionManager,
  CryptographicService,
  UTXOTransaction,
  UTXO,
  CompressionAlgorithm,
  CompressionLevel,
} from '@lorachain/core';
import { Logger } from '@lorachain/shared';

import {
  ServerConfig,
  UTXOAPIResponse,
  UTXOErrorCode,
  UTXOWebSocketEvent,
  UTXOSubscription,
  CryptoAuthChallenge,
  CryptoAuthResponse,
  AuthenticatedClient,
  ValidationResult,
  UTXOServerMetrics,
} from './types.js';

// Import route creators
import { createBlockchainRouter } from './routes/blockchain.js';
import { createUTXOTransactionRouter } from './routes/utxo-transactions.js';
import { createUTXORouter } from './routes/utxo.js';

export class HttpWebSocketServer {
  private app: Express;
  private server: HttpServer;
  private io?: SocketIOServer;
  private nodeServer: LorachainNode;
  private config: ServerConfig;
  private authenticatedClients: Map<string, AuthenticatedClient> = new Map();
  private authChallenges: Map<string, CryptoAuthChallenge> = new Map();
  private cryptoService: CryptographicService;
  private logger: Logger;
  private compressionManager: UTXOCompressionManager;
  private isRunning = false;

  // Metrics tracking
  private metrics: UTXOServerMetrics = {
    utxoOperations: {
      queries: 0,
      creates: 0,
      spends: 0,
      doubleSpendAttempts: 0,
    },
    compression: {
      totalCompressed: 0,
      averageRatio: 0,
      engineUsage: {},
    },
    authentication: {
      ed25519Verifications: 0,
      secp256k1Verifications: 0,
      challengesIssued: 0,
      failedAuthentications: 0,
    },
    meshIntegration: {
      dutyCycleWarnings: 0,
      priorityTransactions: 0,
      reliableDeliveryAcks: 0,
    },
  };

  constructor(nodeServer: LorachainNode, config: ServerConfig) {
    this.nodeServer = nodeServer;
    this.config = config;
    this.logger = Logger.getInstance();
    this.cryptoService = new CryptographicService();

    // Initialize compression manager based on config
    this.compressionManager = new UTXOCompressionManager({
      defaultAlgorithm: CompressionAlgorithm.GZIP,
      compressionLevel: CompressionLevel.BALANCED,
      enableDictionary: true,
      maxCompressionMemory: 512 * 1024, // 512KB
      enableAdaptive: true,
      compressionThreshold: 100, // Minimum 100 bytes to compress
      dutyCycleIntegration: true,
      utxoOptimization: true,
      regionalCompliance: 'US', // Default to US compliance
    });

    // Initialize Express app
    this.app = express();
    this.server = createServer(this.app);

    // Initialize Socket.IO if enabled
    if (config.websocket.enabled) {
      this.io = new SocketIOServer(this.server, {
        path: config.websocket.path,
        maxHttpBufferSize: 1024 * 1024, // 1MB
        cors: {
          origin: config.corsOrigins,
          methods: ['GET', 'POST'],
        },
      });
    }

    this.setupMiddleware();
    this.setupRoutes();
    if (config.websocket.enabled) {
      this.setupWebSocket();
    }

    this.logger.info('HttpWebSocketServer initialized', {
      port: config.port,
      host: config.host,
      websocketEnabled: config.websocket.enabled,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('HttpWebSocketServer is already running');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.server.listen(this.config.port, this.config.host, () => {
          this.isRunning = true;
          this.logger.info('HttpWebSocketServer started', {
            port: this.config.port,
            host: this.config.host,
          });
          resolve();
        });

        this.server.on('error', error => {
          this.logger.error('Failed to start HttpWebSocketServer', { error });
          reject(error);
        });
      });

      // Subscribe to blockchain events for real-time updates
      this.subscribeToBlockchainEvents();
    } catch (error) {
      this.logger.error('Failed to start HttpWebSocketServer', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('HttpWebSocketServer is not running');
      return;
    }

    try {
      await new Promise<void>(resolve => {
        this.server.close(() => {
          this.isRunning = false;
          this.logger.info('HttpWebSocketServer stopped');
          resolve();
        });
      });

      // Clean up
      this.authenticatedClients.clear();
      this.authChallenges.clear();
    } catch (error) {
      this.logger.error('Error stopping HttpWebSocketServer', { error });
      throw error;
    }
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
          },
        },
      })
    );

    // Additional security headers
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()'
      );
      res.setHeader('X-UTXO-Chain-ID', 'lorachain-mainnet');
      res.setHeader('X-API-Version', '1.0.0');
      next();
    });

    // CORS
    this.app.use(
      cors({
        origin: this.config.corsOrigins,
        credentials: true,
      })
    );

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting with UTXO priority boost
    const limiter = rateLimit({
      windowMs: this.config.rateLimiting.windowMs,
      max: this.config.rateLimiting.maxRequests,
      message: {
        success: false,
        error: {
          code: UTXOErrorCode.RATE_LIMITED,
          message: 'Too many requests, please try again later',
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Custom key generator for UTXO priority boost
      keyGenerator: (req: Request) => {
        // TODO: Implement UTXO priority boost logic
        return req.ip || 'unknown';
      },
    });

    this.app.use('/api/', limiter);

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.logger.debug('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
      next();
    });

    // Error handling middleware
    this.app.use(
      (error: Error, req: Request, res: Response, _next: NextFunction) => {
        this.logger.error('HTTP Error', {
          error: error.message,
          stack: error.stack,
        });

        const response: UTXOAPIResponse<null> = {
          success: false,
          error: {
            code: UTXOErrorCode.INTERNAL_ERROR,
            message: 'Internal server error',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        };

        res.status(500).json(response);
      }
    );
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
    });

    // Authentication routes (unprotected)
    this.app.use('/api/v1/auth', this.createAuthRouter());

    // API routes with authentication middleware
    this.app.use(
      '/api/v1',
      this.authMiddleware.bind(this),
      this.createAPIRouter()
    );
  }

  private createAPIRouter(): express.Router {
    const router = express.Router();

    // Import route modules
    const blockchainRouter = createBlockchainRouter(this.nodeServer);
    const utxoTransactionRouter = createUTXOTransactionRouter(this.nodeServer);
    const utxoRouter = createUTXORouter(this.nodeServer);
    const spvRouter = this.createSPVRouter();
    const nodeRouter = this.createNodeRouter();

    // Mount routers
    router.use('/blockchain', blockchainRouter);
    router.use('/utxo-transactions', utxoTransactionRouter);
    router.use('/', utxoRouter); // UTXO endpoints are at root level
    router.use('/spv', spvRouter);
    router.use('/node', nodeRouter);

    // API root endpoint
    router.get('/', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          message: 'Lorachain HTTP/WebSocket API v1.0.0',
          version: '1.0.0',
          chainId: 'lorachain-mainnet',
          features: [
            'UTXO-exclusive blockchain operations',
            'Real-time WebSocket updates',
            'SPV light client support',
            'Cryptographic authentication',
            'Compression optimization',
            'Regional compliance (LoRa)',
          ],
          endpoints: {
            blockchain: '/api/v1/blockchain/*',
            utxoTransactions: '/api/v1/utxo-transactions/*',
            utxos: '/api/v1/blockchain/address/:address/utxos',
            spv: '/api/v1/spv/*',
            node: '/api/v1/node/*',
          },
        },
        timestamp: Date.now(),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
    });

    return router;
  }

  // Placeholder router methods removed - using actual router implementations from routes/ directory

  private createSPVRouter(): express.Router {
    const router = express.Router();

    // SPV endpoints for light clients - to be implemented
    router.get(
      '/merkle-proof/:txId/:blockIndex',
      (req: Request, res: Response) => {
        res.json({
          success: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'SPV merkle proof endpoint not yet implemented',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      }
    );

    return router;
  }

  private createNodeRouter(): express.Router {
    const router = express.Router();

    // GET /api/v1/node/info
    router.get('/info', (req: Request, res: Response) => {
      try {
        const nodeInfo = {
          nodeId: 'lorachain-node-' + Date.now().toString(36), // TODO: Get from actual node when available
          version: '1.0.0',
          network: 'lorachain-mainnet',
          uptime: process.uptime(),
          isRunning: this.nodeServer.isNodeRunning?.() || false,
          connections: {
            peers: 0, // TODO: Get from peer manager when available
            meshNodes: 0, // TODO: Get from mesh protocol
          },
          blockchain: {
            height: this.nodeServer.getBlockchain().getBlocks().length,
            difficulty: this.nodeServer.getBlockchain().getDifficulty(),
            pendingTransactions: this.nodeServer
              .getBlockchain()
              .getPendingTransactions().length,
          },
          httpServer: {
            running: this.isRunning,
            port: this.config.port,
            websocketEnabled: this.config.websocket.enabled,
          },
        };

        res.json({
          success: true,
          data: nodeInfo,
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      } catch (error) {
        this.logger.error('Error getting node info', { error });
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get node information',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      }
    });

    // GET /api/v1/node/health
    router.get('/health', (req: Request, res: Response) => {
      try {
        const blockchain = this.nodeServer.getBlockchain();
        const blocks = blockchain.getBlocks();
        const lastBlock = blocks[blocks.length - 1];
        const timeSinceLastBlock = lastBlock
          ? Date.now() - lastBlock.timestamp
          : 0;

        const health = {
          status: 'healthy',
          checks: {
            blockchain: {
              status: blocks.length > 0 ? 'healthy' : 'warning',
              blockHeight: blocks.length,
              timeSinceLastBlock,
            },
            httpServer: {
              status: this.isRunning ? 'healthy' : 'unhealthy',
              uptime: process.uptime(),
            },
            websocket: {
              status:
                this.config.websocket.enabled && this.io
                  ? 'healthy'
                  : 'disabled',
              connections: this.io?.engine?.clientsCount || 0,
            },
            memory: {
              status:
                process.memoryUsage().heapUsed < 500 * 1024 * 1024
                  ? 'healthy'
                  : 'warning',
              usage: process.memoryUsage(),
            },
          },
          uptime: process.uptime(),
          timestamp: Date.now(),
        };

        // Determine overall status
        const checkStatuses = Object.values(health.checks).map(
          check => check.status
        );
        if (checkStatuses.includes('unhealthy')) {
          health.status = 'unhealthy';
        } else if (checkStatuses.includes('warning')) {
          health.status = 'warning';
        }

        const statusCode =
          health.status === 'healthy'
            ? 200
            : health.status === 'warning'
              ? 200
              : 503;

        res.status(statusCode).json({
          success: true,
          data: health,
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      } catch (error) {
        this.logger.error('Error checking node health', { error });
        res.status(503).json({
          success: false,
          error: {
            code: 'HEALTH_CHECK_FAILED',
            message: 'Health check failed',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      }
    });

    return router;
  }

  private setupWebSocket(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.logger.info('WebSocket client connected', { socketId: socket.id });

      // Handle authentication
      socket.on('authenticate', async data => {
        await this.handleWebSocketAuth(socket, data);
      });

      // Handle UTXO subscriptions
      socket.on('subscribe:utxo', (data: UTXOSubscription) => {
        this.handleUTXOSubscription(socket, data);
      });

      // Handle blockchain info requests
      socket.on('blockchain:info', () => {
        this.handleBlockchainInfoRequest(socket);
      });

      // Handle transaction submission via WebSocket
      socket.on('transaction:submit', (data: any) => {
        this.handleWebSocketTransactionSubmit(socket, data);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle disconnection
      socket.on('disconnect', reason => {
        this.logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason,
        });
        this.handleClientDisconnect(socket.id);
      });

      // Send initial connection info
      socket.emit('connection:established', {
        success: true,
        data: {
          socketId: socket.id,
          serverTime: Date.now(),
          version: '1.0.0',
          chainId: 'lorachain-mainnet',
        },
        timestamp: Date.now(),
      });
    });
  }

  private subscribeToBlockchainEvents(): void {
    // Subscribe to blockchain events for real-time updates
    // This will be implemented when we integrate with the actual UTXO components
    this.logger.info('Subscribed to blockchain events');
  }

  private async handleWebSocketAuth(socket: Socket, data: any): Promise<void> {
    try {
      const { token } = data;

      if (!token) {
        socket.emit('auth:error', {
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Token required for WebSocket authentication',
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.config.auth.jwtSecret) as any;
      const client = this.authenticatedClients.get(decoded.clientId);

      if (!client) {
        socket.emit('auth:error', {
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Invalid or expired session',
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Store authenticated socket connection
      (socket as any).userId = decoded.clientId;
      (socket as any).userInfo = {
        clientId: decoded.clientId,
        publicKey: client.publicKey,
        algorithm: client.algorithm,
        permissions: client.permissions,
      };

      // Update last activity
      client.lastActivity = Date.now();

      // Send success response
      socket.emit('auth:success', {
        success: true,
        data: {
          clientId: decoded.clientId,
          permissions: client.permissions,
          connectedAt: Date.now(),
        },
        timestamp: Date.now(),
      });

      this.logger.info('WebSocket client authenticated', {
        socketId: socket.id,
        clientId: decoded.clientId,
      });
    } catch (error) {
      this.logger.error('WebSocket authentication failed', {
        error,
        socketId: socket.id,
      });

      socket.emit('auth:error', {
        success: false,
        error: {
          code: UTXOErrorCode.UNAUTHORIZED,
          message: 'Authentication failed',
        },
        timestamp: Date.now(),
      });
    }
  }

  private handleUTXOSubscription(socket: Socket, data: UTXOSubscription): void {
    try {
      const userInfo = (socket as any).userInfo;

      // Check if user is authenticated
      if (!userInfo) {
        socket.emit('subscription:error', {
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Authentication required for UTXO subscriptions',
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Validate subscription data
      if (!data.action || !['subscribe', 'unsubscribe'].includes(data.action)) {
        socket.emit('subscription:error', {
          success: false,
          error: {
            code: UTXOErrorCode.INVALID_INPUT,
            message: 'Action must be either "subscribe" or "unsubscribe"',
          },
          timestamp: Date.now(),
        });
        return;
      }

      if (!data.filters) {
        socket.emit('subscription:error', {
          success: false,
          error: {
            code: UTXOErrorCode.INVALID_INPUT,
            message: 'Filters are required for UTXO subscriptions',
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Store subscription information on socket
      if (!socket.data) {
        socket.data = {};
      }

      if (data.action === 'subscribe') {
        socket.data.utxoSubscription = {
          filters: data.filters,
          subscribedAt: Date.now(),
          clientId: userInfo.clientId,
        };

        // Join UTXO rooms based on filters
        if (data.filters.addresses && data.filters.addresses.length > 0) {
          for (const address of data.filters.addresses) {
            socket.join(`utxo:address:${address}`);
          }
        }

        // Join general UTXO updates room
        socket.join('utxo:all');

        socket.emit('subscription:success', {
          success: true,
          data: {
            action: 'subscribe',
            filters: data.filters,
            subscribedAt: Date.now(),
          },
          timestamp: Date.now(),
        });

        this.logger.info('UTXO subscription created', {
          socketId: socket.id,
          clientId: userInfo.clientId,
          filters: data.filters,
        });
      } else if (data.action === 'unsubscribe') {
        // Leave all UTXO rooms
        if (socket.data.utxoSubscription?.filters.addresses) {
          for (const address of socket.data.utxoSubscription.filters
            .addresses) {
            socket.leave(`utxo:address:${address}`);
          }
        }
        socket.leave('utxo:all');

        // Remove subscription data
        delete socket.data.utxoSubscription;

        socket.emit('subscription:success', {
          success: true,
          data: {
            action: 'unsubscribe',
            unsubscribedAt: Date.now(),
          },
          timestamp: Date.now(),
        });

        this.logger.info('UTXO subscription removed', {
          socketId: socket.id,
          clientId: userInfo.clientId,
        });
      }
    } catch (error) {
      this.logger.error('Error handling UTXO subscription', {
        error,
        socketId: socket.id,
      });

      socket.emit('subscription:error', {
        success: false,
        error: {
          code: UTXOErrorCode.INTERNAL_ERROR,
          message: 'Failed to process subscription',
        },
        timestamp: Date.now(),
      });
    }
  }

  private handleClientDisconnect(socketId: string): void {
    // Clean up client subscriptions and auth data
    this.authenticatedClients.delete(socketId);
  }

  private authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: UTXOErrorCode.UNAUTHORIZED,
          message: 'Authorization header required',
        },
        timestamp: Date.now(),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, this.config.auth.jwtSecret) as any;

      // Verify the client is still authenticated
      const client = this.authenticatedClients.get(decoded.clientId);
      if (!client) {
        res.status(401).json({
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Invalid or expired session',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
        return;
      }

      // Update last activity
      client.lastActivity = Date.now();

      // Add user info to request
      (req as any).user = {
        clientId: decoded.clientId,
        publicKey: client.publicKey,
        algorithm: client.algorithm,
        permissions: client.permissions,
      };

      this.metrics.authentication[
        client.algorithm === 'ed25519'
          ? 'ed25519Verifications'
          : 'secp256k1Verifications'
      ]++;

      next();
    } catch {
      this.metrics.authentication.failedAuthentications++;
      res.status(401).json({
        success: false,
        error: {
          code: UTXOErrorCode.UNAUTHORIZED,
          message: 'Invalid token',
        },
        timestamp: Date.now(),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
      return;
    }
  }

  private createAuthRouter(): express.Router {
    const router = express.Router();

    // POST /api/v1/auth/challenge - Request authentication challenge
    router.post('/challenge', (req: Request, res: Response) => {
      try {
        const { algorithm } = req.body;

        if (!algorithm || !['secp256k1', 'ed25519'].includes(algorithm)) {
          return res.status(400).json({
            success: false,
            error: {
              code: UTXOErrorCode.INVALID_INPUT,
              message: 'Algorithm must be either secp256k1 or ed25519',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }

        // Generate random challenge
        const challenge = randomBytes(32).toString('hex');
        const challengeId = randomBytes(16).toString('hex');
        const expiresAt = Date.now() + this.config.auth.challengeExpiration;

        // For now, use a placeholder public key until we fix the type issues
        // TODO: Fix generateKeyPair method call
        const nodePublicKey = 'placeholder_' + algorithm + '_public_key';

        const authChallenge: CryptoAuthChallenge = {
          challenge,
          algorithm,
          expiresAt,
          nodePublicKey,
        };

        // Store challenge temporarily
        this.authChallenges.set(challengeId, authChallenge);

        // Clean up expired challenges
        this.cleanupExpiredChallenges();

        this.metrics.authentication.challengesIssued++;

        res.json({
          success: true,
          data: {
            challengeId,
            challenge,
            algorithm,
            expiresAt,
            nodePublicKey,
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      } catch (error) {
        this.logger.error('Error generating auth challenge', { error });
        res.status(500).json({
          success: false,
          error: {
            code: UTXOErrorCode.INTERNAL_ERROR,
            message: 'Failed to generate challenge',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      }
    });

    // POST /api/v1/auth/verify - Verify signature and get JWT
    router.post('/verify', (req: Request, res: Response) => {
      try {
        const {
          challengeId,
          signature,
          publicKey,
        }: CryptoAuthResponse & { challengeId: string } = req.body;

        if (!challengeId || !signature || !publicKey) {
          return res.status(400).json({
            success: false,
            error: {
              code: UTXOErrorCode.INVALID_INPUT,
              message: 'challengeId, signature, and publicKey are required',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }

        // Get the challenge
        const challenge = this.authChallenges.get(challengeId);
        if (!challenge) {
          this.metrics.authentication.failedAuthentications++;
          return res.status(400).json({
            success: false,
            error: {
              code: UTXOErrorCode.UNAUTHORIZED,
              message: 'Invalid or expired challenge',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }

        // Check expiration
        if (Date.now() > challenge.expiresAt) {
          this.authChallenges.delete(challengeId);
          this.metrics.authentication.failedAuthentications++;
          return res.status(400).json({
            success: false,
            error: {
              code: UTXOErrorCode.UNAUTHORIZED,
              message: 'Challenge expired',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }

        // TODO: Implement proper signature verification
        // For now, accept any signature as valid for testing
        const isValidSignature =
          signature &&
          publicKey &&
          signature.length > 0 &&
          publicKey.length > 0;

        if (!isValidSignature) {
          this.authChallenges.delete(challengeId);
          this.metrics.authentication.failedAuthentications++;
          return res.status(401).json({
            success: false,
            error: {
              code: UTXOErrorCode.INVALID_SIGNATURE,
              message: 'Invalid signature',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }

        // Create authenticated client
        const clientId = randomBytes(16).toString('hex');
        const authenticatedClient: AuthenticatedClient = {
          id: clientId,
          publicKey,
          algorithm: challenge.algorithm,
          permissions: ['read', 'write'], // Basic permissions
          connectedAt: Date.now(),
          lastActivity: Date.now(),
        };

        this.authenticatedClients.set(clientId, authenticatedClient);

        // Generate JWT
        const jwtPayload = {
          clientId,
          publicKey,
          algorithm: challenge.algorithm,
          permissions: authenticatedClient.permissions,
        };

        const token = jwt.sign(jwtPayload, this.config.auth.jwtSecret, {
          expiresIn: this.config.auth.jwtExpiration,
        } as SignOptions);

        // Clean up challenge
        this.authChallenges.delete(challengeId);

        this.metrics.authentication[
          challenge.algorithm === 'ed25519'
            ? 'ed25519Verifications'
            : 'secp256k1Verifications'
        ]++;

        res.json({
          success: true,
          data: {
            token,
            expiresIn: this.config.auth.jwtExpiration,
            clientId,
            permissions: authenticatedClient.permissions,
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      } catch (error) {
        this.logger.error('Error verifying auth signature', { error });
        this.metrics.authentication.failedAuthentications++;
        res.status(500).json({
          success: false,
          error: {
            code: UTXOErrorCode.INTERNAL_ERROR,
            message: 'Failed to verify signature',
          },
          timestamp: Date.now(),
          chainId: 'lorachain-mainnet',
          version: '1.0.0',
        });
      }
    });

    // POST /api/v1/auth/refresh - Refresh JWT token
    router.post(
      '/refresh',
      this.authMiddleware.bind(this),
      (req: Request, res: Response) => {
        try {
          const user = (req as any).user;
          const client = this.authenticatedClients.get(user.clientId);

          if (!client) {
            return res.status(401).json({
              success: false,
              error: {
                code: UTXOErrorCode.UNAUTHORIZED,
                message: 'Session not found',
              },
              timestamp: Date.now(),
              chainId: 'lorachain-mainnet',
              version: '1.0.0',
            });
          }

          // Generate new JWT
          const jwtPayload = {
            clientId: client.id,
            publicKey: client.publicKey,
            algorithm: client.algorithm,
            permissions: client.permissions,
          };

          const token = jwt.sign(jwtPayload, this.config.auth.jwtSecret, {
            expiresIn: this.config.auth.jwtExpiration,
          } as SignOptions);

          res.json({
            success: true,
            data: {
              token,
              expiresIn: this.config.auth.jwtExpiration,
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        } catch (error) {
          this.logger.error('Error refreshing token', { error });
          res.status(500).json({
            success: false,
            error: {
              code: UTXOErrorCode.INTERNAL_ERROR,
              message: 'Failed to refresh token',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }
      }
    );

    // DELETE /api/v1/auth/logout - Invalidate session
    router.delete(
      '/logout',
      this.authMiddleware.bind(this),
      (req: Request, res: Response) => {
        try {
          const user = (req as any).user;
          this.authenticatedClients.delete(user.clientId);

          res.json({
            success: true,
            data: {
              message: 'Successfully logged out',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        } catch (error) {
          this.logger.error('Error during logout', { error });
          res.status(500).json({
            success: false,
            error: {
              code: UTXOErrorCode.INTERNAL_ERROR,
              message: 'Failed to logout',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }
      }
    );

    // GET /api/v1/auth/status - Check authentication status
    router.get(
      '/status',
      this.authMiddleware.bind(this),
      (req: Request, res: Response) => {
        try {
          const user = (req as any).user;
          const client = this.authenticatedClients.get(user.clientId);

          res.json({
            success: true,
            data: {
              authenticated: true,
              clientId: user.clientId,
              algorithm: user.algorithm,
              permissions: user.permissions,
              connectedAt: client?.connectedAt,
              lastActivity: client?.lastActivity,
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        } catch (error) {
          this.logger.error('Error checking auth status', { error });
          res.status(500).json({
            success: false,
            error: {
              code: UTXOErrorCode.INTERNAL_ERROR,
              message: 'Failed to check status',
            },
            timestamp: Date.now(),
            chainId: 'lorachain-mainnet',
            version: '1.0.0',
          });
        }
      }
    );

    return router;
  }

  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [challengeId, challenge] of this.authChallenges.entries()) {
      if (now > challenge.expiresAt) {
        this.authChallenges.delete(challengeId);
      }
    }
  }

  private handleBlockchainInfoRequest(socket: Socket): void {
    try {
      const userInfo = (socket as any).userInfo;

      // Check authentication (optional for blockchain info)
      if (!userInfo) {
        socket.emit('blockchain:info:error', {
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Authentication required',
          },
          timestamp: Date.now(),
        });
        return;
      }

      const blockchain = this.nodeServer.getBlockchain();
      const blocks = blockchain.getBlocks();
      const latestBlock = blocks[blocks.length - 1];

      const info = {
        height: blocks.length,
        latestBlockHash: latestBlock?.hash || '',
        difficulty: blockchain.getDifficulty(),
        pendingTransactions: blockchain.getPendingTransactions().length,
        miningReward: blockchain.getMiningReward(),
        lastBlockTime: latestBlock?.timestamp || 0,
        networkId: 'lorachain-mainnet',
      };

      socket.emit('blockchain:info:response', {
        success: true,
        data: info,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Error handling blockchain info request', {
        error,
        socketId: socket.id,
      });

      socket.emit('blockchain:info:error', {
        success: false,
        error: {
          code: UTXOErrorCode.INTERNAL_ERROR,
          message: 'Failed to get blockchain info',
        },
        timestamp: Date.now(),
      });
    }
  }

  private handleWebSocketTransactionSubmit(socket: Socket, data: any): void {
    try {
      const userInfo = (socket as any).userInfo;

      // Check authentication
      if (!userInfo) {
        socket.emit('transaction:submit:error', {
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Authentication required for transaction submission',
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Check write permissions
      if (!userInfo.permissions.includes('write')) {
        socket.emit('transaction:submit:error', {
          success: false,
          error: {
            code: UTXOErrorCode.UNAUTHORIZED,
            message: 'Write permission required',
          },
          timestamp: Date.now(),
        });
        return;
      }

      const { inputs, outputs } = data;

      // Basic validation
      if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
        socket.emit('transaction:submit:error', {
          success: false,
          error: {
            code: UTXOErrorCode.INVALID_INPUT,
            message: 'Transaction must have at least one input',
          },
          timestamp: Date.now(),
        });
        return;
      }

      if (!outputs || !Array.isArray(outputs) || outputs.length === 0) {
        socket.emit('transaction:submit:error', {
          success: false,
          error: {
            code: UTXOErrorCode.INVALID_OUTPUT,
            message: 'Transaction must have at least one output',
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Create UTXO transaction
      const transaction: UTXOTransaction = {
        id: `ws_tx_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        inputs,
        outputs,
        lockTime: 0,
        timestamp: Date.now(),
        fee:
          inputs.reduce((sum, input) => sum + (input.value || 0), 0) -
          outputs.reduce((sum, output) => sum + output.value, 0),
      };

      // Submit to blockchain
      const blockchain = this.nodeServer.getBlockchain();
      blockchain.addTransaction(transaction);

      // Send success response
      socket.emit('transaction:submit:success', {
        success: true,
        data: {
          transactionId: transaction.id,
          status: 'pending',
          timestamp: transaction.timestamp,
        },
        timestamp: Date.now(),
      });

      // Broadcast to subscribed clients
      this.broadcastTransactionUpdate(transaction, 'submitted');

      this.logger.info('Transaction submitted via WebSocket', {
        socketId: socket.id,
        clientId: userInfo.clientId,
        txId: transaction.id,
      });
    } catch (error) {
      this.logger.error('Error handling WebSocket transaction submission', {
        error,
        socketId: socket.id,
      });

      socket.emit('transaction:submit:error', {
        success: false,
        error: {
          code: UTXOErrorCode.INTERNAL_ERROR,
          message: 'Failed to submit transaction',
        },
        timestamp: Date.now(),
      });
    }
  }

  private validateUTXOTransaction(_tx: UTXOTransaction): ValidationResult {
    // UTXO transaction validation - to be implemented in Phase 2
    return {
      isValid: true,
      errors: [],
      warnings: [],
    };
  }

  private broadcastUTXOUpdate(utxo: UTXO, event: 'created' | 'spent'): void {
    if (!this.io) return;

    const updateEvent: UTXOWebSocketEvent = {
      event: `utxo:${event}`,
      data: {
        utxoId: `${utxo.txId}:${utxo.outputIndex}`,
        transactionId: utxo.txId,
        outputIndex: utxo.outputIndex,
        address: utxo.lockingScript, // UTXO uses lockingScript, not scriptPubKey
        amount: utxo.value.toString(), // UTXO uses value, not amount
        blockHeight: utxo.blockHeight || 0,
      },
      timestamp: Date.now(),
      blockHash: '', // To be filled when available
    };

    // Broadcast to all UTXO subscribers
    this.io.to('utxo:all').emit('utxo:update', updateEvent);

    // Broadcast to address-specific subscribers
    if (utxo.lockingScript) {
      this.io
        .to(`utxo:address:${utxo.lockingScript}`)
        .emit('utxo:update', updateEvent);
    }

    this.logger.debug('UTXO update broadcasted', {
      event,
      utxoId: updateEvent.data.utxoId,
      address: utxo.lockingScript,
    });
  }

  private broadcastTransactionUpdate(
    transaction: UTXOTransaction,
    status: 'submitted' | 'confirmed' | 'failed'
  ): void {
    if (!this.io) return;

    const updateEvent = {
      event: `transaction:${status}`,
      data: {
        transactionId: transaction.id,
        inputs: transaction.inputs,
        outputs: transaction.outputs,
        fee: transaction.fee,
        timestamp: transaction.timestamp,
        status,
      },
      timestamp: Date.now(),
    };

    // Broadcast to all subscribers
    this.io.to('utxo:all').emit('transaction:update', updateEvent);

    // Broadcast to address-specific subscribers based on inputs/outputs
    const addresses = new Set<string>();

    // Add addresses from inputs (inputs don't have lockingScript, they reference previous outputs)
    // For inputs, we'd need to look up the previous transaction's output to get the address
    // For now, skip input addresses as this would require additional blockchain queries

    // Add addresses from outputs
    transaction.outputs?.forEach(output => {
      if (output.lockingScript) {
        addresses.add(output.lockingScript);
      }
    });

    // Broadcast to each relevant address room
    addresses.forEach(address => {
      this.io
        ?.to(`utxo:address:${address}`)
        .emit('transaction:update', updateEvent);
    });

    this.logger.debug('Transaction update broadcasted', {
      status,
      txId: transaction.id,
      addressCount: addresses.size,
    });
  }

  private broadcastBlockUpdate(block: any): void {
    if (!this.io) return;

    const updateEvent = {
      event: 'block:new',
      data: {
        blockIndex: block.index,
        blockHash: block.hash,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        transactionCount: block.transactions?.length || 0,
        difficulty: block.difficulty,
      },
      timestamp: Date.now(),
    };

    // Broadcast to all subscribers
    this.io.emit('block:update', updateEvent);

    this.logger.debug('Block update broadcasted', {
      blockIndex: block.index,
      blockHash: block.hash,
    });
  }

  // Public methods for integration
  public getMetrics(): UTXOServerMetrics {
    return { ...this.metrics };
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }

  public getConfig(): ServerConfig {
    return { ...this.config };
  }
}

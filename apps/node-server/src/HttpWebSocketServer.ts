import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

import { LorachainNode } from '@lorachain/node';
import {
  UTXOManager,
  UTXOTransactionManager,
  UTXOPersistenceManager,
  UTXOCompressionManager,
  CryptographicService,
  UTXOTransaction,
  UTXO,
  Block,
  Blockchain,
  CompressionAlgorithm,
  CompressionLevel,
} from '@lorachain/core';
import { Logger } from '@lorachain/shared';

import {
  ServerConfig,
  UTXOAPIResponse,
  UTXOErrorCode,
  UTXOSetResponse,
  BlockchainInfo,
  UTXOWebSocketEvent,
  UTXOSubscription,
  CryptoAuthChallenge,
  CryptoAuthResponse,
  AuthenticatedClient,
  ValidationResult,
  UTXOServerMetrics,
} from './types.js';

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

        this.server.on('error', (error) => {
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
      await new Promise<void>((resolve) => {
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
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
        },
      },
    }));

    // Additional security headers
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      res.setHeader('X-UTXO-Chain-ID', 'lorachain-mainnet');
      res.setHeader('X-API-Version', '1.0.0');
      next();
    });

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
    }));

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
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      this.logger.error('HTTP Error', { error: error.message, stack: error.stack });
      
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
    });
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

    // API routes will be implemented in Phase 2
    this.app.use('/api/v1', this.createAPIRouter());
  }

  private createAPIRouter(): express.Router {
    const router = express.Router();

    // Placeholder for API routes - will be implemented in Phase 2
    router.get('/', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          message: 'Lorachain HTTP/WebSocket API v1.0.0',
          endpoints: 'To be implemented',
        },
        timestamp: Date.now(),
        chainId: 'lorachain-mainnet',
        version: '1.0.0',
      });
    });

    return router;
  }

  private setupWebSocket(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.logger.info('WebSocket client connected', { socketId: socket.id });

      // Handle authentication
      socket.on('authenticate', async (data) => {
        await this.handleWebSocketAuth(socket, data);
      });

      // Handle UTXO subscriptions
      socket.on('subscribe:utxo', (data: UTXOSubscription) => {
        this.handleUTXOSubscription(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.logger.info('WebSocket client disconnected', { 
          socketId: socket.id, 
          reason 
        });
        this.handleClientDisconnect(socket.id);
      });
    });
  }

  private subscribeToBlockchainEvents(): void {
    // Subscribe to blockchain events for real-time updates
    // This will be implemented when we integrate with the actual UTXO components
    this.logger.info('Subscribed to blockchain events');
  }

  private async handleWebSocketAuth(socket: Socket, data: any): Promise<void> {
    // WebSocket authentication implementation - to be completed in Phase 3
    this.logger.debug('WebSocket authentication attempt', { socketId: socket.id });
  }

  private handleUTXOSubscription(socket: Socket, data: UTXOSubscription): void {
    // UTXO subscription handling - to be completed in Phase 4
    this.logger.debug('UTXO subscription request', { socketId: socket.id, data });
  }

  private handleClientDisconnect(socketId: string): void {
    // Clean up client subscriptions and auth data
    this.authenticatedClients.delete(socketId);
  }

  private validateUTXOTransaction(tx: UTXOTransaction): ValidationResult {
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

    this.io.emit('utxo:update', updateEvent);
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
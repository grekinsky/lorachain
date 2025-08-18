import { LorachainNode } from '@lorachain/node';
import { MeshProtocol } from '@lorachain/mesh-protocol';
import { Logger } from '@lorachain/shared';
import { randomBytes } from 'crypto';
import { HttpWebSocketServer } from './HttpWebSocketServer.js';
import { ServerConfig } from './types.js';

export class NodeServer {
  private node: LorachainNode;
  private meshProtocol: MeshProtocol;
  private httpWebSocketServer?: HttpWebSocketServer;
  private logger = Logger.getInstance();
  private nodeId: string;

  constructor() {
    this.nodeId = randomBytes(16).toString('hex');

    this.node = new LorachainNode({
      id: this.nodeId,
      port: 3000,
      host: 'localhost',
      type: 'full',
      enableMining: true,
      minerAddress: this.nodeId,
    });

    this.meshProtocol = new MeshProtocol({
      nodeId: this.nodeId,
      channel: 1,
      txPower: 20,
      bandwidth: 125000,
      spreadingFactor: 7,
      codingRate: 5,
      fragmentation: {
        maxFragmentSize: 197,
        sessionTimeout: 300000,
        maxConcurrentSessions: 100,
        retryAttempts: 3,
        ackRequired: false,
      },
    });

    this.logger.info('Node server initialized', {
      nodeId: this.nodeId,
    });
  }

  async start(): Promise<void> {
    this.logger.info('Starting node server');

    try {
      await Promise.all([this.node.start(), this.meshProtocol.connect()]);

      // Initialize and start HTTP/WebSocket server
      await this.startHttpWebSocketServer();

      this.logger.info('Node server started successfully');
      this.setupMessageHandling();
    } catch (error) {
      this.logger.error('Failed to start node server', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping node server');

    try {
      const promises: Promise<void>[] = [
        this.node.stop(),
        this.meshProtocol.disconnect()
      ];

      if (this.httpWebSocketServer) {
        promises.push(this.httpWebSocketServer.stop());
      }

      await Promise.all(promises);

      this.logger.info('Node server stopped successfully');
    } catch (error) {
      this.logger.error('Error during node server shutdown', { error });
    }
  }

  private async startHttpWebSocketServer(): Promise<void> {
    const serverConfig: ServerConfig = {
      port: 8080,
      host: '0.0.0.0',
      corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        utxoPriorityBoost: true,
      },
      auth: {
        jwtSecret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
        jwtExpiration: '1h',
        signatureAlgorithm: 'ed25519',
        challengeExpiration: 60000, // 1 minute
      },
      websocket: {
        enabled: true,
        path: '/socket.io',
        maxConnections: 1000,
        compressionEnabled: true,
        compressionEngine: 'gzip',
      },
      utxo: {
        maxInputsPerTransaction: 500,
        maxOutputsPerTransaction: 500,
        minRelayFee: BigInt(1000), // 1000 satoshis
        mempoolMaxSize: 10000,
      },
    };

    this.httpWebSocketServer = new HttpWebSocketServer(this.node, serverConfig);
    await this.httpWebSocketServer.start();

    this.logger.info('HTTP/WebSocket server started', {
      port: serverConfig.port,
      host: serverConfig.host,
    });
  }

  private setupMessageHandling(): void {
    this.logger.info('Setting up mesh message handling');
  }

  getNodeInfo(): any {
    return {
      nodeId: this.nodeId,
      isRunning: this.node.isNodeRunning(),
      connectedMeshNodes: this.meshProtocol.getConnectedNodes().length,
      blockchainHeight: this.node.getBlockchain().getBlocks().length,
      pendingTransactions: this.node.getBlockchain().getPendingTransactions()
        .length,
      httpServerRunning: this.httpWebSocketServer?.isServerRunning() || false,
    };
  }

  getBlockchainStats(): any {
    const blockchain = this.node.getBlockchain();
    const blocks = blockchain.getBlocks();
    const pendingTxs = blockchain.getPendingTransactions();

    return {
      height: blocks.length,
      latestBlockHash: blocks[blocks.length - 1]?.hash || 'N/A',
      pendingTransactions: pendingTxs.length,
      difficulty: blockchain.getDifficulty(),
      miningReward: blockchain.getMiningReward(),
    };
  }

  getHttpWebSocketServer(): HttpWebSocketServer | undefined {
    return this.httpWebSocketServer;
  }
}
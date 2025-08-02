import { LorachainNode } from '@lorachain/node';
import { MeshProtocol } from '@lorachain/mesh-protocol';
import { Logger } from '@lorachain/shared';
import { randomBytes } from 'crypto';

export class NodeServer {
  private node: LorachainNode;
  private meshProtocol: MeshProtocol;
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
      await Promise.all([this.node.stop(), this.meshProtocol.disconnect()]);

      this.logger.info('Node server stopped successfully');
    } catch (error) {
      this.logger.error('Error during node server shutdown', { error });
    }
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
}

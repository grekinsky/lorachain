import {
  Blockchain,
  UTXOTransaction,
  Block,
  UTXOManager,
  UTXOPersistenceManager,
  DatabaseFactory,
  CryptographicService,
  type GenesisConfig,
  type UTXOPersistenceConfig,
} from '@lorachain/core';
import { Logger } from '@lorachain/shared';
import type { NetworkNode } from '@lorachain/core';

export interface NodeConfig {
  id: string;
  port: number;
  host: string;
  type: 'light' | 'full';
  enableMining: boolean;
  minerAddress?: string;
  genesisConfig?: GenesisConfig | string; // Genesis config or chain ID (required)
  persistenceConfig?: UTXOPersistenceConfig; // Optional persistence config
}

export class LorachainNode {
  private blockchain: Blockchain;
  private config: NodeConfig;
  private peers: NetworkNode[] = [];
  private logger = Logger.getInstance();
  private isRunning = false;

  constructor(config: NodeConfig) {
    this.config = config;

    // Initialize blockchain with required parameters (NO BACKWARDS COMPATIBILITY)
    this.blockchain = this.initializeBlockchain(config);

    this.logger.info('Lorachain node initialized', { nodeId: config.id });
  }

  private initializeBlockchain(config: NodeConfig): Blockchain {
    // Default persistence configuration for nodes
    const defaultPersistenceConfig: UTXOPersistenceConfig = {
      enabled: true,
      dbPath: `./node-data/${config.id}`,
      dbType: 'leveldb',
      autoSave: true,
      batchSize: 100,
      compressionType: 'gzip',
      utxoSetCacheSize: 1000,
      cryptographicAlgorithm: 'secp256k1',
      compactionStyle: 'size',
    };

    // Use provided config or default
    const persistenceConfig =
      config.persistenceConfig || defaultPersistenceConfig;

    // Create required blockchain components
    const database = DatabaseFactory.create(persistenceConfig);
    const cryptoService = new CryptographicService();
    const persistence = new UTXOPersistenceManager(
      database,
      persistenceConfig,
      cryptoService
    );
    const utxoManager = new UTXOManager();

    // Default genesis config if none provided
    const genesisConfig = config.genesisConfig || 'mainnet'; // Default to mainnet

    // Default difficulty config
    const difficultyConfig = {
      targetBlockTime: 300, // 5 minutes
      adjustmentPeriod: 10,
      maxDifficultyRatio: 4,
      minDifficulty: 1,
      maxDifficulty: 1000,
    };

    return new Blockchain(
      persistence,
      utxoManager,
      difficultyConfig,
      genesisConfig
    );
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

    // Wait for blockchain initialization to complete
    await this.blockchain.waitForInitialization();

    this.isRunning = true;
    this.logger.info('Starting Lorachain node', {
      nodeId: this.config.id,
      port: this.config.port,
      type: this.config.type,
    });

    if (this.config.type === 'full' && this.config.enableMining) {
      this.startMining();
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping Lorachain node', { nodeId: this.config.id });

    // Close blockchain and persistence layer
    await this.blockchain.close();
  }

  private startMining(): void {
    const mineBlock = (): void => {
      if (!this.isRunning) {
        return;
      }

      if (!this.config.minerAddress) {
        this.logger.warn('Mining enabled but no miner address configured');
        return;
      }

      const pendingTransactions = this.blockchain.getPendingTransactions();
      if (pendingTransactions.length === 0) {
        setTimeout(mineBlock, 5000);
        return;
      }

      this.logger.info('Mining new block', {
        pendingTransactions: pendingTransactions.length,
      });

      const newBlock = this.blockchain.minePendingTransactions(
        this.config.minerAddress
      );

      if (newBlock) {
        this.logger.info('Block mined successfully', {
          blockIndex: newBlock.index,
          transactionCount: newBlock.transactions.length,
        });

        this.broadcastBlock(newBlock);
      }

      setTimeout(mineBlock, 1000);
    };

    setTimeout(mineBlock, 1000);
  }

  async addTransaction(transaction: UTXOTransaction): Promise<boolean> {
    const result = await this.blockchain.addTransaction(transaction);

    if (result.isValid) {
      this.logger.info('Transaction added to pending pool', {
        transactionId: transaction.id,
      });
      this.broadcastTransaction(transaction);
      return true;
    } else {
      this.logger.warn('Invalid transaction rejected', {
        transactionId: transaction.id,
        errors: result.errors,
      });
      return false;
    }
  }

  async addBlock(block: Block): Promise<boolean> {
    const result = await this.blockchain.addBlock(block);

    if (result.isValid) {
      this.logger.info('Block added to blockchain', {
        blockIndex: block.index,
      });
      return true;
    } else {
      this.logger.warn('Invalid block rejected', {
        blockIndex: block.index,
        errors: result.errors,
      });
      return false;
    }
  }

  private broadcastTransaction(transaction: UTXOTransaction): void {
    this.logger.debug('Broadcasting transaction to peers', {
      transactionId: transaction.id,
      peerCount: this.peers.length,
    });
  }

  private broadcastBlock(block: Block): void {
    this.logger.debug('Broadcasting block to peers', {
      blockIndex: block.index,
      peerCount: this.peers.length,
    });
  }

  addPeer(peer: NetworkNode): void {
    const existingPeer = this.peers.find(p => p.id === peer.id);
    if (!existingPeer) {
      this.peers.push(peer);
      this.logger.info('New peer added', { peerId: peer.id });
    }
  }

  removePeer(peerId: string): void {
    const index = this.peers.findIndex(p => p.id === peerId);
    if (index > -1) {
      this.peers.splice(index, 1);
      this.logger.info('Peer removed', { peerId });
    }
  }

  getBlockchain(): Blockchain {
    return this.blockchain;
  }

  getPeers(): NetworkNode[] {
    return [...this.peers];
  }

  getConfig(): NodeConfig {
    return { ...this.config };
  }

  isNodeRunning(): boolean {
    return this.isRunning;
  }
}

import { Blockchain, UTXOTransaction, Block } from '@lorachain/core';
import { Logger } from '@lorachain/shared';
import type { NetworkNode } from '@lorachain/core';

export interface NodeConfig {
  id: string;
  port: number;
  host: string;
  type: 'light' | 'full';
  enableMining: boolean;
  minerAddress?: string;
}

export class LorachainNode {
  private blockchain: Blockchain;
  private config: NodeConfig;
  private peers: NetworkNode[] = [];
  private logger = Logger.getInstance();
  private isRunning = false;

  constructor(config: NodeConfig) {
    this.config = config;
    this.blockchain = new Blockchain();
    this.logger.info('Lorachain node initialized', { nodeId: config.id });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

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

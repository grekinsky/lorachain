import { MobileWallet } from '@lorachain/mobile-wallet';
import { MeshProtocol } from '@lorachain/mesh-protocol';
import { Logger } from '@lorachain/shared';

export class WalletApp {
  private wallet: MobileWallet;
  private meshProtocol: MeshProtocol;
  private logger = Logger.getInstance();

  constructor() {
    this.wallet = new MobileWallet();
    this.meshProtocol = new MeshProtocol({
      nodeId: this.wallet.getAddress(),
      channel: 1,
      txPower: 20,
      bandwidth: 125000,
      spreadingFactor: 7,
      codingRate: 5,
      fragmentation: {
        maxFragmentSize: 197,
        sessionTimeout: 300000,
        maxConcurrentSessions: 50,
        retryAttempts: 3,
        ackRequired: false,
      },
    });

    this.logger.info('Wallet app initialized', {
      address: this.wallet.getAddress(),
    });
  }

  async start(): Promise<void> {
    this.logger.info('Starting wallet app');

    try {
      await this.meshProtocol.connect();
      this.logger.info('Connected to mesh network');
    } catch (error) {
      this.logger.error('Failed to connect to mesh network', { error });
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping wallet app');

    try {
      await this.meshProtocol.disconnect();
      this.logger.info('Disconnected from mesh network');
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
    }
  }

  getWalletInfo(): { address: string; balance: number } {
    return {
      address: this.wallet.getAddress(),
      balance: this.wallet.getBalance(),
    };
  }

  async sendTransaction(to: string, amount: number): Promise<boolean> {
    try {
      const transaction = this.wallet.createTransaction(to, amount);

      const message = {
        type: 'transaction' as const,
        payload: transaction,
        timestamp: Date.now(),
        from: this.wallet.getAddress(),
        signature: this.wallet.signMessage(JSON.stringify(transaction)),
      };

      const success = await this.meshProtocol.sendMessage(message);

      if (success) {
        this.logger.info('Transaction sent successfully', {
          transactionId: transaction.id,
          to,
          amount,
        });
      }

      return success;
    } catch (error) {
      this.logger.error('Failed to send transaction', { error, to, amount });
      return false;
    }
  }

  getMeshNodes(): any[] {
    return this.meshProtocol.getConnectedNodes();
  }
}

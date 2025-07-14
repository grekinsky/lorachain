import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletApp } from './WalletApp';

// Mock all external dependencies
const mockWallet = {
  getAddress: vi.fn().mockReturnValue('test-wallet-address'),
  getBalance: vi.fn().mockReturnValue(100.5),
  createTransaction: vi.fn().mockReturnValue({
    id: 'tx123',
    from: 'test-wallet-address',
    to: 'recipient-address',
    amount: 50,
    timestamp: Date.now(),
  }),
  signMessage: vi.fn().mockReturnValue('signature123'),
};

const mockMeshProtocol = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(true),
  getConnectedNodes: vi.fn().mockReturnValue([
    { id: 'node1', address: 'addr1' },
    { id: 'node2', address: 'addr2' },
  ]),
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock('@lorachain/mobile-wallet', () => ({
  MobileWallet: vi.fn(() => mockWallet),
}));

vi.mock('@lorachain/mesh-protocol', () => ({
  MeshProtocol: vi.fn(() => mockMeshProtocol),
}));

vi.mock('@lorachain/shared', () => ({
  Logger: {
    getInstance: vi.fn(() => mockLogger),
  },
}));

describe('WalletApp', () => {
  let app: WalletApp;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new WalletApp();
  });

  describe('constructor', () => {
    it('should initialize successfully', () => {
      expect(app).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Wallet app initialized', {
        address: 'test-wallet-address',
      });
    });
  });

  describe('start', () => {
    it('should connect to mesh network successfully', async () => {
      await app.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting wallet app');
      expect(mockMeshProtocol.connect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Connected to mesh network');
    });

    it('should handle connection failure gracefully', async () => {
      const error = new Error('Connection failed');
      mockMeshProtocol.connect.mockRejectedValue(error);

      await app.start();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect to mesh network',
        { error }
      );
    });
  });

  describe('stop', () => {
    it('should disconnect from mesh network successfully', async () => {
      await app.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping wallet app');
      expect(mockMeshProtocol.disconnect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Disconnected from mesh network'
      );
    });

    it('should handle disconnection failure gracefully', async () => {
      const error = new Error('Disconnection failed');
      mockMeshProtocol.disconnect.mockRejectedValue(error);

      await app.stop();

      expect(mockLogger.error).toHaveBeenCalledWith('Error during shutdown', {
        error,
      });
    });
  });

  describe('getWalletInfo', () => {
    it('should return correct wallet information', () => {
      const walletInfo = app.getWalletInfo();

      expect(walletInfo).toEqual({
        address: 'test-wallet-address',
        balance: 100.5,
      });
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction successfully', async () => {
      const to = 'recipient-address';
      const amount = 50;

      const result = await app.sendTransaction(to, amount);

      expect(result).toBe(true);
      expect(mockWallet.createTransaction).toHaveBeenCalledWith(to, amount);
      expect(mockWallet.signMessage).toHaveBeenCalled();
      expect(mockMeshProtocol.sendMessage).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction sent successfully',
        {
          transactionId: 'tx123',
          to,
          amount,
        }
      );
    });

    it('should handle transaction failure', async () => {
      const to = 'recipient-address';
      const amount = 50;

      mockMeshProtocol.sendMessage.mockResolvedValue(false);

      const result = await app.sendTransaction(to, amount);

      expect(result).toBe(false);
    });

    it('should handle transaction creation error', async () => {
      const to = 'recipient-address';
      const amount = 50;
      const error = new Error('Transaction creation failed');

      mockWallet.createTransaction.mockImplementation(() => {
        throw error;
      });

      const result = await app.sendTransaction(to, amount);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send transaction',
        { error, to, amount }
      );
    });
  });

  describe('getMeshNodes', () => {
    it('should return connected mesh nodes', () => {
      const nodes = app.getMeshNodes();

      expect(nodes).toEqual([
        { id: 'node1', address: 'addr1' },
        { id: 'node2', address: 'addr2' },
      ]);
      expect(mockMeshProtocol.getConnectedNodes).toHaveBeenCalled();
    });
  });
});

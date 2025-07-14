import { NodeServer } from './NodeServer';

async function main(): Promise<void> {
  const server = new NodeServer();

  process.on('SIGINT', async () => {
    console.log('\\nShutting down node server...');
    await server.stop();
    process.exit(0);
  });

  await server.start();

  const nodeInfo = server.getNodeInfo();
  console.log('Node Server Started');
  console.log('Node ID:', nodeInfo.nodeId);
  console.log('Blockchain Height:', nodeInfo.blockchainHeight);
  console.log('Mining enabled: true');
  console.log('Press Ctrl+C to exit');

  setInterval(() => {
    const stats = server.getBlockchainStats();
    console.log(
      `[${new Date().toISOString()}] Height: ${stats.height}, Pending TXs: ${stats.pendingTransactions}`
    );
  }, 30000);
}

// For ES modules, we can just call main() directly since there's no require.main
main().catch(console.error);

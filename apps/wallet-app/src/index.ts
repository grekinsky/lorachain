import { WalletApp } from './WalletApp';

async function main(): Promise<void> {
  const app = new WalletApp();

  process.on('SIGINT', async () => {
    console.log('\\nShutting down wallet app...');
    await app.stop();
    process.exit(0);
  });

  await app.start();

  const walletInfo = app.getWalletInfo();
  console.log('Wallet App Started');
  console.log('Address:', walletInfo.address);
  console.log('Balance:', walletInfo.balance);
  console.log('Connected to mesh network');
  console.log('Press Ctrl+C to exit');

  setInterval(() => {
    const nodes = app.getMeshNodes();
    if (nodes.length > 0) {
      console.log(`Connected to ${nodes.length} mesh nodes`);
    }
  }, 30000);
}

// For ES modules, we can just call main() directly since there's no require.main
main().catch(console.error);

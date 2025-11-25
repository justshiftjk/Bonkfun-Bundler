import { BotOrchestrator } from './bot/orchestrator.js';
import { logger } from './utils/logger.js';
import { TokenConfig } from './types.js';

async function main() {
  try {
    logger.info('Starting Monad Nad.fun Bundler & Volume Bot');

    const orchestrator = new BotOrchestrator();
    await orchestrator.initialize();

    // Token configuration
    const tokenConfig: TokenConfig = {
      name: 'My Token',
      symbol: 'MTK',
      description: 'Token created by bundler bot',
      imageUrl: '',
    };

    // Execute main flow
    await orchestrator.execute(tokenConfig);

    // Keep running for volume generation
    // In production, add monitoring and recovery triggers
    logger.info('Bot is running. Press Ctrl+C to stop.');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await orchestrator.stop();
      process.exit(0);
    });

    // Example: Trigger recovery after some time or condition
    // setTimeout(async () => {
    //   await orchestrator.triggerRecovery();
    // }, 3600000); // 1 hour

  } catch (error) {
    logger.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();


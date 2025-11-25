import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { WalletManager } from '../utils/wallet.js';
import { NadFunContract } from '../contracts/nadfun.js';
import { TransactionBundler } from '../bundler/transactionBundler.js';
import { VolumeBot } from './volumeBot.js';
import { RecoveryManager } from './recovery.js';
import { BotState, TokenConfig } from '../types.js';

export class BotOrchestrator {
  private walletManager: WalletManager;
  private nadFun: NadFunContract;
  private bundler: TransactionBundler;
  private volumeBot?: VolumeBot;
  private recoveryManager?: RecoveryManager;
  private state: BotState;

  constructor() {
    this.walletManager = new WalletManager();
    this.nadFun = new NadFunContract();
    this.bundler = new TransactionBundler();
    this.state = {
      phase: 'idle',
      fundingWallets: [],
      volumeWallets: [],
      totalMonDeposited: 0,
      bondingCurveComplete: false,
      volumeGenerated: 0,
    };
  }

  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    logger.info('Initializing bot orchestrator...');
    await this.walletManager.initialize();
    logger.info('Bot orchestrator initialized');
  }

  /**
   * Main execution flow
   */
  async execute(tokenConfig: TokenConfig): Promise<void> {
    try {
      // Phase 1: Generate funding wallets
      await this.phase1_GenerateFundingWallets();

      // Phase 2: Fund bonding curve
      await this.phase2_FundBondingCurve(tokenConfig);

      // Phase 3: Wait for bonding curve completion
      await this.phase3_WaitForBondingCurve();

      // Phase 4: Generate volume wallets and start volume bot
      await this.phase4_StartVolumeGeneration();

      logger.info('Bot execution completed successfully');
    } catch (error) {
      logger.error(`Bot execution failed: ${error}`);
      throw error;
    }
  }

  /**
   * Phase 1: Generate funding wallets
   */
  private async phase1_GenerateFundingWallets(): Promise<void> {
    logger.info('=== Phase 1: Generating Funding Wallets ===');
    this.state.phase = 'funding';

    const walletCount = config.bondingCurve.walletCount;
    const wallets = await this.walletManager.generateFundingWallets(walletCount);
    this.state.fundingWallets = wallets;

    logger.info(`Generated ${wallets.length} funding wallets`);
    
    // Verify wallet isolation
    const isIsolated = await this.walletManager.verifyWalletIsolation();
    if (!isIsolated) {
      logger.warn('Wallet isolation verification failed');
    }
  }

  /**
   * Phase 2: Fund bonding curve with bundled transactions
   */
  private async phase2_FundBondingCurve(tokenConfig: TokenConfig): Promise<void> {
    logger.info('=== Phase 2: Funding Bonding Curve ===');
    this.state.phase = 'bonding';

    const fundingWallets = this.state.fundingWallets;
    const targetMon = config.bondingCurve.targetMon;
    const monPerWallet = targetMon / fundingWallets.length;

    logger.info(`Target: ${targetMon} MON across ${fundingWallets.length} wallets`);
    logger.info(`Approx ${monPerWallet} MON per wallet`);

    // Use first wallet to create token
    const firstWallet = fundingWallets[0];
    const firstBuyAmount = ethers.parseEther(monPerWallet.toString());

    // Bundle token creation and first buy
    logger.info('Bundling token creation and first buy...');
    await this.bundler.bundleTokenCreationAndBuy(
      firstWallet,
      tokenConfig,
      firstBuyAmount
    );

    // Extract token address (simplified - in production get from transaction receipt)
    // For now, we'll need to get it from the contract or store it
    const tokenAddress = ''; // TODO: Extract from creation transaction
    this.state.tokenAddress = tokenAddress;

    // Distribute remaining MON across other wallets
    const remainingWallets = fundingWallets.slice(1);
    const remainingAmount = targetMon - monPerWallet;
    const amountPerRemainingWallet = remainingAmount / remainingWallets.length;

    // Bundle multiple buys from remaining wallets
    const buyAmounts = remainingWallets.map(() => 
      ethers.parseEther(amountPerRemainingWallet.toString())
    );

    logger.info(`Bundling ${remainingWallets.length} additional buy transactions...`);
    await this.bundler.bundleMultipleBuys(
      remainingWallets,
      tokenAddress,
      buyAmounts
    );

    this.state.totalMonDeposited = targetMon;
    logger.info('Bonding curve funding complete');
  }

  /**
   * Phase 3: Wait for bonding curve to complete
   */
  private async phase3_WaitForBondingCurve(): Promise<void> {
    logger.info('=== Phase 3: Waiting for Bonding Curve Completion ===');

    if (!this.state.tokenAddress) {
      throw new Error('Token address not set');
    }

    // Poll bonding curve status
    const pollInterval = 30000; // 30 seconds
    const maxWaitTime = 3600000; // 1 hour
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.nadFun.getBondingCurveStatus(this.state.tokenAddress);
      
      logger.info(
        `Bonding curve status: ${ethers.formatEther(status.liquidity)} / ${ethers.formatEther(status.threshold)} MON`
      );

      if (status.isComplete) {
        this.state.bondingCurveComplete = true;
        logger.info('Bonding curve completed!');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Bonding curve did not complete within timeout');
  }

  /**
   * Phase 4: Generate volume wallets and start volume bot
   */
  private async phase4_StartVolumeGeneration(): Promise<void> {
    logger.info('=== Phase 4: Starting Volume Generation ===');
    this.state.phase = 'volume';

    // Generate volume wallets (separate from funding wallets)
    const volumeWallets = await this.walletManager.generateVolumeWallets(
      config.volume.walletCount
    );
    this.state.volumeWallets = volumeWallets;

    // Fund volume wallets with MON for trading
    await this.fundVolumeWallets(volumeWallets);

    // Create and start volume bot
    if (!this.state.tokenAddress) {
      throw new Error('Token address not set');
    }

    this.volumeBot = new VolumeBot(
      this.nadFun,
      this.walletManager,
      this.state.tokenAddress
    );

    await this.volumeBot.start();
    logger.info('Volume bot started');
  }

  /**
   * Fund volume wallets with MON for trading
   */
  private async fundVolumeWallets(wallets: any[]): Promise<void> {
    logger.info(`Funding ${wallets.length} volume wallets...`);

    // Calculate MON needed per wallet
    const avgTradeAmount = (config.volume.tradeAmountMinMon + config.volume.tradeAmountMaxMon) / 2;
    const monPerWallet = avgTradeAmount * 10; // Enough for ~10 trades

    // Transfer MON from funding wallets to volume wallets
    // Use a subset of funding wallets to avoid depleting them
    const fundingWallets = this.state.fundingWallets.slice(0, Math.min(10, this.state.fundingWallets.length));

    for (let i = 0; i < wallets.length; i++) {
      const volumeWallet = wallets[i];
      const fundingWallet = fundingWallets[i % fundingWallets.length];
      
      const amount = ethers.parseEther(monPerWallet.toString());
      await this.nadFun.transferMon(
        fundingWallet,
        volumeWallet.address,
        amount
      );

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info('Volume wallets funded');
  }

  /**
   * Trigger recovery if needed
   */
  async triggerRecovery(expectedDemand: number = 0): Promise<void> {
    logger.info('=== Triggering Recovery ===');
    this.state.phase = 'recovery';

    if (!this.state.tokenAddress) {
      throw new Error('Token address not set');
    }

    // Stop volume bot if running
    if (this.volumeBot) {
      await this.volumeBot.stop();
    }

    // Create recovery manager
    this.recoveryManager = new RecoveryManager(
      this.nadFun,
      this.walletManager,
      this.state.tokenAddress
    );

    // Execute recovery
    const result = await this.recoveryManager.executeRecovery();
    
    logger.info(
      `Recovery complete: ${ethers.formatEther(result.totalMonRecovered)} MON recovered from ${result.walletsProcessed} wallets`
    );

    this.state.phase = 'completed';
  }

  /**
   * Get current bot state
   */
  getState(): BotState {
    return { ...this.state };
  }

  /**
   * Stop all operations
   */
  async stop(): Promise<void> {
    if (this.volumeBot) {
      await this.volumeBot.stop();
    }
    logger.info('Bot orchestrator stopped');
  }
}


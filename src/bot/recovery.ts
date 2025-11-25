import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Wallet } from '../types.js';
import { NadFunContract } from '../contracts/nadfun.js';
import { WalletManager } from '../utils/wallet.js';

export class RecoveryManager {
  private nadFun: NadFunContract;
  private walletManager: WalletManager;
  private tokenAddress: string;
  private recoveryAddress: string;

  constructor(
    nadFun: NadFunContract,
    walletManager: WalletManager,
    tokenAddress: string
  ) {
    this.nadFun = nadFun;
    this.walletManager = walletManager;
    this.tokenAddress = tokenAddress;
    this.recoveryAddress = config.recovery.walletAddress;
    
    if (!this.recoveryAddress) {
      throw new Error('Recovery wallet address not configured');
    }
  }

  /**
   * Execute recovery: swap all tokens to MON and consolidate
   * Works with both funding wallets and volume wallets
   */
  async executeRecovery(): Promise<{
    totalMonRecovered: bigint;
    walletsProcessed: number;
  }> {
    logger.info('Starting recovery process...');

    const allWallets = this.walletManager.getAllWallets();
    let totalMonRecovered = BigInt(0);
    let walletsProcessed = 0;

    // Process each wallet
    for (const wallet of allWallets) {
      try {
        const recovered = await this.recoverFromWallet(wallet);
        totalMonRecovered += recovered;
        walletsProcessed++;
        
        // Small delay between wallets to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Failed to recover from wallet ${wallet.address}: ${error}`);
      }
    }

    logger.info(
      `Recovery complete: ${ethers.formatEther(totalMonRecovered)} MON recovered from ${walletsProcessed} wallets`
    );

    return {
      totalMonRecovered,
      walletsProcessed,
    };
  }

  /**
   * Recover funds from a single wallet
   */
  private async recoverFromWallet(wallet: Wallet): Promise<bigint> {
    logger.info(`Recovering from wallet: ${wallet.address}`);

    let totalRecovered = BigInt(0);

    // Step 1: Sell all tokens for MON
    const tokenBalance = await this.nadFun.getTokenBalance(
      this.tokenAddress,
      wallet.address
    );

    if (tokenBalance > BigInt(0)) {
      logger.info(`Selling ${ethers.formatEther(tokenBalance)} tokens from ${wallet.address}`);
      
      try {
        const monReceived = await this.nadFun.sellToken(
          wallet,
          this.tokenAddress,
          tokenBalance
        );
        totalRecovered += monReceived;
        logger.info(`Received ${ethers.formatEther(monReceived)} MON from token sale`);
      } catch (error) {
        logger.error(`Failed to sell tokens: ${error}`);
      }
    }

    // Step 2: Transfer all MON to recovery address
    const monBalance = await this.nadFun.getMonBalance(wallet.address);

    if (monBalance > BigInt(0)) {
      // Keep small amount for gas
      const gasReserve = ethers.parseEther('0.001');
      const transferAmount = monBalance > gasReserve 
        ? monBalance - gasReserve 
        : BigInt(0);

      if (transferAmount > BigInt(0)) {
        logger.info(`Transferring ${ethers.formatEther(transferAmount)} MON to recovery address`);
        
        try {
          await this.nadFun.transferMon(
            wallet,
            this.recoveryAddress,
            transferAmount
          );
          totalRecovered += transferAmount;
        } catch (error) {
          logger.error(`Failed to transfer MON: ${error}`);
        }
      }
    }

    return totalRecovered;
  }

  /**
   * Check if recovery is needed based on token performance
   */
  async shouldRecover(expectedDemand: number): Promise<boolean> {
    // Check various metrics:
    // - Token price vs initial price
    // - Trading volume
    // - Time since launch
    
    // Placeholder logic - implement based on actual requirements
    const currentPrice = await this.nadFun.getTokenPrice(this.tokenAddress);
    const initialPrice = BigInt(0); // Store initial price during creation
    
    // If price dropped significantly, consider recovery
    // Adjust threshold based on requirements
    const priceDropThreshold = 0.5; // 50% drop
    
    return false; // Implement actual logic
  }
}


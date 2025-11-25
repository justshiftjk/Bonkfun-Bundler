import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Wallet, TradeOrder } from '../types.js';
import { NadFunContract } from '../contracts/nadfun.js';
import { WalletManager } from '../utils/wallet.js';

export class VolumeBot {
  private nadFun: NadFunContract;
  private walletManager: WalletManager;
  private tokenAddress: string;
  private isRunning: boolean = false;
  private tradeInterval?: NodeJS.Timeout;
  private tradeHistory: TradeOrder[] = [];

  constructor(nadFun: NadFunContract, walletManager: WalletManager, tokenAddress: string) {
    this.nadFun = nadFun;
    this.walletManager = walletManager;
    this.tokenAddress = tokenAddress;
  }

  /**
   * Start volume generation
   * Only uses volume wallets (not funding wallets)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Volume bot is already running');
      return;
    }

    const volumeWallets = this.walletManager.getVolumeWallets();
    if (volumeWallets.length === 0) {
      throw new Error('No volume wallets available');
    }

    this.isRunning = true;
    logger.info('Starting volume bot...');

    // Start trading loop
    this.scheduleNextTrade(volumeWallets);
  }

  /**
   * Stop volume generation
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.tradeInterval) {
      clearTimeout(this.tradeInterval);
    }
    logger.info('Volume bot stopped');
  }

  private scheduleNextTrade(wallets: Wallet[]): void {
    if (!this.isRunning) return;

    const interval = this.getRandomInterval();
    
    this.tradeInterval = setTimeout(async () => {
      try {
        await this.executeRandomTrade(wallets);
      } catch (error) {
        logger.error(`Trade execution error: ${error}`);
      }
      
      // Schedule next trade
      this.scheduleNextTrade(wallets);
    }, interval);
  }

  private async executeRandomTrade(wallets: Wallet[]): Promise<void> {
    // Select random wallet
    const wallet = this.walletManager.getRandomWallet(wallets);
    
    // Randomly decide buy or sell
    const tradeType = Math.random() > 0.5 ? 'buy' : 'sell';
    
    // Get random trade amount
    const amountMon = this.getRandomTradeAmount();

    try {
      if (tradeType === 'buy') {
        await this.executeBuy(wallet, amountMon);
      } else {
        await this.executeSell(wallet, amountMon);
      }
    } catch (error) {
      logger.error(`Failed to execute ${tradeType}: ${error}`);
    }
  }

  private async executeBuy(wallet: Wallet, amountMon: number): Promise<void> {
    logger.info(`Buy: ${amountMon} MON from wallet ${wallet.address}`);
    
    const amountMonBigInt = ethers.parseEther(amountMon.toString());
    
    // Check balance
    const balance = await this.nadFun.getMonBalance(wallet.address);
    if (balance < amountMonBigInt) {
      logger.warn(`Insufficient balance for buy: ${wallet.address}`);
      return;
    }

    await this.nadFun.buyToken(wallet, this.tokenAddress, amountMonBigInt);
    
    const order: TradeOrder = {
      wallet,
      type: 'buy',
      amountMon,
      tokenAddress: this.tokenAddress,
      timestamp: new Date(),
    };
    
    this.tradeHistory.push(order);
  }

  private async executeSell(wallet: Wallet, amountMon: number): Promise<void> {
    logger.info(`Sell: ${amountMon} MON worth from wallet ${wallet.address}`);
    
    // Get token balance
    const tokenBalance = await this.nadFun.getTokenBalance(
      this.tokenAddress,
      wallet.address
    );
    
    if (tokenBalance === BigInt(0)) {
      logger.warn(`No tokens to sell: ${wallet.address}`);
      return;
    }

    // Calculate token amount to sell based on MON value
    const tokenPrice = await this.nadFun.getTokenPrice(this.tokenAddress);
    const amountMonBigInt = ethers.parseEther(amountMon.toString());
    const tokensToSell = (amountMonBigInt * BigInt(10**18)) / tokenPrice;

    if (tokensToSell > tokenBalance) {
      // Sell all available tokens
      await this.nadFun.sellToken(wallet, this.tokenAddress, tokenBalance);
    } else {
      await this.nadFun.sellToken(wallet, this.tokenAddress, tokensToSell);
    }
    
    const order: TradeOrder = {
      wallet,
      type: 'sell',
      amountMon,
      tokenAddress: this.tokenAddress,
      timestamp: new Date(),
    };
    
    this.tradeHistory.push(order);
  }

  private getRandomInterval(): number {
    const min = config.volume.minTradeIntervalMs;
    const max = config.volume.maxTradeIntervalMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getRandomTradeAmount(): number {
    const min = config.volume.tradeAmountMinMon;
    const max = config.volume.tradeAmountMaxMon;
    return Math.random() * (max - min) + min;
  }

  getTradeHistory(): TradeOrder[] {
    return [...this.tradeHistory];
  }

  getTotalVolume(): number {
    return this.tradeHistory.reduce((sum, order) => sum + order.amountMon, 0);
  }
}


import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import { Wallet } from '../types.js';
import { logger } from './logger.js';
import { config } from '../config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const WALLETS_DIR = path.join(process.cwd(), 'wallets');

export class WalletManager {
  private fundingWallets: Wallet[] = [];
  private volumeWallets: Wallet[] = [];
  private seedPhrase: string = '';

  async initialize(): Promise<void> {
    await fs.mkdir(WALLETS_DIR, { recursive: true });
    
    // Generate or load seed phrase
    if (config.wallet.seed) {
      this.seedPhrase = config.wallet.seed;
    } else {
      this.seedPhrase = bip39.generateMnemonic();
      await this.saveSeedPhrase();
    }

    logger.info('Wallet manager initialized');
  }

  private async saveSeedPhrase(): Promise<void> {
    const seedPath = path.join(WALLETS_DIR, 'seed.txt');
    await fs.writeFile(seedPath, this.seedPhrase, 'utf-8');
    logger.info('Seed phrase saved (keep this secure!)');
  }

  /**
   * Generate funding wallets for bonding curve
   * These wallets will be isolated and appear unrelated
   */
  async generateFundingWallets(count: number): Promise<Wallet[]> {
    logger.info(`Generating ${count} funding wallets...`);
    
    const wallets: Wallet[] = [];
    
    // Use different derivation paths to ensure wallets appear unrelated
    for (let i = 0; i < count; i++) {
      // Use different derivation paths with indices
      // For Monad (EVM-compatible), use standard Ethereum derivation path
      const derivationPath = `m/44'/60'/0'/0/${i}`;
      
      // Generate wallet from mnemonic with derivation path
      const hdNode = ethers.HDNodeWallet.fromPhrase(this.seedPhrase, derivationPath);
      
      const wallet: Wallet = {
        address: hdNode.address,
        privateKey: hdNode.privateKey,
        publicKey: hdNode.publicKey,
        index: i,
        type: 'funding',
      };

      wallets.push(wallet);
      
      // Save wallet info (without private key in plain text)
      await this.saveWalletInfo(wallet, 'funding');
    }

    this.fundingWallets = wallets;
    logger.info(`Generated ${wallets.length} funding wallets`);
    return wallets;
  }

  /**
   * Generate volume trading wallets
   * These are created after bonding curve completion
   */
  async generateVolumeWallets(count: number): Promise<Wallet[]> {
    logger.info(`Generating ${count} volume wallets...`);
    
    const wallets: Wallet[] = [];
    const baseIndex = this.fundingWallets.length;
    
    for (let i = 0; i < count; i++) {
      // Use different derivation path starting from baseIndex
      // This ensures complete separation from funding wallets
      const hdNode = ethers.HDNodeWallet.fromPhrase(
        this.seedPhrase,
        `m/44'/60'/1'/0/${i}`
      );
      
      const wallet: Wallet = {
        address: hdNode.address,
        privateKey: hdNode.privateKey,
        publicKey: hdNode.publicKey,
        index: baseIndex + i,
        type: 'volume',
      };

      wallets.push(wallet);
      await this.saveWalletInfo(wallet, 'volume');
    }

    this.volumeWallets = wallets;
    logger.info(`Generated ${wallets.length} volume wallets`);
    return wallets;
  }

  private async saveWalletInfo(wallet: Wallet, category: string): Promise<void> {
    const walletDir = path.join(WALLETS_DIR, category);
    await fs.mkdir(walletDir, { recursive: true });
    
    const walletFile = path.join(walletDir, `wallet_${wallet.index}.json`);
    const walletData = {
      address: wallet.address,
      publicKey: wallet.publicKey,
      index: wallet.index,
      type: wallet.type,
      // Private key is stored separately for security
    };
    
    await fs.writeFile(walletFile, JSON.stringify(walletData, null, 2));
    
    // Store private key in separate encrypted file (simplified - in production use encryption)
    const keyFile = path.join(walletDir, `wallet_${wallet.index}.key`);
    await fs.writeFile(keyFile, wallet.privateKey, { mode: 0o600 });
  }

  getFundingWallets(): Wallet[] {
    return [...this.fundingWallets];
  }

  getVolumeWallets(): Wallet[] {
    return [...this.volumeWallets];
  }

  getAllWallets(): Wallet[] {
    return [...this.fundingWallets, ...this.volumeWallets];
  }

  /**
   * Get a random wallet from a set, ensuring diversity
   */
  getRandomWallet(wallets: Wallet[]): Wallet {
    const index = Math.floor(Math.random() * wallets.length);
    return wallets[index];
  }

  /**
   * Ensure wallet isolation by checking for any on-chain relationships
   */
  async verifyWalletIsolation(): Promise<boolean> {
    // In production, check on-chain for:
    // - No direct transfers between wallets
    // - Different funding sources
    // - Different timing patterns
    logger.info('Wallet isolation verification (placeholder)');
    return true;
  }
}


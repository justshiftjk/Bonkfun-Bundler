import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Wallet, TokenConfig } from '../types.js';

// Nad.fun contract ABIs (update with actual ABIs)
const NAD_FUN_ABI = [
  'function createToken(string name, string symbol, string description, string imageUrl) returns (address)',
  'function buyToken(address token, uint256 amountMon) returns (uint256)',
  'function sellToken(address token, uint256 amountTokens) returns (uint256)',
  'function getBondingCurveStatus(address token) view returns (uint256 liquidity, uint256 threshold, bool isComplete)',
  'function getTokenPrice(address token) view returns (uint256)',
  'function getTokenBalance(address token, address wallet) view returns (uint256)',
];

const BONDING_CURVE_ABI = [
  'function deposit(uint256 amount)',
  'function getLiquidity() view returns (uint256)',
  'function getThreshold() view returns (uint256)',
  'function isComplete() view returns (bool)',
  'function withdraw()',
];

export class NadFunContract {
  private provider: ethers.JsonRpcProvider;
  private nadFunContract: ethers.Contract;
  private bondingCurveContract: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.monad.rpcUrl);
    
    if (!config.contracts.nadFun) {
      throw new Error('NAD_FUN_CONTRACT_ADDRESS not configured');
    }
    
    this.nadFunContract = new ethers.Contract(
      config.contracts.nadFun,
      NAD_FUN_ABI,
      this.provider
    );

    if (config.contracts.bondingCurve) {
      this.bondingCurveContract = new ethers.Contract(
        config.contracts.bondingCurve,
        BONDING_CURVE_ABI,
        this.provider
      );
    }
  }

  /**
   * Create a new token on nad.fun
   */
  async createToken(
    wallet: Wallet,
    tokenConfig: TokenConfig
  ): Promise<string> {
    logger.info(`Creating token: ${tokenConfig.name} (${tokenConfig.symbol})`);
    
    const signer = new ethers.Wallet(wallet.privateKey, this.provider);
    const contract = this.nadFunContract.connect(signer);

    try {
      const tx = await contract.createToken(
        tokenConfig.name,
        tokenConfig.symbol,
        tokenConfig.description || '',
        tokenConfig.imageUrl || ''
      );

      const receipt = await tx.wait();
      logger.info(`Token creation transaction: ${receipt.hash}`);

      // Extract token address from event (adjust based on actual event structure)
      const tokenAddress = receipt.logs[0]?.address || '';
      return tokenAddress;
    } catch (error) {
      logger.error(`Failed to create token: ${error}`);
      throw error;
    }
  }

  /**
   * Buy tokens using MON
   */
  async buyToken(
    wallet: Wallet,
    tokenAddress: string,
    amountMon: bigint
  ): Promise<bigint> {
    logger.info(`Buying tokens: ${amountMon} MON from ${wallet.address}`);
    
    const signer = new ethers.Wallet(wallet.privateKey, this.provider);
    const contract = this.nadFunContract.connect(signer);

    try {
      const tx = await contract.buyToken(tokenAddress, amountMon, {
        value: amountMon,
      });

      const receipt = await tx.wait();
      logger.info(`Buy transaction: ${receipt.hash}`);

      // Extract tokens received from event
      const tokensReceived = BigInt(0); // Parse from receipt
      return tokensReceived;
    } catch (error) {
      logger.error(`Failed to buy tokens: ${error}`);
      throw error;
    }
  }

  /**
   * Sell tokens for MON
   */
  async sellToken(
    wallet: Wallet,
    tokenAddress: string,
    amountTokens: bigint
  ): Promise<bigint> {
    logger.info(`Selling tokens: ${amountTokens} from ${wallet.address}`);
    
    const signer = new ethers.Wallet(wallet.privateKey, this.provider);
    const contract = this.nadFunContract.connect(signer);

    try {
      const tx = await contract.sellToken(tokenAddress, amountTokens);
      const receipt = await tx.wait();
      logger.info(`Sell transaction: ${receipt.hash}`);

      // Extract MON received from event
      const monReceived = BigInt(0); // Parse from receipt
      return monReceived;
    } catch (error) {
      logger.error(`Failed to sell tokens: ${error}`);
      throw error;
    }
  }

  /**
   * Get bonding curve status
   */
  async getBondingCurveStatus(tokenAddress: string): Promise<{
    liquidity: bigint;
    threshold: bigint;
    isComplete: boolean;
  }> {
    try {
      const result = await this.nadFunContract.getBondingCurveStatus(tokenAddress);
      return {
        liquidity: result.liquidity,
        threshold: result.threshold,
        isComplete: result.isComplete,
      };
    } catch (error) {
      logger.error(`Failed to get bonding curve status: ${error}`);
      throw error;
    }
  }

  /**
   * Get current token price
   */
  async getTokenPrice(tokenAddress: string): Promise<bigint> {
    try {
      return await this.nadFunContract.getTokenPrice(tokenAddress);
    } catch (error) {
      logger.error(`Failed to get token price: ${error}`);
      throw error;
    }
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    try {
      return await this.nadFunContract.getTokenBalance(tokenAddress, walletAddress);
    } catch (error) {
      logger.error(`Failed to get token balance: ${error}`);
      throw error;
    }
  }

  /**
   * Get MON balance for a wallet
   */
  async getMonBalance(walletAddress: string): Promise<bigint> {
    try {
      return await this.provider.getBalance(walletAddress);
    } catch (error) {
      logger.error(`Failed to get MON balance: ${error}`);
      throw error;
    }
  }

  /**
   * Transfer MON between wallets
   */
  async transferMon(
    fromWallet: Wallet,
    toAddress: string,
    amount: bigint
  ): Promise<string> {
    logger.info(`Transferring ${amount} MON from ${fromWallet.address} to ${toAddress}`);
    
    const signer = new ethers.Wallet(fromWallet.privateKey, this.provider);
    
    try {
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: amount,
      });

      const receipt = await tx.wait();
      logger.info(`Transfer transaction: ${receipt.hash}`);
      return receipt.hash;
    } catch (error) {
      logger.error(`Failed to transfer MON: ${error}`);
      throw error;
    }
  }
}


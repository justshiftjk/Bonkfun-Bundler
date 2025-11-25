import { ethers } from 'ethers';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Wallet, TransactionBundle } from '../types.js';
import { NadFunContract } from '../contracts/nadfun.js';

export class TransactionBundler {
  private provider: ethers.JsonRpcProvider;
  private nadFun: NadFunContract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.monad.rpcUrl);
    this.nadFun = new NadFunContract();
  }

  /**
   * Bundle token creation and first buy transactions
   * This ensures atomic execution
   */
  async bundleTokenCreationAndBuy(
    fundingWallet: Wallet,
    tokenConfig: { name: string; symbol: string; description?: string; imageUrl?: string },
    buyAmountMon: bigint
  ): Promise<TransactionBundle> {
    logger.info('Bundling token creation and first buy...');

    const signer = new ethers.Wallet(fundingWallet.privateKey, this.provider);
    
    try {
      // Step 1: Create token transaction
      const nadFunContract = new ethers.Contract(
        config.contracts.nadFun,
        ['function createToken(string, string, string, string) returns (address)'],
        signer
      );

      const createTx = await nadFunContract.createToken.populateTransaction(
        tokenConfig.name,
        tokenConfig.symbol,
        tokenConfig.description || '',
        tokenConfig.imageUrl || ''
      );

      // Step 2: First buy transaction (will need token address from first tx)
      // For true bundling, we may need to use a bundler service or batch transactions
      // This is a simplified version - adjust based on Monad's bundling mechanism
      
      const transactions: string[] = [];
      const signatures: string[] = [];

      // If using a bundler service (like Jito for Solana, or similar for Monad)
      if (config.monad.bundlerRpcUrl) {
        return await this.submitToBundler([createTx], signer);
      } else {
        // Fallback: execute sequentially but quickly
        logger.warn('No bundler configured, executing transactions sequentially');
        
        const createTxResponse = await signer.sendTransaction(createTx);
        await createTxResponse.wait();
        
        // Extract token address from receipt and create buy transaction
        const receipt = await this.provider.getTransactionReceipt(createTxResponse.hash);
        const tokenAddress = this.extractTokenAddress(receipt);
        
        if (tokenAddress) {
          const buyTx = await this.createBuyTransaction(
            signer,
            tokenAddress,
            buyAmountMon
          );
          const buyTxResponse = await signer.sendTransaction(buyTx);
          await buyTxResponse.wait();
          
          transactions.push(createTxResponse.hash, buyTxResponse.hash);
          signatures.push(createTxResponse.hash, buyTxResponse.hash);
        }
      }

      return { transactions, signatures };
    } catch (error) {
      logger.error(`Failed to bundle transactions: ${error}`);
      throw error;
    }
  }

  /**
   * Bundle multiple buy transactions from different wallets
   */
  async bundleMultipleBuys(
    wallets: Wallet[],
    tokenAddress: string,
    amounts: bigint[]
  ): Promise<TransactionBundle> {
    logger.info(`Bundling ${wallets.length} buy transactions...`);

    const transactions: string[] = [];
    const signatures: string[] = [];

    // Create transactions for each wallet
    const txPromises = wallets.map(async (wallet, index) => {
      const signer = new ethers.Wallet(wallet.privateKey, this.provider);
      const nadFunContract = new ethers.Contract(
        config.contracts.nadFun,
        ['function buyToken(address, uint256)'],
        signer
      );

      return await nadFunContract.buyToken.populateTransaction(
        tokenAddress,
        amounts[index],
        { value: amounts[index] }
      );
    });

    const txs = await Promise.all(txPromises);

    // Submit to bundler if available
    if (config.monad.bundlerRpcUrl) {
      // Use first wallet as signer for bundler submission
      const signer = new ethers.Wallet(wallets[0].privateKey, this.provider);
      return await this.submitToBundler(txs, signer);
    } else {
      // Execute sequentially with small delays to appear more natural
      for (let i = 0; i < wallets.length; i++) {
        const signer = new ethers.Wallet(wallets[i].privateKey, this.provider);
        const txResponse = await signer.sendTransaction(txs[i]);
        await txResponse.wait();
        
        transactions.push(txResponse.hash);
        signatures.push(txResponse.hash);
        
        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { transactions, signatures };
  }

  private async createBuyTransaction(
    signer: ethers.Wallet,
    tokenAddress: string,
    amountMon: bigint
  ): Promise<ethers.TransactionRequest> {
    const nadFunContract = new ethers.Contract(
      config.contracts.nadFun,
      ['function buyToken(address, uint256)'],
      signer
    );

    return await nadFunContract.buyToken.populateTransaction(
      tokenAddress,
      amountMon,
      { value: amountMon }
    );
  }

  private extractTokenAddress(receipt: ethers.TransactionReceipt | null): string | null {
    if (!receipt) return null;
    
    // Extract token address from logs/events
    // Adjust based on actual event structure
    for (const log of receipt.logs) {
      // Parse log to find token address
      // This is a placeholder - implement based on actual contract events
    }
    
    return null;
  }

  private async submitToBundler(
    transactions: ethers.TransactionRequest[],
    signer: ethers.Wallet
  ): Promise<TransactionBundle> {
    // Implement bundler submission logic
    // This depends on the specific bundler service used for Monad
    logger.info(`Submitting ${transactions.length} transactions to bundler...`);
    
    // Placeholder implementation
    // In production, integrate with actual Monad bundler service
    const transactions_serialized: string[] = [];
    const signatures: string[] = [];

    for (const tx of transactions) {
      const signedTx = await signer.signTransaction(tx);
      transactions_serialized.push(signedTx);
      // Execute and get signature
      const response = await signer.sendTransaction(tx);
      await response.wait();
      signatures.push(response.hash);
    }

    return {
      transactions: transactions_serialized,
      signatures,
    };
  }
}


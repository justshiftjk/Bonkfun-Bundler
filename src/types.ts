export interface Wallet {
  address: string;
  privateKey: string;
  publicKey: string;
  index: number;
  type: 'funding' | 'volume' | 'recovery';
}

export interface TokenConfig {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
}

export interface BondingCurveConfig {
  targetMon: number;
  walletCount: number;
  minWallets: number;
  maxWallets: number;
}

export interface VolumeConfig {
  walletCount: number;
  minTradeIntervalMs: number;
  maxTradeIntervalMs: number;
  tradeAmountMinMon: number;
  tradeAmountMaxMon: number;
}

export interface BotState {
  phase: 'idle' | 'funding' | 'bonding' | 'volume' | 'recovery' | 'completed';
  tokenAddress?: string;
  fundingWallets: Wallet[];
  volumeWallets: Wallet[];
  totalMonDeposited: number;
  bondingCurveComplete: boolean;
  volumeGenerated: number;
  startTime?: Date;
}

export interface TransactionBundle {
  transactions: string[];
  signatures: string[];
}

export interface TradeOrder {
  wallet: Wallet;
  type: 'buy' | 'sell';
  amountMon: number;
  tokenAddress: string;
  timestamp: Date;
}


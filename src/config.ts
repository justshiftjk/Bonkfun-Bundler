import dotenv from 'dotenv';

dotenv.config();

export const config = {
  monad: {
    rpcUrl: process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
    bundlerRpcUrl: process.env.BUNDLER_RPC_URL || '',
  },
  bondingCurve: {
    targetMon: parseFloat(process.env.BONDING_CURVE_TARGET_MON || '1296000'),
    walletCount: parseInt(process.env.FUNDING_WALLET_COUNT || '100'),
    minWallets: parseInt(process.env.MIN_FUNDING_WALLETS || '100'),
    maxWallets: parseInt(process.env.MAX_FUNDING_WALLETS || '150'),
  },
  volume: {
    walletCount: parseInt(process.env.VOLUME_WALLET_COUNT || '50'),
    minTradeIntervalMs: parseInt(process.env.MIN_TRADE_INTERVAL_MS || '5000'),
    maxTradeIntervalMs: parseInt(process.env.MAX_TRADE_INTERVAL_MS || '30000'),
    tradeAmountMinMon: parseFloat(process.env.TRADE_AMOUNT_MIN_MON || '10'),
    tradeAmountMaxMon: parseFloat(process.env.TRADE_AMOUNT_MAX_MON || '100'),
  },
  contracts: {
    nadFun: process.env.NAD_FUN_CONTRACT_ADDRESS || '',
    bondingCurve: process.env.BONDING_CURVE_CONTRACT_ADDRESS || '',
  },
  recovery: {
    walletAddress: process.env.RECOVERY_WALLET_ADDRESS || '',
  },
  wallet: {
    seed: process.env.FUNDING_WALLET_SEED || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};


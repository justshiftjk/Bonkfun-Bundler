# Monad Nad.fun Bundler & Volume Bot

Automated bundler and volume bot for token launches on nad.fun (Monad blockchain token launchpad).



https://github.com/user-attachments/assets/2ea3df20-113b-4677-9efc-763a0787b15d



## Features

- **Automated Token Creation**: Bundle token creation and first buy transactions
- **Bonding Curve Funding**: Distribute 1,296,000 MON across 100-150 isolated wallets
- **Volume Generation**: Automated buy/sell trading from separate volume wallets
- **Wallet Isolation**: Ensures wallets appear unrelated and independent
- **Recovery Mechanism**: Automatic token-to-MON swap and consolidation if needed
- **Web GUI**: Monitor and control the bot through a web interface

## Requirements

- Node.js 18+ 
- npm or yarn
- Monad RPC endpoint
- Private keys or seed phrase for wallet generation

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Monad RPC Endpoint
MONAD_RPC_URL=https://rpc.monad.xyz

# Bundler RPC (if using Jito-like service)
BUNDLER_RPC_URL=

# Recovery Wallet (where to send recovered MON)
RECOVERY_WALLET_ADDRESS=

# Bonding Curve Parameters
BONDING_CURVE_TARGET_MON=1296000
FUNDING_WALLET_COUNT=100
MIN_FUNDING_WALLETS=100
MAX_FUNDING_WALLETS=150

# Volume Bot Parameters
VOLUME_WALLET_COUNT=50
MIN_TRADE_INTERVAL_MS=5000
MAX_TRADE_INTERVAL_MS=30000
TRADE_AMOUNT_MIN_MON=10
TRADE_AMOUNT_MAX_MON=100

# Nad.fun Contract Addresses
NAD_FUN_CONTRACT_ADDRESS=
BONDING_CURVE_CONTRACT_ADDRESS=

# Wallet Seed (optional - will generate if not provided)
FUNDING_WALLET_SEED=
```

## Usage

### Command Line

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### Web GUI

```bash
npm run gui
```

Then open `http://localhost:3000` in your browser.

## How It Works

### Phase 1: Funding Wallet Generation
- Generates 100-150 isolated wallets using HD wallet derivation
- Each wallet uses different derivation paths to appear unrelated
- Wallets are stored securely

### Phase 2: Bonding Curve Funding
- Bundles token creation and first buy transaction
- Distributes remaining MON across all funding wallets
- Executes bundled buy transactions

### Phase 3: Bonding Curve Completion
- Monitors bonding curve status
- Waits for 80% liquidity threshold

### Phase 4: Volume Generation
- Creates separate volume wallets (isolated from funding wallets)
- Funds volume wallets with MON
- Starts automated buy/sell trading
- Only uses volume wallets (funding wallets remain untouched)

### Recovery
- Can be triggered manually or automatically
- Sells all tokens from both funding and volume wallets
- Consolidates MON to recovery address
- Aims to recover the original 1,296,000 MON

## Security Notes

- Private keys are stored in `wallets/` directory
- Seed phrase is saved in `wallets/seed.txt`
- **Keep these files secure and never commit them to git**
- Use `.env` for sensitive configuration

## Project Structure

```
src/
├── bot/
│   ├── orchestrator.ts    # Main bot orchestration
│   ├── volumeBot.ts       # Volume trading bot
│   └── recovery.ts        # Recovery mechanism
├── bundler/
│   └── transactionBundler.ts  # Transaction bundling
├── contracts/
│   └── nadfun.ts         # Nad.fun contract interactions
├── utils/
│   ├── wallet.ts         # Wallet management
│   └── logger.ts         # Logging
├── gui/
│   ├── server.ts         # Express server
│   └── public/
│       └── index.html    # Web interface
├── config.ts             # Configuration
├── types.ts              # TypeScript types
└── main.ts               # Entry point
```

## Important Notes

1. **Contract ABIs**: Update the contract ABIs in `src/contracts/nadfun.ts` with actual nad.fun contract interfaces
2. **Bundler Integration**: Implement actual bundler service integration if using a Monad bundler
3. **Token Address Extraction**: Update token address extraction logic after creation transaction
4. **Testing**: Test thoroughly on testnet before mainnet use
5. **Compliance**: Ensure compliance with local regulations
---

## Contact  
For inquiries, custom integrations, or tailored solutions, reach out via:  

💬 **Telegram**: [@bettyjk_0915](https://t.me/bettyjk_0915)


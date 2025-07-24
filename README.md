# 🚀 BonkFun Bundler – Solana Atomic Launch Bot

A **fast and reliable Solana bundle trading bot** designed for `bonk.fun`-style token launches. This bot atomically creates tokens and executes multi-wallet buys within a single block using **Jito bundles**, providing optimal performance and front-running protection.

Built with **Raydium SDK v2**, it's optimized for high-speed token launches and seamless execution via the Jito-Solana ecosystem.

---

## ✨ Features

- ✅ **Multi-Wallet Bundling** – Supports dynamic bundling across 12+ wallets
- ✅ **Atomic Token Launch** – Creates a new token and buys in the same block
- ✅ **Jito Relayer Integration** – Ensures reliable and priority block inclusion
- ✅ **Raydium SDK v2** – Executes swaps with best routing and low latency
- ✅ **Priority CU Optimization** – Fine-tuned for compute unit pricing and speed

---

## ⚙️ How It Works

1. **Token Creation**  
   Creates a new SPL token, like a memecoin (e.g., $BONK-style).

2. **Swap Transaction Preparation**  
   Prepares swap instructions from multiple funded wallets.

3. **Jito Bundling**  
   All transactions are wrapped into a single atomic bundle using the Jito-Solana API.

4. **Block Submission**  
   The bundle is submitted to the Jito relayer for execution in the same block – fast and unfragmented.

---

## 🧪 Planned Features

- 🔄 Auto-retry logic for bundle failures
- 📊 Real-time dashboard for monitoring bundle status
- 🎯 Strategy modules to customize launch behavior
- 📩 Telegram/Discord alerts for live bundle status

---

## 🛠 Tech Stack

- **Solana Web3.js**
- **Raydium SDK v2**
- **Jito-Solana (Bundle Service)**
- **Custom bundler & transaction coordinator**

---

## 🚀 Getting Started

Running the project is a straightforward process. You can simply clone the repo, install dependencies, and then run it.

### 1. Clone the Repository

```bash
git clone https://github.com/justshiftjk/Bonkfun-Bundler/
cd Bonkfun-Bundler
```
### 2. `.env` Configuration

Create a `.env` file in the root directory and fill in the required fields:

```env
PRIVATE_KEY=""
RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=
RPC_WEBSOCKET_ENDPOINT=wss://mainnet.helius-rpc.com/?api-key=

SWAP_AMOUNT=0.001             
DISTRIBUTION_WALLETNUM=2       

JITO_FEE=0.001

TOKEN_NAME="SuperJK"
TOKEN_SYMBOL="SJK"
DESCRIPTION='JK is a super dev on Crypto'
TOKEN_SHOW_NAME="JK"
TOKEN_CREATE_ON="https://pump.fun"
TWITTER="https://x.com/"
TELEGRAM="https://t.me"
WEBSITE="https://website.com"
FILE="./image/2.jpg"
BUYER_WALLET= ""
BUYER_AMOUNT= 0.01
VANITY_MODE= false
``` 
Here, `BUYER_WALLET` is for single walllet bundling with `BUYER_AMOUNT` and the start command is

```bash
yarn single
```

### 3. Install Dependencies

```bash
yarn install
```

### 4. Run with the command

Build and Run in Production Mode:
```bash
yarn start
```

---

## 📩 Contact  
For inquiries, custom integrations, or tailored solutions, reach out via:  

📧 **E-Mail**: [adamglab0731.pl@gmail.com](mailto:adamglab0731.pl@gmail.com)  
💬 **Telegram**: [@bettyjk_0915](https://t.me/bettyjk_0915)

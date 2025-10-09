import base58 from "bs58"
import { readJson, retrieveEnvVariable, sleep } from "./utils"
import { ComputeBudgetProgram, Connection, Keypair, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { splAccountLayout, TokenAccount } from "@raydium-io/raydium-sdk-v2";
import { execute } from "./executor/legacy";
import { RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants";
import { makeBonkSellIx } from "./src/main";

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "processed"
})

const rpcUrl = retrieveEnvVariable("RPC_ENDPOINT");
const mainKpStr = retrieveEnvVariable('PRIVATE_KEY');
const connection = new Connection(rpcUrl, { commitment: "processed" });
const mainKp = Keypair.fromSecretKey(base58.decode(mainKpStr))

const main = async () => {
  const walletsData = readJson()
  let wallets = walletsData.map((kp) => Keypair.fromSecretKey(base58.decode(kp)))
  // wallets.push(Keypair.fromSecretKey(base58.decode(BUYER_WALLET)))

  wallets.map(async (kp, i) => {
    try {
      await sleep(i * 50)
      const accountInfo = await connection.getAccountInfo(kp.publicKey)

      const tokenAccounts = await connection.getTokenAccountsByOwner(kp.publicKey, {
        programId: TOKEN_PROGRAM_ID,
      },
        "confirmed"
      )
      const ixs: TransactionInstruction[] = []
      const accounts: TokenAccount[] = [];

      if (tokenAccounts.value.length > 0)
        for (const { pubkey, account } of tokenAccounts.value) {
          accounts.push({
            publicKey: pubkey,
            programId: account.owner,
            amount: splAccountLayout.decode(account.data).amount,
            mint: splAccountLayout.decode(account.data).mint,
            isNative: false,
          });
        }
      else
        console.log("No token accounts found")

      for (let j = 0; j < accounts.length; j++) {
        const baseAta = await getAssociatedTokenAddress(accounts[j].mint, mainKp.publicKey)
        const tokenAccount = accounts[j].publicKey!
        const tokenBalance = (await connection.getTokenAccountBalance(accounts[j].publicKey!)).value

        let i = 0
        while (true) {
          if (i > 10) {
            console.log("Sell error before gather")
            break
          }
          if (tokenBalance.uiAmount == 0) {
            console.log("Token balance is 0")
            break
          }
          try {
            console.log("Selling token:", accounts[j].mint.toBase58())
            const sellIx = await makeBonkSellIx(connection, kp, accounts[j].mint, mainKp.publicKey, true, 0)
            if (sellIx == null) {
              throw new Error("Error getting sell tx")
            }
            const blockhash = await connection.getLatestBlockhash()
            const messageV0 = new TransactionMessage({
              payerKey: mainKp.publicKey,
              recentBlockhash: blockhash.blockhash,
              instructions: sellIx
            }).compileToV0Message();
            const tx = new VersionedTransaction(messageV0);
            tx.sign([kp, mainKp])
            const simResult = await connection.simulateTransaction(tx, { sigVerify: true })
            console.log("Simulation result:", simResult.value)
            if (simResult.value.err) {
              throw new Error("Simulation failed")
              break
            }
            const txSellSig = await execute(tx, blockhash, false)
            const tokenSellTx = txSellSig ? `https://solscan.io/tx/${txSellSig}` : ''
            console.log("Sold token, ", tokenSellTx)
            break
          } catch (error) {
            i++
          }
        }
        await sleep(1000)

        const tokenBalanceAfterSell = (await connection.getTokenAccountBalance(accounts[j].publicKey!)).value
        console.log("Wallet address & balance : ", kp.publicKey.toBase58(), tokenBalanceAfterSell.amount)
        ixs.push(createAssociatedTokenAccountIdempotentInstruction(mainKp.publicKey, baseAta, mainKp.publicKey, accounts[j].mint))
        if (tokenBalanceAfterSell.uiAmount && tokenBalanceAfterSell.uiAmount > 0)
          ixs.push(createTransferCheckedInstruction(tokenAccount, accounts[j].mint, baseAta, kp.publicKey, BigInt(tokenBalanceAfterSell.amount), tokenBalance.decimals))
        ixs.push(createCloseAccountInstruction(tokenAccount, mainKp.publicKey, kp.publicKey))
      }

      if (accountInfo) {
        const solBal = await connection.getBalance(kp.publicKey)
        ixs.push(
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: mainKp.publicKey,
            lamports: solBal
          })
        )
      }

      if (ixs.length) {
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 220_000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
          ...ixs,
        )
        tx.feePayer = mainKp.publicKey
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        // console.log(await connection.simulateTransaction(tx))
        const sig = await sendAndConfirmTransaction(connection, tx, [mainKp, kp], { commitment: "confirmed" })
        console.log(`Closed and gathered SOL from wallets ${i} : https://solscan.io/tx/${sig}`)
        return
      }

      // filter the keypair that is completed (after this procedure, only keypairs with sol or ata will be saved in data.json)
      // const bal = await connection.getBalance(kp.publicKey)
      // if (bal == 0) {
      //   const tokenAccounts = await connection.getTokenAccountsByOwner(kp.publicKey, {
      //     programId: TOKEN_PROGRAM_ID,
      //   },
      //     "confirmed"
      //   )
      //   if (tokenAccounts.value.length == 0) {
      //     const walletsData = readJson()
      //     const wallets = walletsData.filter((privateKey) => base58.encode(kp.secretKey) != privateKey)
      //     saveDataToFile(wallets)
      //     console.log("Wallet closed completely")
      //   }
      // }

    } catch (error) {
      console.log("transaction error while gathering", error)
      return
    }
  })
}

main()

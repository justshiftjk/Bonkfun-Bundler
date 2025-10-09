import { VersionedTransaction, Keypair, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage } from "@solana/web3.js"
import base58 from "bs58"
import { DISTRIBUTION_WALLETNUM, LIL_JIT_MODE, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, VANITY_MODE } from "./constants"
import { generateVanityAddress, saveDataToFile, sleep } from "./utils"
import { distributeSol, addBonkAddressesToTable, createLUT, makeBonkBuyIx, createBonkTokenTx } from "./src/main";
import { executeJitoTx } from "./executor/jito";
import { sendBundle } from "./executor/liljito";



const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
console.log(mainKp.publicKey.toBase58())

let kps: Keypair[] = []
const transactions: VersionedTransaction[] = []

let mintKp = Keypair.generate()
console.log("mintKp", mintKp.publicKey.toString());

if (VANITY_MODE) {
  const { keypair, pubkey } = generateVanityAddress("bonk")
  mintKp = keypair
  console.log(`Keypair generated with "bonk" ending: ${pubkey}`);
}

const mintAddress = mintKp.publicKey
console.log("mintAddress", mintAddress.toString());


const main = async () => {

  const mainBal = await connection.getBalance(mainKp.publicKey)
  console.log((mainBal / 10 ** 9).toFixed(3), "SOL in main keypair")

  console.log("Mint address of token ", mintAddress.toBase58())
  saveDataToFile([base58.encode(mintKp.secretKey)], "mint.json")

  const minimumSolAmount = (SWAP_AMOUNT + 0.01) * DISTRIBUTION_WALLETNUM + 0.05

  if (mainBal / 10 ** 9 < minimumSolAmount) {
    console.log("Main wallet balance is not enough to run the bundler")
    console.log(`Plz charge the wallet more than ${minimumSolAmount}SOL`)
    return
  }

  console.log("Distributing SOL to wallets...")
  let result = await distributeSol(connection, mainKp, DISTRIBUTION_WALLETNUM)
  if (!result) {
    console.log("Distribution failed")
    return
  } else {
    kps = result
  }


  console.log("Creating LUT started")
  const lutAddress = await createLUT(connection, mainKp)
  if (!lutAddress) {
    console.log("Lut creation failed")
    return
  }
  console.log("LUT Address:", lutAddress.toBase58())
  saveDataToFile([lutAddress.toBase58()], "lut.json")
  await addBonkAddressesToTable(connection, lutAddress, mintAddress, kps, mainKp)


  const buyIxs: TransactionInstruction[] = []

  for (let i = 0; i < DISTRIBUTION_WALLETNUM; i++) {
    const ix = await makeBonkBuyIx(connection, kps[i], Math.floor(SWAP_AMOUNT * 10 ** 9), mainKp.publicKey, mintKp.publicKey) // mintKp.publicKey
    if (!ix) {
      console.log("Error while buying token")
      return
    }
    buyIxs.push(...ix)
  }

  console.log("Buy instructions: ", buyIxs)


  const lookupTable = (await connection.getAddressLookupTable(lutAddress)).value;
  if (!lookupTable) {
    console.log("Lookup table not ready")
    return
  }
  console.log("Lookup table is ready, address:", lookupTable.key.toBase58())

  const tokenCreationTx = await createBonkTokenTx(connection, mainKp, mintKp)
  if (!tokenCreationTx || tokenCreationTx.serialize().length == 0) {
    console.log("Token creation transaction failed")
    return
  }
  console.log("Token creation transaction created, size:", tokenCreationTx.serialize().length, "bytes")

  const simResult = await connection.simulateTransaction(tokenCreationTx, { sigVerify: false });
  console.log("Simulation result:", simResult.value);
  if (simResult.value.err) {
    console.log("Simulation failed. Adjust compute units or batch size.");
    return;
  }

  // const sig = await connection.sendTransaction(tokenCreationTx, { skipPreflight: true })
  // console.log("Transaction sent:", sig)
  // const confirmation = await connection.confirmTransaction(sig, "confirmed")
  // console.log("Transaction confirmed:", confirmation)
  // if (confirmation.value.err) {
  //   console.log("Transaction failed")
  //   return
  // }

  transactions.push(tokenCreationTx)
  console.log("Executing token creation transaction...")

  for (let i = 0; i < Math.ceil(DISTRIBUTION_WALLETNUM / 3); i++) {
    const latestBlockhash = await connection.getLatestBlockhash()
    if (!latestBlockhash) {
      console.log("Failed to get latest blockhash")
      return
    }
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
    ]

    for (let j = 0; j < 3; j++) {
      const index = i * 3 + j
      if (kps[index]) {
        instructions.push(buyIxs[index * 5], buyIxs[index * 5 + 1], buyIxs[index * 5 + 2], buyIxs[index * 5 + 3], buyIxs[index * 5 + 4])
      }
    }

    console.log("Instructions length:", instructions.length)

    const msg = new TransactionMessage({
      payerKey: kps[i * 3].publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions
    }).compileToV0Message([lookupTable])

    console.log("Transaction message created, size:", msg.serialize().length, "bytes")

    const tx = new VersionedTransaction(msg)

    console.log("Transaction created, size:", tx.serialize().length, "bytes")
    for (let j = 0; j < 3; j++) {
      const index = i * 3 + j;
      const kp = kps[index];
      console.log("index", index, " | Keypair public key:", kp?.publicKey?.toBase58());
      if (kp) {
        console.log("Signing transaction with keypair:", kp.publicKey.toBase58());
        tx.sign([kp]);
      } else {
        console.log("No keypair found at index", index);
      }
    }

    console.log("Transaction created, size:", tx.serialize().length, "bytes")

    // const simResult = await connection.simulateTransaction(tx, { sigVerify: false });
    // console.log("Simulation result:", simResult.value);
    // if (simResult.value.err) {
    //   console.log("Simulation failed. Adjust compute units or batch size.");
    //   return;
    // }

    // const sig = await connection.sendTransaction(tx, { skipPreflight: true })
    // console.log("Transaction sent:", sig)
    // const confirmation = await connection.confirmTransaction(sig, "confirmed")
    // console.log("Transaction confirmed:", confirmation)
    // if (confirmation.value.err) {
    //   console.log("Transaction failed")
    //   return
    // }

    transactions.push(tx)

  }
  // console.log("Buy transactions created, total size:", transactions.reduce((acc, tx) => acc + tx.serialize().length, 0), "bytes")

  // transactions.map(async (tx, i) => console.log(i, " | ", tx.serialize().length, "bytes | \n", (await connection.simulateTransaction(tx, { sigVerify: true }))))
  // console.log("Executing transactions...")

  console.log("Sending bundle...")
  if (LIL_JIT_MODE) {
    const bundleId = await sendBundle(transactions)
    if (!bundleId) {
      console.log("Failed to send bundle")
      return
    }
  } else {
    await executeJitoTx(transactions, mainKp, commitment)
  }
  await sleep(10000)
}

main()

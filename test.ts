import { VersionedTransaction, Keypair, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, PublicKey, Transaction } from "@solana/web3.js"
import base58 from "bs58"
import { DISTRIBUTION_WALLETNUM, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, VANITY_MODE } from "./constants"
import { generateVanityAddress, saveDataToFile, sleep } from "./utils"
import { createTokenTx, distributeSol, addBonkAddressesToTable, createLUT, makeBuyIx, createBonkTokenMetadata } from "./src/main";
import { executeJitoTx } from "./executor/jito";
import { makeBuyTx } from "./buysell";



const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const mintAddress = new PublicKey("Y9YW5uaPfFtQuwbe6z9namDn8S1JoTHAD29j7opbonk"); // Replace with your mint address

const main = async () => {
    const ix = await makeBuyIx(mainKp, Math.floor(SWAP_AMOUNT * 10 ** 9), 0, mainKp.publicKey, mintAddress)
    const tx = new Transaction().add(
        ...ix
    )
    tx.recentBlockhash = (await connection.getLatestBlockhash(commitment)).blockhash
    tx.feePayer = mainKp.publicKey
    console.log("simulation started", await connection.simulateTransaction(tx));
}


// makeBuyTx(connection, mintAddress, mainKp, SWAP_AMOUNT)

main()


import { VersionedTransaction, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, AddressLookupTableProgram, PublicKey, SYSVAR_RENT_PUBKEY } from "@solana/web3.js"
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddress, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import { openAsBlob } from "fs";
import base58 from "bs58"
import { BN } from "bn.js";


import { DESCRIPTION, FILE, JITO_FEE, PUMP_PROGRAM, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, TELEGRAM, TOKEN_CREATE_ON, TOKEN_NAME, TOKEN_SHOW_NAME, TOKEN_SYMBOL, TWITTER, WEBSITE } from "../constants"
import { saveDataToFile, sleep } from "../utils"
import { createAndSendV0Tx, execute } from "../executor/legacy"
import { PumpFunSDK } from "./pumpfun";

import { SYSTEM_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { getATAAddress, buyExactInInstruction, getPdaLaunchpadAuth, getPdaLaunchpadConfigId, getPdaLaunchpadPoolId, getPdaLaunchpadVaultId, TxVersion, LAUNCHPAD_PROGRAM, LaunchpadConfig } from "@raydium-io/raydium-sdk-v2";
import { initSdk } from "./config";
import { BONK_PLATFROM_ID } from "../constants";
const commitment = "confirmed"

const createImageMetadata = async (create) => {
  let formData = new FormData();
  formData.append("image", create.file);

  try {
    const response = await fetch("https://storage.letsbonk.fun/upload/img", {
      method: "POST",
      body: formData,
    });

    const resultText = await response.text(); // the response is plain text (IPFS URL)
    console.log("Uploaded image link:", resultText);
    return resultText;
  } catch (error) {
    console.error("Upload failed:", error);
  }
}


const createBonkTokenMetadata = async (create) => {
  const metadata = {
    name: create.name,
    symbol: create.symbol,
    description: create.description,
    createdOn: create.createdOn,
    platformId: create.platformId,
    image: create.image, // replace with your actual IPFS image link
  };


  try {
    const response = await fetch("https://storage.letsbonk.fun/upload/meta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });
    const resultText = await response.text(); // The response is a plain text IPFS URL
    console.log("Metadata IPFS link:", resultText);
    return resultText;
  } catch (error) {
    console.error("Metadata upload failed:", error);
  }
}

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
let sdk = new PumpFunSDK(new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment }));
let kps: Keypair[] = []

export const createBonkFunTokenMetadata = async () => {

  const imageInfo = {
    file: await openAsBlob(FILE),
  };
  let imageMetadata = await createImageMetadata(imageInfo);

  console.log("imageMetadata: ", imageMetadata);

  const tokenInfo = {
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    description: DESCRIPTION,
    createdOn: "https://bonk.fun",
    platformId: "platformId",
    image: imageMetadata
  }

  let tokenMetadata = await createBonkTokenMetadata(tokenInfo);

  console.log("tokenMetadata", tokenMetadata);

  return tokenMetadata;

}

// create token instructions
export const createBonkTokenTx = async (connection: Connection, mainKp: Keypair, mintKp: Keypair) => {
  try {

    const uri = await createBonkFunTokenMetadata();

    if (!uri) {
      throw new Error("Token metadata URI is undefined");
    }

    // Initialize SDK
    const raydium = await initSdk(mainKp.publicKey);

    // Get config info
    const configId = getPdaLaunchpadConfigId(LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
    const configData = await connection.getAccountInfo(configId);

    if (!configData) {
      throw new Error('Config not found');
    }

    const configInfo = LaunchpadConfig.decode(configData.data);
    const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);

    // Set up transaction parameters
    const solBuyAmount = 0.01;
    const buyAmount = new BN(solBuyAmount * 10 ** 9);
    const slippageAmount = 0.1;
    const slippage = new BN(slippageAmount * 100);

    // Create launchpad transaction
    const { transactions } = await raydium.launchpad.createLaunchpad({
      programId: LAUNCHPAD_PROGRAM,
      mintA: mintKp.publicKey,
      decimals: 6,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      migrateType: 'amm',
      uri,
      configId,
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      slippage,
      platformId: BONK_PLATFROM_ID,
      txVersion: TxVersion.LEGACY,
      buyAmount,
      feePayer: mainKp.publicKey,
      createOnly: true,
      extraSigners: [mintKp],
      computeBudgetConfig: {
        units: 1_200_000,
        microLamports: 100_000,
      }
    });

    let createIx = transactions[0].instructions;

    const tipAccounts = [
      'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
      'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
      '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
      '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
      'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
      'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
      'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
      'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    ];
    const jitoFeeWallet = new PublicKey(tipAccounts[Math.floor(tipAccounts.length * Math.random())])
    console.log(`Selected Jito fee wallet: ${jitoFeeWallet.toBase58()}`);
    console.log(`Calculated fee: ${JITO_FEE * LAMPORTS_PER_SOL} SOL`);

    // Get latest blockhash
    const latestBlockhash = await connection.getLatestBlockhash();
    console.log(" Got latest blockhash:", latestBlockhash.blockhash);

    const { blockhash } = await connection.getLatestBlockhash();
    const ixs = transactions[0].instructions
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: mainKp.publicKey,
        toPubkey: jitoFeeWallet,
        lamports: Math.floor(JITO_FEE * 10 ** 9),
      }),
    )
    const messageV0 = new TransactionMessage({
      payerKey: mainKp.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([mainKp, mintKp]);

    console.log("create token transaction simulate ==>", await connection.simulateTransaction(transaction, { sigVerify: true }))

    return transaction;
  } catch (error) {
    console.error("createTokenTx error:", error);
    throw error;
  }
}

export const createTokenTx = async (mainKp: Keypair, mintKp: Keypair) => {
  const tokenInfo = {
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    description: DESCRIPTION,
    showName: TOKEN_SHOW_NAME,
    createOn: TOKEN_CREATE_ON,
    twitter: TWITTER,
    telegram: TELEGRAM,
    website: WEBSITE,
    file: await openAsBlob(FILE),
  };
  let tokenMetadata = await sdk.createTokenMetadata(tokenInfo);

  let createIx = await sdk.getCreateInstructions(
    mainKp.publicKey,
    tokenInfo.name,
    tokenInfo.symbol,
    tokenMetadata.metadataUri,
    mintKp
  );

  const tipAccounts = [
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  ];
  const jitoFeeWallet = new PublicKey(tipAccounts[Math.floor(tipAccounts.length * Math.random())])
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    SystemProgram.transfer({
      fromPubkey: mainKp.publicKey,
      toPubkey: jitoFeeWallet,
      lamports: Math.floor(JITO_FEE * 10 ** 9),
    }),
    createIx
  ]
}

export const distributeSol = async (connection: Connection, mainKp: Keypair, distritbutionNum: number) => {
  try {
    const sendSolTx: TransactionInstruction[] = []
    sendSolTx.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 })
    )
    const mainSolBal = await connection.getBalance(mainKp.publicKey)
    if (mainSolBal <= 4 * 10 ** 6) {
      console.log("Main wallet balance is not enough")
      return []
    }
    let solAmount = Math.floor((SWAP_AMOUNT + 0.01) * 10 ** 9)

    for (let i = 0; i < distritbutionNum; i++) {

      const wallet = Keypair.generate()
      kps.push(wallet)

      sendSolTx.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: wallet.publicKey,
          lamports: solAmount
        })
      )
    }

    try {
      saveDataToFile(kps.map(kp => base58.encode(kp.secretKey)))
    } catch (error) {

    }

    let index = 0
    while (true) {
      try {
        if (index > 5) {
          console.log("Error in distribution")
          return null
        }
        const siTx = new Transaction().add(...sendSolTx)
        const latestBlockhash = await connection.getLatestBlockhash()
        siTx.feePayer = mainKp.publicKey
        siTx.recentBlockhash = latestBlockhash.blockhash
        const messageV0 = new TransactionMessage({
          payerKey: mainKp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: sendSolTx,
        }).compileToV0Message()
        const transaction = new VersionedTransaction(messageV0)
        transaction.sign([mainKp])
        // console.log(await connection.simulateTransaction(transaction))
        let txSig = await execute(transaction, latestBlockhash, 1)

        if (txSig) {
          const distibuteTx = txSig ? `https://solscan.io/tx/${txSig}` : ''
          console.log("SOL distributed ", distibuteTx)
          break
        }
        index++
      } catch (error) {
        index++
      }
    }
    console.log("Success in distribution")
    return kps
  } catch (error) {
    console.log(`Failed to transfer SOL`, error)
    return null
  }
}

export const createLUT = async (mainKp: Keypair) => {
  let i = 0
  while (true) {
    if (i > 5) {
      console.log("LUT creation failed, Exiting...")
      return
    }
    const slot = await connection.getSlot("confirmed")
    try {
      const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
          authority: mainKp.publicKey,
          payer: mainKp.publicKey,
          recentSlot: slot,
        });

      // Step 2 - Log Lookup Table Address
      console.log("Lookup Table Address:", lookupTableAddress.toBase58());

      // Step 3 - Generate a create transaction and send it to the network
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        lookupTableInst
      ], mainKp, connection);

      if (!result)
        throw new Error("Lut creation error")

      console.log("Lookup Table Address created successfully!")
      console.log("Please wait for about 15 seconds...")
      await sleep(15000)

      return lookupTableAddress
    } catch (err) {
      console.log("Retrying to create Lookuptable until it is created...")
      i++
    }
  }
}

export async function addBonkAddressesToTable(lutAddress: PublicKey, mint: PublicKey, walletKPs: Keypair[], mainKp: Keypair) {
  const walletPKs: PublicKey[] = walletKPs.map(wallet => wallet.publicKey);
  try {
    const configId = getPdaLaunchpadConfigId(LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
    const configData = await connection.getAccountInfo(configId);
    if (!configData) {
      throw new Error('Config not found');
    }
    const configInfo = LaunchpadConfig.decode(configData.data);
    const platformId = new PublicKey("4Bu96XjU84XjPDSpveTVf6LYGCkfW5FK7SNkREWcEfV4")
    const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mint, NATIVE_MINT).publicKey
    const vaultA = getPdaLaunchpadVaultId(LAUNCHPAD_PROGRAM, poolId, mint).publicKey;
    const vaultB = getPdaLaunchpadVaultId(LAUNCHPAD_PROGRAM, poolId, NATIVE_MINT).publicKey;
    const userTokenAccountB = getAssociatedTokenAddressSync(NATIVE_MINT, mainKp.publicKey)
    const shareATA = getATAAddress(mainKp.publicKey, NATIVE_MINT, TOKEN_PROGRAM_ID).publicKey;
    const authProgramId = getPdaLaunchpadAuth(LAUNCHPAD_PROGRAM).publicKey;


    // Collect all addresses
    const tokenAtasToAdd: PublicKey[] = walletPKs.map(pk =>
      getAssociatedTokenAddressSync(mint, pk)
    );

    const wsolAtasToAdd: PublicKey[] = walletPKs.map(pk =>
      getAssociatedTokenAddressSync(NATIVE_MINT, pk)
    );

    const userTokenAccountA: PublicKey[] = walletPKs.map(pk =>
      getAssociatedTokenAddressSync(mint, pk)
    );

    const anotherAddresses = [
      TOKEN_PROGRAM_ID,
      SYSTEM_PROGRAM_ID,
      SYSVAR_RENT_PUBKEY,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      mainKp.publicKey,
      mint,
      LAUNCHPAD_PROGRAM,
      configId,
      platformId,
      poolId,
      vaultA,
      vaultB,
      userTokenAccountB,
      shareATA,
      authProgramId
    ];

    let i = 0
    while (true) {
      if (i > 5) {
        console.log("Extending LUT failed, Exiting...")
        return
      }
      // Step 1 - Adding bundler wallets
      const addAddressesInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: walletPKs,
      });
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction
      ], mainKp, connection);
      if (result) {
        console.log("Successfully added wallet addresses.")
        i = 0
        break
      } else {
        console.log("Trying again with step 1")
      }
    }
    await sleep(10000)

    // Step 2 - Adding wallets' token ata
    while (true) {
      if (i > 5) {
        console.log("Extending LUT failed, Exiting...")
        return
      }

      console.log(`Adding atas for the token ${mint.toBase58()}`)
      const baseAtas: PublicKey[] = []

      for (const wallet of walletKPs) {
        const baseAta = getAssociatedTokenAddressSync(mint, wallet.publicKey)
        baseAtas.push(baseAta);
      }
      console.log("Base atas address num to extend: ", baseAtas.length)
      const addAddressesInstruction1 = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: baseAtas,
      });
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction1
      ], mainKp, connection);

      if (result) {
        console.log("Successfully added base ata addresses.")
        i = 0
        break
      } else {
        console.log("Trying again with step 2")
      }
    }
    await sleep(10000)

    // Step 3 - Adding wallets' wsol accounts
    while (true) {
      if (i > 5) {
        console.log("Extending LUT failed, Exiting...")
        return
      }

      console.log(`Adding atas for the token ${mint.toBase58()}`)
      const wsolAccs: PublicKey[] = []

      for (const wallet of walletKPs) {
        const wsolAcc = getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey)
        wsolAccs.push(wsolAcc);
      }
      console.log("Wsol Account address num to extend: ", wsolAccs.length)
      const addAddressesInstruction1 = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: wsolAccs,
      });
      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction1
      ], mainKp, connection);

      if (result) {
        console.log("Successfully added Wsol Account addresses.")
        i = 0
        break
      } else {
        console.log("Trying again with step 2")
      }
    }
    await sleep(10000)

    // Step 4 - Adding main wallet and static keys
    while (true) {
      if (i > 5) {
        console.log("Extending LUT failed, Exiting...")
        return
      }
      const creatorVault = sdk.getCreatorVaultPda(sdk.program.programId, mainKp.publicKey)

      const addAddressesInstruction3 = AddressLookupTableProgram.extendLookupTable({
        payer: mainKp.publicKey,
        authority: mainKp.publicKey,
        lookupTable: lutAddress,
        addresses: [mainKp.publicKey, mint, LAUNCHPAD_PROGRAM, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram.programId, configId, platformId, poolId, vaultA, vaultB, userTokenAccountB, shareATA, authProgramId],
      });

      const result = await createAndSendV0Tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
        addAddressesInstruction3
      ], mainKp, connection);

      if (result) {
        console.log("Successfully added main wallet address.")
        i = 0
        break
      } else {
        console.log("Trying again with step 3")
      }
    }
    await sleep(10000)
    console.log("Lookup Table Address extended successfully!")
    console.log(`Lookup Table Entries: `, `https://explorer.solana.com/address/${lutAddress.toString()}/entries`)
  }
  catch (err) {
    console.log("There is an error in adding addresses in LUT. Please retry it.")
    return;
  }
}

export const makeBuyIx = async (kp: Keypair, buyAmount: number, index: number, creator: PublicKey, mintAddress: PublicKey) => {
  const buyInstruction: TransactionInstruction[] = [];
  const lamports = buyAmount
  console.log("launchpad programId:", LAUNCHPAD_PROGRAM.toBase58())
  const programId = LAUNCHPAD_PROGRAM;
  const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;
  const poolId = getPdaLaunchpadPoolId(programId, mintAddress, NATIVE_MINT).publicKey;
  console.log("🚀 ~ makeBuyTx ~ poolId:", poolId)

  const userTokenAccountA = getAssociatedTokenAddressSync(mintAddress, kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ userTokenAccountA:", userTokenAccountA)
  const userTokenAccountB = getAssociatedTokenAddressSync(NATIVE_MINT, kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ userTokenAccountB:", userTokenAccountB)

  // Get minimum rent for token accounts
  const rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(165); // 165 bytes for token account
  console.log("🚀 ~ makeBuyTx ~ rentExemptionAmount:", rentExemptionAmount)

  // Check buyer's balance
  const buyerBalance = await connection.getBalance(kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ buyerBalance:", buyerBalance)
  const requiredBalance = rentExemptionAmount * 2 + lamports; // rent for 2 accounts + trade amount
  console.log("🚀 ~ makeBuyTx ~ requiredBalance:", requiredBalance)

  if (buyerBalance < requiredBalance) {
    throw new Error(`Insufficient funds. Need ${requiredBalance / 1e9} SOL, have ${buyerBalance / 1e9} SOL`);
  }

  const vaultA = getPdaLaunchpadVaultId(programId, poolId, mintAddress).publicKey;
  console.log("🚀 ~ makeBuyTx ~ vaultA:", vaultA)
  const vaultB = getPdaLaunchpadVaultId(programId, poolId, NATIVE_MINT).publicKey;
  console.log("🚀 ~ makeBuyTx ~ vaultB:", vaultB)

  const shareATA = getATAAddress(kp.publicKey, NATIVE_MINT).publicKey;
  console.log("🚀 ~ makeBuyTx ~ shareATA:", shareATA)
  const authProgramId = getPdaLaunchpadAuth(programId).publicKey;
  console.log("🚀 ~ makeBuyTx ~ authProgramId:", authProgramId)
  const minmintAmount = new BN(1);

  const tokenAta = await getAssociatedTokenAddress(mintAddress, kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ tokenAta:", tokenAta)
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, kp.publicKey);
  console.log("🚀 ~ makeBuyTx ~ wsolAta:", wsolAta)
  buyInstruction.push(
    createAssociatedTokenAccountIdempotentInstruction(
      kp.publicKey,
      tokenAta,
      kp.publicKey,
      mintAddress
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      kp.publicKey,
      wsolAta,
      kp.publicKey,
      NATIVE_MINT
    ),
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: wsolAta,
      lamports
    }),
    createSyncNativeInstruction(wsolAta)
  );

  const instruction = buyExactInInstruction(
    programId,
    kp.publicKey,
    authProgramId,
    configId,
    BONK_PLATFROM_ID,
    poolId,
    userTokenAccountA,
    userTokenAccountB,
    vaultA,
    vaultB,
    mintAddress,
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    new BN(lamports),
    minmintAmount,
    new BN(10000),
    shareATA,
  );

  console.log("🚀 ~ makeBuyTx ~ instruction:", instruction)

  buyInstruction.push(instruction);
  console.log("🚀 ~ makeBuyTx ~ buyInstruction:", buyInstruction)

  return buyInstruction
}


import {
  Commitment,
  Connection,
  Finality,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, Provider } from "@coral-xyz/anchor";
import { setGlobalDispatcher, Agent } from 'undici'
import { GlobalAccount } from "./globalAccount";
import {
  CompleteEvent,
  CreateBonkTokenMetadata,
  CreateEvent,
  CreateImageMetadata,
  CreateTokenMetadata,
  PriorityFee,
  PumpFunEventHandlers,
  PumpFunEventType,
  SetParamsEvent,
  TradeEvent,
  TransactionResult,
} from "./types";
import {
  toCompleteEvent,
  toCreateEvent,
  toSetParamsEvent,
  toTradeEvent,
} from "./events";
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BondingCurveAccount } from "./bondingCurveAccount";
import { BN } from "bn.js";
import {
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY,
  buildTx,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  getRandomInt,
  sendTx,
} from "./util";
import { PumpFun, IDL } from "./idl/index";
import { TransactionInstruction } from "@solana/web3.js";
import { global_mint } from "../constants";

const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MPL_TOKEN_METADATA_PROGRAM_ID =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

export const GLOBAL_ACCOUNT_SEED = "global";
export const MINT_AUTHORITY_SEED = "mint-authority";
export const BONDING_CURVE_SEED = "bonding-curve";
export const METADATA_SEED = "metadata";

export const DEFAULT_DECIMALS = 6;

export class PumpFunSDK {
  public program: Program<PumpFun>;
  public connection: Connection;
  constructor(provider?: Provider) {
    this.program = new Program<PumpFun>(IDL as PumpFun, provider);
    this.connection = this.program.provider.connection;
  }

  async sell(
    seller: Keypair,
    mint: PublicKey,
    sellTokenAmount: bigint,
    slippageBasisPoints: bigint = BigInt(500),
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<TransactionResult> {
    let sellTx = await this.getSellInstructionsByTokenAmount(
      seller.publicKey,
      mint,
      sellTokenAmount,
      slippageBasisPoints,
      commitment
    );

    let sellResults = await sendTx(
      this.connection,
      sellTx,
      seller.publicKey,
      [seller],
      priorityFees,
      commitment,
      finality
    );
    return sellResults;
  }

  //create token instructions
  async getCreateInstructions(
    creator: PublicKey,
    name: string,
    symbol: string,
    uri: string,
    mint: Keypair
  ) {
    const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);

    return this.program.methods
      .create(name, symbol, uri, creator)
      .accountsPartial({
        mint: mint.publicKey,
        user: creator,
      })
      .signers([mint])
      .instruction();
  }

  async getBuyInstructionsBySolAmount(
    buyer: PublicKey,
    mint: PublicKey,
    buyAmountSol: bigint,
    index: number,
    buyExisting: boolean = true,
    creator: PublicKey | null = null,
  ) {
    // const bondingCurveAccount = new BondingCurveAccount(
    //   6966180631402821399n,
    //   1073000000000000n,
    //   30000000000n,
    //   793100000000000n,
    //   0n,
    //   1000000000000000n,
    //   false,
    //   new PublicKey("11111111111111111111111111111111")
    // )
    const bondingCurveAccount = await this.getBondingCurveAccount(global_mint);

    let buyAmount: bigint
    if (index == 0)
      buyAmount = bondingCurveAccount!.getBuyPrice(buyAmountSol);
    else
      buyAmount = bondingCurveAccount!.getBuyPrice(BigInt(Number(buyAmountSol) * (index + 1))) - bondingCurveAccount!.getBuyPrice(BigInt(Number(buyAmountSol) * index))

    let buyAmountWithSlippage = await this.connection.getBalance(buyer)
    return await this.getBuyInstructions(
      buyer,
      mint,
      new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"),
      buyAmount * BigInt(8) / BigInt(10),
      BigInt(buyAmountWithSlippage - 10 ** 6),
      buyExisting,
      creator
    );
  }

  //buy
  async getBuyInstructions(
    buyer: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    amount: bigint,
    solAmount: bigint,
    buyExisting: boolean = true,
    creator: PublicKey | null = null,
    commitment: Commitment = DEFAULT_COMMITMENT,
  ) {
    let bondingCurve: BondingCurveAccount | null = null
    if (buyExisting)
      bondingCurve = await this.getBondingCurveAccount(mint)
    const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);
    if (buyExisting && !bondingCurve) {
      return []
    }
    return [
      createAssociatedTokenAccountInstruction(buyer, associatedUser, buyer, mint),
      await this.program.methods
        .buy(new BN(amount.toString()), new BN(solAmount.toString()))
        .accountsPartial({
          feeRecipient,
          mint: mint,
          associatedUser: associatedUser,
          user: buyer,
          creatorVault: buyExisting ?
            this.getCreatorVaultPda(this.program.programId, bondingCurve?.creator!) :
            this.getCreatorVaultPda(this.program.programId, creator!)
        })
        .instruction()
    ]
  }

  async getBuyIxsBySolAmount(
    buyer: PublicKey,
    mint: PublicKey,
    buyAmountSol: bigint,
    buyExisting: boolean = true,
    slippageBasisPoints: bigint = BigInt(500),
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    // let bondingCurveAccount = await this.getBondingCurveAccount(
    //   global_mint,
    //   commitment
    // );
    // if (!bondingCurveAccount) {
    //   throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
    // }

    const bondingCurveAccount = new BondingCurveAccount(
      6966180631402821399n,
      1073000000000000n,
      30000000000n,
      793100000000000n,
      0n,
      1000000000000000n,
      false,
      new PublicKey("11111111111111111111111111111111")
    )

    let buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
    let buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmountSol,
      slippageBasisPoints
    );
    let globalAccount = await this.getGlobalAccount(commitment);

    return await this.getBuyIxs(
      buyer,
      mint,
      globalAccount.feeRecipient,
      buyAmount * BigInt(9) / BigInt(10),
      buyAmountWithSlippage,
      buyExisting
    );
  }

  getCreatorVaultPda(programId: PublicKey, creator: PublicKey) {
    const [creatorVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator-vault"), creator.toBuffer()],
      programId,
    );
    return creatorVault;
  }

  //buy
  async getBuyIxs(
    buyer: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    amount: bigint,
    solAmount: bigint,
    buyExisting: boolean,
    commitment: Commitment = DEFAULT_COMMITMENT,
  ) {
    const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);
    let ixs: TransactionInstruction[] = [];
    try {
      await getAccount(this.connection, associatedUser, commitment);
    } catch (e) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          buyer,
          associatedUser,
          buyer,
          mint
        )
      );
    }

    const bondingCurve = await this.getBondingCurveAccount(mint)
    if (buyExisting && !bondingCurve)
      return []

    ixs.push(
      await this.program.methods
        .buy(new BN(amount.toString()), new BN(solAmount.toString()))
        .accountsPartial({
          feeRecipient,
          mint,
          associatedUser,
          user: buyer,
          creatorVault: this.getCreatorVaultPda(
            this.program.programId,
            buyExisting
              ? bondingCurve!.creator
              : buyer
          ),
        })
        .instruction(),
    );
    return ixs;
  }

  //sell
  async getSellInstructionsByTokenAmount(
    seller: PublicKey,
    mint: PublicKey,
    sellTokenAmount: bigint,
    slippageBasisPoints: bigint = BigInt(500),
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    let bondingCurveAccount = await this.getBondingCurveAccount(
      mint,
      commitment
    );
    if (!bondingCurveAccount) {
      throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
    }

    let globalAccount = await this.getGlobalAccount(commitment);

    let minSolOutput = bondingCurveAccount.getSellPrice(
      sellTokenAmount,
      globalAccount.feeBasisPoints
    );

    let sellAmountWithSlippage = calculateWithSlippageSell(
      minSolOutput,
      slippageBasisPoints
    );

    return await this.getSellInstructions(
      seller,
      mint,
      globalAccount.feeRecipient,
      sellTokenAmount,
      sellAmountWithSlippage
    );
  }

  async getSellInstructions(
    seller: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    amount: bigint,
    minSolOutput: bigint
  ) {
    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      this.getBondingCurvePDA(mint),
      true
    );

    const associatedUser = await getAssociatedTokenAddress(mint, seller, false);

    let transaction = new Transaction();

    transaction.add(
      await this.program.methods
        .sell(new BN(amount.toString()), new BN(minSolOutput.toString()))
        .accountsPartial({
          feeRecipient: feeRecipient,
          mint: mint,
          associatedUser: associatedUser,
          user: seller,
        })
        .transaction()
    );

    return transaction;
  }

  async getBondingCurveAccount(
    mint: PublicKey,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    const tokenAccount = await this.connection.getAccountInfo(
      this.getBondingCurvePDA(mint),
      commitment
    );
    if (!tokenAccount) {
      return null;
    }
    return BondingCurveAccount.fromBuffer(tokenAccount!.data);
  }

  async getGlobalAccount(commitment: Commitment = DEFAULT_COMMITMENT) {
    const [globalAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_ACCOUNT_SEED)],
      new PublicKey(PROGRAM_ID)
    );

    const tokenAccount = await this.connection.getAccountInfo(
      globalAccountPDA,
      commitment
    );
    console.log("=============")
    return GlobalAccount.fromBuffer(tokenAccount!.data);
  }

  getBondingCurvePDA(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      this.program.programId
    )[0];
  }


  async createTokenMetadata(create: CreateTokenMetadata) {
    let formData = new FormData();
    formData.append("file", create.file),
      formData.append("name", create.name),
      formData.append("symbol", create.symbol),
      formData.append("description", create.description),
      formData.append("twitter", create.twitter || ""),
      formData.append("telegram", create.telegram || ""),
      formData.append("website", create.website || ""),
      formData.append("showName", "true");

    setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }))
    let request = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      headers: {
        "Host": "www.pump.fun",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Referer": "https://www.pump.fun/create",
        "Origin": "https://www.pump.fun",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Priority": "u=1",
        "TE": "trailers"
      },
      body: formData,
    });
    return request.json();
  }
}

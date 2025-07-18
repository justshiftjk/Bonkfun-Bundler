import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  Account,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  createAssociatedTokenAccountInstruction,
  TokenInvalidMintError,
  TokenInvalidOwnerError,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { DISTRIBUTE_WALLET_NUM } from "../constants";


export const makeCreateMainAta = async (connection: Connection, mint: PublicKey, mainKp: Keypair): Promise<Account> => {
  try {
    const associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID;
    const newProgramId = TOKEN_PROGRAM_ID;

    const associatedToken = getAssociatedTokenAddressSync(
      mint,
      mainKp.publicKey,
      false,
      newProgramId,
      associatedTokenProgramId
    );

    let account: Account;
    try {
      account = await getAccount(connection, associatedToken, "confirmed", newProgramId);
    } catch (error: unknown) {
      if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
        try {
          const transaction = new Transaction({
            feePayer: mainKp.publicKey,
          }).add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }), // Add priority fee
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1200_000 }), // Add compute limit
            createAssociatedTokenAccountInstruction(
              mainKp.publicKey,
              associatedToken,
              mainKp.publicKey,
              mint,
              newProgramId,
              associatedTokenProgramId
            )
          );

          await sendAndConfirmTransaction(connection, transaction, [mainKp]);
        } catch (error: unknown) {
        }
        account = await getAccount(connection, associatedToken, "confirmed", newProgramId);
      } else {
        throw error;
      }
    }

    if (!account.mint.equals(mint)) throw new TokenInvalidMintError();
    if (!account.owner.equals(mainKp.publicKey)) throw new TokenInvalidOwnerError();
    return account;
  } catch (err) {
    console.log("makeCreateMainAta error ====>", err);
    throw new Error("Failed to create main ATA");
  }
}


// export const createBuyersAta = async (
//   connection: Connection,
//   mint: PublicKey,
//   mainKp: Keypair,
//   buyerPubkey: PublicKey,
// ) => {
//   try {
//     const programId = TOKEN_PROGRAM_ID
//     const associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
        
//       const associatedToken = getAssociatedTokenAddressSync(
//         mint,
//         buyerPubkey,
//         false,
//         programId,
//         associatedTokenProgramId
//       );
//       console.log("🚀 ~ associatedToken:", associatedToken)


//       const transaction = new Transaction().add(
//         ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }), // Add priority fee
//         ComputeBudgetProgram.setComputeUnitLimit({ units: 12_00_000 }), // Add compute limit
//         createAssociatedTokenAccountInstruction(
//           buyerPubkey,
//           associatedToken,
//           buyerPubkey,
//           mint,
//           programId,
//           associatedTokenProgramId
//         )
//       );

//       transaction.feePayer = buyerPubkey;
      

//       console.log("createBuyerAta ===>", await connection.simulateTransaction(transaction))

//       return transaction
//       // await sendAndConfirmTransaction(connection, transaction, [mainKp]);
      
     
    
//   } catch (err) {
//     console.log("Error in create token ata tx:", err)
//   }

// }

export const createBuyersAta = async (
  mint: PublicKey,
  buyerPubkey: PublicKey,
) => {
  try {
    const programId = TOKEN_PROGRAM_ID;
    const associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID;
    
    const associatedToken = await getAssociatedTokenAddress(
      mint,
      buyerPubkey,
      false,
      programId,
      associatedTokenProgramId
    );
    const instructions: TransactionInstruction[] = []
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        buyerPubkey,
        associatedToken, 
        buyerPubkey,
        mint,
        programId,
        associatedTokenProgramId
      )
    );

    console.log("create Ata instruction ==>", instructions)

    return instructions;

  } catch (err) {
    console.log("Error in create token ata tx:", err)
  }
}





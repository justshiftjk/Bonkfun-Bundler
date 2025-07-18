import {
    getPdaLaunchpadPoolId,
    LAUNCHPAD_PROGRAM,
    buyExactInInstruction,
    getPdaLaunchpadConfigId,
    getATAAddress,
    getPdaLaunchpadAuth,
    getPdaLaunchpadVaultId,
    sellExactInInstruction,
} from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { Connection, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, PublicKey } from '@solana/web3.js'
import {
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    createSyncNativeInstruction,
    getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { BONK_PLATFROM_ID } from './constants'
import { SystemProgram } from '@solana/web3.js'
import { execute } from './executor/legacy'

export const makeBuyTx = async (connection: Connection, mint: PublicKey, mainKp: Keypair, solAmount: number) => {
    try {
        const buyInstruction = [
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
        ];
        const lamports = Math.floor(solAmount * 10 ** 9)
        const programId = LAUNCHPAD_PROGRAM;
        const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;
        const poolId = getPdaLaunchpadPoolId(programId, mint, NATIVE_MINT).publicKey;

        const userTokenAccountA = getAssociatedTokenAddressSync(mint, mainKp.publicKey);
        const userTokenAccountB = getAssociatedTokenAddressSync(NATIVE_MINT, mainKp.publicKey);

        // Get minimum rent for token accounts
        const rentExemptionAmount = await connection.getMinimumBalanceForRentExemption(165); // 165 bytes for token account

        // Check buyer's balance
        const buyerBalance = await connection.getBalance(mainKp.publicKey);
        const requiredBalance = rentExemptionAmount * 2 + lamports; // rent for 2 accounts + trade amount

        if (buyerBalance < requiredBalance) {
            throw new Error(`Insufficient funds. Need ${requiredBalance / 1e9} SOL, have ${buyerBalance / 1e9} SOL`);
        }

        const vaultA = getPdaLaunchpadVaultId(programId, poolId, mint).publicKey;
        const vaultB = getPdaLaunchpadVaultId(programId, poolId, NATIVE_MINT).publicKey;

        const shareATA = getATAAddress(mainKp.publicKey, NATIVE_MINT).publicKey;
        const authProgramId = getPdaLaunchpadAuth(programId).publicKey;
        const minmintAmount = new BN(1);

        const tokenAta = await getAssociatedTokenAddress(mint, mainKp.publicKey);
        const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, mainKp.publicKey);
        buyInstruction.push(
            createAssociatedTokenAccountIdempotentInstruction(
                mainKp.publicKey,
                tokenAta,
                mainKp.publicKey,
                mint
            ),
            createAssociatedTokenAccountIdempotentInstruction(
                mainKp.publicKey,
                wsolAta,
                mainKp.publicKey,
                NATIVE_MINT
            ),
            SystemProgram.transfer({
                fromPubkey: mainKp.publicKey,
                toPubkey: wsolAta,
                lamports
            }),
            createSyncNativeInstruction(wsolAta)
        );

        const instruction = buyExactInInstruction(
            programId,
            mainKp.publicKey,
            authProgramId,
            configId,
            BONK_PLATFROM_ID,
            poolId,
            userTokenAccountA,
            userTokenAccountB,
            vaultA,
            vaultB,
            mint,
            NATIVE_MINT,
            TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            new BN(lamports),
            minmintAmount,
            new BN(10000),
            shareATA,
        );

        buyInstruction.push(instruction);
        const blockhash = await connection.getLatestBlockhash();

        const messageV0 = new TransactionMessage({
            payerKey: mainKp.publicKey,
            recentBlockhash: blockhash.blockhash,
            instructions: buyInstruction
        }).compileToV0Message();
        const tx = new VersionedTransaction(messageV0);
        tx.sign([mainKp])
        console.log(await connection.simulateTransaction(tx, { sigVerify: true }))
        // const sig = await execute(tx, blockhash)
        return ""
    } catch (error) {
        console.log("Error while buying token", error)
    }
}




export const makeSellTx = async (connection: Connection, mint: PublicKey, mainKp: Keypair, sellAll: boolean = true, sellAmount: number = 0) => {
    try {
        const sellInstruction = [
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
        ];

        const programId = LAUNCHPAD_PROGRAM;
        const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;
        const poolId = getPdaLaunchpadPoolId(programId, mint, NATIVE_MINT).publicKey;
        const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, mainKp.publicKey);
        const tokenAta = await getAssociatedTokenAddress(mint, mainKp.publicKey);

        let tokenBal = new BN(0)
        let decimal = 0
        try {
            const tokenBalInfo = await connection.getTokenAccountBalance(tokenAta)
            tokenBal = new BN(tokenBalInfo.value.amount)
            decimal = tokenBalInfo.value.decimals
        } catch (error) {
            console.log("Wallet does not have the token")
            return
        }
        const tokenSellAmount = sellAmount == 0 ? tokenBal : new BN(sellAmount).mul(new BN(10 ** decimal))
        if (!sellAll && tokenBal.lt(tokenSellAmount)) {
            console.log("Wallet doesn't have enough token")
            return
        }

        const vaultA = getPdaLaunchpadVaultId(programId, poolId, mint).publicKey;
        const vaultB = getPdaLaunchpadVaultId(programId, poolId, NATIVE_MINT).publicKey;

        const shareATA = getATAAddress(mainKp.publicKey, NATIVE_MINT).publicKey;
        const authProgramId = getPdaLaunchpadAuth(programId).publicKey;

        sellInstruction.push(
            createAssociatedTokenAccountIdempotentInstruction(
                mainKp.publicKey,
                wsolAta,
                mainKp.publicKey,
                NATIVE_MINT
            )
        );

        const instruction = sellExactInInstruction(
            programId,
            mainKp.publicKey,
            authProgramId,
            configId,
            BONK_PLATFROM_ID,
            poolId,
            tokenAta,
            wsolAta,
            vaultA,
            vaultB,
            mint,
            NATIVE_MINT,
            TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            tokenSellAmount,
            new BN(0),
            new BN(10000),
            shareATA,
        );

        sellInstruction.push(
            instruction,
            createCloseAccountInstruction(wsolAta, mainKp.publicKey, mainKp.publicKey)
        );
        const blockhash = await connection.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
            payerKey: mainKp.publicKey,
            recentBlockhash: blockhash.blockhash,
            instructions: sellInstruction
        }).compileToV0Message();
        const tx = new VersionedTransaction(messageV0);
        tx.sign([mainKp])
        console.log(await connection.simulateTransaction(tx, { sigVerify: true }))
        // const sig = await execute(tx, blockhash)
        return ""
    } catch (error) {
        console.log("Error while selling token", error)
    }
}

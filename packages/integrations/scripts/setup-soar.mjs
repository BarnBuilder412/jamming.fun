// packages/integrations/scripts/setup-soar.mjs
// Run from project root: pnpm --filter @jamming/integrations run setup-soar
//
// Reads your authority key from .env (MAGICBLOCK_AUTH_WALLET_PRIVATE_KEY)
// and creates a SOAR Game + Leaderboard + Achievement on Solana devnet.
// Prints the pubkeys you need for your .env file.

import { SoarProgram, GameType, Genre, GameClient } from '@magicblock-labs/soar-sdk';
import { Connection, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

// ---------- Config ----------
const RPC_URL = 'https://api.devnet.solana.com';
const GAME_TITLE = 'jamming.fun';
const GAME_DESCRIPTION = 'Music beat prediction game on Solana';
// ----------------------------

function loadAuthorityKeypair() {
    const envPath = resolve(PROJECT_ROOT, '.env');
    let raw;
    try {
        const envContent = readFileSync(envPath, 'utf-8');
        const match = envContent.match(/^MAGICBLOCK_AUTH_WALLET_PRIVATE_KEY=(.+)$/m);
        if (match) raw = match[1].trim();
    } catch { }

    if (!raw) {
        const keyfilePath = resolve(PROJECT_ROOT, 'authority-wallet.json');
        try {
            raw = readFileSync(keyfilePath, 'utf-8').trim();
        } catch {
            console.error('❌ Could not find MAGICBLOCK_AUTH_WALLET_PRIVATE_KEY in .env');
            console.error('   nor authority-wallet.json in project root.');
            console.error('');
            console.error('   Option A: Export private key from Phantom → paste in .env');
            console.error('   Option B: Run: solana-keygen new --outfile authority-wallet.json');
            process.exit(1);
        }
    }

    if (raw.startsWith('[')) {
        const bytes = JSON.parse(raw);
        return Keypair.fromSecretKey(Uint8Array.from(bytes));
    }
    return Keypair.fromSecretKey(Uint8Array.from(bs58.decode(raw)));
}

/**
 * Sign and send a transaction using @solana/web3.js directly,
 * bypassing the SOAR SDK's broken sendAndConfirmTransaction.
 */
async function signAndSend(connection, transaction, signers) {
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    transaction.feePayer = signers[0].publicKey;
    transaction.sign(...signers);
    const signature = await sendAndConfirmTransaction(connection, transaction, signers, {
        commitment: 'confirmed',
    });
    return signature;
}

async function main() {
    console.log('🔧 Setting up SOAR resources on devnet...\n');

    const connection = new Connection(RPC_URL, 'confirmed');
    const authority = loadAuthorityKeypair();
    console.log(`Authority wallet: ${authority.publicKey.toBase58()}`);

    // Check balance
    const balance = await connection.getBalance(authority.publicKey);
    if (balance < 0.05 * 1e9) {
        console.error(`\n❌ Insufficient SOL balance: ${balance / 1e9} SOL`);
        console.error('   You need at least 0.05 SOL. Run:');
        console.error(`   solana airdrop 2 ${authority.publicKey.toBase58()} --url devnet`);
        console.error('   Or use: https://faucet.solana.com/');
        process.exit(1);
    }
    console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

    const soar = SoarProgram.getFromConnection(connection, authority.publicKey);

    // 1. Create Game
    console.log('📦 Creating SOAR Game...');
    const gameKeypair = Keypair.generate();
    const nftMeta = Keypair.generate().publicKey; // placeholder NFT metadata
    const { transaction: gameTx } = await soar.initializeNewGame(
        gameKeypair.publicKey,
        GAME_TITLE,
        GAME_DESCRIPTION,
        Genre.Action,
        GameType.Web,
        nftMeta,
        [authority.publicKey],
    );
    const gameSig = await signAndSend(connection, gameTx, [authority, gameKeypair]);
    console.log(`✅ Game created: ${gameKeypair.publicKey.toBase58()}`);
    console.log(`   Tx: ${gameSig}\n`);

    // 2. Add Leaderboard
    console.log('📊 Adding Leaderboard...');
    const gameClient = new GameClient(soar, gameKeypair.publicKey);
    await gameClient.init();

    const { newLeaderBoard, transaction: lbTx } = await gameClient.addLeaderBoard(
        authority.publicKey,
        'Prediction Scores',  // description
        nftMeta,              // nft metadata (placeholder)
        100,                  // max scores to track
        true,                 // order by descending (highest first)
        null,                 // decimals
        null,                 // min score
        null,                 // max score
    );
    const lbSig = await signAndSend(connection, lbTx, [authority]);
    await gameClient.refresh();
    const leaderboardPubkey = newLeaderBoard ?? gameClient.account.leaderboard;
    console.log(`✅ Leaderboard created: ${leaderboardPubkey}`);
    console.log(`   Tx: ${lbSig}\n`);

    // 3. Add Achievement (optional, for FT claims)
    console.log('🏆 Adding Achievement...');
    try {
        const { newAchievement, transaction: achTx } = await gameClient.addAchievement(
            authority.publicKey,
            'Round Winner',       // title
            'Won a prediction round', // description
            nftMeta,              // nft metadata
        );
        const achSig = await signAndSend(connection, achTx, [authority]);
        await gameClient.refresh();
        const achievementPubkey = newAchievement ?? gameClient.recentAchievementAddress();
        console.log(`✅ Achievement created: ${achievementPubkey}`);
        console.log(`   Tx: ${achSig}\n`);

        printEnvBlock(gameKeypair.publicKey.toBase58(), leaderboardPubkey, achievementPubkey);
    } catch (err) {
        console.warn(`⚠️  Achievement creation failed (optional): ${err.message}\n`);
        printEnvBlock(gameKeypair.publicKey.toBase58(), leaderboardPubkey, null);
    }
}

function printEnvBlock(gamePubkey, leaderboardPubkey, achievementPubkey) {
    console.log('═══════════════════════════════════════════════════');
    console.log('  📋 Copy these into your .env file:');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(`MAGICBLOCK_SOLANA_RPC_URL=https://api.devnet.solana.com`);
    console.log(`MAGICBLOCK_SOAR_GAME_PUBKEY=${gamePubkey}`);
    console.log(`MAGICBLOCK_SOAR_LEADERBOARD_PUBKEY=${leaderboardPubkey}`);
    if (achievementPubkey) {
        console.log(`MAGICBLOCK_SOAR_ACHIEVEMENT_PUBKEY=${achievementPubkey}`);
    }
    console.log('\n═══════════════════════════════════════════════════\n');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

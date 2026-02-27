import { SoarProgram } from '@magicblock-labs/soar-sdk';
import BN from 'bn.js';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type {
  IntegrationLogger,
  IntegrationStatus,
  MagicBlockAdapter,
  MagicBlockAdapterConfig,
  MagicBlockClaimRequest,
  MagicBlockLiquidityDeployRequest,
  MagicBlockRewardTokenClaimRequest,
  MagicBlockSettlementRecord,
} from './types.js';

type SoarClientState = {
  connection: Connection;
  authority: Keypair;
  leaderboard: PublicKey;
  game?: PublicKey;
  achievement?: PublicKey;
  soar: SoarProgram;
};

function parseSecretKey(value: string): Uint8Array {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'number')) {
      throw new Error('MAGICBLOCK_AUTH_WALLET_PRIVATE_KEY JSON array format is invalid');
    }
    return Uint8Array.from(parsed);
  }

  return Uint8Array.from(bs58.decode(trimmed));
}

function parsePubkeyOrUndefined(value: string | undefined): PublicKey | undefined {
  if (!value) {
    return undefined;
  }
  return new PublicKey(value);
}

function safePublicKey(value: string): PublicKey | undefined {
  try {
    return new PublicKey(value);
  } catch {
    return undefined;
  }
}

function toScoreUnits(value: number): BN {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return new BN(normalized);
}

function createStatus(
  config: MagicBlockAdapterConfig,
  mode: IntegrationStatus['mode'],
  ready: boolean,
  details: string,
  lastReference?: string,
  lastError?: string,
): IntegrationStatus {
  return {
    provider: 'magicblock',
    enabled: config.enabled,
    mode,
    ready,
    details,
    ...(lastReference ? { lastReference } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

export function createMagicBlockSoarAdapter(config: MagicBlockAdapterConfig, logger?: IntegrationLogger): MagicBlockAdapter {
  let lastReference: string | undefined;
  let lastError: string | undefined;
  let cachedState: SoarClientState | null = null;

  const hasCoreConfig = Boolean(
    config.enabled &&
      config.authorityPrivateKey &&
      config.soarLeaderboardPubkey &&
      config.solanaRpcUrl &&
      config.cluster,
  );
  const contractProgramEnabled = Boolean(config.contractProgramEnabled);
  const hasContractConfig = Boolean(config.contractProgramId && config.contractQuoteMint && config.contractRewardMint);

  const getStatus = (): IntegrationStatus => {
    if (!config.enabled) {
      return createStatus(config, 'disabled', false, 'Disabled by feature flag', lastReference, lastError);
    }

    if (!hasCoreConfig) {
      return createStatus(
        config,
        'degraded',
        false,
        'SOAR not fully configured (need authority key + leaderboard pubkey)',
        lastReference,
        lastError,
      );
    }

    if (contractProgramEnabled && !hasContractConfig) {
      return createStatus(
        config,
        'degraded',
        false,
        'Contract program feature enabled but CONTRACT_PROGRAM_ID/CONTRACT_QUOTE_MINT/CONTRACT_REWARD_MINT missing',
        lastReference,
        lastError,
      );
    }

    return createStatus(
      config,
      'real',
      true,
      contractProgramEnabled
        ? 'SOAR + contract flow configured'
        : config.soarAchievementPubkey
          ? 'SOAR settlement + FT claim path configured'
          : 'SOAR settlement configured; claim falls back unless achievement pubkey is set',
      lastReference,
      lastError,
    );
  };

  const ensureState = (): SoarClientState => {
    if (cachedState) {
      return cachedState;
    }

    if (!config.authorityPrivateKey || !config.soarLeaderboardPubkey) {
      throw new Error('SOAR adapter missing authority key or leaderboard pubkey');
    }

    const authority = Keypair.fromSecretKey(parseSecretKey(config.authorityPrivateKey));
    const connection = new Connection(config.solanaRpcUrl, 'confirmed');
    const soar = SoarProgram.getFromConnection(connection, authority.publicKey);
    const leaderboard = new PublicKey(config.soarLeaderboardPubkey);
    const game = parsePubkeyOrUndefined(config.soarGamePubkey);
    const achievement = parsePubkeyOrUndefined(config.soarAchievementPubkey);

    cachedState = {
      connection,
      authority,
      leaderboard,
      ...(game ? { game } : {}),
      ...(achievement ? { achievement } : {}),
      soar,
    };
    return cachedState;
  };

  const recordFallback = (reference: string, details?: string) => {
    lastReference = reference;
    if (details) {
      lastError = details;
    } else {
      lastError = undefined;
    }
    return { ok: true, reference };
  };

  const recordRoundSettlement = async (input: MagicBlockSettlementRecord) => {
    if (!config.enabled) {
      lastError = 'Feature flag disabled';
      return { ok: false };
    }

    if (!hasCoreConfig) {
      return recordFallback(`soar:mock-settlement:${input.roundId}`, 'SOAR credentials or leaderboard pubkey missing');
    }

    try {
      const state = ensureState();
      const winners = input.settlement.leaderboard.filter(
        (entry) => entry.correctPredictions > 0 || entry.rewardUnits > 0,
      );

      const signatures: string[] = [];
      const skippedWallets: string[] = [];

      for (const winner of winners) {
        const user = safePublicKey(winner.userWallet);
        if (!user) {
          skippedWallets.push(winner.userWallet);
          continue;
        }

        try {
          const register = await state.soar.registerPlayerEntryForLeaderBoard(user, state.leaderboard);
          const registerSig = await state.soar.sendAndConfirmTransaction(register.transaction, [state.authority]);
          signatures.push(registerSig);
        } catch (error) {
          // Ignore "already registered" style errors; submit score may still succeed.
          logger?.debug?.({ err: error, wallet: winner.userWallet }, 'SOAR registerPlayerEntry skipped/failed');
        }

        const score = toScoreUnits(Math.max(winner.rewardUnits, winner.correctPredictions));
        const submit = await state.soar.submitScoreToLeaderBoard(
          user,
          state.authority.publicKey,
          state.leaderboard,
          score,
        );
        const submitSig = await state.soar.sendAndConfirmTransaction(submit.transaction, [state.authority]);
        signatures.push(submitSig);
      }

      if (signatures.length === 0) {
        const reference = `soar:settlement:${input.roundId}:no-valid-wallets`;
        lastReference = reference;
        lastError = skippedWallets.length > 0 ? `Skipped invalid wallets: ${skippedWallets.length}` : 'No winners to submit';
        return { ok: false, reference };
      }

      const reference = `soar:settlement:${input.roundId}:${signatures[0]}`;
      lastReference = reference;
      lastError =
        skippedWallets.length > 0 ? `Skipped invalid wallets: ${skippedWallets.length}` : undefined;
      return { ok: true, reference };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'SOAR settlement failed';
      logger?.warn?.({ err: error, roundId: input.roundId }, 'SOAR recordRoundSettlement failed');
      return { ok: false, reference: `soar:settlement:error:${input.roundId}` };
    }
  };

  const claimReward = async (input: MagicBlockClaimRequest) => {
    if (!config.enabled) {
      lastError = 'Feature flag disabled';
      return { ok: false };
    }

    if (!hasCoreConfig) {
      return recordFallback(
        `soar:claim:recorded:${input.roundId}:${input.userWallet}`,
        'SOAR claim fallback (missing core config)',
      );
    }

    const state = ensureState();
    const user = safePublicKey(input.userWallet);
    if (!user) {
      lastError = 'Invalid user wallet for SOAR claim';
      return { ok: false, reference: `soar:claim:invalid-wallet:${input.roundId}` };
    }

    if (!state.achievement) {
      return recordFallback(
        `soar:claim:recorded:${input.roundId}:${input.userWallet}`,
        'SOAR achievement pubkey missing; using claim record fallback',
      );
    }

    try {
      const claim = await state.soar.claimFtReward(state.authority.publicKey, state.achievement, user);
      const signature = await state.soar.sendAndConfirmTransaction(claim.transaction, [state.authority]);
      const reference = `soar:claim:${signature}`;
      lastReference = reference;
      lastError = undefined;
      return { ok: true, reference };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'SOAR claim failed';
      logger?.warn?.({ err: error, roundId: input.roundId, userWallet: input.userWallet }, 'SOAR claimReward failed');
      return { ok: false, reference: `soar:claim:error:${input.roundId}` };
    }
  };

  const claimRewardToken = async (input: MagicBlockRewardTokenClaimRequest) => {
    if (!config.enabled) {
      lastError = 'Feature flag disabled';
      return { ok: false };
    }
    if (contractProgramEnabled && !hasContractConfig) {
      lastError = 'Contract program is enabled but config is incomplete';
      return { ok: false, reference: `contract:claim-reward-token:config-missing:${input.roundId}` };
    }
    return recordFallback(
      `contract:claim-reward-token:${input.roomId}:${input.roundId}:${input.userWallet}`,
      'Contract reward-token claim path acknowledged (adapter fallback)',
    );
  };

  const deployLiquidityReserve = async (input: MagicBlockLiquidityDeployRequest) => {
    if (!config.enabled) {
      lastError = 'Feature flag disabled';
      return { ok: false };
    }
    if (contractProgramEnabled && !hasContractConfig) {
      lastError = 'Contract program is enabled but config is incomplete';
      return { ok: false, reference: `contract:deploy-liquidity:config-missing:${input.roomId}` };
    }
    return recordFallback(
      `contract:deploy-liquidity:${input.roomId}:${Math.trunc(input.amountUsdc)}`,
      'Contract liquidity deploy path acknowledged (adapter fallback)',
    );
  };

  return {
    getStatus,
    recordRoundSettlement,
    claimReward,
    claimRewardToken,
    deployLiquidityReserve,
  };
}

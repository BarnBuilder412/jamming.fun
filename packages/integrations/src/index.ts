import type { SettlementResult } from '@jamming/shared-types';

export type MagicBlockSettlementRecord = {
  roomId: string;
  roundId: string;
  settlement: SettlementResult;
};

export type MagicBlockClaimRequest = {
  roomId: string;
  roundId: string;
  userWallet: string;
};

export interface MagicBlockAdapter {
  recordRoundSettlement(input: MagicBlockSettlementRecord): Promise<{ ok: boolean; reference?: string }>;
  claimReward(input: MagicBlockClaimRequest): Promise<{ ok: boolean; reference?: string }>;
}

export interface AudiusAdapter {
  resolveArtist(input: {
    wallet?: string | null;
    handle?: string | null;
  }): Promise<{ ok: boolean; artistName?: string; audiusHandle?: string; profileUrl?: string }>;
  publishSessionMetadata(input: {
    roomId: string;
    roundId?: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<{ ok: boolean; reference?: string }>;
}

export type BlinksActionKind = 'join' | 'predict' | 'claim';

export interface BlinksAdapter {
  buildJoinAction(input: { roomId: string }): Promise<Record<string, unknown>>;
  buildPredictAction(input: { roomId: string; roundId: string }): Promise<Record<string, unknown>>;
  buildClaimAction(input: { roomId: string; roundId: string; userWallet?: string }): Promise<Record<string, unknown>>;
}

export type IntegrationFlags = {
  enableMagicBlock: boolean;
  enableAudius: boolean;
  enableBlinks: boolean;
};

export function createNoopMagicBlockAdapter(flags: IntegrationFlags): MagicBlockAdapter {
  return {
    recordRoundSettlement(input) {
      if (!flags.enableMagicBlock) {
        return Promise.resolve({ ok: false });
      }

      return Promise.resolve({
        ok: true,
        reference: `mock:magicblock:settlement:${input.roundId}`,
      });
    },
    claimReward(input) {
      if (!flags.enableMagicBlock) {
        return Promise.resolve({ ok: false });
      }

      return Promise.resolve({
        ok: true,
        reference: `mock:magicblock:claim:${input.roundId}:${input.userWallet}`,
      });
    },
  };
}

export function createNoopAudiusAdapter(flags: IntegrationFlags): AudiusAdapter {
  return {
    resolveArtist(input) {
      if (!flags.enableAudius) {
        return Promise.resolve({ ok: false });
      }

      return Promise.resolve({
        ok: true,
        artistName: input.handle ?? 'Demo Artist',
        audiusHandle: input.handle ?? 'demo_artist',
        profileUrl: `https://audius.co/${input.handle ?? 'demo_artist'}`,
      });
    },
    publishSessionMetadata(input) {
      if (!flags.enableAudius) {
        return Promise.resolve({ ok: false });
      }

      return Promise.resolve({
        ok: true,
        reference: `mock:audius:session:${input.roomId}`,
      });
    },
  };
}

export function createNoopBlinksAdapter(flags: IntegrationFlags): BlinksAdapter {
  const status = flags.enableBlinks ? 'ready' : 'disabled';

  return {
    buildJoinAction(input) {
      return Promise.resolve({
        type: 'join',
        roomId: input.roomId,
        status,
        label: 'Join Room',
      });
    },
    buildPredictAction(input) {
      return Promise.resolve({
        type: 'predict',
        roomId: input.roomId,
        roundId: input.roundId,
        status,
        label: 'Submit Prediction',
      });
    },
    buildClaimAction(input) {
      return Promise.resolve({
        type: 'claim',
        roomId: input.roomId,
        roundId: input.roundId,
        userWallet: input.userWallet,
        status,
        label: 'Claim Rewards',
      });
    },
  };
}

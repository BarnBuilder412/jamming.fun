import type { ActionGetResponse, ActionPostResponse } from '@solana/actions';
import type { SettlementResult } from '@jamming/shared-types';

export type IntegrationMode = 'disabled' | 'mock' | 'degraded' | 'real';

export type IntegrationStatus = {
  provider: 'magicblock' | 'audius' | 'blinks';
  enabled: boolean;
  ready: boolean;
  mode: IntegrationMode;
  details?: string;
  lastReference?: string;
  lastError?: string;
};

export type IntegrationFlags = {
  enableMagicBlock: boolean;
  enableAudius: boolean;
  enableBlinks: boolean;
};

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
  getStatus(): IntegrationStatus;
  recordRoundSettlement(input: MagicBlockSettlementRecord): Promise<{ ok: boolean; reference?: string }>;
  claimReward(input: MagicBlockClaimRequest): Promise<{ ok: boolean; reference?: string }>;
}

export interface AudiusAdapter {
  getStatus(): IntegrationStatus;
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
  getStatus(): IntegrationStatus;
  getCorsHeaders(): Record<string, string>;
  buildJoinAction(input: { roomId: string; iconUrl?: string }): Promise<ActionGetResponse>;
  buildPredictAction(input: { roomId: string; roundId: string; iconUrl?: string }): Promise<ActionGetResponse>;
  buildClaimAction(input: { roomId: string; roundId: string; userWallet?: string; iconUrl?: string }): Promise<ActionGetResponse>;
  buildJoinPostResponse(input: { roomId: string; account: string }): Promise<ActionPostResponse>;
  buildPredictPostResponse(input: {
    roomId: string;
    roundId: string;
    account: string;
    params?: Record<string, string | string[] | undefined>;
  }): Promise<ActionPostResponse>;
  buildClaimPostResponse(input: {
    roomId: string;
    roundId: string;
    account: string;
    userWallet?: string;
  }): Promise<ActionPostResponse>;
}

export interface IntegrationLogger {
  info?(obj: unknown, msg?: string): void;
  warn?(obj: unknown, msg?: string): void;
  error?(obj: unknown, msg?: string): void;
  debug?(obj: unknown, msg?: string): void;
}

export type MagicBlockAdapterConfig = {
  enabled: boolean;
  solanaRpcUrl: string;
  cluster: 'devnet' | 'mainnet-beta';
  authorityPrivateKey?: string;
  soarGamePubkey?: string;
  soarLeaderboardPubkey?: string;
  soarAchievementPubkey?: string;
};

export type AudiusAdapterConfig = {
  enabled: boolean;
  appName: string;
  apiKey?: string;
  apiSecret?: string;
  bearerToken?: string;
  writeMode: 'read_only' | 'signed';
};

export type BlinksAdapterConfig = {
  enabled: boolean;
  solanaRpcUrl: string;
  cluster: 'devnet' | 'mainnet-beta';
};

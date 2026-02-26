import type { Prisma, PrismaClient, RoundPhase as PrismaRoundPhase, RoomStatus, TrackId as PrismaTrackId } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { RoomSnapshot, RoundSnapshot, PredictionSnapshot } from './gameStore.js';
import type { SettlementResult } from '@jamming/shared-types';

export class PrismaMirror {
  constructor(
    private readonly prisma: PrismaClient | null,
    private readonly logger: FastifyBaseLogger,
  ) {}

  get enabled(): boolean {
    return this.prisma !== null;
  }

  async syncRoom(room: RoomSnapshot): Promise<void> {
    if (!this.prisma) {
      return;
    }

    await this.prisma.room.upsert({
      where: { id: room.id },
      update: {
        code: room.code,
        title: room.title,
        status: room.status as RoomStatus,
        artistWallet: room.artistWallet,
        audiusHandle: room.audiusHandle,
      },
      create: {
        id: room.id,
        code: room.code,
        title: room.title,
        status: room.status as RoomStatus,
        artistWallet: room.artistWallet,
        audiusHandle: room.audiusHandle,
      },
    });
  }

  async syncRound(round: RoundSnapshot): Promise<void> {
    if (!this.prisma) {
      return;
    }

    await this.prisma.round.upsert({
      where: { id: round.id },
      update: {
        phase: round.phase as PrismaRoundPhase,
        bpm: round.bpm,
        commitHash: round.commitHash,
        patternVersion: round.patternVersion,
        revealPattern: (round.reveal?.pattern ?? null) as Prisma.InputJsonValue,
        revealNonce: round.reveal?.nonce ?? null,
        commitVerified: round.reveal?.commitVerified ?? null,
        lockedAt: round.lockedAt,
        revealedAt: round.revealedAt,
        settledAt: round.settledAt,
      },
      create: {
        id: round.id,
        roomId: round.roomId,
        roundIndex: round.index,
        phase: round.phase as PrismaRoundPhase,
        bpm: round.bpm,
        commitHash: round.commitHash,
        patternVersion: round.patternVersion,
        revealPattern: (round.reveal?.pattern ?? null) as Prisma.InputJsonValue,
        revealNonce: round.reveal?.nonce ?? null,
        commitVerified: round.reveal?.commitVerified ?? null,
        startedAt: round.startedAt,
        lockedAt: round.lockedAt,
        revealedAt: round.revealedAt,
        settledAt: round.settledAt,
      },
    });

    if (round.commitHash) {
      await this.prisma.commitment.upsert({
        where: { roundId: round.id },
        update: {
          commitHash: round.commitHash,
          patternVersion: round.patternVersion ?? 1,
        },
        create: {
          roundId: round.id,
          commitHash: round.commitHash,
          patternVersion: round.patternVersion ?? 1,
        },
      });
    }
  }

  async syncPrediction(roundId: string, prediction: PredictionSnapshot): Promise<void> {
    if (!this.prisma) {
      return;
    }

    const user = await this.prisma.user.upsert({
      where: { walletAddress: prediction.userWallet },
      update: {},
      create: { walletAddress: prediction.userWallet },
      select: { id: true },
    });

    await this.prisma.prediction.upsert({
      where: { id: prediction.id },
      update: {
        userWallet: prediction.userWallet,
        userId: user.id,
        trackId: prediction.guess.trackId as PrismaTrackId,
        stepIndex: prediction.guess.stepIndex,
        willBeActive: prediction.guess.willBeActive,
        submittedAt: prediction.submittedAt,
      },
      create: {
        id: prediction.id,
        roundId,
        userWallet: prediction.userWallet,
        userId: user.id,
        trackId: prediction.guess.trackId as PrismaTrackId,
        stepIndex: prediction.guess.stepIndex,
        willBeActive: prediction.guess.willBeActive,
        submittedAt: prediction.submittedAt,
      },
    });
  }

  async syncSettlement(round: RoundSnapshot, settlement: SettlementResult): Promise<void> {
    if (!this.prisma) {
      return;
    }

    await this.prisma.settlement.upsert({
      where: { roundId: round.id },
      update: {
        commitVerified: settlement.commitVerified,
        totalPredictions: settlement.totalPredictions,
        winningPredictions: settlement.winningPredictions,
        leaderboard: settlement.leaderboard as unknown as Prisma.InputJsonValue,
      },
      create: {
        roundId: round.id,
        commitVerified: settlement.commitVerified,
        totalPredictions: settlement.totalPredictions,
        winningPredictions: settlement.winningPredictions,
        leaderboard: settlement.leaderboard as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.rewardLedgerEntry.deleteMany({ where: { roundId: round.id } });
    if (settlement.rewards.length > 0) {
      await this.prisma.rewardLedgerEntry.createMany({
        data: settlement.rewards.map((reward) => ({
          roundId: round.id,
          userWallet: reward.userWallet,
          units: reward.units,
          reason: reward.reason,
        })),
      });
    }
  }

  async syncArtistLink(params: { room: RoomSnapshot; profileUrl?: string | null }): Promise<void> {
    if (!this.prisma || !params.room.artistWallet) {
      return;
    }

    const user = await this.prisma.user.upsert({
      where: { walletAddress: params.room.artistWallet },
      update: {},
      create: { walletAddress: params.room.artistWallet },
      select: { id: true },
    });

    let profileId: string | null = null;
    if (params.room.audiusHandle) {
      const profile = await this.prisma.artistProfile.upsert({
        where: { userId: user.id },
        update: {
          audiusHandle: params.room.audiusHandle,
          ...(params.profileUrl !== undefined ? { audiusProfileUrl: params.profileUrl } : {}),
        },
        create: {
          userId: user.id,
          audiusHandle: params.room.audiusHandle,
          ...(params.profileUrl !== undefined ? { audiusProfileUrl: params.profileUrl } : {}),
        },
        select: { id: true },
      });
      profileId = profile.id;
    }

    await this.prisma.room.update({
      where: { id: params.room.id },
      data: {
        artistProfile: profileId ? { connect: { id: profileId } } : { disconnect: true },
      },
    });
  }

  async safe(task: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.warn({ err: error, task }, 'Prisma mirror sync failed');
    }
  }
}

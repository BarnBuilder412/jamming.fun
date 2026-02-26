import { settleRound as settleRoundCore, verifyCommitReveal } from '@jamming/game-core';
import type {
  CommitPayload,
  CreateRoomRequest,
  PatternV1,
  PredictionPayload,
  RevealPayload,
  RoomResponse,
  RoundSummary,
  SettleResponse,
  SettlementResult,
  StartRoundRequest,
} from '@jamming/shared-types';
import type { RoundPhase } from '@jamming/shared-types';
import { generateId, generateRoomCode } from '../lib/ids.js';

export class StoreError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type StoredPrediction = {
  id: string;
  submittedAt: Date;
} & PredictionPayload;

type StoredRoom = {
  id: string;
  code: string;
  title: string;
  status: 'active' | 'archived';
  artistWallet: string | null;
  audiusHandle: string | null;
  audiusProfileUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  currentRoundId: string | null;
};

type StoredRound = {
  id: string;
  roomId: string;
  index: number;
  phase: RoundPhase;
  bpm: number;
  commitHash: string | null;
  patternVersion: 1 | null;
  startedAt: Date;
  lockedAt: Date | null;
  revealedAt: Date | null;
  settledAt: Date | null;
  predictions: StoredPrediction[];
  reveal: {
    pattern: PatternV1;
    nonce: string;
    commitVerified: boolean;
  } | null;
  settlement: SettlementResult | null;
};

export type RoomSnapshot = StoredRoom;
export type RoundSnapshot = StoredRound;
export type PredictionSnapshot = StoredPrediction;

export class GameStore {
  private readonly rooms = new Map<string, StoredRoom>();
  private readonly rounds = new Map<string, StoredRound>();
  private readonly roomRoundOrder = new Map<string, string[]>();

  createRoom(input: CreateRoomRequest): RoomResponse['room'] {
    const now = new Date();
    const room: StoredRoom = {
      id: generateId('room'),
      code: generateRoomCode(),
      title: input.title,
      status: 'active',
      artistWallet: input.artistWallet ?? null,
      audiusHandle: input.audiusHandle ?? null,
      audiusProfileUrl: null,
      createdAt: now,
      updatedAt: now,
      currentRoundId: null,
    };

    this.rooms.set(room.id, room);
    this.roomRoundOrder.set(room.id, []);

    return this.toRoomView(room);
  }

  getRoom(roomId: string): RoomResponse['room'] {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new StoreError(404, `Room not found: ${roomId}`);
    }

    return this.toRoomView(room);
  }

  updateRoomIntegrationMetadata(
    roomId: string,
    patch: {
      audiusHandle?: string | null;
      audiusProfileUrl?: string | null;
    },
  ): RoomResponse['room'] {
    const room = this.getRoomSnapshot(roomId);
    if (patch.audiusHandle !== undefined) {
      room.audiusHandle = patch.audiusHandle;
    }
    if (patch.audiusProfileUrl !== undefined) {
      room.audiusProfileUrl = patch.audiusProfileUrl;
    }
    room.updatedAt = new Date();
    return this.toRoomView(room);
  }

  getRoomSnapshot(roomId: string): RoomSnapshot {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new StoreError(404, `Room not found: ${roomId}`);
    }
    return room;
  }

  getRoundSnapshot(roomId: string, roundId: string): RoundSnapshot {
    const round = this.rounds.get(roundId);
    if (!round || round.roomId !== roomId) {
      throw new StoreError(404, `Round not found: ${roundId}`);
    }
    return round;
  }

  startRound(roomId: string, input: StartRoundRequest): RoundSummary {
    const room = this.getRoomSnapshot(roomId);
    if (room.currentRoundId) {
      const current = this.rounds.get(room.currentRoundId);
      if (current && current.phase !== 'settled') {
        throw new StoreError(409, 'Current round must be settled before starting a new one');
      }
    }

    const roundIds = this.roomRoundOrder.get(roomId) ?? [];
    const roundIndex = roundIds.length;
    const now = new Date();

    const round: StoredRound = {
      id: generateId('round'),
      roomId,
      index: roundIndex,
      phase: 'awaiting_commit',
      bpm: input.bpm,
      commitHash: null,
      patternVersion: null,
      startedAt: now,
      lockedAt: null,
      revealedAt: null,
      settledAt: null,
      predictions: [],
      reveal: null,
      settlement: null,
    };

    this.rounds.set(round.id, round);
    this.roomRoundOrder.set(roomId, [...roundIds, round.id]);
    room.currentRoundId = round.id;
    room.updatedAt = now;

    return this.toRoundSummary(round);
  }

  commitRound(roomId: string, roundId: string, input: CommitPayload): RoundSummary {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (round.phase !== 'awaiting_commit') {
      throw new StoreError(409, `Commit only allowed in awaiting_commit phase (current: ${round.phase})`);
    }
    if (round.commitHash) {
      throw new StoreError(409, 'Commitment already submitted for this round');
    }

    round.commitHash = input.commitHash;
    round.patternVersion = input.patternVersion;
    round.phase = 'prediction_open';

    return this.toRoundSummary(round);
  }

  addPrediction(roomId: string, roundId: string, input: PredictionPayload): { predictionCount: number; round: RoundSummary; prediction: StoredPrediction } {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (round.phase !== 'prediction_open') {
      throw new StoreError(409, `Predictions are closed (current phase: ${round.phase})`);
    }

    const duplicate = round.predictions.find(
      (prediction) =>
        prediction.userWallet === input.userWallet &&
        prediction.guess.trackId === input.guess.trackId &&
        prediction.guess.stepIndex === input.guess.stepIndex,
    );
    if (duplicate) {
      throw new StoreError(409, 'Duplicate prediction for the same track/step by this user');
    }

    const prediction: StoredPrediction = {
      id: generateId('pred'),
      submittedAt: new Date(),
      ...input,
    };

    round.predictions.push(prediction);
    return {
      predictionCount: round.predictions.length,
      round: this.toRoundSummary(round),
      prediction,
    };
  }

  lockRound(roomId: string, roundId: string): RoundSummary {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (round.phase !== 'prediction_open') {
      throw new StoreError(409, `Lock only allowed in prediction_open phase (current: ${round.phase})`);
    }

    round.phase = 'locked';
    round.lockedAt = new Date();
    return this.toRoundSummary(round);
  }

  revealRound(roomId: string, roundId: string, input: RevealPayload): { round: RoundSummary; commitVerified: boolean } {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (round.phase !== 'locked') {
      throw new StoreError(409, `Reveal only allowed in locked phase (current: ${round.phase})`);
    }
    if (!round.commitHash) {
      throw new StoreError(409, 'Commitment missing for this round');
    }

    const commitVerified = verifyCommitReveal({
      commitHash: round.commitHash,
      pattern: input.pattern,
      roundId,
      nonce: input.nonce,
      commitInputVersion: input.commitInputVersion,
    });

    round.reveal = {
      pattern: input.pattern,
      nonce: input.nonce,
      commitVerified,
    };
    round.revealedAt = new Date();
    round.phase = 'revealed';

    return {
      round: this.toRoundSummary(round),
      commitVerified,
    };
  }

  settleRound(roomId: string, roundId: string): SettleResponse['settlement'] {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (round.phase !== 'revealed') {
      throw new StoreError(409, `Settlement only allowed in revealed phase (current: ${round.phase})`);
    }
    if (!round.reveal) {
      throw new StoreError(409, 'Reveal data missing for round');
    }
    if (round.settlement) {
      throw new StoreError(409, 'Round already settled');
    }

    const settlement = settleRoundCore({
      roundId,
      commitVerified: round.reveal.commitVerified,
      pattern: round.reveal.pattern,
      predictions: round.predictions.map((prediction) => ({
        userWallet: prediction.userWallet,
        guess: prediction.guess,
      })),
    });

    round.settlement = settlement;
    round.phase = 'settled';
    round.settledAt = new Date();

    return settlement;
  }

  setSettlementIntegrations(
    roomId: string,
    roundId: string,
    integrations: NonNullable<SettlementResult['integrations']>,
  ): SettlementResult {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (!round.settlement) {
      throw new StoreError(404, 'Settlement results not found for round');
    }

    round.settlement = {
      ...round.settlement,
      integrations: {
        ...(round.settlement.integrations ?? {}),
        ...integrations,
      },
    };

    return round.settlement;
  }

  getResults(roomId: string, roundId: string): SettlementResult {
    const round = this.getRoundSnapshot(roomId, roundId);
    if (!round.settlement) {
      throw new StoreError(404, 'Settlement results not found for round');
    }

    return round.settlement;
  }

  getCurrentRoundSummary(roomId: string): RoundSummary | null {
    const room = this.getRoomSnapshot(roomId);
    if (!room.currentRoundId) {
      return null;
    }
    const round = this.rounds.get(room.currentRoundId);
    return round ? this.toRoundSummary(round) : null;
  }

  private toRoomView(room: StoredRoom): RoomResponse['room'] {
    return {
      id: room.id,
      code: room.code,
      title: room.title,
      status: room.status,
      artistWallet: room.artistWallet,
      audiusHandle: room.audiusHandle,
      audiusProfileUrl: room.audiusProfileUrl,
      currentRound: room.currentRoundId ? this.toRoundSummary(this.rounds.get(room.currentRoundId)!) : null,
    };
  }

  toRoundSummary(round: StoredRound): RoundSummary {
    return {
      id: round.id,
      roomId: round.roomId,
      index: round.index,
      phase: round.phase,
      bpm: round.bpm,
      commitHash: round.commitHash,
      predictionCount: round.predictions.length,
      commitVerified: round.reveal?.commitVerified ?? null,
      startedAt: round.startedAt.toISOString(),
      lockedAt: round.lockedAt?.toISOString() ?? null,
      revealedAt: round.revealedAt?.toISOString() ?? null,
      settledAt: round.settledAt?.toISOString() ?? null,
    };
  }
}

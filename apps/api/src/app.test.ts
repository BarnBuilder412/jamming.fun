import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

describe('api app', () => {
  let appPromise: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    appPromise = await buildApp({
      config: loadConfig({
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:6543/does_not_exist',
      }),
    });
  });

  afterAll(async () => {
    await appPromise?.app.close();
  });

  it('responds on healthz', async () => {
    const response = await appPromise.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });

  it('runs a minimal round lifecycle over REST', async () => {
    const createRoom = await appPromise.app.inject({
      method: 'POST',
      url: '/api/v1/rooms',
      payload: { title: 'Demo Room', artistWallet: 'wallet_test_artist_1234567890' },
    });
    expect(createRoom.statusCode).toBe(200);
    const room = createRoom.json().room;

    const startRound = await appPromise.app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${room.id}/rounds/start`,
      payload: { bpm: 120 },
    });
    expect(startRound.statusCode).toBe(200);
    const round = startRound.json().round;

    const pattern = {
      version: 1,
      length: 16,
      bpm: 120,
      tracks: [
        { id: 'kick', steps: Array.from({ length: 16 }, (_, i) => ({ active: i === 0, velocity: 100 })) },
        { id: 'snare', steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 100 })) },
        { id: 'hat_closed', steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 100 })) },
        { id: 'hat_open', steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 100 })) },
        { id: 'clap', steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 100 })) },
      ],
    };
    const nonce = 'test_nonce';

    const { hashPatternCommitInput } = await import('@jamming/pattern-core');
    const commitHash = hashPatternCommitInput({ pattern, roundId: round.id, nonce });

    expect(
      (
        await appPromise.app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${room.id}/rounds/${round.id}/commit`,
          payload: { commitHash, patternVersion: 1 },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await appPromise.app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${room.id}/rounds/${round.id}/predictions`,
          payload: {
            userWallet: 'wallet_user_12345678901234567890',
            guess: { trackId: 'kick', stepIndex: 0, willBeActive: true },
          },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await appPromise.app.inject({
          method: 'POST',
          url: `/api/v1/rooms/${room.id}/rounds/${round.id}/lock`,
        })
      ).statusCode,
    ).toBe(200);

    const reveal = await appPromise.app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${room.id}/rounds/${round.id}/reveal`,
      payload: { pattern, nonce, commitInputVersion: 'v1' },
    });
    expect(reveal.statusCode).toBe(200);
    expect(reveal.json().commitVerified).toBe(true);

    const settle = await appPromise.app.inject({
      method: 'POST',
      url: `/api/v1/rooms/${room.id}/rounds/${round.id}/settle`,
    });
    expect(settle.statusCode).toBe(200);
    expect(settle.json().settlement.winningPredictions).toBe(1);
  });
});

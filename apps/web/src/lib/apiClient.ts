import type {
  CommitRequest,
  CommitResponse,
  CreateRoomRequest,
  IntegrationStatusResponse,
  PredictionBatchRequest,
  PredictionBatchResponse,
  PredictionRequest,
  PredictionResponse,
  RevealRequest,
  RevealResponse,
  ResultsResponse,
  RoomResponse,
  SettleResponse,
  StartRoundRequest,
  StartRoundResponse,
} from '@jamming/shared-types';
import { webEnv } from './env';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${webEnv.apiBaseUrl}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

async function requestAbsoluteJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function apiRootUrl(): string {
  return webEnv.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
}

export const apiClient = {
  createRoom(input: CreateRoomRequest) {
    return requestJson<RoomResponse>('/rooms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  getRoom(roomId: string) {
    return requestJson<RoomResponse>(`/rooms/${roomId}`);
  },
  getRoomByCode(code: string) {
    return requestJson<RoomResponse>(`/rooms/code/${encodeURIComponent(code)}`);
  },
  startRound(roomId: string, input: StartRoundRequest) {
    return requestJson<StartRoundResponse>(`/rooms/${roomId}/rounds/start`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  commit(roomId: string, roundId: string, input: CommitRequest) {
    return requestJson<CommitResponse>(`/rooms/${roomId}/rounds/${roundId}/commit`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  predict(roomId: string, roundId: string, input: PredictionRequest) {
    return requestJson<PredictionResponse>(`/rooms/${roomId}/rounds/${roundId}/predictions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  predictBatch(roomId: string, roundId: string, input: PredictionBatchRequest) {
    return requestJson<PredictionBatchResponse>(`/rooms/${roomId}/rounds/${roundId}/predictions/batch`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  lock(roomId: string, roundId: string) {
    return requestJson<{ round: CommitResponse['round'] }>(`/rooms/${roomId}/rounds/${roundId}/lock`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  reveal(roomId: string, roundId: string, input: RevealRequest) {
    return requestJson<RevealResponse>(`/rooms/${roomId}/rounds/${roundId}/reveal`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  settle(roomId: string, roundId: string) {
    return requestJson<SettleResponse>(`/rooms/${roomId}/rounds/${roundId}/settle`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  results(roomId: string, roundId: string) {
    return requestJson<ResultsResponse>(`/rooms/${roomId}/rounds/${roundId}/results`);
  },
  blinkJoin(roomId: string) {
    return requestAbsoluteJson<Record<string, unknown>>(
      `${apiRootUrl()}/actions/join?roomId=${encodeURIComponent(roomId)}`,
    );
  },
  blinkPredict(roomId: string, roundId: string) {
    return requestAbsoluteJson<Record<string, unknown>>(
      `${apiRootUrl()}/actions/predict?roomId=${encodeURIComponent(roomId)}&roundId=${encodeURIComponent(roundId)}`,
    );
  },
  blinkClaim(roomId: string, roundId: string, userWallet?: string) {
    const url = new URL(`${apiRootUrl()}/actions/claim`);
    url.searchParams.set('roomId', roomId);
    url.searchParams.set('roundId', roundId);
    if (userWallet) {
      url.searchParams.set('userWallet', userWallet);
    }
    return requestAbsoluteJson<Record<string, unknown>>(url.toString());
  },
  claimReward(roomId: string, roundId: string, userWallet: string) {
    return requestAbsoluteJson<{ ok: boolean; result: { ok: boolean; reference?: string } }>(
      `${apiRootUrl()}/actions/claim`,
      {
        method: 'POST',
        body: JSON.stringify({ roomId, roundId, userWallet }),
      },
    );
  },
  integrationStatus() {
    return requestJson<IntegrationStatusResponse>('/integrations/status');
  },
  health() {
    return fetch(webEnv.apiBaseUrl.replace(/\/api\/v1\/?$/, '/healthz')).then(
      async (response) =>
        (await response.json()) as {
          ok: boolean;
          dbReady: boolean;
          featureFlags: Record<string, boolean>;
          integrations?: Record<
            string,
            {
              provider?: string;
              enabled?: boolean;
              ready?: boolean;
              mode?: string;
              details?: string;
              lastReference?: string;
              lastError?: string;
            }
          >;
        },
    );
  },
};

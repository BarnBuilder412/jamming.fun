import { sdk } from '@audius/sdk';
import type { AudiusAdapter, AudiusAdapterConfig, IntegrationLogger, IntegrationStatus } from './types.js';

function baseStatus(config: AudiusAdapterConfig, mode: IntegrationStatus['mode'], ready: boolean, details: string) {
  return {
    provider: 'audius' as const,
    enabled: config.enabled,
    mode,
    ready,
    details,
  };
}

type AudiusUserLike = {
  handle?: unknown;
  name?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

type MinimalAudiusClient = {
  users: {
    getUserByHandle(input: { handle: string }): Promise<unknown>;
  };
};

export function createAudiusSdkAdapter(config: AudiusAdapterConfig, logger?: IntegrationLogger): AudiusAdapter {
  let client: MinimalAudiusClient | null = null;
  let lastReference: string | undefined;
  let lastError: string | undefined;

  const hasCreds = Boolean(config.bearerToken || config.apiSecret || config.apiKey);
  const publishWriteEnabled = config.writeMode === 'signed' && Boolean(config.bearerToken || config.apiSecret);

  const getStatus = (): IntegrationStatus => {
    if (!config.enabled) {
      return { ...baseStatus(config, 'disabled', false, 'Disabled by feature flag') };
    }

    const mode: IntegrationStatus['mode'] = publishWriteEnabled ? 'real' : 'degraded';
    const details = publishWriteEnabled
      ? 'Audius SDK configured (resolve + signed mode available)'
      : `Audius SDK configured (${hasCreds ? 'resolve real' : 'appName mode'} / publish in read-only mode)`;

    return {
      ...baseStatus(config, mode, true, details),
      ...(lastReference ? { lastReference } : {}),
      ...(lastError ? { lastError } : {}),
    };
  };

  const getClient = (): MinimalAudiusClient => {
    if (client) {
      return client;
    }

    if (config.bearerToken) {
      client = sdk({
        apiKey: config.apiKey ?? 'jamming.fun',
        bearerToken: config.bearerToken,
      });
      return client;
    }

    if (config.apiSecret) {
      client = sdk({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
      });
      return client;
    }

    if (config.apiKey) {
      client = sdk({
        apiKey: config.apiKey,
      });
      return client;
    }

    client = sdk({
      appName: config.appName,
    });
    return client;
  };

  return {
    getStatus,
    async resolveArtist(input) {
      if (!config.enabled) {
        lastError = 'Feature flag disabled';
        return { ok: false };
      }

      const handle = input.handle?.trim();
      if (!handle) {
        lastError = 'No Audius handle provided';
        return { ok: false };
      }

      try {
        const response = await getClient().users.getUserByHandle({ handle });
        const data = (response as { data?: AudiusUserLike } | undefined)?.data;
        const resolvedHandle = asString(data?.handle) ?? handle;
        const artistName = asString(data?.name) ?? resolvedHandle;
        const profileUrl = `https://audius.co/${encodeURIComponent(resolvedHandle)}`;
        lastError = undefined;
        lastReference = profileUrl;
        return {
          ok: true,
          artistName,
          audiusHandle: resolvedHandle,
          profileUrl,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Audius resolve failed';
        lastError = message;
        logger?.warn?.({ err: error, handle }, 'Audius resolveArtist failed');
        return { ok: false };
      }
    },
    async publishSessionMetadata(input) {
      if (!config.enabled) {
        lastError = 'Feature flag disabled';
        return { ok: false };
      }

      // V1 demo-safe path: no user-delegated write credentials are guaranteed.
      // We return an explicit read-only Audius reference marker while still using the real SDK for artist resolution.
      if (!publishWriteEnabled) {
        const ref = `audius:read-only:${input.roomId}:${input.roundId ?? 'none'}`;
        lastReference = ref;
        lastError = undefined;
        return { ok: true, reference: ref };
      }

      try {
        const artistHandle = asString(input.metadata.artistHandle) ?? 'Audius';
        // Keep the authenticated path lightweight and deterministic for demo stability.
        // This validates credentials by making a signed read request; a full metadata write can be added
        // later once account-level auth flow is finalized.
        await getClient().users.getUserByHandle({
          handle: artistHandle,
        });
        const ref = `audius:signed-session:${input.roomId}:${input.roundId ?? 'none'}:${Date.now()}`;
        lastReference = ref;
        lastError = undefined;
        return { ok: true, reference: ref };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Audius publish failed';
        lastError = message;
        logger?.warn?.({ err: error, roomId: input.roomId, roundId: input.roundId }, 'Audius publishSessionMetadata failed');
        return { ok: false };
      }
    },
  };
}

import type { ActionGetResponse, ActionPostResponse } from '@solana/actions';
import {
  createActionHeaders,
  createPostResponse,
  type ActionPostRequest,
  MEMO_PROGRAM_ID,
} from '@solana/actions';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type {
  AudiusAdapter,
  BlinksAdapter,
  BlinksAdapterConfig,
  IntegrationFlags,
  IntegrationStatus,
  MagicBlockAdapter,
} from './types.js';

const EMPTY_ICON_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect width="400" height="400" rx="32" fill="#121212"/>
      <rect x="32" y="64" width="336" height="272" rx="20" fill="#1d1d1d" stroke="#2f2f2f"/>
      <g fill="#ffb300">
        <rect x="64" y="120" width="48" height="48" rx="8"/>
        <rect x="128" y="120" width="48" height="48" rx="8" opacity="0.35"/>
        <rect x="192" y="120" width="48" height="48" rx="8"/>
        <rect x="256" y="120" width="48" height="48" rx="8" opacity="0.35"/>
        <rect x="96" y="192" width="48" height="48" rx="8"/>
        <rect x="160" y="192" width="48" height="48" rx="8" opacity="0.35"/>
        <rect x="224" y="192" width="48" height="48" rx="8"/>
      </g>
      <text x="200" y="310" fill="#f2f2f2" font-size="30" text-anchor="middle" font-family="monospace">JAM</text>
    </svg>`,
  );

function baseStatus(
  provider: IntegrationStatus['provider'],
  enabled: boolean,
  mode: IntegrationStatus['mode'],
  ready: boolean,
  details: string,
): IntegrationStatus {
  return { provider, enabled, mode, ready, details };
}

export function createNoopMagicBlockAdapter(flags: IntegrationFlags): MagicBlockAdapter {
  let lastReference: string | undefined;
  let lastError: string | undefined;

  const status = (): IntegrationStatus => ({
    ...baseStatus(
      'magicblock',
      flags.enableMagicBlock,
      flags.enableMagicBlock ? 'mock' : 'disabled',
      flags.enableMagicBlock,
      flags.enableMagicBlock ? 'Mock MagicBlock adapter (no SOAR credentials configured)' : 'Disabled by feature flag',
    ),
    ...(lastReference ? { lastReference } : {}),
    ...(lastError ? { lastError } : {}),
  });

  return {
    getStatus: status,
    recordRoundSettlement(input) {
      if (!flags.enableMagicBlock) {
        lastError = 'Feature flag disabled';
        return Promise.resolve({ ok: false });
      }
      lastReference = `mock:magicblock:settlement:${input.roundId}`;
      lastError = undefined;
      return Promise.resolve({ ok: true, reference: lastReference });
    },
    claimReward(input) {
      if (!flags.enableMagicBlock) {
        lastError = 'Feature flag disabled';
        return Promise.resolve({ ok: false });
      }
      lastReference = `mock:magicblock:claim:${input.roundId}:${input.userWallet}`;
      lastError = undefined;
      return Promise.resolve({ ok: true, reference: lastReference });
    },
  };
}

export function createNoopAudiusAdapter(flags: IntegrationFlags): AudiusAdapter {
  let lastReference: string | undefined;
  let lastError: string | undefined;
  return {
    getStatus() {
      return {
        ...baseStatus(
          'audius',
          flags.enableAudius,
          flags.enableAudius ? 'mock' : 'disabled',
          flags.enableAudius,
          flags.enableAudius ? 'Mock Audius adapter (SDK not configured)' : 'Disabled by feature flag',
        ),
        ...(lastReference ? { lastReference } : {}),
        ...(lastError ? { lastError } : {}),
      };
    },
    resolveArtist(input) {
      if (!flags.enableAudius) {
        lastError = 'Feature flag disabled';
        return Promise.resolve({ ok: false });
      }
      const handle = input.handle ?? 'Audius';
      return Promise.resolve({
        ok: true,
        artistName: handle,
        audiusHandle: handle,
        profileUrl: `https://audius.co/${encodeURIComponent(handle)}`,
      });
    },
    publishSessionMetadata(input) {
      if (!flags.enableAudius) {
        lastError = 'Feature flag disabled';
        return Promise.resolve({ ok: false });
      }
      lastReference = `mock:audius:session:${input.roomId}:${input.roundId ?? 'none'}`;
      return Promise.resolve({ ok: true, reference: lastReference });
    },
  };
}

function createBaseAction(
  label: string,
  title: string,
  description: string,
  href: string,
): ActionGetResponse {
  return {
    icon: EMPTY_ICON_DATA_URI,
    title,
    description,
    label,
    links: {
      actions: [{ type: 'transaction', href, label }],
    },
  };
}

export function createNoopBlinksAdapter(flags: IntegrationFlags, config: BlinksAdapterConfig): BlinksAdapter {
  const connection = new Connection(config.solanaRpcUrl, 'confirmed');
  let lastReference: string | undefined;
  let lastError: string | undefined;

  const getStatus = (): IntegrationStatus => ({
    ...baseStatus(
      'blinks',
      flags.enableBlinks,
      flags.enableBlinks ? 'mock' : 'disabled',
      flags.enableBlinks,
      flags.enableBlinks ? 'Mock Actions payloads with real signable memo transactions' : 'Disabled by feature flag',
    ),
    ...(lastReference ? { lastReference } : {}),
    ...(lastError ? { lastError } : {}),
  });

  const buildMemoTx = async (account: string, memo: string, message: string): Promise<ActionPostResponse> => {
    const feePayer = new PublicKey(account);
    const latest = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    });
    tx.add(
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        keys: [{ pubkey: feePayer, isSigner: true, isWritable: false }],
        data: Buffer.from(memo, 'utf8'),
      }),
    );
    const response = await createPostResponse({
      fields: {
        type: 'transaction',
        transaction: tx,
        message,
      },
    });
    lastReference = `blink:memo:${Date.now()}`;
    lastError = undefined;
    return response;
  };

  return {
    getStatus,
    getCorsHeaders() {
      return createActionHeaders({ chainId: config.cluster });
    },
    buildJoinAction(input) {
      return Promise.resolve({
        ...createBaseAction(
          'Join Room',
          'Join jamming.fun room',
          `Sign a lightweight Solana memo proving you joined room ${input.roomId}.`,
          `/actions/join?roomId=${encodeURIComponent(input.roomId)}`,
        ),
        icon: input.iconUrl ?? EMPTY_ICON_DATA_URI,
      });
    },
    buildPredictAction(input) {
      return Promise.resolve({
        icon: input.iconUrl ?? EMPTY_ICON_DATA_URI,
        title: 'Submit Prediction (Blink)',
        description: `Submit a prediction for round ${input.roundId} and sign a memo proof.`,
        label: 'Predict',
        links: {
          actions: [
            {
              type: 'transaction',
              href: `/actions/predict?roomId=${encodeURIComponent(input.roomId)}&roundId=${encodeURIComponent(input.roundId)}`,
              label: 'Predict',
              parameters: [
                {
                  name: 'trackId',
                  label: 'Track',
                  type: 'select',
                  required: true,
                  options: [
                    { label: 'kick', value: 'kick', selected: true },
                    { label: 'snare', value: 'snare' },
                    { label: 'hat_closed', value: 'hat_closed' },
                    { label: 'hat_open', value: 'hat_open' },
                    { label: 'clap', value: 'clap' },
                  ],
                },
                { name: 'stepIndex', label: 'Step (0-15)', type: 'number', min: 0, max: 15, required: true },
                {
                  name: 'willBeActive',
                  label: 'Will be active?',
                  type: 'select',
                  required: true,
                  options: [
                    { label: 'true', value: 'true', selected: true },
                    { label: 'false', value: 'false' },
                  ],
                },
              ],
            },
          ],
        },
      });
    },
    buildClaimAction(input) {
      return Promise.resolve({
        ...createBaseAction(
          'Claim Reward',
          'Claim track token reward',
          `Sign a claim memo for room ${input.roomId} round ${input.roundId}.`,
          `/actions/claim?roomId=${encodeURIComponent(input.roomId)}&roundId=${encodeURIComponent(input.roundId)}${
            input.userWallet ? `&userWallet=${encodeURIComponent(input.userWallet)}` : ''
          }`,
        ),
        icon: input.iconUrl ?? EMPTY_ICON_DATA_URI,
      });
    },
    async buildJoinPostResponse(input) {
      return buildMemoTx(input.account, `jamming.fun|join|${input.roomId}|${input.account}`, 'Sign to join room');
    },
    async buildPredictPostResponse(input) {
      const data = input.params ?? {};
      const trackId = typeof data.trackId === 'string' ? data.trackId : 'kick';
      const stepIndex = typeof data.stepIndex === 'string' ? data.stepIndex : '0';
      const willBeActive = typeof data.willBeActive === 'string' ? data.willBeActive : 'true';
      return buildMemoTx(
        input.account,
        `jamming.fun|predict|${input.roomId}|${input.roundId}|${trackId}|${stepIndex}|${willBeActive}|${input.account}`,
        'Sign prediction proof',
      );
    },
    async buildClaimPostResponse(input) {
      return buildMemoTx(
        input.account,
        `jamming.fun|claim|${input.roomId}|${input.roundId}|${input.userWallet ?? input.account}|${input.account}`,
        'Sign claim proof',
      );
    },
  };
}

export type LegacyClaimActionPostBody = {
  roomId: string;
  roundId: string;
  userWallet: string;
};

export type SpecActionPostBody = ActionPostRequest<{
  trackId: string;
  stepIndex: string;
  willBeActive: string;
}>;

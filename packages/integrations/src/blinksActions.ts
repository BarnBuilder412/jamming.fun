import {
  createActionHeaders,
  createPostResponse,
  MEMO_PROGRAM_ID,
  type ActionPostResponse,
} from '@solana/actions';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import type {
  BlinksAdapter,
  BlinksAdapterConfig,
  IntegrationLogger,
  IntegrationStatus,
} from './types.js';

const DEFAULT_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1d1d1d"/>
          <stop offset="100%" stop-color="#0f0f0f"/>
        </linearGradient>
      </defs>
      <rect width="400" height="400" rx="28" fill="url(#g)"/>
      <rect x="28" y="70" width="344" height="260" rx="18" fill="#171717" stroke="#353535"/>
      <g fill="#ffb300">
        <rect x="62" y="114" width="40" height="40" rx="6"/>
        <rect x="114" y="114" width="40" height="40" rx="6" opacity="0.32"/>
        <rect x="166" y="114" width="40" height="40" rx="6"/>
        <rect x="218" y="114" width="40" height="40" rx="6" opacity="0.32"/>
        <rect x="270" y="114" width="40" height="40" rx="6"/>
        <rect x="88" y="170" width="40" height="40" rx="6" opacity="0.32"/>
        <rect x="140" y="170" width="40" height="40" rx="6"/>
        <rect x="192" y="170" width="40" height="40" rx="6" opacity="0.32"/>
        <rect x="244" y="170" width="40" height="40" rx="6"/>
        <rect x="296" y="170" width="40" height="40" rx="6" opacity="0.32"/>
      </g>
      <text x="200" y="288" text-anchor="middle" fill="#f6f6f6" font-size="28" font-family="monospace">JAM BLINK</text>
    </svg>`,
  );

function actionIcon(iconUrl?: string): string {
  return iconUrl ?? DEFAULT_ICON;
}

function predictHref(roomId: string, roundId: string): string {
  return `/actions/predict?roomId=${encodeURIComponent(roomId)}&roundId=${encodeURIComponent(roundId)}`;
}

export function createBlinksActionsAdapter(
  config: BlinksAdapterConfig,
  _logger?: IntegrationLogger,
): BlinksAdapter {
  const connection = new Connection(config.solanaRpcUrl, 'confirmed');
  let lastReference: string | undefined;
  let lastError: string | undefined;

  const status = (): IntegrationStatus => ({
    provider: 'blinks',
    enabled: config.enabled,
    ready: config.enabled,
    mode: config.enabled ? 'real' : 'disabled',
    details: config.enabled
      ? 'Solana Actions/Blinks endpoints enabled (memo tx sign flow on selected cluster)'
      : 'Disabled by feature flag',
    ...(lastReference ? { lastReference } : {}),
    ...(lastError ? { lastError } : {}),
  });

  const buildMemoActionPostResponse = async (
    account: string,
    memo: string,
    message: string,
  ): Promise<ActionPostResponse> => {
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
    lastReference = `blink:${Date.now()}`;
    lastError = undefined;
    return response;
  };

  return {
    getStatus: status,
    getCorsHeaders() {
      return createActionHeaders({ chainId: config.cluster });
    },
    buildJoinAction(input) {
      return Promise.resolve({
        icon: actionIcon(input.iconUrl),
        title: 'Join jamming.fun Room',
        description: `Join room ${input.roomId} by signing a lightweight Solana memo proof.`,
        label: 'Join',
        links: {
          actions: [
            {
              type: 'transaction',
              href: `/actions/join?roomId=${encodeURIComponent(input.roomId)}`,
              label: 'Join Room',
            },
          ],
        },
      });
    },
    buildPredictAction(input) {
      return Promise.resolve({
        icon: actionIcon(input.iconUrl),
        title: 'Predict Next Beat Segment',
        description: `Submit a prediction for round ${input.roundId} and sign a Blink transaction proof.`,
        label: 'Predict',
        links: {
          actions: [
            {
              type: 'transaction',
              href: predictHref(input.roomId, input.roundId),
              label: 'Submit Prediction',
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
                { name: 'stepIndex', label: 'Step Index', type: 'number', min: 0, max: 15, required: true },
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
      const query = new URLSearchParams({
        roomId: input.roomId,
        roundId: input.roundId,
      });
      if (input.userWallet) {
        query.set('userWallet', input.userWallet);
      }
      return Promise.resolve({
        icon: actionIcon(input.iconUrl),
        title: 'Claim Prediction Reward',
        description: `Claim reward units for round ${input.roundId}. The claim transaction is a memo proof tied to this game action.`,
        label: 'Claim',
        links: {
          actions: [
            {
              type: 'transaction',
              href: `/actions/claim?${query.toString()}`,
              label: 'Claim Reward',
            },
          ],
        },
      });
    },
    async buildJoinPostResponse(input) {
      return buildMemoActionPostResponse(
        input.account,
        `jamming.fun|blink-join|${input.roomId}|${input.account}`,
        'Sign to join room',
      );
    },
    async buildPredictPostResponse(input) {
      const trackId = typeof input.params?.trackId === 'string' ? input.params.trackId : 'kick';
      const stepIndex = typeof input.params?.stepIndex === 'string' ? input.params.stepIndex : '0';
      const willBeActive = typeof input.params?.willBeActive === 'string' ? input.params.willBeActive : 'true';

      return buildMemoActionPostResponse(
        input.account,
        `jamming.fun|blink-predict|${input.roomId}|${input.roundId}|${trackId}|${stepIndex}|${willBeActive}|${input.account}`,
        'Sign prediction proof',
      );
    },
    async buildClaimPostResponse(input) {
      const subject = input.userWallet ?? input.account;
      return buildMemoActionPostResponse(
        input.account,
        `jamming.fun|blink-claim|${input.roomId}|${input.roundId}|${subject}|${input.account}`,
        'Sign reward claim proof',
      );
    },
  };
}

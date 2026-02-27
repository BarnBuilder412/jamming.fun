import { useCallback, useEffect, useMemo, useState } from 'react';

type WalletPublicKey = {
  toBase58(): string;
};

type WalletConnectResult = {
  publicKey?: WalletPublicKey;
};

type InjectedSolanaProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: WalletPublicKey;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<WalletConnectResult>;
  disconnect?(): Promise<void>;
  on?(event: 'connect' | 'disconnect' | 'accountChanged', listener: (next?: WalletPublicKey | null) => void): void;
  off?(event: 'connect' | 'disconnect' | 'accountChanged', listener: (next?: WalletPublicKey | null) => void): void;
};

export type WalletStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

function getProvider(): InjectedSolanaProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const maybeProvider = (window as Window & { solana?: InjectedSolanaProvider }).solana;
  return maybeProvider ?? null;
}

export function useSolanaWallet() {
  const [status, setStatus] = useState<WalletStatus>(() => (getProvider() ? 'disconnected' : 'unsupported'));
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = getProvider();
    if (!provider) {
      setStatus('unsupported');
      return;
    }

    const handleConnect = (next?: WalletPublicKey | null) => {
      const key = next?.toBase58?.() ?? provider.publicKey?.toBase58?.() ?? null;
      setPublicKey(key);
      setStatus(key ? 'connected' : 'disconnected');
      setError(null);
    };

    const handleDisconnect = () => {
      setPublicKey(null);
      setStatus('disconnected');
    };

    provider.on?.('connect', handleConnect);
    provider.on?.('accountChanged', handleConnect);
    provider.on?.('disconnect', handleDisconnect);

    if (provider.isConnected && provider.publicKey) {
      setPublicKey(provider.publicKey.toBase58());
      setStatus('connected');
    } else {
      setStatus('disconnected');
    }

    return () => {
      provider.off?.('connect', handleConnect);
      provider.off?.('accountChanged', handleConnect);
      provider.off?.('disconnect', handleDisconnect);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setStatus('unsupported');
      setError('No injected Solana wallet found. Install Phantom or Solflare.');
      return;
    }

    setStatus('connecting');
    setError(null);
    try {
      const result = await provider.connect();
      const key = result.publicKey?.toBase58?.() ?? provider.publicKey?.toBase58?.() ?? null;
      setPublicKey(key);
      setStatus(key ? 'connected' : 'disconnected');
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Wallet connection failed');
    }
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getProvider();
    if (!provider?.disconnect) {
      setPublicKey(null);
      setStatus(provider ? 'disconnected' : 'unsupported');
      return;
    }

    try {
      await provider.disconnect();
      setPublicKey(null);
      setStatus('disconnected');
      setError(null);
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Wallet disconnect failed');
    }
  }, []);

  return useMemo(
    () => ({
      status,
      publicKey,
      error,
      connected: status === 'connected' && Boolean(publicKey),
      connect,
      disconnect,
    }),
    [connect, disconnect, error, publicKey, status],
  );
}

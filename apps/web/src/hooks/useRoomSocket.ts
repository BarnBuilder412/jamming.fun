import { useEffect, useRef, useState } from 'react';
import type { WsEventEnvelope } from '@jamming/shared-types';
import { connectRoomSocket } from '../lib/wsClient';
import { webEnv } from '../lib/env';

type SocketStatus = 'idle' | 'open' | 'closed' | 'error' | 'invalid-message';

export function useRoomSocket(roomId: string | null, onEvent: (event: WsEventEnvelope) => void) {
  const [status, setStatus] = useState<SocketStatus>('idle');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!roomId) {
      setStatus('idle');
      return;
    }

    const client = connectRoomSocket(
      webEnv.wsUrl,
      (event) => onEventRef.current(event),
      (nextStatus) => setStatus(nextStatus as SocketStatus),
    );
    client.send({ type: 'room.subscribe', payload: { roomId } });

    return () => {
      client.send({ type: 'room.unsubscribe', payload: { roomId } });
      client.close();
    };
  }, [roomId]);

  return status;
}

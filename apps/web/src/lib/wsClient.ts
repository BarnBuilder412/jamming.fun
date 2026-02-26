import type { WsClientMessage, WsEventEnvelope } from '@jamming/shared-types';

export type RoomSocketClient = {
  close(): void;
  send(message: WsClientMessage): void;
};

export function connectRoomSocket(url: string, onEvent: (event: WsEventEnvelope) => void, onStatus: (status: string) => void): RoomSocketClient {
  const socket = new WebSocket(url);

  socket.addEventListener('open', () => onStatus('open'));
  socket.addEventListener('close', () => onStatus('closed'));
  socket.addEventListener('error', () => onStatus('error'));
  socket.addEventListener('message', (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as WsEventEnvelope;
      if (parsed && typeof parsed.type === 'string') {
        onEvent(parsed);
      }
    } catch {
      onStatus('invalid-message');
    }
  });

  return {
    close() {
      socket.close();
    },
    send(message) {
      const payload = JSON.stringify(message);
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener(
          'open',
          () => {
            socket.send(payload);
          },
          { once: true },
        );
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    },
  };
}

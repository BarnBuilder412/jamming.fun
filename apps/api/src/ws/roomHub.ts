import type { WsEventEnvelope, WsEventType } from '@jamming/shared-types';

export type SocketLike = {
  send(data: string): void;
  readyState?: number;
};

export class RoomHub {
  private readonly roomSockets = new Map<string, Set<SocketLike>>();
  private readonly socketRooms = new Map<SocketLike, Set<string>>();

  subscribe(roomId: string, socket: SocketLike): void {
    const roomSet = this.roomSockets.get(roomId) ?? new Set<SocketLike>();
    roomSet.add(socket);
    this.roomSockets.set(roomId, roomSet);

    const socketSet = this.socketRooms.get(socket) ?? new Set<string>();
    socketSet.add(roomId);
    this.socketRooms.set(socket, socketSet);
  }

  unsubscribe(roomId: string, socket: SocketLike): void {
    this.roomSockets.get(roomId)?.delete(socket);
    if (this.roomSockets.get(roomId)?.size === 0) {
      this.roomSockets.delete(roomId);
    }

    const socketSet = this.socketRooms.get(socket);
    socketSet?.delete(roomId);
    if (socketSet?.size === 0) {
      this.socketRooms.delete(socket);
    }
  }

  unsubscribeAll(socket: SocketLike): void {
    const rooms = this.socketRooms.get(socket);
    if (!rooms) {
      return;
    }

    for (const roomId of rooms) {
      this.roomSockets.get(roomId)?.delete(socket);
      if (this.roomSockets.get(roomId)?.size === 0) {
        this.roomSockets.delete(roomId);
      }
    }

    this.socketRooms.delete(socket);
  }

  emit<TType extends WsEventType>(roomId: string, type: TType, payload: WsEventEnvelope['payload']): void {
    const envelope: WsEventEnvelope = { type, payload } as WsEventEnvelope;
    const data = JSON.stringify(envelope);
    for (const socket of this.roomSockets.get(roomId) ?? []) {
      if (socket.readyState !== undefined && socket.readyState > 1) {
        continue;
      }
      try {
        socket.send(data);
      } catch {
        // best-effort fanout for demo runtime
      }
    }
  }
}

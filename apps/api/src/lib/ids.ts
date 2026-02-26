import { randomUUID } from 'node:crypto';

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function generateRoomCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

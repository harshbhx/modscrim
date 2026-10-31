import { z } from 'zod';
import { ClientMsgZ } from '@mfd/core';
import type { ClientMsg, Role, ServerMsg } from '@mfd/core';

export const WS_PING_MS = 20_000;
export const WS_DEAD_MS = 45_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
const ServerEnvelopeZ = z.object({ type: z.string().min(1), data: z.unknown() });
const SERVER_TYPES = new Set([
  'hello', 'drill.state', 'drill.started', 'drill.line', 'drill.action', 'drill.slipped', 'drill.score',
  'drill.ended', 'action.rejected', 'participants', 'grade.progress', 'grade.done', 'push.result',
  'report.ready', 'chat.stats', 'vote.update', 'error'
]);

export type RoomSocketOptions = {
  role: Role;
  getUrl: () => Promise<string>;
  onMessage: (message: ServerMsg) => void;
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void;
  onError?: (error: Error) => void;
};
export type RoomSocket = { send: (message: ClientMsg) => boolean; close: () => void };

export function parseServerMsg(raw: string): ServerMsg | null {
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return null; }
  const parsed = ServerEnvelopeZ.safeParse(value);
  if (!parsed.success || !SERVER_TYPES.has(parsed.data.type)) return null;
  return parsed.data as ServerMsg;
}

export function connectRoom(options: RoomSocketOptions): RoomSocket {
  let closed = false;
  let active: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let deadTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let lastMessageAt = Date.now();

  const clearSocketTimers = (): void => {
    if (pingTimer !== null) clearInterval(pingTimer);
    if (deadTimer !== null) clearTimeout(deadTimer);
    pingTimer = null;
    deadTimer = null;
  };
  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer !== null) return;
    options.onStatus?.('closed');
    const base = RECONNECT_DELAYS_MS[Math.min(attempts, RECONNECT_DELAYS_MS.length - 1)] ?? 15_000;
    attempts += 1;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void open(); }, base + Math.floor(Math.random() * base * 0.3));
  };
  const open = async (): Promise<void> => {
    if (closed) return;
    options.onStatus?.('connecting');
    try {
      const url = await options.getUrl();
      if (closed) return;
      const socket = new WebSocket(url);
      active = socket;
      socket.addEventListener('open', () => {
        if (active !== socket || closed) return;
        lastMessageAt = Date.now();
        clearSocketTimers();
        pingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, WS_PING_MS);
        const checkAlive = (): void => {
          if (active !== socket || closed) return;
          const silence = Date.now() - lastMessageAt;
          if (silence >= WS_DEAD_MS) socket.close(4000, 'heartbeat timeout');
          else deadTimer = setTimeout(checkAlive, WS_DEAD_MS - silence);
        };
        deadTimer = setTimeout(checkAlive, WS_DEAD_MS);
        options.onStatus?.('open');
      });
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (active !== socket || closed || typeof event.data !== 'string') return;
        lastMessageAt = Date.now();
        if (deadTimer !== null) clearTimeout(deadTimer);
        deadTimer = setTimeout(() => { if (Date.now() - lastMessageAt >= WS_DEAD_MS) socket.close(4000, 'heartbeat timeout'); }, WS_DEAD_MS);
        const message = parseServerMsg(event.data);
        if (message) options.onMessage(message);
      });
      socket.addEventListener('close', () => {
        if (active !== socket) return;
        clearSocketTimers();
        active = null;
        scheduleReconnect();
      });
      socket.addEventListener('error', () => {
        options.onError?.(new Error('WebSocket connection failed.'));
        socket.close();
      });
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('WebSocket connection failed.'));
      scheduleReconnect();
    }
  };
  void open();
  return {
    send(message) {
      const parsed = ClientMsgZ.safeParse(message);
      if (!parsed.success || active?.readyState !== WebSocket.OPEN) return false;
      active.send(JSON.stringify(parsed.data));
      return true;
    },
    close() {
      closed = true;
      clearSocketTimers();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const socket = active;
      active = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'client closed');
    }
  };
}

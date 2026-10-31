import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ClientMsg, DrillSnapshot, Role, ServerMsg } from '@mfd/core';
import { fetchConsoleTicket, fetchModTicket } from './api.js';
import { connectRoom, type RoomSocket } from './ws.js';

export type RoomConnection = 'connecting' | 'open' | 'closed';
export type RoomState = {
  role: Role | null;
  connection: RoomConnection;
  snapshot: DrillSnapshot | null;
  lastMessage: ServerMsg | null;
  messages: ServerMsg[];
};
type RoomAction = { type: 'connection'; status: RoomConnection } | { type: 'message'; message: ServerMsg };
const initialState: RoomState = { role: null, connection: 'closed', snapshot: null, lastMessage: null, messages: [] };

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  if (action.type === 'connection') return { ...state, connection: action.status };
  const message = action.message;
  const messages = [...state.messages, message].slice(-100);
  if (message.type === 'hello') return { ...state, role: message.data.role, lastMessage: message, messages };
  if (message.type === 'drill.state') return { ...state, snapshot: message.data, lastMessage: message, messages };
  const snapshot = state.snapshot;
  if (!snapshot?.drill) return { ...state, lastMessage: message, messages };
  const drill = snapshot.drill;
  switch (message.type) {
    case 'drill.started':
      return { ...state, snapshot: { ...snapshot, drill: { ...drill, drillId: message.data.drillId, status: 'running', startedAt: message.data.startedAt, total: message.data.total } }, lastMessage: message, messages };
    case 'drill.line': {
      const line = { line: message.data.line, shownAt: message.data.shownAt, state: 'open' as const };
      const lines = drill.lines.filter((item) => item.line.lineId !== message.data.line.lineId);
      lines.push(line);
      return { ...state, snapshot: { ...snapshot, drill: { ...drill, lines } }, lastMessage: message, messages };
    }
    case 'drill.action':
      return { ...state, snapshot: { ...snapshot, drill: { ...drill, lines: drill.lines.map((line) => line.line.lineId === message.data.lineId ? { ...line, state: 'acted', actedByName: message.data.name, action: message.data.action } : line) } }, lastMessage: message, messages };
    case 'drill.slipped':
      return { ...state, snapshot: { ...snapshot, drill: { ...drill, lines: drill.lines.map((line) => line.line.lineId === message.data.lineId ? { ...line, state: 'slipped' } : line) } }, lastMessage: message, messages };
    case 'drill.score':
      return { ...state, snapshot: { ...snapshot, drill: { ...drill, score: message.data } }, lastMessage: message, messages };
    case 'drill.ended':
      return { ...state, snapshot: { ...snapshot, drill: { ...drill, status: 'ended', score: message.data.score, ...(message.data.reveal ? { reveal: message.data.reveal } : {}) } }, lastMessage: message, messages };
    case 'participants':
      return { ...state, snapshot: { ...snapshot, participants: message.data }, lastMessage: message, messages };
    default:
      return { ...state, lastMessage: message, messages };
  }
}

export type UseRoomOptions = {
  role: Role;
  apiBase?: string;
  enabled?: boolean;
  participantToken?: string;
  overlayKey?: string;
  channelId?: string;
};
function overlaySocketUrl(channelId: string, key: string): string {
  const url = new URL(`/ws/ch/${encodeURIComponent(channelId)}`, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('overlayKey', key);
  return url.toString();
}

export function useRoom(options: UseRoomOptions) {
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const socketRef = useRef<RoomSocket | null>(null);
  const apiBase = options.apiBase ?? '/api';
  const getUrl = useCallback(async (): Promise<string> => {
    if (options.role === 'overlay') {
      if (!options.channelId || !options.overlayKey) throw new Error('Overlay connection details are missing.');
      return overlaySocketUrl(options.channelId, options.overlayKey);
    }
    if (options.role === 'mod') {
      if (!options.participantToken) throw new Error('Moderator reconnect details are missing.');
      return (await fetchModTicket(options.participantToken, { apiBase })).wsUrl;
    }
    return (await fetchConsoleTicket({ apiBase })).wsUrl;
  }, [apiBase, options.channelId, options.overlayKey, options.participantToken, options.role]);
  useEffect(() => {
    if (options.enabled === false) return;
    const socket = connectRoom({
      role: options.role,
      getUrl,
      onMessage: (message) => dispatch({ type: 'message', message }),
      onStatus: (status) => dispatch({ type: 'connection', status })
    });
    socketRef.current = socket;
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [getUrl, options.enabled, options.role]);
  const send = useCallback((message: ClientMsg): boolean => socketRef.current?.send(message) ?? false, []);
  const sync = useCallback((): boolean => send({ type: 'sync' }), [send]);
  const act = useCallback((lineId: string, action: 'delete' | 'timeout' | 'ban'): boolean => send({ type: 'mod.action', data: { lineId, action } }), [send]);
  const knownLineIds = useMemo(() => new Set(state.snapshot?.drill?.lines.map((line) => line.line.lineId) ?? []), [state.snapshot]);
  useEffect(() => {
    const message = state.lastMessage;
    if (!message || (message.type !== 'drill.action' && message.type !== 'drill.slipped')) return;
    if (!knownLineIds.has(message.data.lineId)) sync();
  }, [knownLineIds, state.lastMessage, sync]);
  return { ...state, send, sync, act };
}

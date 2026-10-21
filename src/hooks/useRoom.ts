import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ws } from '@appdeploy/client';

export interface RoomPlayer {
  playerId: string;
  name: string;
  colour: string;
  rating: number;
  /** 0 or 1. In a duel it is just which seat; in a team match it is the side. */
  team: number;
  index: number;
  correct: number;
  finishedAt: number | null;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  colour: string;
  text: string;
  at: number;
}

export interface RoomState {
  id: string;
  code: string;
  seed: string;
  mode: 'duel' | 'team';
  puzzleIds: string[];
  players: RoomPlayer[];
  chat: ChatMessage[];
  status: 'waiting' | 'playing' | 'finished';
  winnerId: string | null;
  /** Set instead of winnerId when the match was played in teams. */
  winnerTeam: number | null;
  createdAt: number;
}

/**
 * Live room state. Loads once over HTTP, then keeps itself current from the
 * realtime channel — no polling.
 */
export function useRoom(roomId: string | undefined) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const connRef = useRef<ReturnType<typeof ws.connect> | null>(null);
  const subRef = useRef<{ entity_type: string; entity_id: string; connection_id: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await api.get(`/api/rooms/${roomId}`);
      setRoom(res.data?.room ?? null);
      setError(null);
    } catch {
      setError('That match could not be found. It may have expired.');
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    void refresh();

    const conn = ws.connect();
    connRef.current = conn;

    conn.onMessage((message: { type?: string; payload?: { entity_type?: string; entity_id?: string; data?: RoomState } }) => {
      if (message?.type !== 'entity.update') return;
      if (message.payload?.entity_type !== 'room' || message.payload?.entity_id !== roomId) return;
      if (message.payload.data) setRoom(message.payload.data);
    });

    conn.ready
      .then(async () => {
        const connection_id = conn.connectionId;
        if (!connection_id) return;
        subRef.current = { entity_type: 'room', entity_id: roomId, connection_id };
        await api.post('/api/subscriptions', subRef.current);
        setConnected(true);
      })
      .catch(() => setConnected(false));

    return () => {
      const sub = subRef.current;
      if (sub) void api.post('/api/subscriptions/remove', sub).catch(() => undefined);
      subRef.current = null;
      connRef.current?.disconnect();
      connRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return { room, error, connected, refresh, setRoom };
}

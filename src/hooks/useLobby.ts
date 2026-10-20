import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ws } from '@appdeploy/client';
import { useProfile } from '../lib/profile';

export interface LobbyPlayer {
  id: string;
  playerId: string;
  name: string;
  colour: string;
  rating: number;
  verified: boolean;
  activity: string;
  lat: number | null;
  lng: number | null;
  place: string;
  lastSeen: number;
}

export interface IncomingChallenge {
  fromPlayerId: string;
  fromName: string;
  roomId: string;
  code: string;
}

const HEARTBEAT_MS = 25_000;
const LOCATION_KEY = 'ulox.share-location.v1';

export function readLocationConsent(): boolean {
  try {
    return localStorage.getItem(LOCATION_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLocationConsent(value: boolean) {
  try {
    localStorage.setItem(LOCATION_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Keeps the player visible in the live lobby and streams everyone else's
 * presence in. Location is opt-in and deliberately coarse — one decimal place,
 * roughly an 11km square, enough for a world map and nothing more.
 */
export function useLobby(activity: string) {
  const profile = useProfile(s => s.profile);
  const account = useProfile(s => s.account);

  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [connected, setConnected] = useState(false);
  const [challenge, setChallenge] = useState<IncomingChallenge | null>(null);
  const [shareLocation, setShareLocation] = useState(readLocationConsent);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const connRef = useRef<ReturnType<typeof ws.connect> | null>(null);
  const subRef = useRef<{ entity_type: string; entity_id: string; connection_id: string } | null>(null);
  const activityRef = useRef(activity);
  const coordsRef = useRef(coords);
  const shareRef = useRef(shareLocation);

  activityRef.current = activity;
  coordsRef.current = coords;
  shareRef.current = shareLocation;

  const myId = account?.userId ? `user:${account.userId}` : profile.playerId;

  const ping = useCallback(async () => {
    try {
      const res = await api.post('/api/presence/ping', {
        playerId: profile.playerId,
        name: profile.name,
        colour: profile.colour,
        rating: profile.rating.rating,
        activity: activityRef.current,
        shareLocation: shareRef.current,
        lat: coordsRef.current?.lat ?? null,
        lng: coordsRef.current?.lng ?? null,
      });
      if (Array.isArray(res.data?.players)) setPlayers(res.data.players);
    } catch {
      /* the lobby is best-effort; the rest of the app does not depend on it */
    }
  }, [profile.playerId, profile.name, profile.colour, profile.rating.rating]);

  // Paint the lobby from a plain read first — it returns before the heartbeat
  // write does, so the list is on screen immediately rather than a beat later.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/presence')
      .then(res => {
        if (!cancelled && Array.isArray(res.data?.players)) setPlayers(res.data.players);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Heartbeat.
  useEffect(() => {
    void ping();
    const timer = window.setInterval(() => void ping(), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [ping]);

  // Realtime lobby channel.
  useEffect(() => {
    const conn = ws.connect();
    connRef.current = conn;

    conn.onMessage((message: { type?: string; payload?: { entity_type?: string; entity_id?: string; data?: Record<string, unknown> } }) => {
      if (message?.type !== 'entity.update') return;
      if (message.payload?.entity_type !== 'lobby') return;
      const data = message.payload.data as
        | { type?: string; players?: LobbyPlayer[]; toPlayerId?: string; fromPlayerId?: string; fromName?: string; roomId?: string; code?: string }
        | undefined;
      if (!data) return;

      if (data.type === 'presence' && Array.isArray(data.players)) {
        setPlayers(data.players);
        return;
      }
      if (data.type === 'challenge' && data.toPlayerId === myId && data.roomId) {
        setChallenge({
          fromPlayerId: String(data.fromPlayerId ?? ''),
          fromName: String(data.fromName ?? 'A player'),
          roomId: String(data.roomId),
          code: String(data.code ?? ''),
        });
      }
    });

    conn.ready
      .then(async () => {
        const connection_id = conn.connectionId;
        if (!connection_id) return;
        subRef.current = { entity_type: 'lobby', entity_id: 'global', connection_id };
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
  }, [myId]);

  // Leave the lobby cleanly when the tab closes.
  useEffect(() => {
    const bye = () => {
      void api.post('/api/presence/leave', { playerId: profile.playerId }).catch(() => undefined);
    };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [profile.playerId]);

  const enableLocation = useCallback(async () => {
    setLocationError(null);
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot report a location.');
      return false;
    }
    return new Promise<boolean>(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          // Round before it ever leaves the device.
          const lat = Math.round(position.coords.latitude * 10) / 10;
          const lng = Math.round(position.coords.longitude * 10) / 10;
          setCoords({ lat, lng });
          setShareLocation(true);
          writeLocationConsent(true);
          void ping();
          resolve(true);
        },
        err => {
          setLocationError(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. You will still appear in the online list.'
              : 'Could not get a location fix right now.'
          );
          resolve(false);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 }
      );
    });
  }, [ping]);

  const disableLocation = useCallback(() => {
    setShareLocation(false);
    setCoords(null);
    writeLocationConsent(false);
    void ping();
  }, [ping]);

  const sendChallenge = useCallback(
    async (toPlayerId: string) => {
      const res = await api.post('/api/challenges', {
        playerId: profile.playerId,
        name: profile.name,
        colour: profile.colour,
        rating: profile.rating.rating,
        toPlayerId,
      });
      return res.data?.room as { id: string; code: string };
    },
    [profile.playerId, profile.name, profile.colour, profile.rating.rating]
  );

  const others = players.filter(p => p.playerId !== myId);

  return {
    players,
    others,
    me: players.find(p => p.playerId === myId) ?? null,
    myId,
    connected,
    challenge,
    dismissChallenge: () => setChallenge(null),
    shareLocation,
    enableLocation,
    disableLocation,
    locationError,
    sendChallenge,
    refresh: ping,
  };
}

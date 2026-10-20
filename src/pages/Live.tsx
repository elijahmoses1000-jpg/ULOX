import { Suspense, lazy, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, Globe2, MapPin, MapPinOff, Radio, ShieldCheck, Swords, Users } from 'lucide-react';
import { useLobby } from '../hooks/useLobby';
import { useProfile } from '../lib/profile';
// Leaflet is ~150kB; nobody pays for it until they open the Live tab.
const WorldMap = lazy(() => import('../components/WorldMap').then(m => ({ default: m.WorldMap })));
import { Avatar, Card, Chip, Empty, Modal, useToast } from '../components/ui';

export function Live() {
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile(s => s.profile);
  const account = useProfile(s => s.account);
  const signIn = useProfile(s => s.signIn);
  const authBusy = useProfile(s => s.authBusy);

  const {
    players,
    others,
    myId,
    connected,
    challenge,
    dismissChallenge,
    shareLocation,
    enableLocation,
    disableLocation,
    locationError,
    sendChallenge,
  } = useLobby('Browsing the live lobby');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const points = useMemo(
    () =>
      players
        .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
        .map(p => ({
          id: p.playerId,
          lat: p.lat as number,
          lng: p.lng as number,
          label: p.playerId === myId ? `${p.name} (you)` : p.name,
          colour: p.colour || '#EE1B24',
          detail: `${p.rating} · ${p.activity}`,
          isSelf: p.playerId === myId,
        })),
    [players, myId]
  );

  const challengePlayer = async (playerId: string, name: string) => {
    setBusyId(playerId);
    try {
      const room = await sendChallenge(playerId);
      toast(`Challenge sent to ${name}. Taking you to the board.`, 'ok');
      navigate(`/arena/${room.id}`);
    } catch {
      toast(`${name} just went offline, or the match could not be created.`, 'err');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 lg:py-8 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Live</h1>
          <p className="text-sm text-chalk-dim mt-1">
            Everyone in UloX right now. Challenge anyone to a rated match — it starts the moment they accept.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-chalk-dim">
          <Radio size={13} className={connected ? 'text-eval-up' : 'text-eval-warn'} />
          {connected ? 'connected' : 'connecting…'}
          <Chip tone="brand" className="ml-1">
            {players.length} online
          </Chip>
        </span>
      </header>

      {!account && (
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <ShieldCheck size={18} className="text-brand shrink-0" />
          <p className="text-[13px] text-chalk-dim grow min-w-[220px]">
            You are playing as a guest. Sign in to get a verified badge, keep your rating on every device, and let people
            find you again.
          </p>
          <button
            className="btn-primary !text-xs"
            disabled={authBusy}
            onClick={async () => {
              const result = await signIn();
              toast(result.ok ? 'Signed in. Your progress now follows you.' : result.message ?? 'Sign-in failed.', result.ok ? 'ok' : 'err');
            }}
          >
            Sign in
          </button>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Globe2 size={16} className="text-brand" />
          <span className="label">Where everyone is</span>
          <div className="ml-auto flex items-center gap-2">
            {shareLocation ? (
              <button className="btn-ghost !text-xs" onClick={disableLocation}>
                <MapPinOff size={13} /> Stop sharing
              </button>
            ) : (
              <button className="btn-ghost !text-xs" onClick={() => setConsentOpen(true)}>
                <MapPin size={13} /> Share my location
              </button>
            )}
          </div>
        </div>

        <Suspense fallback={<div className="h-[320px] rounded-xl bg-ink-850 border border-ink-700 scan animate-shimmer" />}>
          <WorldMap points={points} />
        </Suspense>

        <p className="mt-2.5 text-[11.5px] text-chalk-faint leading-snug">
          Locations are rounded to one decimal place — roughly an 11&nbsp;km square — before they ever leave your device,
          and sharing is off until you turn it on.
        </p>
        {locationError && <p className="mt-1.5 text-[11.5px] text-eval-warn">{locationError}</p>}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-brand" />
          <span className="label">Online now</span>
        </div>

        {others.length === 0 ? (
          <Empty
            title="You are the only one here right now"
            hint="Share a match code from the Arena, or come back later — matches also work fine with a direct link."
            action={
              <Link to="/arena" className="btn-primary !text-xs">
                <Swords size={13} /> Open the Arena
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-ink-750">
            {others.map(player => (
              <li key={player.playerId} className="flex items-center gap-3 py-2.5">
                <Avatar name={player.name} colour={player.colour || '#EE1B24'} size={34} />
                <div className="min-w-0 grow">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-bold truncate">{player.name}</span>
                    {player.verified && <BadgeCheck size={14} className="text-eval-info shrink-0" aria-label="Signed in" />}
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-chalk-faint">
                    <span className="font-mono">{player.rating}</span>
                    <span className="truncate">{player.activity}</span>
                  </div>
                </div>
                <button
                  className="btn-ghost !text-xs shrink-0"
                  disabled={busyId !== null}
                  onClick={() => challengePlayer(player.playerId, player.name)}
                >
                  <Swords size={13} /> {busyId === player.playerId ? 'Sending…' : 'Challenge'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        title="Share your approximate location"
        footer={
          <>
            <button className="btn-ghost !text-xs" onClick={() => setConsentOpen(false)}>
              Not now
            </button>
            <button
              className="btn-primary !text-xs"
              onClick={async () => {
                setConsentOpen(false);
                const ok = await enableLocation();
                if (ok) toast('You are on the map. Turn it off any time.', 'ok');
              }}
            >
              <MapPin size={13} /> Share it
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-chalk">
          UloX will ask your browser for a location and immediately round it to one decimal place — an area of roughly
          11&nbsp;km — before sending it. Other players see a dot on a world map, your display name, rating and what you
          are doing. Your exact position is never transmitted or stored.
        </p>
        <p className="text-[13.5px] leading-relaxed text-chalk-dim mt-3">
          You can stop sharing at any time, which removes your dot on the next heartbeat.
        </p>
      </Modal>

      <Modal
        open={!!challenge}
        onClose={dismissChallenge}
        title="You have been challenged"
        footer={
          <>
            <button className="btn-ghost !text-xs" onClick={dismissChallenge}>
              Decline
            </button>
            <button
              className="btn-primary !text-xs"
              onClick={() => {
                const target = challenge?.roomId;
                dismissChallenge();
                if (target) navigate(`/arena/${target}`);
              }}
            >
              <Swords size={13} /> Accept
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-chalk">
          <strong>{challenge?.fromName}</strong> wants to play you in a rated match — five positions, same board for both
          sides, most correct wins.
        </p>
        {challenge?.code && (
          <p className="text-[12.5px] text-chalk-dim mt-2">
            Match code <span className="font-mono font-bold text-chalk">{challenge.code}</span>
          </p>
        )}
      </Modal>

      <p className="text-[11.5px] text-chalk-faint text-center">
        Signed in as <span className="text-chalk-dim font-semibold">{profile.name}</span>
        {account ? ' · verified account' : ' · guest'}
      </p>
    </div>
  );
}

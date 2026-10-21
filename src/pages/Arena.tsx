import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, invitesClient } from '@appdeploy/client';
import { Copy, Loader2, LogIn, Plus, Swords, Users } from 'lucide-react';
import { useProfile } from '../lib/profile';
import { Card, Chip, useToast } from '../components/ui';

export function Arena() {
  const profile = useProfile(s => s.profile);
  const navigate = useNavigate();
  const toast = useToast();

  const [code, setCode] = useState('');
  // Play sends people here with the mode already chosen, so the card they
  // tapped and the card they land on agree.
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'duel' | 'team'>(params.get('mode') === 'team' ? 'team' : 'duel');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [created, setCreated] = useState<{ roomId: string; code: string; inviteUrl: string } | null>(null);
  const [joinError, setJoinError] = useState('');

  const identity = {
    playerId: profile.playerId,
    name: profile.name,
    colour: profile.colour,
    rating: profile.rating.rating,
  };

  // An invite link lands here. Check the invite is still good before joining, so
  // an expired link says so instead of failing generically.
  useEffect(() => {
    const pending = invitesClient.getPendingCode();
    if (!pending) return;
    (async () => {
      setBusy('join');
      try {
        const resolved = await api.get(`/api/invites/${pending}`);
        const status = resolved.data?.status;
        if (status && status !== 'open') {
          invitesClient.clearPendingCode();
          setJoinError(
            status === 'expired'
              ? 'That invite link has expired. Ask your opponent for the six-character match code instead.'
              : 'That invite link was revoked. Ask your opponent for a fresh one.'
          );
          return;
        }
        const res = await api.post(`/api/invites/${pending}/join`, identity);
        invitesClient.clearPendingCode();
        navigate(`/arena/${res.data.room.id}`);
      } catch {
        invitesClient.clearPendingCode();
        setJoinError('That invite link is no longer valid. Ask for a fresh match code.');
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy('create');
    setJoinError('');
    try {
      const res = await api.post('/api/rooms', { ...identity, mode });
      const room = res.data.room;
      const inviteUrl = res.data.inviteCode
        ? invitesClient.buildJoinUrl(res.data.inviteCode, { path: '#/join' })
        : '';
      setCreated({ roomId: room.id, code: room.code, inviteUrl });
    } catch {
      setJoinError('Could not create a match right now. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setJoinError('Enter the 6-character match code your opponent shared.');
      return;
    }
    setBusy('join');
    setJoinError('');
    try {
      const res = await api.post('/api/rooms/join', { ...identity, code: clean });
      navigate(`/arena/${res.data.room.id}`);
    } catch {
      setJoinError('No open match with that code. Check the characters and try again.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard', 'ok');
    } catch {
      toast(text, 'info');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Arena</h1>
        <p className="text-sm text-chalk-dim mt-1">
          Head-to-head agentic tactics. Both players get the same five positions and race to pick the engine’s best move.
        </p>
      </header>

      {joinError && (
        <div role="alert" className="mb-4 px-3.5 py-2.5 rounded-lg bg-eval-down/12 border border-eval-down/40 text-[13px] text-eval-down">
          {joinError}
        </div>
      )}

      {created ? (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-brand" />
            <span className="label">Match created</span>
            <Chip tone="warn" className="ml-auto">
              {mode === 'team' ? 'waiting for 3 more' : 'waiting for opponent'}
            </Chip>
          </div>

          <p className="text-[13px] text-chalk-dim mb-3">Share this code — anyone can join without an account.</p>
          <div className="flex items-center gap-2 mb-4">
            <div className="grow font-mono text-3xl font-extrabold tracking-[0.22em] text-center py-4 rounded-xl bg-ink-900 border border-ink-700">
              {created.code}
            </div>
            <button className="btn-ghost !px-3 h-14" onClick={() => copy(created.code)} aria-label="Copy match code">
              <Copy size={16} />
            </button>
          </div>

          {created.inviteUrl && (
            <div className="mb-3">
              <label className="label block mb-1.5" htmlFor="invite-link">
                Or send this link
              </label>
              <div className="flex gap-2">
                <input
                  id="invite-link"
                  readOnly
                  value={created.inviteUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="field font-mono !text-[11px]"
                />
                <button className="btn-ghost !px-3 shrink-0" onClick={() => copy(created.inviteUrl)} aria-label="Copy invite link">
                  <Copy size={15} />
                </button>
              </div>
            </div>
          )}
          <button className="btn-primary w-full" onClick={() => navigate(`/arena/${created.roomId}`)}>
            <Swords size={15} /> Enter the match room
          </button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-5 flex flex-col">
            <span className="w-10 h-10 rounded-xl bg-brand/12 text-brand grid place-items-center mb-3">
              <Plus size={20} />
            </span>
            <h2 className="text-[15px] font-bold">Create a match</h2>
            <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug">
              You get a six-character code and a share link. Whoever joins needs neither an account nor an install.
            </p>

            <div className="grid grid-cols-2 gap-1.5 mt-3 grow content-start">
              {([
                { id: 'duel' as const, label: 'One on one', detail: 'Two players, rated.' },
                { id: 'team' as const, label: 'Two on two', detail: 'Four players, unrated.' },
              ]).map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition ${
                    mode === option.id
                      ? 'bg-brand text-white border-brand'
                      : 'bg-ink-850 border-ink-700 hover:border-ink-500'
                  }`}
                >
                  <span className="block text-[12.5px] font-bold">{option.label}</span>
                  <span className={`block text-[10.5px] leading-snug mt-0.5 ${mode === option.id ? 'text-white/80' : 'text-chalk-faint'}`}>
                    {option.detail}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-chalk-faint mt-2 leading-relaxed">
              {mode === 'team'
                ? 'Everyone gets the same five positions. A side scores its members’ solves added together, and the match starts once all four seats are filled.'
                : 'Both players get the same five positions and race to pick the engine’s best move. Your rating moves on the result.'}
            </p>

            <button className="btn-primary w-full mt-3" onClick={create} disabled={busy !== null}>
              {busy === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Create match
            </button>
          </Card>

          <Card className="p-5 flex flex-col">
            <span className="w-10 h-10 rounded-xl bg-ink-700 text-chalk grid place-items-center mb-3">
              <LogIn size={20} />
            </span>
            <h2 className="text-[15px] font-bold">Join a match</h2>
            <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug grow">
              Enter the code your opponent gave you.
            </p>
            <input
              className="field font-mono text-center text-lg tracking-[0.2em] uppercase mt-4"
              placeholder="ABC123"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && join()}
              aria-label="Match code"
            />
            <button className="btn-ghost w-full mt-2" onClick={join} disabled={busy !== null}>
              {busy === 'join' ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              Join
            </button>
          </Card>
        </div>
      )}

      <Card className="p-4 mt-4">
        <div className="label mb-2">How a match works</div>
        <ol className="text-[12.5px] leading-relaxed text-chalk-dim space-y-1.5 list-decimal pl-4">
          <li>Both players see the same five broken agent graphs, in the same order.</li>
          <li>Each position offers four candidate moves. Pick the one the engine rates highest.</li>
          <li>Most correct wins. A tie goes to whoever finished first.</li>
          <li>The result is rated — your Glicko-2 number moves either way.</li>
        </ol>
        <Link to="/rush" className="btn-quiet w-full mt-3 !text-xs">
          Prefer to practise alone? Try Puzzle Rush
        </Link>
      </Card>
    </div>
  );
}

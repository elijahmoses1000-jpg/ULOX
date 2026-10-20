import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { Award, Check, Copy, Lock, Printer, ShieldCheck, Sparkles } from 'lucide-react';
import { STAGE_BY_ID } from '../lib/journey';
import { useProfile } from '../lib/profile';
import { Card, Chip, useToast } from '../components/ui';
import { Logo } from '../components/ui';

interface Held {
  code: string;
  name: string;
  track: string;
  trackTitle: string;
  issuedAt: number;
  evidence: { topics: number; drills: number; built: boolean; ratingAtIssue: number };
}

interface TrackRow {
  track: string;
  title: string;
  stageTitle: string;
  earned: boolean;
  held: Held | null;
  remaining: { topics: number; drills: number; built: boolean };
  totals: { topics: number; drills: number };
}

const hueFor = (track: string) => STAGE_BY_ID.get(track as never)?.hex ?? '#EE1B24';

export function Certificates() {
  const toast = useToast();
  const profile = useProfile(s => s.profile);
  const push = useProfile(s => s.push);

  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Push first: the server can only verify progress it has been told about.
      await push();
      const res = await api.get(`/api/certificates?playerId=${encodeURIComponent(profile.playerId)}`);
      setTracks(res.data?.tracks ?? []);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [profile.playerId, push]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (track: string) => {
    setClaiming(track);
    try {
      const res = await api.post('/api/certificates/claim', {
        playerId: profile.playerId,
        track,
        name: profile.name,
      });
      if (res.data?.certificate) {
        toast(res.data.alreadyHeld ? 'You already hold this one.' : 'Certificate issued.', 'ok');
        await load();
      }
    } catch (err) {
      const data = (err as { response?: { data?: { shortfall?: { topics: string[]; drills: string[]; built: boolean } } } })
        ?.response?.data;
      const s = data?.shortfall;
      if (s) {
        const bits = [
          s.topics.length ? `${s.topics.length} still to read` : '',
          s.drills.length ? `${s.drills.length} still to fix` : '',
          s.built ? '' : 'the build step',
        ].filter(Boolean);
        toast(`Not yet — outstanding: ${bits.join(', ')}.`, 'err');
      } else {
        toast('Could not issue that certificate right now.', 'err');
      }
    } finally {
      setClaiming(null);
    }
  };

  const heldCount = tracks.filter(t => t.held).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">Certificates</h1>
        <p className="text-sm text-chalk-dim mt-1 max-w-2xl">
          Finish a discipline — read it, fix every puzzle in it, build the thing — and UloX issues a certificate with a
          code anyone can verify. Finish all six and you earn the Agentic Engineering certificate.
        </p>
        {heldCount > 0 && (
          <p className="text-[12.5px] mt-2 font-bold" style={{ color: '#F5A524' }}>
            {heldCount} earned
          </p>
        )}
      </header>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[92px] rounded-xl bg-ink-800 border border-ink-700 scan animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map(row => {
            const hue = row.track === 'master' ? '#F5A524' : hueFor(row.track);
            const outstanding =
              row.remaining.topics + row.remaining.drills + (row.remaining.built ? 0 : 1);
            return (
              <Card
                key={row.track}
                className="p-4"
                style={row.held ? { borderColor: `${hue}66` } : undefined}
              >
                <div className="flex items-start gap-3.5">
                  <span
                    className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                    style={{
                      background: row.held ? hue : `${hue}1F`,
                      color: row.held ? '#0E0F11' : hue,
                    }}
                  >
                    {row.held ? <Award size={20} /> : row.earned ? <Sparkles size={19} /> : <Lock size={17} />}
                  </span>

                  <div className="grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-[15.5px] font-bold">{row.title}</h2>
                      {row.track === 'master' && <Chip tone="warn">capstone</Chip>}
                      {row.held && <Chip tone="up">earned</Chip>}
                    </div>
                    <p className="text-[12px] text-chalk-dim mt-0.5">{row.stageTitle}</p>

                    {row.held ? (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <code className="text-[12px] font-mono font-bold" style={{ color: hue }}>
                          {row.held.code}
                        </code>
                        <Link to={`/verify/${row.held.code}`} className="btn-ghost !px-2.5 !py-1 !text-[11px]">
                          View
                        </Link>
                        <button
                          className="btn-quiet !px-2 !py-1 !text-[11px]"
                          onClick={async () => {
                            const url = `${window.location.origin}${window.location.pathname}#/verify/${row.held!.code}`;
                            try {
                              await navigator.clipboard.writeText(url);
                              toast('Verification link copied', 'ok');
                            } catch {
                              toast(url, 'info');
                            }
                          }}
                        >
                          <Copy size={11} /> Share
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11.5px] text-chalk-faint mt-2">
                        {outstanding === 0
                          ? 'All requirements met.'
                          : `Outstanding: ${[
                              row.remaining.topics ? `${row.remaining.topics} to read` : '',
                              row.remaining.drills ? `${row.remaining.drills} to fix` : '',
                              row.remaining.built ? '' : 'build step',
                            ]
                              .filter(Boolean)
                              .join(' · ')}`}
                      </p>
                    )}
                  </div>

                  {!row.held && (
                    <button
                      className={row.earned ? 'btn-primary !text-xs shrink-0' : 'btn-ghost !text-xs shrink-0'}
                      disabled={!row.earned || claiming === row.track}
                      onClick={() => claim(row.track)}
                    >
                      {claiming === row.track ? 'Checking…' : row.earned ? 'Claim' : 'Locked'}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11.5px] text-chalk-faint mt-6 leading-relaxed">
        These are UloX certificates of completion. They record work you actually did on this platform — every
        requirement is re-checked on our side before one is issued — but they are not an accredited qualification.
      </p>
    </div>
  );
}

/** Public verification. Anyone with the code can open this; no account needed. */
export function VerifyCertificate() {
  const { code = '' } = useParams();
  const [cert, setCert] = useState<Held | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/certificates/${encodeURIComponent(code)}`)
      .then(res => {
        if (cancelled) return;
        if (res.data?.certificate) {
          setCert(res.data.certificate);
          setState('ok');
        } else setState('missing');
      })
      .catch(() => !cancelled && setState('missing'));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state === 'loading') {
    return <div className="max-w-xl mx-auto px-4 py-20 text-center text-chalk-dim">Checking this certificate…</div>;
  }

  if (state === 'missing' || !cert) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <ShieldCheck size={26} className="mx-auto text-eval-down mb-3" />
        <h1 className="font-display text-xl font-bold">No certificate with that code</h1>
        <p className="text-[13px] text-chalk-dim mt-2">
          Codes look like <span className="font-mono">ULX-LOOP-7F3K2A</span>. Check for a typo.
        </p>
        <Link to="/" className="btn-primary mt-5">
          Go to UloX
        </Link>
      </div>
    );
  }

  const hue = cert.track === 'master' ? '#F5A524' : hueFor(cert.track);
  const issued = new Date(cert.issuedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <article
        className="relative overflow-hidden rounded-2xl border-2 p-7 sm:p-10 text-center print:border-black"
        style={{ borderColor: `${hue}88` }}
      >
        <div
          className="absolute -right-24 -top-28 w-80 h-80 rounded-full blur-3xl opacity-20 print:hidden"
          style={{ background: hue }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex justify-center mb-5">
            <Logo size={26} />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-chalk-faint">
            Certificate of completion
          </p>

          <h1 className="font-display text-[26px] sm:text-[32px] font-bold tracking-tight mt-3" style={{ color: hue }}>
            {cert.trackTitle}
          </h1>

          <p className="text-[13px] text-chalk-dim mt-5">awarded to</p>
          <p className="font-display text-[22px] sm:text-[26px] font-bold mt-1">{cert.name}</p>

          <div className="mt-6 flex items-center justify-center gap-2 flex-wrap text-[12px] text-chalk-dim">
            <span className="flex items-center gap-1">
              <Check size={13} style={{ color: hue }} /> {cert.evidence.topics} topics read
            </span>
            <span className="flex items-center gap-1">
              <Check size={13} style={{ color: hue }} /> {cert.evidence.drills} broken systems fixed
            </span>
            <span className="flex items-center gap-1">
              <Check size={13} style={{ color: hue }} /> built from scratch
            </span>
          </div>

          <div className="mt-7 pt-5 border-t border-ink-700 flex items-center justify-between gap-3 flex-wrap text-left">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-chalk-faint">Issued</p>
              <p className="text-[12.5px] font-semibold">{issued}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-chalk-faint">Rating at issue</p>
              <p className="text-[12.5px] font-semibold font-mono">{cert.evidence.ratingAtIssue}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-chalk-faint">Verification code</p>
              <p className="text-[12.5px] font-semibold font-mono" style={{ color: hue }}>
                {cert.code}
              </p>
            </div>
          </div>
        </div>
      </article>

      <div className="flex items-center justify-center gap-2 mt-5 print:hidden">
        <button className="btn-ghost !text-xs" onClick={() => window.print()}>
          <Printer size={13} /> Print or save as PDF
        </button>
        <Link to="/certificates" className="btn-quiet !text-xs">
          My certificates
        </Link>
      </div>

      <p className="text-center text-[11.5px] text-chalk-faint mt-5 print:hidden">
        Verified against UloX records. A certificate of completion on this platform, not an accredited qualification.
      </p>
    </div>
  );
}

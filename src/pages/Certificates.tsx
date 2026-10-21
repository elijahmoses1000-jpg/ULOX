import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { Award, Check, Copy, Download, FileText, Image, Lock, Printer, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import { STAGE_BY_ID } from '../lib/journey';
import { useProfile } from '../lib/profile';
import { Card, Chip, Logo, Modal, useToast } from '../components/ui';
import { ShareSheet } from '../components/ShareSheet';
import {
  CertificateData,
  certificateBlobs,
  download,
  fileStem,
  shareCertificate,
  verifyUrl,
} from '../lib/certificate-render';

interface Held extends CertificateData {
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

const MASTER_HUE = '#F5A524';
export const hueFor = (track: string) =>
  track === 'master' ? MASTER_HUE : STAGE_BY_ID.get(track as never)?.hex ?? '#EE1B24';

/**
 * The one place a name is collected. It is asked for at claim time rather than
 * at sign-up because that is the only moment it matters, and because a name
 * typed months earlier for a leaderboard is rarely the one someone wants
 * printed. Whatever they enter is remembered for the next claim.
 */
function NameDialog({
  open,
  track,
  busy,
  initial,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  track: TrackRow | null;
  busy: boolean;
  initial: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  const clean = value.replace(/\s+/g, ' ').trim();
  const tooShort = clean.length < 2;
  const hue = track ? hueFor(track.track) : '#EE1B24';

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={`Claim ${track?.title ?? 'certificate'}`}
      footer={
        <>
          <button className="btn-quiet !text-xs" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary !text-xs" disabled={tooShort || busy} onClick={() => onConfirm(clean)}>
            {busy ? 'Issuing…' : 'Issue certificate'}
          </button>
        </>
      }
    >
      <label className="label block mb-2" htmlFor="cert-name">
        Your full name, as it should appear
      </label>
      <input
        id="cert-name"
        className="field"
        value={value}
        autoFocus
        maxLength={64}
        placeholder="e.g. Adaeze Okonkwo-Bello"
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !tooShort && !busy) onConfirm(clean);
        }}
      />
      <p className="text-[11.5px] text-chalk-faint mt-2">
        This is printed on the certificate and shown to anyone who verifies it. Use the spelling, capitalisation and
        accents you want — it is saved for your other certificates too.
      </p>

      <div className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-4 py-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-chalk-faint">Preview</p>
        <p className="font-display text-lg font-bold mt-2.5" style={{ color: hue }}>
          {track?.title}
        </p>
        <p className="text-[11px] text-chalk-dim mt-1.5">awarded to</p>
        <p className="font-display text-[19px] font-bold mt-0.5 break-words">
          {clean || <span className="text-chalk-faint">Your name</span>}
        </p>
      </div>
    </Modal>
  );
}

export function Certificates() {
  const toast = useToast();
  const profile = useProfile(s => s.profile);
  const push = useProfile(s => s.push);
  const setCertificateName = useProfile(s => s.setCertificateName);

  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [asking, setAsking] = useState<TrackRow | null>(null);

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

  const claim = async (name: string) => {
    const track = asking;
    if (!track) return;
    setClaiming(true);
    try {
      // Save the name before claiming so the server has it even if the request
      // is retried, and so the next track does not ask again.
      setCertificateName(name);
      await push();

      const res = await api.post('/api/certificates/claim', {
        playerId: profile.playerId,
        track: track.track,
        name,
      });
      if (res.data?.certificate) {
        toast(res.data.alreadyHeld ? 'You already hold this one.' : 'Certificate issued.', 'ok');
        setAsking(null);
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
      setClaiming(false);
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
          <p className="text-[12.5px] mt-2 font-bold" style={{ color: MASTER_HUE }}>
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
            const hue = hueFor(row.track);
            const outstanding = row.remaining.topics + row.remaining.drills + (row.remaining.built ? 0 : 1);
            return (
              <Card key={row.track} className="p-4" style={row.held ? { borderColor: `${hue}66` } : undefined}>
                <div className="flex items-start gap-3.5">
                  <span
                    className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                    style={{ background: row.held ? hue : `${hue}1F`, color: row.held ? '#0E0F11' : hue }}
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
                        <span className="text-[11.5px] text-chalk-faint">· {row.held.name}</span>
                        <Link to={`/verify/${row.held.code}`} className="btn-ghost !px-2.5 !py-1 !text-[11px]">
                          Open & download
                        </Link>
                        <button
                          className="btn-quiet !px-2 !py-1 !text-[11px]"
                          onClick={async () => {
                            const url = verifyUrl(row.held!.code);
                            try {
                              await navigator.clipboard.writeText(url);
                              toast('Verification link copied', 'ok');
                            } catch {
                              toast(url, 'info');
                            }
                          }}
                        >
                          <Copy size={11} /> Copy link
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
                      disabled={!row.earned}
                      onClick={() => setAsking(row)}
                    >
                      {row.earned ? 'Claim' : 'Locked'}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NameDialog
        open={!!asking}
        track={asking}
        busy={claiming}
        initial={profile.certificateName || (profile.name.startsWith('Player ') ? '' : profile.name)}
        onCancel={() => setAsking(null)}
        onConfirm={claim}
      />

      <p className="text-[11.5px] text-chalk-faint mt-6 leading-relaxed">
        These are UloX certificates of completion. They record work you actually did on this platform, and every
        requirement is re-checked on our side before one is issued.
      </p>
    </div>
  );
}

/** Public verification. Anyone with the code can open this; no account needed. */
export function VerifyCertificate() {
  const { code = '' } = useParams();
  const toast = useToast();
  const [cert, setCert] = useState<Held | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [busy, setBusy] = useState<'jpg' | 'pdf' | 'share' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const hue = useMemo(() => (cert ? hueFor(cert.track) : '#EE1B24'), [cert]);

  const exportAs = async (kind: 'jpg' | 'pdf' | 'share') => {
    if (!cert) return;
    setBusy(kind);
    try {
      const { jpeg, pdf } = await certificateBlobs(cert, hue);
      const stem = fileStem(cert);
      if (kind === 'jpg') {
        download(jpeg, `${stem}.jpg`);
        toast('JPG downloaded', 'ok');
      } else if (kind === 'pdf') {
        download(pdf, `${stem}.pdf`);
        toast('PDF downloaded', 'ok');
      } else {
        const shared = await shareCertificate(cert, jpeg);
        if (!shared) {
          download(jpeg, `${stem}.jpg`);
          toast('Your device cannot attach a file — the image was downloaded instead. Post it with the link.', 'info');
        }
      }
    } catch {
      toast('Could not build the file. Try the print option instead.', 'err');
    } finally {
      setBusy(null);
    }
  };

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

  const issued = new Date(cert.issuedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:py-10">
      <article
        className="relative overflow-hidden rounded-2xl border-2 p-7 sm:p-10 text-center"
        // --cert-hue lets the print stylesheet restore the full-strength hue;
        // the on-screen border is deliberately softened with alpha.
        style={{ borderColor: `${hue}88`, ['--cert-hue' as string]: hue } as React.CSSProperties}
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
          <p className="font-display text-[22px] sm:text-[26px] font-bold mt-1 break-words">{cert.name}</p>

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

      <div className="flex items-center justify-center gap-2 mt-5 flex-wrap print:hidden">
        <button className="btn-primary !text-xs" onClick={() => setSheetOpen(true)}>
          <Share2 size={13} /> Share
        </button>
        <button className="btn-ghost !text-xs" onClick={() => exportAs('pdf')} disabled={!!busy}>
          <FileText size={13} /> {busy === 'pdf' ? 'Building…' : 'PDF'}
        </button>
        <button className="btn-ghost !text-xs" onClick={() => exportAs('jpg')} disabled={!!busy}>
          <Image size={13} /> {busy === 'jpg' ? 'Building…' : 'JPG'}
        </button>
        <button
          className="btn-quiet !text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(verifyUrl(cert.code));
              toast('Verification link copied', 'ok');
            } catch {
              toast(verifyUrl(cert.code), 'info');
            }
          }}
        >
          <Copy size={13} /> Copy link
        </button>
        <button className="btn-quiet !text-xs" onClick={() => window.print()}>
          <Printer size={13} /> Print
        </button>
      </div>

      <p className="text-center text-[11.5px] text-chalk-faint mt-4 print:hidden">
        <Download size={11} className="inline -mt-0.5 mr-1" />
        The PDF prints on A4; the JPG is sized for LinkedIn, X and WhatsApp. Both carry the verification link.
      </p>

      {/* Anywhere, not just wherever this device happens to have a share
          sheet. The link is what travels — it resolves to a page that checks
          the certificate against the record, which an image alone cannot. */}
      <ShareSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Share this certificate"
        url={verifyUrl(cert.code)}
        text={`I completed ${cert.trackTitle} on UloX.`}
        busy={busy === 'share'}
        nativeLabel="Share with the certificate image"
        nativeNote="Attaches the JPG itself wherever your device can — messages, email, anywhere that takes a file."
        blurb="The link opens this certificate and checks it against the UloX record, so whoever you send it to can confirm it rather than take your word for it."
        fileNoun="certificate image"
        onNativeShare={() => {
          setSheetOpen(false);
          void exportAs('share');
        }}
      />

      <p className="text-center text-[11.5px] text-chalk-faint mt-3 print:hidden">
        Verified against UloX records — the code above resolves to this page, and this page reads the record.
      </p>
    </div>
  );
}

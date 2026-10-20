import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { Copy, GitFork, Image, Share2 } from 'lucide-react';
import { AgentGraph } from '../lib/agentic';
import { useProfile } from '../lib/profile';
import { Modal, useToast } from '../components/ui';
import { CardRecord, buildCardBlob, download, shareBlob, shareUrl } from '../lib/share-card';

/**
 * Publish a build and hand back the two things that actually travel: a link
 * anyone can open without an account, and a square card with that link drawn
 * into it.
 *
 * The dialog does not close on success. Publishing is the easy half — the
 * share is the point — so the result state keeps the card and the link in
 * front of the person until they have done something with them.
 */
export function PublishDialog({
  open,
  onClose,
  graph,
  score,
  origin,
}: {
  open: boolean;
  onClose: () => void;
  graph: AgentGraph;
  score: number;
  origin: string;
}) {
  const toast = useToast();
  const profile = useProfile(s => s.profile);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CardRecord | null>(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      setTitle('');
      setNote('');
    }
  }, [open]);

  const clean = title.replace(/\s+/g, ' ').trim();
  const tooShort = clean.length < 3;

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await api.post('/api/shares', {
        title: clean,
        note: note.replace(/\s+/g, ' ').trim(),
        authorName: profile.certificateName || profile.name,
        playerId: profile.playerId,
        origin,
        score,
        graph,
      });
      if (res.data?.share) {
        setResult(res.data.share);
        toast('Published. Anyone with the link can open and run it.', 'ok');
      }
    } catch {
      toast('Could not publish that build right now.', 'err');
    } finally {
      setPublishing(false);
    }
  };

  const card = async (mode: 'share' | 'download') => {
    if (!result) return;
    setBusy(true);
    try {
      const blob = await buildCardBlob(result);
      const name = `${clean.replace(/[^A-Za-z0-9]+/g, '-') || 'ulox-agent'}-${result.code}.jpg`;
      if (mode === 'share') {
        const ok = await shareBlob(blob, name, `${result.title} — built on UloX`, shareUrl(result.code));
        if (!ok) {
          download(blob, name);
          toast('Sharing is not available here — the card was downloaded instead.', 'info');
        }
      } else {
        download(blob, name);
        toast('Card downloaded', 'ok');
      }
    } catch {
      toast('Could not build the card.', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? 'Published' : 'Share this build'}
      footer={
        result ? (
          <button className="btn-ghost !text-xs" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn-quiet !text-xs" onClick={onClose} disabled={publishing}>
              Cancel
            </button>
            <button className="btn-primary !text-xs" disabled={tooShort || publishing} onClick={publish}>
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <p className="text-[13px] text-chalk-dim leading-relaxed">
            Anyone with this link can open <span className="text-chalk font-semibold">{result.title}</span>, replay the
            run step by step, and fork it into their own Lab. No account needed to look.
          </p>

          <div className="panel-flat px-3 py-2.5 mt-3 flex items-center gap-2">
            <code className="text-[12px] font-mono text-chalk grow min-w-0 break-all">{shareUrl(result.code)}</code>
            <button
              className="btn-quiet !px-2 !py-1 !text-[11px] shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl(result.code));
                  toast('Link copied', 'ok');
                } catch {
                  toast(shareUrl(result.code), 'info');
                }
              }}
            >
              <Copy size={11} /> Copy
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button className="btn-primary !text-xs" onClick={() => card('share')} disabled={busy}>
              <Share2 size={13} /> {busy ? 'Preparing…' : 'Share the card'}
            </button>
            <button className="btn-ghost !text-xs" onClick={() => card('download')} disabled={busy}>
              <Image size={13} /> Download card
            </button>
          </div>

          <p className="text-[11.5px] text-chalk-faint mt-3.5 leading-relaxed">
            <GitFork size={11} className="inline -mt-0.5 mr-1" />
            The card draws your actual graph and carries the link, so it still works when a platform strips the URL.
            You will see the remix count on the build's page as people fork it.
          </p>
        </div>
      ) : (
        <div>
          <label className="label block mb-2" htmlFor="share-title">
            What does this agent do?
          </label>
          <input
            id="share-title"
            className="field"
            value={title}
            autoFocus
            maxLength={80}
            placeholder="e.g. Research loop that stops when it has enough"
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !tooShort && !publishing) void publish();
            }}
          />

          <label className="label block mt-3.5 mb-2" htmlFor="share-note">
            Anything worth knowing? <span className="text-chalk-faint font-normal">(optional)</span>
          </label>
          <textarea
            id="share-note"
            className="field resize-y min-h-[72px]"
            value={note}
            maxLength={240}
            rows={3}
            placeholder="What you were trying, what surprised you, what you would do differently."
            onChange={e => setNote(e.target.value)}
          />

          <p className="text-[11.5px] text-chalk-faint mt-3 leading-relaxed">
            Your graph and its contracts become public, under the name{' '}
            <span className="text-chalk-dim font-semibold">{profile.certificateName || profile.name}</span>. Do not
            publish anything you would not want read — treat the contract fields as public writing.
          </p>
        </div>
      )}
    </Modal>
  );
}

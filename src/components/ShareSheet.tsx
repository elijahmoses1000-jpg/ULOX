import { useState } from 'react';
import { Check, Copy, Link2, Mail, MessageCircle, Send, Share2 } from 'lucide-react';
import { Modal, useToast } from './ui';

/**
 * Share anywhere.
 *
 * The OS share sheet is the best route when it exists, because it reaches
 * every app installed on the device and can carry the video file itself. It
 * does not exist on most desktop browsers, and even where it does it cannot
 * post to a named network. So this offers both: the native sheet when the
 * browser has one, and direct hand-offs to the places people actually post.
 *
 * Every target gets the link. Only the native sheet can carry the file, which
 * is stated rather than left for someone to discover.
 */

export interface ShareTarget {
  id: string;
  label: string;
  /** Build the destination URL for this network. */
  href: (url: string, text: string) => string;
  icon?: React.ReactNode;
  hue: string;
}

const TARGETS: ShareTarget[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    hue: '#25D366',
    icon: <MessageCircle size={14} />,
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: 'x',
    label: 'X',
    hue: '#E7E9EA',
    href: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    hue: '#0A66C2',
    href: url => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hue: '#1877F2',
    href: url => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    hue: '#2AABEE',
    icon: <Send size={14} />,
    href: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    hue: '#FF4500',
    href: (url, text) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
  {
    id: 'email',
    label: 'Email',
    hue: '#A5ABB3',
    icon: <Mail size={14} />,
    href: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  },
];

export function ShareSheet({
  open,
  onClose,
  url,
  text,
  title = 'Share this',
  /** Offered only when the browser can attach a file to the native sheet. */
  onNativeShare,
  nativeLabel = 'Share the file',
  nativeNote,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  text: string;
  title?: string;
  onNativeShare?: () => void;
  nativeLabel?: string;
  nativeNote?: string;
  busy?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast('Link copied', 'ok');
    } catch {
      toast(url, 'info');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[13px] text-chalk-dim leading-relaxed">
        Anyone with this link can open it, run it and fork it. No account needed to look.
      </p>

      <div className="panel-flat px-3 py-2.5 mt-3 flex items-center gap-2">
        <Link2 size={13} className="text-chalk-faint shrink-0" />
        <code className="text-[12px] font-mono text-chalk grow min-w-0 break-all">{url}</code>
        <button className="btn-quiet !px-2 !py-1 !text-[11px] shrink-0" onClick={copy}>
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {onNativeShare && (
        <>
          <button className="btn-primary w-full !text-xs mt-3" onClick={onNativeShare} disabled={busy}>
            <Share2 size={13} /> {busy ? 'Preparing…' : nativeLabel}
          </button>
          {nativeNote && <p className="text-[11px] text-chalk-faint mt-1.5 leading-relaxed">{nativeNote}</p>}
        </>
      )}

      <div className="label mt-4 mb-2">Post it</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {TARGETS.map(target => (
          <a
            key={target.id}
            href={target.href(url, text)}
            target="_blank"
            rel="noreferrer noopener"
            className="panel-flat px-3 py-2.5 flex items-center gap-2 hover:border-ink-500 transition"
            onClick={() => onClose()}
          >
            <span className="shrink-0" style={{ color: target.hue }}>
              {target.icon ?? <Share2 size={14} />}
            </span>
            <span className="text-[12px] font-semibold text-chalk truncate">{target.label}</span>
          </a>
        ))}
      </div>

      <p className="text-[11px] text-chalk-faint mt-3.5 leading-relaxed">
        These open the network with the link already filled in. A post carries the link, not the video file — use
        the share button above, or download the recording, to attach the video itself.
      </p>
    </Modal>
  );
}

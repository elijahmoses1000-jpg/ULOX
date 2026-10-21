import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Bot, Lightbulb, X } from 'lucide-react';
import { useProfile } from '../lib/profile';
import { readBuilt } from '../lib/journey';
import { uxBriefing } from '../lib/ux';

/**
 * UX, on every screen.
 *
 * One button, one panel, one next action. It is deliberately not a chat
 * window: a learner who is stuck does not need a conversation, they need the
 * single next thing and a way to get there. Everything it says is read out of
 * state that is already on screen somewhere else, so it can never quietly
 * become the fourth version of the truth.
 *
 * It stays shut until asked, and remembers being shut. A guide that reopens
 * itself on every navigation is an obstacle wearing a helpful face.
 */

const SEEN_KEY = 'ulox.ux.greeted';

export function UxGuide() {
  const { pathname } = useLocation();
  const profile = useProfile(s => s.profile);
  const [open, setOpen] = useState(false);
  const [greeted, setGreeted] = useState(true);

  // `built` lives in localStorage rather than the profile store, so it is read
  // when the panel opens rather than subscribed to.
  const briefing = useMemo(() => uxBriefing(pathname, profile, readBuilt()), [pathname, profile, open]);

  useEffect(() => {
    try {
      setGreeted(localStorage.getItem(SEEN_KEY) === '1');
    } catch {
      setGreeted(true);
    }
  }, []);

  const toggle = () => {
    setOpen(o => !o);
    if (!greeted) {
      setGreeted(true);
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* private mode — it just greets again next time */
      }
    }
  };

  return (
    <>
      {open && (
        <>
          <button
            className="fixed inset-0 z-40 bg-ink-950/50 lg:hidden"
            aria-label="Close UX"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="UX, your guide"
            className="fixed z-50 right-3 left-3 sm:left-auto sm:w-[340px] bottom-[82px] lg:bottom-20 panel p-4 animate-popIn"
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-7 h-7 rounded-lg bg-brand/15 text-brand grid place-items-center shrink-0">
                <Bot size={15} />
              </span>
              <span className="text-[13px] font-bold text-chalk grow">UX</span>
              <span className="text-[11px] text-chalk-faint">{briefing.here}</span>
              <button className="text-chalk-faint hover:text-chalk shrink-0" onClick={() => setOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>

            <div className="panel-flat p-3">
              <div className="label mb-1.5">Do this next</div>
              <p className="text-[13px] font-bold text-chalk leading-snug">{briefing.next.label}</p>
              <p className="text-[11.5px] text-chalk-faint mt-1">{briefing.next.because}</p>
              <Link to={briefing.next.to} className="btn-primary w-full mt-2.5 !text-xs" onClick={() => setOpen(false)}>
                {briefing.next.action} <ArrowRight size={13} />
              </Link>
            </div>

            {briefing.tip && (
              <p className="text-[11.5px] text-chalk-dim leading-relaxed mt-3 flex gap-2">
                <Lightbulb size={12} className="text-brand mt-0.5 shrink-0" />
                <span>{briefing.tip}</span>
              </p>
            )}

            <Link
              to="/duel"
              className="btn-quiet w-full mt-3 !text-xs"
              onClick={() => setOpen(false)}
            >
              <Bot size={13} /> Play me instead
            </Link>
          </div>
        </>
      )}

      <button
        onClick={toggle}
        aria-label={open ? 'Close UX' : 'Ask UX what to do next'}
        aria-expanded={open}
        className="fixed z-50 right-3 bottom-[76px] lg:bottom-4 w-12 h-12 rounded-full bg-brand text-white shadow-lg grid place-items-center hover:bg-brand-bright transition"
      >
        {open ? <X size={19} /> : <Bot size={20} />}
        {!greeted && !open && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-eval-warn border-2 border-ink-950" aria-hidden />
        )}
      </button>
    </>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Download,
  Flame,
  GitFork,
  Home,
  LogIn,
  LogOut,
  Map,
  Radio,
  Search,
  Swords,
  Target,
  Wifi,
  Wrench,
  WifiOff,
} from 'lucide-react';
import { bandFor, useProfile } from '../lib/profile';
import { LevelSwitcher } from './Level';
import { Avatar, Logo, useToast } from './ui';

// Five destinations, each a place a person recognises. Everything optional
// lives behind Explore, so a new arrival is never choosing between nine doors.
const PRIMARY = [
  { to: '/', label: 'Journey', icon: Home, end: true },
  { to: '/train', label: 'Practice', icon: Swords, end: false },
  { to: '/lab', label: 'Build', icon: Target, end: false },
  { to: '/explore', label: 'Explore', icon: Map, end: false },
  { to: '/live', label: 'Play', icon: Radio, end: false },
];

const SECONDARY = [
  { to: '/gallery', label: 'Published builds', icon: GitFork },
  { to: '/certificates', label: 'Certificates', icon: Award },
  { to: '/glossary', label: 'Jargon desk', icon: Search },
  { to: '/paths', label: 'Learning paths', icon: BookOpen },
  { to: '/toolkit', label: 'Toolkit', icon: Wrench },
  { to: '/arena', label: 'Match a friend', icon: Flame },
];

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const profile = useProfile(s => s.profile);
  const account = useProfile(s => s.account);
  const authBusy = useProfile(s => s.authBusy);
  const signIn = useProfile(s => s.signIn);
  const signOut = useProfile(s => s.signOut);
  const touchStreak = useProfile(s => s.touchStreak);
  const toast = useToast();

  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const band = bandFor(profile.rating.rating);

  useEffect(() => {
    touchStreak();
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [touchStreak]);

  const doSignIn = async () => {
    const result = await signIn();
    toast(result.ok ? 'Signed in — your progress now follows you.' : result.message ?? 'Sign-in failed.', result.ok ? 'ok' : 'err');
  };

  const doSignOut = async () => {
    await signOut();
    toast('Signed out. You are playing as a guest again.', 'info');
  };

  const immersive = location.pathname.startsWith('/lab') || location.pathname.startsWith('/train/');

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
      isActive ? 'bg-brand/12 text-brand-bright' : 'text-chalk-dim hover:text-chalk hover:bg-ink-800'
    }`;

  return (
    <div className="min-h-full flex flex-col lg:flex-row bg-ink-900">
      {/* Desktop rail */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-ink-750 bg-ink-850">
        <div className="px-5 py-5">
          <NavLink to="/" className="block">
            <Logo size={26} />
          </NavLink>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-chalk-faint">by VerionX</p>
        </div>

        <nav className="px-3 space-y-0.5">
          {PRIMARY.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
          <div className="h-px bg-ink-750 my-2 mx-3" />
          {SECONDARY.map(item => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto p-3">
          <div className="mb-2">
            <LevelSwitcher compact />
          </div>
          {install && (
            <button
              className="btn-ghost w-full mb-2 !text-xs"
              onClick={async () => {
                await install.prompt();
                setInstall(null);
              }}
            >
              <Download size={14} /> Install UloX
            </button>
          )}

          <NavLink to="/me" className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-ink-800 transition">
            <Avatar name={profile.name} colour={profile.colour} size={34} />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-chalk truncate">{profile.name}</span>
              <span className="block text-[11px] text-chalk-faint">
                {band.name} · {profile.rating.rating}
              </span>
            </span>
          </NavLink>

          {account ? (
            <button className="btn-quiet w-full mt-1 !text-[11px]" onClick={doSignOut} disabled={authBusy}>
              <LogOut size={12} /> Sign out
            </button>
          ) : (
            <button className="btn-ghost w-full mt-1 !text-[11px]" onClick={doSignIn} disabled={authBusy}>
              <LogIn size={12} /> {authBusy ? 'Opening…' : 'Sign in'}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-ink-850/95 backdrop-blur border-b border-ink-750">
        <NavLink to="/">
          <Logo size={22} />
        </NavLink>
        <div className="ml-auto flex items-center gap-2">
          <span title={online ? 'Online' : 'Offline — cached content still works'}>
            {online ? <Wifi size={13} className="text-eval-up" /> : <WifiOff size={13} className="text-eval-warn" />}
          </span>
          <LevelSwitcher compact />
          <span className="flex items-center gap-1 text-[12px] font-bold text-eval-warn">
            <Flame size={13} />
            {profile.streak}
          </span>
          {!account && (
            <button className="btn-ghost !px-2 !py-1 !text-[11px]" onClick={doSignIn} disabled={authBusy}>
              <LogIn size={12} /> Sign in
            </button>
          )}
          <NavLink to="/me">
            <Avatar name={profile.name} colour={profile.colour} size={28} />
          </NavLink>
        </div>
      </header>

      <main className={`grow min-w-0 ${immersive ? '' : 'pb-20 lg:pb-0'}`}>{children}</main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-ink-850/97 backdrop-blur border-t border-ink-750 safe-bottom">
        <div className="grid grid-cols-5">
          {PRIMARY.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition ${
                  isActive ? 'text-brand-bright' : 'text-chalk-faint'
                }`
              }
            >
              <item.icon size={19} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

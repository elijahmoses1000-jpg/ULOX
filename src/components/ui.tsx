import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

export function Logo({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
        <circle cx="24" cy="24" r="15" fill="#EE1B24" />
        <circle cx="24" cy="24" r="16.5" fill="none" stroke="#E9EBEE" strokeWidth="2.4" />
        <path d="M16 13c4 7 12 15 18 20" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M32 13c-4 7-12 15-18 20" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <ellipse cx="24" cy="24" rx="23" ry="8" fill="none" stroke="#fff" strokeWidth="2.6" transform="rotate(-18 24 24)" />
      </svg>
      {wordmark && (
        <span className="font-extrabold tracking-tight leading-none" style={{ fontSize: size * 0.78 }}>
          Ulo<span className="text-brand">X</span>
        </span>
      )}
    </span>
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <Tag className={`panel shadow-panel ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Chip({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: 'neutral' | 'brand' | 'up' | 'down' | 'warn' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-700 text-chalk-dim',
    brand: 'bg-brand/15 text-brand-bright',
    up: 'bg-eval-up/15 text-eval-up',
    down: 'bg-eval-down/15 text-eval-down',
    warn: 'bg-eval-warn/15 text-eval-warn',
    info: 'bg-eval-info/15 text-eval-info',
  };
  return <span className={`chip ${tones[tone]} ${className}`}>{children}</span>;
}

export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'up' | 'info' }) {
  const colours = { brand: 'bg-brand', up: 'bg-eval-up', info: 'bg-eval-info' };
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${colours[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function Ring({ value, size = 44, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#26282C" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#EE1B24"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      {label && <span className="absolute text-[10px] font-bold text-chalk">{label}</span>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} panel shadow-pop
                    rounded-b-none sm:rounded-b-xl animate-slideUp sm:animate-popIn max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-700">
          <h2 className="text-base font-bold">{title}</h2>
          <button className="btn-quiet !px-2 !py-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto grow">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-ink-700 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className = '',
}: {
  tabs: Array<{ id: T; label: string; badge?: React.ReactNode }>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 p-1 bg-ink-850 border border-ink-700 rounded-lg overflow-x-auto no-scrollbar ${className}`}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition
            ${active === t.id ? 'bg-brand text-white' : 'text-chalk-dim hover:text-chalk hover:bg-ink-750'}`}
        >
          {t.label}
          {t.badge != null && <span className="ml-1.5 opacity-80">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      {icon && <div className="mx-auto mb-3 text-chalk-faint">{icon}</div>}
      <p className="font-semibold text-chalk">{title}</p>
      {hint && <p className="mt-1 text-sm text-chalk-dim max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- Toasts -----------------------------------------------------------------

type Toast = { id: number; text: string; tone: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems(list => [...list, { id, text, tone }]);
    window.setTimeout(() => setItems(list => list.filter(t => t.id !== id)), 3800);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed z-[60] bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center px-4 w-full max-w-md pointer-events-none">
        {items.map(t => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto w-full px-4 py-2.5 rounded-lg text-sm font-medium shadow-pop animate-popIn border
              ${t.tone === 'ok' ? 'bg-eval-up/15 border-eval-up/40 text-eval-up' : ''}
              ${t.tone === 'err' ? 'bg-eval-down/15 border-eval-down/40 text-eval-down' : ''}
              ${t.tone === 'info' ? 'bg-ink-750 border-ink-600 text-chalk' : ''}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function Avatar({ name, colour, size = 32 }: { name: string; colour: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="inline-grid place-items-center rounded-lg font-extrabold text-ink-900 shrink-0"
      style={{ width: size, height: size, background: colour, fontSize: size * 0.42 }}
    >
      {initials || '?'}
    </span>
  );
}

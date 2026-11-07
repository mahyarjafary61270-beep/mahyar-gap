import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useToasts } from '../stores/toast.js';
import { useI18n } from '../i18n/index.js';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ── Splash / loading ───────────────────────────────────────── */

export function Splash() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-ink-900">
      <BrandLogo size={56} />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-400" />
    </div>
  );
}

/* ── Brand ──────────────────────────────────────────────────── */

export function BrandLogo({ size = 40, withText = false }: { size?: number; withText?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" className="drop-shadow-glow">
        <defs>
          <linearGradient id="brand-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#brand-g)" />
        <path
          d="M20 26c0-4.4 3.6-8 8-8h8c4.4 0 8 3.6 8 8v6c0 4.4-3.6 8-8 8h-2.5L27 45v-5.2c-4-0.6-7-3.9-7-7.8z"
          fill="#fff"
          opacity="0.95"
        />
        <circle cx="27" cy="29" r="2" fill="#7c5cff" />
        <circle cx="37" cy="29" r="2" fill="#7c5cff" />
      </svg>
      {withText && (
        <span className="text-xl font-extrabold brand-text">{t.common.appName}</span>
      )}
    </div>
  );
}

/* ── Button ─────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger' | 'success';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'brand-gradient text-white shadow-glow hover:brightness-110 active:brightness-95 disabled:opacity-50',
  ghost: 'text-mist-300 hover:text-mist-100 hover:bg-white/5',
  subtle: 'bg-white/5 text-mist-100 border border-white/8 hover:bg-white/10',
  danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/25 hover:bg-rose-500/25',
  success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed',
        buttonStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Input ──────────────────────────────────────────────────── */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2.5 text-sm text-mist-100 placeholder:text-mist-500',
        'outline-none transition-colors focus:border-brand-500/60 focus:bg-white/[0.06]',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-mist-400">{children}</label>;
}

/* ── Avatar ─────────────────────────────────────────────────── */

const AVATAR_GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-sky-500 to-cyan-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-indigo-500 to-blue-500',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  src,
  size = 36,
  online,
  speaking,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
  speaking?: boolean;
  className?: string;
}) {
  const gradient = AVATAR_GRADIENTS[hashString(name) % AVATAR_GRADIENTS.length];
  const initials = name.trim().slice(0, 2) || '?';
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <span
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-bold text-white select-none',
          gradient,
          speaking && 'speaking-ring',
        )}
        style={{ fontSize: size * 0.38 }}
      >
        {src ? <img src={src} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initials}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-ink-850',
            online ? 'bg-emerald-400' : 'bg-mist-600',
          )}
        />
      )}
    </span>
  );
}

/* ── Badge ──────────────────────────────────────────────────── */

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Modal ──────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={cn('w-full animate-pop-in rounded-2xl border border-white/10 bg-ink-800 shadow-card', width)}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
            <h2 className="text-sm font-bold text-mist-100">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-mist-400 transition-colors hover:bg-white/5 hover:text-mist-100"
              aria-label="close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Volume slider ──────────────────────────────────────────── */

export function VolumeSlider({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('mg-slider w-full', className)}
      style={{ ['--fill' as string]: `${Math.round(value * 100)}%`, direction: 'ltr' }}
    />
  );
}

/* ── Toasts viewport ────────────────────────────────────────── */

export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  const { t } = useI18n();
  void t;
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="fixed bottom-4 start-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 rtl:translate-x-1/2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={cn(
            'animate-fade-up rounded-xl border px-4 py-2.5 text-start text-sm font-medium shadow-card backdrop-blur-md',
            toast.kind === 'success' && 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
            toast.kind === 'error' && 'border-rose-500/30 bg-rose-500/15 text-rose-200',
            toast.kind === 'info' && 'border-white/10 bg-ink-750/90 text-mist-100',
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* ── Empty state ────────────────────────────────────────────── */

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-mist-600">{icon}</div>}
      <p className="text-sm font-semibold text-mist-400">{title}</p>
      {hint && <p className="text-xs text-mist-500">{hint}</p>}
    </div>
  );
}

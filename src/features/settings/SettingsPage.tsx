import { useState } from 'react';
import { Info, Languages, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../../stores/auth.js';
import { useI18n } from '../../i18n/index.js';
import { useVoice } from '../../stores/voice.js';
import { Button, cn } from '../../components/ui.js';
import { getSocket } from '../../lib/socket.js';
import { useNavigate } from 'react-router-dom';

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const me = useAuth((s) => s.me);
  const applyLocale = useAuth((s) => s.applyLocale);
  const leave = useVoice((s) => s.leave);
  const navigate = useNavigate();

  const changeLocale = async (next: 'fa' | 'en') => {
    setLocale(next);
    applyLocale(next);
    try {
      await useAuth.getState().updateProfile({ locale: next });
    } catch { /* keep local change */ }
  };

  const doLogout = async () => {
    await leave().catch(() => {});
    getSocket().disconnect();
    await useAuth.getState().logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex h-14 shrink-0 items-center border-b border-white/5 bg-ink-850/50 px-5 backdrop-blur">
        <h1 className="text-sm font-extrabold text-mist-100">{t.settings.title}</h1>
      </header>

      <div className="mx-auto w-full max-w-xl space-y-6 p-6">
        {/* Language */}
        <section className="rounded-2xl border border-white/8 bg-ink-800/70 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-mist-100">
            <Languages size={15} className="text-brand-400" />
            {t.settings.appearance}
          </h2>
          <p className="mb-2 text-xs font-semibold text-mist-400">{t.settings.language}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['fa', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => void changeLocale(l)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-bold transition-all',
                  locale === l
                    ? 'border-brand-500/60 bg-brand-500/12 text-brand-100 shadow-glow'
                    : 'border-white/8 bg-white/[0.03] text-mist-400 hover:border-white/20',
                )}
              >
                {l === 'fa' ? t.settings.languageFa : t.settings.languageEn}
              </button>
            ))}
          </div>
        </section>

        {/* Account */}
        <section className="rounded-2xl border border-white/8 bg-ink-800/70 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-mist-100">
            <UserRound size={15} className="text-brand-400" />
            {t.settings.account}
          </h2>
          <div className="space-y-1 text-xs text-mist-400">
            <p dir="ltr" className="text-start">@{me?.username}</p>
            <p>{t.profile.memberSince}: {me ? new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(me.createdAt)) : ''}</p>
          </div>
          <Button variant="danger" className="mt-4" onClick={() => void doLogout()}>
            <LogOut size={14} />
            {t.sidebar.logout}
          </Button>
          <p className="mt-2 text-[11px] text-mist-600">{t.settings.logoutEverywhereHint}</p>
        </section>

        {/* About */}
        <section className="rounded-2xl border border-white/8 bg-ink-800/70 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-mist-100">
            <Info size={15} className="text-brand-400" />
            {t.settings.about}
          </h2>
          <p className="text-xs leading-relaxed text-mist-400">{t.settings.aboutText}</p>
          <p className="mt-3 text-[11px] font-bold text-mist-600">Mahyar Gap v1.0</p>
        </section>
      </div>
    </div>
  );
}

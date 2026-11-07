import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ShieldCheck, Volume2 } from 'lucide-react';
import { useAuth } from '../../stores/auth.js';
import { useI18n, getCurrentDict } from '../../i18n/index.js';
import { toast } from '../../stores/toast.js';
import { api, ApiError } from '../../lib/api.js';
import { BrandLogo, Button, Input, Label } from '../../components/ui.js';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const needsSetup = useAuth((s) => s.needsSetup);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingState, setCheckingState] = useState(mode === 'register');

  // /register doubles as the first-run setup when no users exist yet.
  useEffect(() => {
    if (mode !== 'register') return;
    void api
      .get<{ needsSetup: boolean }>('/auth/state')
      .then((s) => setCheckingState(false))
      .catch(() => setCheckingState(false));
  }, [mode]);

  const isSetup = mode === 'register' && needsSetup && !checkingState;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username.trim().toLowerCase(), password);
      } else {
        await register({
          username: username.trim().toLowerCase(),
          displayName: displayName.trim() || username.trim(),
          password,
          inviteCode: isSetup ? undefined : inviteCode.trim().toLowerCase() || undefined,
        });
      }
      navigate('/app', { replace: true });
    } catch (err) {
      const dict = getCurrentDict();
      if (err instanceof ApiError) {
        setError(
          err.code === 'BAD_CREDENTIALS'
            ? dict.auth.loginFailed
            : err.code === 'INVITE_REQUIRED'
              ? dict.auth.inviteRequired
              : err.code === 'INVITE_INVALID'
                ? dict.auth.inviteInvalid
                : err.code === 'INVITE_EXHAUSTED'
                  ? dict.auth.inviteExhausted
                  : err.code === 'USERNAME_TAKEN'
                    ? dict.auth.usernameTaken
                    : err.message,
        );
      } else {
        setError(dict.auth.genericError);
        toast.error(dict.auth.genericError);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-stretch bg-ink-900">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden brand-gradient p-10 lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(60%_50%_at_70%_20%,white,transparent)]" />
        <div className="relative">
          <BrandLogo size={48} withText />
        </div>
        <div className="relative">
          <h1 className="text-3xl font-extrabold leading-snug text-white">{t.auth.welcomeTitle}</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/80">{t.auth.welcomeSubtitle}</p>
          <ul className="mt-8 space-y-3 text-sm text-white/90">
            <li className="flex items-center gap-3">
              <span className="rounded-xl bg-white/15 p-2"><Radio size={16} /></span>
              {t.auth.brandPoint1}
            </li>
            <li className="flex items-center gap-3">
              <span className="rounded-xl bg-white/15 p-2"><ShieldCheck size={16} /></span>
              {t.auth.brandPoint2}
            </li>
            <li className="flex items-center gap-3">
              <span className="rounded-xl bg-white/15 p-2"><Volume2 size={16} /></span>
              {t.auth.brandPoint3}
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Mahyar Gap · private community</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandLogo size={52} withText />
          </div>

          <h2 className="text-xl font-extrabold text-mist-50">
            {isSetup ? t.auth.firstRunTitle : mode === 'login' ? t.auth.loginTitle : t.auth.registerTitle}
          </h2>
          <p className="mt-1 text-sm text-mist-400">
            {isSetup ? t.auth.firstRunSubtitle : mode === 'login' ? t.auth.loginSubtitle : t.auth.registerSubtitle}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>{t.auth.username}</Label>
              <Input
                dir="ltr"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={32}
                placeholder="mahyar"
              />
              {mode === 'register' && <p dir="ltr" className="mt-1 text-end text-[11px] text-mist-500">{t.auth.usernameHint}</p>}
            </div>

            {mode === 'register' && (
              <div>
                <Label>{t.auth.displayName}</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={48}
                  placeholder="مهیار"
                />
              </div>
            )}

            <div>
              <Label>{t.auth.password}</Label>
              <Input
                dir="ltr"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
              />
              {mode === 'register' && <p className="mt-1 text-[11px] text-mist-500">{t.auth.passwordHint}</p>}
            </div>

            {mode === 'register' && !isSetup && (
              <div>
                <Label>{t.auth.inviteCode}</Label>
                <Input
                  dir="ltr"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="mg-xxxxxxxx"
                />
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full py-2.5">
              {busy ? t.common.loading : mode === 'login' ? t.auth.login : t.auth.register}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-mist-400">
            {mode === 'login' ? t.auth.needAccount : t.auth.haveAccount}{' '}
            <a
              href={mode === 'login' ? '/register' : '/login'}
              className="font-bold text-brand-400 hover:text-brand-300"
            >
              {mode === 'login' ? t.auth.register : t.auth.login}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

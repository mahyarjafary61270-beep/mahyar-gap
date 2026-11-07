import { useRef, useState } from 'react';
import { Camera, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '../../stores/auth.js';
import { useI18n } from '../../i18n/index.js';
import { usePresence } from '../../stores/presence.js';
import { toast } from '../../stores/toast.js';
import { Avatar, Button, Input, Label, cn } from '../../components/ui.js';
import { RoleChip } from '../layout/MembersPanel.js';
import { getCurrentDict } from '../../i18n/index.js';

/** Downscale to 256×256 JPEG data URL client-side so avatars stay small. */
async function fileToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Cover-crop to square
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function ProfilePage() {
  const { t, locale } = useI18n();
  const me = useAuth((s) => s.me);
  const updateProfile = useAuth((s) => s.updateProfile);
  const onlineUserIds = usePresence((s) => s.onlineUserIds);

  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!me) return null;

  const save = async () => {
    if (!displayName.trim()) return;
    setBusy(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      toast.success(getCurrentDict().profile.saved);
    } finally {
      setBusy(false);
    }
  };

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatar(file);
      await updateProfile({ avatar: dataUrl });
      toast.success(getCurrentDict().profile.saved);
    } catch {
      toast.error(getCurrentDict().profile.avatarTooBig);
    }
  };

  const removeAvatar = async () => {
    await updateProfile({ avatar: null });
  };

  const online = onlineUserIds.has(me.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex h-14 shrink-0 items-center border-b border-white/5 bg-ink-850/50 px-5 backdrop-blur">
        <h1 className="text-sm font-extrabold text-mist-100">{t.profile.title}</h1>
      </header>

      <div className="mx-auto w-full max-w-xl p-6">
        <div className="rounded-2xl border border-white/8 bg-ink-800/70 p-6">
          {/* Banner */}
          <div className="relative mb-14 h-24 rounded-xl brand-gradient opacity-70">
            <div className="absolute -bottom-12 start-6">
              <Avatar name={me.displayName} src={me.avatar} size={96} online={online} />
            </div>
            <div className="absolute -bottom-3 end-4 flex gap-2">
              <Button variant="subtle" onClick={() => fileRef.current?.click()} className="text-xs">
                <Camera size={14} />
                {t.profile.changeAvatar}
              </Button>
              {me.avatar && (
                <Button variant="danger" onClick={() => void removeAvatar()} className="text-xs">
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickAvatar(e.target.files?.[0])}
            />
          </div>

          <div className="mb-5 flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-mist-50">{me.displayName}</h2>
            <RoleChip role={me.role} />
          </div>

          <div className="space-y-1.5 text-xs text-mist-400">
            <p dir="ltr" className="text-start">@{me.username}</p>
            <p>
              {online ? (
                <span className="font-bold text-emerald-400">● {t.profile.onlineNow}</span>
              ) : (
                `${t.profile.offlineAt} ${new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(me.lastSeenAt))}`
              )}
            </p>
          </div>

          <div className="mt-6">
            <Label>{t.settings.displayName}</Label>
            <div className="flex gap-2">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} />
              <Button onClick={() => void save()} disabled={busy || !displayName.trim()}>
                <UserRound size={14} />
                {t.common.save}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

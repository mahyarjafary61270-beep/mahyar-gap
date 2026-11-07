import { useState } from 'react';
import { Radio } from 'lucide-react';
import { useAuth } from '../../stores/auth.js';
import { usePresence } from '../../stores/presence.js';
import { useI18n } from '../../i18n/index.js';
import { relativeTime } from '../../lib/format.js';
import { Avatar, EmptyState, Modal, cn } from '../../components/ui.js';
import type { PublicUser } from '../../../shared/types.js';

export function MembersPanel() {
  const { t, locale } = useI18n();
  const me = useAuth((s) => s.me);
  const users = useAuth((s) => s.users);
  const onlineUserIds = usePresence((s) => s.onlineUserIds);
  const voiceRooms = usePresence((s) => s.voiceRooms);
  const [selected, setSelected] = useState<PublicUser | null>(null);

  if (!me) return null;

  const sorted = [...users].sort((a, b) => {
    const aOnline = onlineUserIds.has(a.id) ? 0 : 1;
    const bOnline = onlineUserIds.has(b.id) ? 0 : 1;
    return aOnline - bOnline || a.username.localeCompare(b.username);
  });

  const isUserInVoice = (userId: string) =>
    Object.values(voiceRooms).some((room) => room.includes(userId));

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-s border-white/5 bg-ink-850/60 xl:flex">
        <div className="px-4 py-4 text-[11px] font-bold tracking-wide text-mist-500 uppercase">
          {t.common.members} — {users.length}
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {sorted.map((user) => {
            const online = onlineUserIds.has(user.id);
            return (
              <button
                key={user.id}
                onClick={() => setSelected(user)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-white/4',
                  !online && 'opacity-50',
                )}
              >
                <Avatar name={user.displayName} src={user.avatar} size={32} online={online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-mist-200">
                      {user.displayName}
                      {user.id === me.id && <span className="ms-1 text-mist-500">({t.common.you})</span>}
                    </span>
                    <RoleChip role={user.role} />
                  </span>
                  <span className="block truncate text-[11px] text-mist-500">
                    {isUserInVoice(user.id) ? (
                      <span className="inline-flex items-center gap-1 text-brand-300">
                        <Radio size={10} /> {t.voice.inRoom}
                      </span>
                    ) : online ? (
                      t.common.online
                    ) : (
                      relativeTime(user.lastSeenAt, locale)
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          {sorted.length === 0 && <EmptyState title={t.sidebar.empty} />}
        </div>
      </aside>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={t.profile.title}>
        {selected && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar
              name={selected.displayName}
              src={selected.avatar}
              size={72}
              online={onlineUserIds.has(selected.id)}
            />
            <div>
              <p className="text-lg font-extrabold text-mist-50">{selected.displayName}</p>
              <p dir="ltr" className="text-xs text-mist-500">@{selected.username}</p>
            </div>
            <RoleChip role={selected.role} />
            <div className="w-full space-y-1.5 rounded-xl bg-white/[0.03] px-4 py-3 text-xs text-mist-400">
              <p>
                <span className="text-mist-500">{t.profile.memberSince}: </span>
                {new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(new Date(selected.createdAt))}
              </p>
              <p>
                <span className="text-mist-500">{t.profile.lastSeen}: </span>
                {onlineUserIds.has(selected.id) ? t.profile.onlineNow : relativeTime(selected.lastSeenAt, locale)}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function RoleChip({ role }: { role: PublicUser['role'] }) {
  const { t } = useI18n();
  const label = role === 'owner' ? t.profile.roleOwner : role === 'admin' ? t.profile.roleAdmin : t.profile.roleMember;
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
        role === 'owner' && 'bg-amber-500/15 text-amber-300',
        role === 'admin' && 'bg-brand-500/15 text-brand-300',
        role === 'member' && 'bg-white/6 text-mist-500',
      )}
    >
      {label}
    </span>
  );
}

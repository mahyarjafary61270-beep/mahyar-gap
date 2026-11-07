import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, KeyRound, Loader2, Ticket, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../stores/auth.js';
import { useI18n, getCurrentDict } from '../../i18n/index.js';
import { toast } from '../../stores/toast.js';
import { Avatar, Button, Input, Label, cn } from '../../components/ui.js';
import { RoleChip } from '../layout/MembersPanel.js';
import type { InviteCode, PublicUser } from '../../../shared/types.js';

export function AdminPage() {
  const { t } = useI18n();
  const me = useAuth((s) => s.me);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'invites' | 'members'>('invites');

  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  if (!isAdmin) {
    navigate('/app', { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-850/50 px-5 backdrop-blur">
        <h1 className="text-sm font-extrabold text-mist-100">{t.admin.title}</h1>
        <div className="ms-4 flex gap-1 rounded-xl bg-white/[0.04] p-1">
          {(
            [
              ['invites', <Ticket key="i" size={13} />, t.admin.tabInvites],
              ['members', <Users key="m" size={13} />, t.admin.tabMembers],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                tab === key ? 'bg-brand-500/20 text-brand-100' : 'text-mist-400 hover:text-mist-200',
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === 'invites' ? <InvitesTab /> : <MembersTab />}
      </div>
    </div>
  );
}

/* ── Invites ────────────────────────────────────────────────── */

function InvitesTab() {
  const { t } = useI18n();
  const [invites, setInvites] = useState<InviteCode[] | null>(null);
  const [maxUses, setMaxUses] = useState(5);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.get<{ invites: InviteCode[] }>('/admin/invites');
    setInvites(res.invites);
  };

  useEffect(() => {
    void load().catch(() => setInvites([]));
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      await api.post('/admin/invites', { maxUses, note: note.trim() || undefined });
      await load();
      toast.success(getCurrentDict().admin.inviteCreated);
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (code: string) => {
    await api.delete(`/admin/invites/${code}`);
    await load();
  };

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(() => toast.success(getCurrentDict().common.copied));
  };

  const statusOf = (invite: InviteCode) =>
    invite.revokedAt
      ? { label: t.admin.statusRevoked, cls: 'bg-rose-500/12 text-rose-300' }
      : invite.usedCount >= invite.maxUses
        ? { label: t.admin.statusExhausted, cls: 'bg-mist-500/15 text-mist-400' }
        : { label: t.admin.statusActive, cls: 'bg-emerald-500/12 text-emerald-300' };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-2xl border border-white/8 bg-ink-800/70 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-mist-100">
          <KeyRound size={15} className="text-brand-400" />
          {t.admin.createInvite}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_auto]">
          <div>
            <Label>{t.admin.maxUses}</Label>
            <Input
              dir="ltr"
              type="number"
              min={1}
              max={100}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div>
            <Label>{t.admin.note}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void create()} disabled={busy} className="h-[42px] w-full sm:w-auto">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />}
              {t.admin.createInvite}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {invites === null && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-brand-400" size={22} />
          </div>
        )}
        {invites?.length === 0 && (
          <p className="py-8 text-center text-sm text-mist-500">{t.admin.noInvites}</p>
        )}
        {invites?.map((invite) => {
          const status = statusOf(invite);
          return (
            <div
              key={invite.code}
              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-800/70 px-4 py-3"
            >
              <button
                onClick={() => copy(invite.code)}
                title={t.common.copy}
                dir="ltr"
                className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-1.5 font-mono text-xs font-bold text-brand-200 hover:bg-white/10"
              >
                {invite.code}
                <Copy size={12} />
              </button>
              <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', status.cls)}>
                {status.label}
              </span>
              <span className="text-[11px] text-mist-500">
                {invite.usedCount}/{invite.maxUses}
              </span>
              {invite.note && <span className="truncate text-[11px] text-mist-600">· {invite.note}</span>}
              <span className="ms-auto" />
              {!invite.revokedAt && (
                <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => void revoke(invite.code)}>
                  {t.admin.revoke}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Members ────────────────────────────────────────────────── */

function MembersTab() {
  const { t } = useI18n();
  const me = useAuth((s) => s.me);
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const isOwner = me?.role === 'owner';

  const load = async () => {
    const res = await api.get<{ users: PublicUser[] }>('/admin/users');
    setUsers(res.users);
  };

  useEffect(() => {
    void load().catch(() => setUsers([]));
  }, []);

  const changeRole = async (user: PublicUser, role: 'admin' | 'member') => {
    if (user.role === role) return;
    await api.patch(`/admin/users/${user.id}`, { role });
    await load();
  };

  const revokeSessions = async (userId: string) => {
    await api.post(`/admin/users/${userId}/revoke-sessions`);
    toast.success(getCurrentDict().admin.sessionsRevoked);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-2">
      {users === null && (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-brand-400" size={22} />
        </div>
      )}
      {users?.map((user) => (
        <div
          key={user.id}
          className="flex items-center gap-3 rounded-2xl border border-white/8 bg-ink-800/70 px-4 py-3"
        >
          <Avatar name={user.displayName} src={user.avatar} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-bold text-mist-100">{user.displayName}</span>
              <RoleChip role={user.role} />
            </div>
            <p dir="ltr" className="text-start text-[11px] text-mist-500">@{user.username}</p>
          </div>

          {user.role === 'owner' ? (
            <span className="text-[10px] text-mist-600">{t.admin.ownerNote}</span>
          ) : (
            <div className="flex items-center gap-2">
              {isOwner && (
                <select
                  value={user.role}
                  onChange={(e) => void changeRole(user, e.target.value as 'admin' | 'member')}
                  className="rounded-lg border border-white/10 bg-ink-750 px-2 py-1.5 text-xs text-mist-200 outline-none"
                >
                  <option value="member">{t.profile.roleMember}</option>
                  <option value="admin">{t.profile.roleAdmin}</option>
                </select>
              )}
              <Button
                variant="subtle"
                className="px-3 py-1.5 text-xs"
                onClick={() => void revokeSessions(user.id)}
              >
                {t.admin.revokeSessions}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Hash,
  Shield,
  Headphones,
  HeadphoneOff,
  LogOut,
  Mic,
  MicOff,
  Plus,
  Radio,
  Settings,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../../stores/auth.js';
import { useChat } from '../../stores/chat.js';
import { usePresence } from '../../stores/presence.js';
import { useVoice } from '../../stores/voice.js';
import { useUi } from '../../stores/ui.js';
import { useI18n } from '../../i18n/index.js';
import { Avatar, Badge, BrandLogo, Button, cn } from '../../components/ui.js';
import { api } from '../../lib/api.js';
import { getSocket } from '../../lib/socket.js';
import type { Channel } from '../../../shared/types.js';
import type { ChannelKind } from '../../../shared/types.js';

export function Sidebar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const me = useAuth((s) => s.me);
  const users = useAuth((s) => s.users);
  const logout = useAuth((s) => s.logout);
  const channels = useChat((s) => s.channels);
  const unread = useChat((s) => s.unread);
  const voiceRooms = usePresence((s) => s.voiceRooms);
  const voice = useVoice();
  const radioStates = useVoice((s) => s.radioStates);
  const setRadioModal = useChat((s) => s.setRadioModal);
  const [creating, setCreating] = useState(false);

  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  const textChannels = channels.filter((c) => c.kind === 'text');
  const voiceChannels = channels.filter((c) => c.kind === 'voice');
  const { channelId: routeChannelId } = useParams();

  const activeVoiceChannel = voice.channelId;

  const doLogout = async () => {
    await voice.leave().catch(() => {});
    getSocket().disconnect();
    await logout();
    navigate('/login', { replace: true });
  };

  const openRadioFor = (channel: Channel) => {
    if (voice.channelId === channel.id) {
      setRadioModal(channel.id);
    } else {
      // Opening from the sidebar: navigate to the room and open the selector there.
      navigate(`/app/voice/${channel.id}`);
      setRadioModal(channel.id);
    }
  };

  const myUser = me ? users.find((u) => u.id === me.id) : undefined;

  return (
    <aside className="flex h-full w-72 flex-col border-e border-white/5 bg-ink-850">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-4">
        <button onClick={() => navigate('/app')} className="flex items-center gap-2">
          <BrandLogo size={34} />
          <span className="text-lg font-extrabold brand-text">{t.common.appName}</span>
        </button>
        <button
          className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 lg:hidden"
          onClick={() => useUi.getState().setMobileNav(false)}
          aria-label="close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Channels */}
      <div className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-4">
        <ChannelGroup
          label={t.sidebar.textChannels}
          icon={<Hash size={13} />}
          onAdd={isAdmin ? () => setCreating(true) : undefined}
        >
          {textChannels.map((channel) => {
            const active = routeChannelId === channel.id;
            const count = unread[channel.id] ?? 0;
            return (
              <button
                key={channel.id}
                onClick={() => navigate(`/app/channel/${channel.id}`)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                  active ? 'bg-white/8 font-bold text-mist-50' : 'font-medium text-mist-400 hover:bg-white/4 hover:text-mist-200',
                )}
              >
                <Hash size={15} className="shrink-0 opacity-60" />
                <span className="flex-1 truncate text-start">{channel.name}</span>
                {count > 0 && !active && <Badge>{count > 9 ? '۹+' : count}</Badge>}
              </button>
            );
          })}
        </ChannelGroup>

        <ChannelGroup label={t.sidebar.voiceChannels} icon={<Volume2 size={13} />}>
          {voiceChannels.map((channel) => {
            const occupants = voiceRooms[channel.id] ?? [];
            const radio = radioStates[channel.id];
            const inThisRoom = activeVoiceChannel === channel.id;
            return (
              <div key={channel.id}>
                <button
                  onClick={() => navigate(`/app/voice/${channel.id}`)}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                    inThisRoom
                      ? 'bg-brand-500/15 font-bold text-brand-200'
                      : 'font-medium text-mist-400 hover:bg-white/4 hover:text-mist-200',
                  )}
                >
                  <Volume2 size={15} className="shrink-0 opacity-60" />
                  <span className="flex-1 truncate text-start">{channel.name}</span>
                  {occupants.length > 0 && (
                    <span className="rounded-full bg-white/8 px-1.5 text-[11px] font-bold text-mist-300">
                      {occupants.length}
                    </span>
                  )}
                </button>

                {/* Occupants preview (Discord-style) */}
                {occupants.length > 0 && (
                  <div className="mt-0.5 space-y-0.5 ps-6">
                    {occupants.map((userId) => {
                      const user = users.find((u) => u.id === userId);
                      return (
                        <div key={userId} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-mist-500">
                          <Avatar name={user?.displayName ?? '?'} src={user?.avatar} size={18} />
                          <span className="truncate">{user?.displayName ?? userId.slice(0, 8)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {radio && radio.status !== 'stopped' && radio.station && (
                  <button
                    onClick={() => openRadioFor(channel)}
                    className="ms-6 mt-1 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg bg-gradient-to-l from-brand-500/20 to-accent-500/10 px-2 py-1.5 text-[11px] font-bold text-brand-200 hover:from-brand-500/30"
                  >
                    <Radio size={12} className="shrink-0 animate-pulse" />
                    <span className="truncate">{radio.station.name}</span>
                  </button>
                )}
              </div>
            );
          })}
        </ChannelGroup>
      </div>

      {/* Current user bar */}
      <div className="flex items-center gap-2 border-t border-white/5 bg-ink-800/80 px-3 py-2.5">
        {me && <Avatar name={myUser?.displayName ?? me.displayName} src={me.avatar} size={34} online />}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-bold text-mist-100">{myUser?.displayName ?? me?.displayName}</p>
          <p dir="ltr" className="truncate text-[11px] text-mist-500">@{me?.username}</p>
        </div>

        {activeVoiceChannel && (
          <>
            <IconButton label={voice.micEnabled ? 'mic' : 'mic-off'} onClick={() => void voice.toggleMic()}>
              {voice.micEnabled ? <Mic size={17} /> : <MicOff size={17} className="text-rose-400" />}
            </IconButton>
            <IconButton label="deafen" onClick={voice.toggleDeafen}>
              {voice.deafened ? <HeadphoneOff size={17} className="text-rose-400" /> : <Headphones size={17} />}
            </IconButton>
          </>
        )}
        <IconButton label="profile" onClick={() => navigate('/app/profile')}>
          <UserRound size={17} />
        </IconButton>
        {isAdmin && (
          <IconButton label="admin" onClick={() => navigate('/app/admin')}>
            <Shield size={17} />
          </IconButton>
        )}
        <IconButton label="settings" onClick={() => navigate('/app/settings')}>
          <Settings size={17} />
        </IconButton>
        <IconButton label="logout" onClick={() => void doLogout()}>
          <LogOut size={17} className="text-rose-300" />
        </IconButton>
      </div>

      {creating && <CreateChannelModal onClose={() => setCreating(false)} />}
    </aside>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="rounded-lg p-2 text-mist-400 transition-colors hover:bg-white/8 hover:text-mist-100"
    >
      {children}
    </button>
  );
}

function ChannelGroup({
  label,
  icon,
  onAdd,
  children,
}: {
  label: string;
  icon: ReactNode;
  onAdd?: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-mist-500 uppercase">
          {icon}
          {label}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            title={t.sidebar.createChannel}
            className="rounded-md p-1 text-mist-500 hover:bg-white/5 hover:text-mist-200"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CreateChannelModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('text');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ channel: Channel }>('/channels', { name: name.trim(), kind });
      onClose();
      if (kind === 'text') navigate(`/app/channel/${res.channel.id}`);
      else navigate(`/app/voice/${res.channel.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm animate-pop-in rounded-2xl border border-white/10 bg-ink-800 p-5 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-mist-100">{t.sidebar.createChannel}</h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder={kind === 'text' ? 'چت جدید' : 'اتاق صوتی'}
          maxLength={48}
          className="w-full rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2.5 text-sm text-mist-100 outline-none placeholder:text-mist-500 focus:border-brand-500/60"
        />
        <div className="mt-3 flex gap-2">
          {(['text', 'voice'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                kind === k
                  ? 'border-brand-500/50 bg-brand-500/15 text-brand-200'
                  : 'border-white/8 bg-white/[0.03] text-mist-400 hover:text-mist-200',
              )}
            >
              {k === 'text' ? '📝 ' + t.sidebar.textChannels : '🔊 ' + t.sidebar.voiceChannels}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim()}>{t.common.save}</Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Headphones,
  HeadphoneOff,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Radio as RadioIcon,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useAuth } from '../../stores/auth.js';
import { useChat } from '../../stores/chat.js';
import { usePresence } from '../../stores/presence.js';
import { useVoice } from '../../stores/voice.js';
import { useUi } from '../../stores/ui.js';
import { useI18n } from '../../i18n/index.js';
import { Avatar, Button, VolumeSlider, cn } from '../../components/ui.js';
import { RADIO_BOT_IDENTITY } from '../../../shared/types.js';
import { Menu } from 'lucide-react';

const NO_OCCUPANTS: string[] = [];

export function VoiceRoomView() {
  const { channelId = '' } = useParams();
  const { t } = useI18n();
  const me = useAuth((s) => s.me);
  const channels = useChat((s) => s.channels);
  const channel = channels.find((c) => c.id === channelId);

  const voice = useVoice();
  const joined = voice.channelId === channelId && voice.connectionState !== 'idle';
  const occupants = usePresence((s) => s.voiceRooms[channelId] ?? NO_OCCUPANTS);
  const radioState = useVoice((s) => s.radioStates[channelId]);
  const setRadioModal = useChat((s) => s.setRadioModal);

  if (!channel) {
    return <div className="flex flex-1 items-center justify-center text-mist-500">{t.common.loading}</div>;
  }

  const statusLabel =
    voice.connectionState === 'connecting'
      ? t.voice.connecting
      : voice.connectionState === 'reconnecting'
        ? t.voice.reconnecting
        : joined
          ? t.voice.connected
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink-900">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-850/50 px-4 backdrop-blur">
        <button
          className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 lg:hidden"
          onClick={() => useUi.getState().setMobileNav(true)}
          aria-label="menu"
        >
          <Menu size={18} />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl brand-gradient">
          <Volume2 size={15} className="text-white" />
        </div>
        <h1 className="text-sm font-extrabold text-mist-100">{channel.name}</h1>

        {statusLabel && (
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
              voice.connectionState === 'connected'
                ? 'bg-emerald-500/12 text-emerald-300'
                : voice.connectionState === 'reconnecting'
                  ? 'bg-amber-500/12 text-amber-300'
                  : 'bg-white/6 text-mist-300',
            )}
          >
            {voice.connectionState !== 'connected' && <Loader2 size={11} className="animate-spin" />}
            {statusLabel}
          </span>
        )}

        <span className="ms-auto text-[11px] font-bold text-mist-500">
          {t.voice.participants}: {occupants.length + (joined ? 1 : 0)}
        </span>

        {radioState && radioState.status !== 'stopped' && radioState.station && (
          <button
            onClick={() => setRadioModal(channelId)}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-l from-brand-500/25 to-accent-500/15 px-3 py-1 text-[11px] font-bold text-brand-200 hover:from-brand-500/40"
          >
            <RadioIcon size={11} className="animate-pulse" />
            {radioState.station.name}
          </button>
        )}
      </header>

      {/* Screen-share stage */}
      {joined && <ScreenShareStage />}

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
        {joined ? (
          <ParticipantGrid channelId={channelId} />
        ) : (
          <NotJoinedPreview channelId={channelId} occupantCount={occupants.length} />
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/5 bg-ink-850/70 px-4 py-3.5 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-center gap-2.5">
          {joined ? (
            <>
              <ControlButton
                active={!voice.micEnabled}
                danger={!voice.micEnabled}
                label={voice.micEnabled ? t.voice.mic : t.voice.micOff}
                onClick={() => void voice.toggleMic()}
              >
                {voice.micEnabled ? <Mic size={19} /> : <MicOff size={19} />}
              </ControlButton>
              <ControlButton
                active={voice.deafened}
                danger={voice.deafened}
                label={voice.deafened ? t.voice.undeafen : t.voice.deafen}
                onClick={voice.toggleDeafen}
              >
                {voice.deafened ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
              </ControlButton>
              <ControlButton
                active={voice.screenSharing}
                label={voice.screenSharing ? t.voice.stopShare : t.voice.shareScreen}
                onClick={() => void voice.toggleScreenShare()}
              >
                <MonitorUp size={19} />
              </ControlButton>
              <ControlButton
                accent
                active={radioState?.status === 'playing'}
                label={t.radio.title}
                onClick={() => setRadioModal(channelId)}
              >
                <RadioIcon size={19} />
              </ControlButton>
              <ControlButton danger filled label={t.voice.leaveVoice} onClick={() => void voice.leave()}>
                <PhoneOff size={19} />
              </ControlButton>
            </>
          ) : (
            <Button
              onClick={() => void voice.join(channelId)}
              disabled={voice.connectionState === 'connecting'}
              className="px-8 py-3 text-base"
            >
              {voice.connectionState === 'connecting' ? (
                <>
                  <Loader2 size={17} className="animate-spin" /> {t.voice.connecting}
                </>
              ) : (
                t.voice.joinVoice
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Not joined ─────────────────────────────────────────────── */

function NotJoinedPreview({ channelId, occupantCount }: { channelId: string; occupantCount: number }) {
  const { t } = useI18n();
  const join = useVoice((s) => s.join);
  return (
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-brand-500/25 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl brand-gradient shadow-glow">
          <Volume2 size={34} className="text-white" />
        </div>
      </div>
      <h2 className="text-lg font-extrabold text-mist-50">{t.voice.joinVoice}</h2>
      <p className="text-xs leading-relaxed text-mist-400">
        {occupantCount > 0 ? `${occupantCount} · ${t.voice.inRoom}` : t.voice.emptyRoom}
      </p>
      <Button onClick={() => void join(channelId)} className="px-8 py-2.5">
        {t.voice.joinVoice}
      </Button>
    </div>
  );
}

/* ── Participant grid ───────────────────────────────────────── */

function ParticipantGrid({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const me = useAuth((s) => s.me);
  const users = useAuth((s) => s.users);
  const voice = useVoice();
  const radioState = useVoice((s) => s.radioStates[channelId]);

  const remoteHumans = voice.remoteParticipants.filter((p) => p.identity !== RADIO_BOT_IDENTITY);
  const radioBot = voice.remoteParticipants.find((p) => p.identity === RADIO_BOT_IDENTITY);

  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-3.5 sm:grid-cols-3">
      {/* Me */}
      {me && (
        <ParticipantCard
          identity={me.id}
          displayName={me.displayName}
          avatar={me.avatar}
          muted={!voice.micEnabled}
          speaking={false}
          isSelf
          quality={null}
        />
      )}

      {/* Remote humans */}
      {remoteHumans.map((p) => {
        const user = users.find((u) => u.id === p.identity);
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        return (
          <ParticipantCard
            key={p.identity}
            identity={p.identity}
            displayName={user?.displayName ?? p.name ?? p.identity.slice(0, 8)}
            avatar={user?.avatar}
            muted={micPub?.isMuted ?? true}
            speaking={voice.activeSpeakers.has(p.identity)}
            quality={p.connectionQuality}
          />
        );
      })}

      {/* Radio bot */}
      {radioBot && (
        <RadioParticipantCard
          channelId={channelId}
          stationName={radioState?.station?.name ?? t.voice.radioBot}
          radioStatus={radioState?.status ?? 'playing'}
        />
      )}

      {/* Empty hint */}
      {remoteHumans.length === 0 && !radioBot && (
        <p className="col-span-full pt-2 text-center text-xs text-mist-500">{t.voice.emptyRoom}</p>
      )}
    </div>
  );
}

function ParticipantCard({
  identity,
  displayName,
  avatar,
  muted,
  speaking,
  isSelf = false,
  quality,
}: {
  identity: string;
  displayName: string;
  avatar?: string | null;
  muted: boolean;
  speaking: boolean;
  isSelf?: boolean;
  quality: string | null;
}) {
  const { t } = useI18n();
  const volumes = useVoice((s) => s.volumes);
  const setVolume = useVoice((s) => s.setVolume);
  const deafened = useVoice((s) => s.deafened);
  const [showVolume, setShowVolume] = useState(false);
  const volume = deafened ? 0 : (volumes[identity] ?? 1);

  const QualityIcon =
    quality === 'excellent'
      ? SignalHigh
      : quality === 'good'
        ? SignalMedium
        : quality === 'poor'
          ? SignalLow
          : quality === 'lost'
            ? SignalZero
            : null;

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-2.5 rounded-2xl border p-5 transition-all',
        speaking
          ? 'border-brand-500/60 bg-brand-500/10 shadow-glow'
          : 'border-white/6 bg-white/[0.03] hover:border-white/12',
      )}
    >
      <Avatar name={displayName} src={avatar} size={56} speaking={speaking} />
      <div className="flex items-center gap-1.5">
        <span className="max-w-28 truncate text-xs font-extrabold text-mist-100">{displayName}</span>
        {isSelf && <span className="text-[10px] text-mist-500">({t.common.you})</span>}
        {muted && <MicOff size={12} className="text-rose-400" />}
      </div>

      <div className="flex items-center gap-1.5">
        {/* Per-participant volume */}
        <button
          onClick={() => setShowVolume((v) => !v)}
          title={t.voice.volume}
          className="rounded-lg p-1 text-mist-500 hover:bg-white/6 hover:text-mist-200"
        >
          {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        {QualityIcon && (
          <QualityIcon
            size={13}
            className={cn(
              quality === 'excellent' && 'text-emerald-400',
              quality === 'good' && 'text-mist-400',
              (quality === 'poor' || quality === 'lost') && 'text-amber-400',
            )}
          />
        )}
      </div>

      {showVolume && (
        <div className="absolute inset-x-3 bottom-2 flex items-center gap-2 rounded-xl border border-white/10 bg-ink-750/95 px-2.5 py-2 shadow-card backdrop-blur">
          <Volume2 size={11} className="shrink-0 text-mist-400" />
          <VolumeSlider
            value={volume}
            onChange={(v) => setVolume(identity, v)}
            ariaLabel={`${displayName} volume`}
          />
          <span className="w-8 shrink-0 text-end text-[10px] font-bold text-mist-400">
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

function RadioParticipantCard({
  channelId,
  stationName,
  radioStatus,
}: {
  channelId: string;
  stationName: string;
  radioStatus: string;
}) {
  const { t } = useI18n();
  const volumes = useVoice((s) => s.volumes);
  const setVolume = useVoice((s) => s.setVolume);
  const deafened = useVoice((s) => s.deafened);
  const volume = deafened ? 0 : (volumes[RADIO_BOT_IDENTITY] ?? 1);

  return (
    <div className="relative flex flex-col items-center gap-2.5 overflow-hidden rounded-2xl border border-brand-500/40 bg-gradient-to-b from-brand-500/15 to-accent-500/8 p-5 shadow-glow">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient">
        <RadioIcon size={24} className="text-white" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="max-w-32 truncate text-xs font-extrabold text-mist-50">{t.voice.radioBot}</span>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-brand-200">
        {radioStatus === 'playing' ? (
          <>
            <span className="flex h-3 items-end gap-0.5" dir="ltr">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="eq-bar h-3 w-1 rounded bg-brand-300"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </span>
            {stationName}
          </>
        ) : radioStatus === 'connecting' ? (
          t.radio.connecting
        ) : (
          t.radio.error
        )}
      </span>

      {/* Independent radio volume */}
      <div className="flex w-full items-center gap-2 px-1">
        <Volume2 size={12} className="shrink-0 text-mist-400" />
        <VolumeSlider
          value={volume}
          onChange={(v) => setVolume(RADIO_BOT_IDENTITY, v)}
          ariaLabel="radio volume"
        />
        <span className="w-8 shrink-0 text-end text-[10px] font-bold text-mist-400">
          {Math.round(volume * 100)}%
        </span>
      </div>
      <span className="absolute end-2 top-2 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold tracking-wide text-mist-300 uppercase">
        radio · {channelId.slice(0, 0)}mp
      </span>
    </div>
  );
}

/* ── Screen share stage ─────────────────────────────────────── */

function ScreenShareStage() {
  const { t } = useI18n();
  const voice = useVoice();
  const users = useAuth((s) => s.users);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Which participant is sharing? (remote first, then local)
  const remoteSharer = voice.remoteParticipants.find(
    (p) => p.getTrackPublication(Track.Source.ScreenShare)?.track,
  );
  const localSharePub = voice.room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const sharerName = remoteSharer
    ? (users.find((u) => u.id === remoteSharer.identity)?.displayName ?? remoteSharer.name)
    : voice.screenSharing
      ? t.common.you
      : null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const track =
      remoteSharer?.getTrackPublication(Track.Source.ScreenShare)?.track ??
      (localSharePub?.track as LocalVideoTrack | undefined);
    if (track) {
      track.attach(el);
      return () => {
        try {
          track.detach(el);
        } catch { /* ignore */ }
      };
    }
  }, [remoteSharer, localSharePub]);

  if (!remoteSharer && !voice.screenSharing) return null;

  return (
    <div className="relative mx-4 mt-4 flex-1 overflow-hidden rounded-2xl border border-white/8 bg-black/60 shadow-card">
      <video ref={videoRef} autoPlay playsInline className="h-full w-full object-contain" />
      <span className="absolute start-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-mist-100 backdrop-blur">
        <MonitorUp size={12} className="text-brand-300" />
        {sharerName} · {t.voice.screenSharingBy}
      </span>
    </div>
  );
}

/* ── Control button ─────────────────────────────────────────── */

function ControlButton({
  label,
  onClick,
  children,
  active = false,
  danger = false,
  accent = false,
  filled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
  filled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-2xl border transition-all',
        filled
          ? 'border-rose-500/40 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
          : accent
            ? active
              ? 'border-brand-500/60 bg-brand-500/25 text-brand-100 shadow-glow'
              : 'border-brand-500/30 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20'
            : danger
              ? 'border-rose-500/30 bg-rose-500/12 text-rose-300 hover:bg-rose-500/20'
              : active
                ? 'border-white/20 bg-white/12 text-mist-100'
                : 'border-white/8 bg-white/[0.05] text-mist-300 hover:bg-white/10 hover:text-mist-100',
      )}
    >
      {children}
    </button>
  );
}

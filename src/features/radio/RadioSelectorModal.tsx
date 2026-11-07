import { useEffect, useState } from 'react';
import { Flame, Globe, Loader2, Radio, Sparkles, CloudRain, Square, Volume2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../stores/auth.js';
import { useVoice } from '../../stores/voice.js';
import { useI18n } from '../../i18n/index.js';
import { Modal, VolumeSlider, cn } from '../../components/ui.js';
import type { RadioStation } from '../../../shared/types.js';

const STATION_ICONS = {
  flame: Flame,
  sparkles: Sparkles,
  globe: Globe,
  'cloud-rain': CloudRain,
} as const;

export function RadioSelectorModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { t } = useI18n();
  const me = useAuth((s) => s.me);
  const [stations, setStations] = useState<RadioStation[] | null>(null);
  const radioState = useVoice((s) => s.radioStates[channelId]);
  const startRadio = useVoice((s) => s.startRadio);
  const stopRadio = useVoice((s) => s.stopRadio);
  const inRoom = useVoice((s) => s.channelId === channelId);
  const [busyStation, setBusyStation] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ stations: RadioStation[] }>('/voice/radio/stations')
      .then((res) => setStations(res.stations))
      .catch(() => setStations([]));
  }, []);

  const isPlaying = radioState && radioState.status !== 'stopped' && radioState.station;
  const startingByMe = radioState?.startedBy?.id === me?.id;

  return (
    <Modal open onClose={onClose} title={
      <span className="flex items-center gap-2">
        <Radio size={15} className="text-brand-400" />
        {t.radio.title}
      </span>
    } width="max-w-md">
      <p className="mb-4 text-xs leading-relaxed text-mist-400">{t.radio.subtitle}</p>

      {!inRoom && (
        <p className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {t.radio.needVoice}
        </p>
      )}

      {!stations ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-brand-400" size={24} />
        </div>
      ) : (
        <div className="space-y-2">
          {stations.map((station) => {
            const Icon = STATION_ICONS[station.icon];
            const active = radioState?.station?.id === station.id && radioState.status !== 'stopped';
            const busy = busyStation === station.id;
            return (
              <button
                key={station.id}
                disabled={!inRoom || busy}
                onClick={async () => {
                  setBusyStation(station.id);
                  await startRadio(channelId, station.id);
                  setBusyStation(null);
                }}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-start transition-all disabled:cursor-not-allowed',
                  active
                    ? 'border-brand-500/60 bg-brand-500/12 shadow-glow'
                    : 'border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-40',
                )}
              >
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-card',
                    station.gradient,
                  )}
                >
                  {busy ? <Loader2 size={19} className="animate-spin" /> : <Icon size={19} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-mist-50">{station.name}</span>
                  <span dir="ltr" className="block text-[11px] text-mist-500">{station.englishName}</span>
                </span>
                {active && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-brand-300">
                    {radioState!.status === 'playing' ? (
                      <>
                        <span className="flex h-3 items-end gap-0.5" dir="ltr">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className="eq-bar h-3 w-1 rounded bg-brand-400"
                              style={{ animationDelay: `${i * 160}ms` }}
                            />
                          ))}
                        </span>
                        {t.radio.nowPlaying}
                      </>
                    ) : radioState!.status === 'connecting' ? (
                      t.radio.connecting
                    ) : (
                      t.radio.error
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Current playback footer */}
      {isPlaying && (
        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2 text-xs text-mist-400">
            <Volume2 size={13} className="text-brand-400" />
            <span>
              {t.radio.nowPlaying}: <b className="text-mist-100">{radioState!.station!.name}</b>
              {radioState!.startedBy && (
                <>
                  {' · '}
                  {t.radio.startedBy}: <b className="text-brand-300">{startingByMe ? t.radio.byYou : radioState!.startedBy.displayName}</b>
                </>
              )}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <Square size={12} className="shrink-0 text-rose-400" />
            <button
              onClick={() => void stopRadio(channelId)}
              disabled={!inRoom}
              className="flex-1 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
            >
              {t.radio.stop}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-mist-600">{t.radio.switchHint}</p>
        </div>
      )}
    </Modal>
  );
}

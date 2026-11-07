import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
} from 'livekit-client';
import { api, ApiError } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { toast } from './toast.js';
import { getCurrentDict } from '../i18n/index.js';
import type { RadioState, VoiceTokenResponse } from '../../shared/types.js';

const VOLUMES_KEY = 'mg_volumes';

type VoiceConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

function loadVolumes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VOLUMES_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function saveVolumes(v: Record<string, number>): void {
  try {
    localStorage.setItem(VOLUMES_KEY, JSON.stringify(v));
  } catch { /* ignore */ }
}

function refreshParticipants(room: Room | null): RemoteParticipant[] {
  return room ? Array.from(room.remoteParticipants.values()) : [];
}

interface VoiceStore {
  room: Room | null;
  channelId: string | null;
  connectionState: VoiceConnectionState;
  micEnabled: boolean;
  deafened: boolean;
  screenSharing: boolean;
  screenSharedBy: string | null; // identity of the remote sharer (null when it's us)
  remoteParticipants: RemoteParticipant[];
  activeSpeakers: Set<string>;
  volumes: Record<string, number>;
  radioStates: Record<string, RadioState>;
  radioSelectorChannelId: string | null;

  join: (channelId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => void;
  toggleScreenShare: () => Promise<void>;
  setVolume: (identity: string, volume: number) => void;
  openRadioSelector: (channelId: string | null) => void;
  startRadio: (channelId: string, stationId: string) => Promise<void>;
  stopRadio: (channelId: string) => Promise<void>;
  refreshRadioState: (channelId: string) => Promise<void>;
  initSocket: () => void;
}

export const useVoice = create<VoiceStore>((set, get) => {
  const wireRoom = (room: Room) => {
    const refresh = () => set({ remoteParticipants: refreshParticipants(room) });

    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.TrackSubscribed, refresh);
    room.on(RoomEvent.TrackUnsubscribed, refresh);
    room.on(RoomEvent.TrackMuted, refresh);
    room.on(RoomEvent.TrackUnmuted, refresh);
    room.on(RoomEvent.ConnectionQualityChanged, refresh);

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      set({ activeSpeakers: new Set(speakers.map((p) => p.identity)) });
    });

    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
        set({ screenSharing: true, screenSharedBy: null });
      }
      if (pub.source === Track.Source.Microphone) {
        set({ micEnabled: !pub.isMuted });
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
        set({ screenSharing: false });
      }
    });

    room.on(RoomEvent.Reconnecting, () => set({ connectionState: 'reconnecting' }));
    room.on(RoomEvent.Reconnected, () => set({ connectionState: 'connected' }));

    room.on(RoomEvent.Disconnected, () => {
      getSocket().emit('voice:leave');
      set({
        room: null,
        channelId: null,
        connectionState: 'idle',
        micEnabled: false,
        deafened: false,
        screenSharing: false,
        screenSharedBy: null,
        remoteParticipants: [],
        activeSpeakers: new Set(),
      });
    });
  };

  return {
    room: null,
    channelId: null,
    connectionState: 'idle',
    micEnabled: false,
    deafened: false,
    screenSharing: false,
    screenSharedBy: null,
    remoteParticipants: [],
    activeSpeakers: new Set<string>(),
    volumes: loadVolumes(),
    radioStates: {},
    radioSelectorChannelId: null,

    join: async (channelId) => {
      if (get().channelId) await get().leave();
      set({ connectionState: 'connecting', channelId });
      try {
        const tokenRes = await api.post<VoiceTokenResponse>(`/voice/${channelId}/token`);
        const room = new Room({ dynacast: false, adaptiveStream: false });
        wireRoom(room);
        await room.connect(tokenRes.url, tokenRes.token);
        set({ room, connectionState: 'connected' });
        getSocket().emit('voice:join', { channelId });
        // Start with the microphone live (Discord-style); recover gracefully if denied.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          set({ micEnabled: true });
        } catch {
          set({ micEnabled: false });
          toast.error(getCurrentDict().voice.micPermission);
        }
        void get().refreshRadioState(channelId);
      } catch (err) {
        set({ connectionState: 'error' });
        if (err instanceof ApiError && err.code === 'VOICE_NOT_CONFIGURED') {
          toast.error(getCurrentDict().voice.notConfigured);
        } else if (err instanceof ApiError) toast.error(err.message);
        else toast.error(getCurrentDict().voice.disconnected);
        window.setTimeout(() => {
          if (get().connectionState === 'error') set({ connectionState: 'idle', channelId: null });
        }, 1500);
      }
    },

    leave: async () => {
      const room = get().room;
      set({ connectionState: 'idle' });
      getSocket().emit('voice:leave');
      if (room) {
        try {
          await room.disconnect();
        } catch { /* ignore */ }
      }
      set({
        room: null,
        channelId: null,
        remoteParticipants: [],
        activeSpeakers: new Set(),
        micEnabled: false,
        deafened: false,
        screenSharing: false,
        screenSharedBy: null,
      });
    },

    toggleMic: async () => {
      const room = get().room;
      if (!room) return;
      const next = !get().micEnabled;
      try {
        await room.localParticipant.setMicrophoneEnabled(next);
        set({ micEnabled: next });
      } catch {
        toast.error(getCurrentDict().voice.micPermission);
      }
    },

    toggleDeafen: () => {
      set((s) => ({ deafened: !s.deafened }));
    },

    toggleScreenShare: async () => {
      const room = get().room;
      if (!room) return;
      try {
        if (get().screenSharing) {
          await room.localParticipant.setScreenShareEnabled(false);
          set({ screenSharing: false });
        } else {
          await room.localParticipant.setScreenShareEnabled(true, { audio: true });
          set({ screenSharing: true, screenSharedBy: null });
        }
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name !== 'NotAllowedError' && name !== 'AbortError') {
          toast.error(getCurrentDict().voice.screenPermission);
        }
        set({ screenSharing: get().screenSharing });
      }
    },

    setVolume: (identity, volume) => {
      const volumes = { ...get().volumes, [identity]: volume };
      set({ volumes });
      saveVolumes(volumes);
    },

    openRadioSelector: (channelId) => set({ radioSelectorChannelId: channelId }),

    startRadio: async (channelId, stationId) => {
      try {
        const state = await api.post<RadioState>(`/voice/${channelId}/radio`, { action: 'start', stationId });
        set((s) => ({ radioStates: { ...s.radioStates, [channelId]: state } }));
        toast.success(getCurrentDict().toast.radioStarted);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === 'NOT_IN_VOICE_ROOM') toast.error(getCurrentDict().toast.mustJoinVoice);
          else toast.error(err.message);
        } else {
          toast.error(getCurrentDict().toast.radioError);
        }
      }
    },

    stopRadio: async (channelId) => {
      try {
        const state = await api.post<RadioState>(`/voice/${channelId}/radio`, { action: 'stop' });
        set((s) => ({ radioStates: { ...s.radioStates, [channelId]: state } }));
        toast.success(getCurrentDict().toast.radioStopped);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_IN_VOICE_ROOM') toast.error(getCurrentDict().toast.mustJoinVoice);
      }
    },

    refreshRadioState: async (channelId) => {
      try {
        const state = await api.get<RadioState>(`/voice/${channelId}/radio`);
        set((s) => ({ radioStates: { ...s.radioStates, [channelId]: state } }));
      } catch { /* ignore */ }
    },

    initSocket: () => {
      getSocket().on('radio:state', (state) => {
        set((s) => ({ radioStates: { ...s.radioStates, [state.channelId]: state } }));
      });
    },
  };
});

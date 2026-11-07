import { create } from 'zustand';
import { getSocket } from '../lib/socket.js';
import type { VoiceRoomState } from '../../shared/types.js';

interface PresenceStore {
  onlineUserIds: Set<string>;
  /** channelId -> userIds currently in that voice room */
  voiceRooms: Record<string, string[]>;
  /** LiveKit connection state of the local user ('idle' = not connected). */
  init: () => void;
}

export const usePresence = create<PresenceStore>((set) => ({
  onlineUserIds: new Set<string>(),
  voiceRooms: {},
  init: () => {
    const socket = getSocket();
    socket.on('presence:state', (payload) => {
      set({ onlineUserIds: new Set(payload.onlineUserIds) });
    });
    socket.on('voice:state', (payload: VoiceRoomState) => {
      const rooms: Record<string, string[]> = {};
      for (const [channelId, room] of Object.entries(payload.rooms ?? {})) {
        rooms[channelId] = room.userIds;
      }
      set({ voiceRooms: rooms });
    });
  },
}));

export function isVoiceRoomOccupied(state: PresenceStore, channelId: string): boolean {
  return (state.voiceRooms[channelId]?.length ?? 0) > 0;
}

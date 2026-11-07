import { create } from 'zustand';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { toast } from './toast.js';
import { useAuth } from './auth.js';
import type { Channel, Message } from '../../shared/types.js';

const LAST_READ_KEY = 'mg_last_read';
const TYPING_TTL = 6000;

function loadLastRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveLastRead(map: Record<string, string>): void {
  try {
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

interface TypingEntry {
  userId: string;
  displayName: string;
  expiresAt: number;
}

interface ChatStore {
  channels: Channel[];
  channelsLoaded: boolean;
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  loadingChannel: string | null;
  typing: Record<string, Record<string, TypingEntry>>;
  unread: Record<string, number>;
  activeChannelId: string | null;
  /** Radio modal opened via /mp — bound to a voice channel. */
  radioModalChannelId: string | null;

  loadChannels: () => Promise<void>;
  openChannel: (channelId: string) => Promise<void>;
  setActiveChannel: (channelId: string | null) => void;
  loadOlder: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, replyToId?: string) => Promise<void>;
  editMessage: (message: Message, content: string) => Promise<void>;
  deleteMessage: (message: Message) => Promise<void>;
  toggleReaction: (message: Message, emoji: string) => Promise<void>;
  notifyTyping: (channelId: string) => void;
  markRead: (channelId: string) => void;
  setRadioModal: (channelId: string | null) => void;
  initSocket: () => void;
}

let lastTypingSent = 0;

export const useChat = create<ChatStore>((set, get) => ({
  channels: [],
  channelsLoaded: false,
  messages: {},
  hasMore: {},
  loadingChannel: null,
  typing: {},
  unread: {},
  activeChannelId: null,
  radioModalChannelId: null,

  loadChannels: async () => {
    const res = await api.get<{ channels: Channel[] }>('/channels');
    const lastRead = loadLastRead();
    const unread: Record<string, number> = {};
    for (const c of res.channels) {
      if (c.kind !== 'text') continue;
      const readAt = lastRead[c.id];
      if (c.lastMessageAt && (!readAt || new Date(c.lastMessageAt) > new Date(readAt))) {
        unread[c.id] = get().unread[c.id] ?? 1;
      }
    }
    set({ channels: res.channels, channelsLoaded: true, unread: { ...unread, ...get().unread } });
  },

  openChannel: async (channelId) => {
    set({ activeChannelId: channelId, loadingChannel: channelId });
    get().markRead(channelId);
    try {
      const res = await api.get<{ messages: Message[]; hasMore: boolean }>(
        `/channels/${channelId}/messages?limit=50`,
      );
      set((s) => ({
        messages: { ...s.messages, [channelId]: res.messages },
        hasMore: { ...s.hasMore, [channelId]: res.hasMore },
        loadingChannel: null,
      }));
    } catch {
      set({ loadingChannel: null });
      toast.error('Could not load messages');
    }
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId });
    if (channelId) get().markRead(channelId);
  },

  loadOlder: async (channelId) => {
    const msgs = get().messages[channelId] ?? [];
    const oldest = msgs[0];
    if (!oldest || get().hasMore[channelId] === false) return;
    try {
      const res = await api.get<{ messages: Message[]; hasMore: boolean }>(
        `/channels/${channelId}/messages?before=${oldest.id}&limit=50`,
      );
      set((s) => ({
        messages: { ...s.messages, [channelId]: [...res.messages, ...(s.messages[channelId] ?? [])] },
        hasMore: { ...s.hasMore, [channelId]: res.hasMore },
      }));
    } catch { /* ignore */ }
  },

  sendMessage: async (channelId, content, replyToId) => {
    await api.post(`/channels/${channelId}/messages`, { content, ...(replyToId ? { replyToId } : {}) });
  },

  editMessage: async (message, content) => {
    const res = await api.patch<{ message: Message }>(`/messages/${message.id}`, { content });
    set((s) => ({
      messages: {
        ...s.messages,
        [message.channelId]: (s.messages[message.channelId] ?? []).map((m) => (m.id === res.message.id ? res.message : m)),
      },
    }));
  },

  deleteMessage: async (message) => {
    await api.delete(`/messages/${message.id}`);
    // 'message:deleted' socket event performs the local update.
  },

  toggleReaction: async (message, emoji) => {
    try {
      const res = await api.put<{ message: Message }>(`/messages/${message.id}/reactions`, { emoji });
      set((s) => ({
        messages: {
          ...s.messages,
          [message.channelId]: (s.messages[message.channelId] ?? []).map((m) =>
            m.id === res.message.id ? res.message : m,
          ),
        },
      }));
    } catch (err) {
      // Optimistic failure — refresh the single message from the broadcast.
      void err;
    }
  },

  notifyTyping: (channelId) => {
    const now = Date.now();
    if (now - lastTypingSent < 2500) return;
    lastTypingSent = now;
    getSocket().emit('typing', { channelId, typing: true });
  },

  markRead: (channelId) => {
    const lastRead = loadLastRead();
    lastRead[channelId] = new Date().toISOString();
    saveLastRead(lastRead);
    set((s) => {
      const unread = { ...s.unread };
      delete unread[channelId];
      return { unread };
    });
  },

  setRadioModal: (channelId) => set({ radioModalChannelId: channelId }),

  initSocket: () => {
    const socket = getSocket();

    socket.on('message:new', ({ message }) => {
      const state = get();
      const meId = useAuth.getState().me?.id;
      const list = state.messages[message.channelId];
      if (list) {
        if (list.some((m) => m.id === message.id)) return;
        set((s) => ({
          messages: { ...s.messages, [message.channelId]: [...(s.messages[message.channelId] ?? []), message] },
        }));
      }
      // Update channel lastMessageAt + unread badge
      set((s) => ({
        channels: s.channels.map((c) => (c.id === message.channelId ? { ...c, lastMessageAt: message.createdAt } : c)),
      }));
      if (state.activeChannelId !== message.channelId && message.author.id !== meId) {
        // Only count for text channels; voice channels have no chat badge.
        const channel = state.channels.find((c) => c.id === message.channelId);
        if (channel?.kind === 'text') {
          set((s) => ({ unread: { ...s.unread, [message.channelId]: (s.unread[message.channelId] ?? 0) + 1 } }));
        }
      }
    });

    socket.on('message:updated', ({ message }) => {
      set((s) => ({
        messages: {
          ...s.messages,
          [message.channelId]: (s.messages[message.channelId] ?? []).map((m) => (m.id === message.id ? message : m)),
        },
      }));
    });

    socket.on('message:deleted', ({ channelId, id }) => {
      set((s) => ({
        messages: {
          ...s.messages,
          [channelId]: (s.messages[channelId] ?? []).map((m) =>
            m.id === id
              ? { ...m, deletedAt: new Date().toISOString(), content: '', reactions: [] }
              : m,
          ),
        },
      }));
    });

    socket.on('reactions:updated', ({ message }) => {
      set((s) => ({
        messages: {
          ...s.messages,
          [message.channelId]: (s.messages[message.channelId] ?? []).map((m) => (m.id === message.id ? message : m)),
        },
      }));
    });

    socket.on('typing', ({ channelId, userId, displayName, typing }) => {
      set((s) => {
        const perChannel = { ...(s.typing[channelId] ?? {}) };
        if (typing) {
          perChannel[userId] = { userId, displayName, expiresAt: Date.now() + TYPING_TTL };
        } else {
          delete perChannel[userId];
        }
        return { typing: { ...s.typing, [channelId]: perChannel } };
      });
      if (typing) {
        window.setTimeout(() => {
          set((s) => {
            const perChannel = { ...(s.typing[channelId] ?? {}) };
            const entry = perChannel[userId];
            if (entry && Date.now() >= entry.expiresAt) delete perChannel[userId];
            return { typing: { ...s.typing, [channelId]: perChannel } };
          });
        }, TYPING_TTL + 500);
      }
    });

    socket.on('channel:created', (channel) => {
      set((s) => ({ channels: [...s.channels, channel] }));
    });
  },
}));

/** True when the given channel has unread messages (sidebar badge). */
export function channelUnreadCount(unread: Record<string, number>, channelId: string): number {
  return unread[channelId] ?? 0;
}

import { create } from 'zustand';
import { api, ApiError } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import type { MeUser, PublicUser } from '../../shared/types.js';
import type { Locale } from '../i18n/index.js';

export type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthStore {
  status: AuthStatus;
  me: MeUser | null;
  users: PublicUser[];
  needsSetup: boolean;
  livekitConfigured: boolean;
  bootstrap: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (input: { username: string; displayName: string; password: string; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: { displayName?: string; avatar?: string | null; locale?: Locale }) => Promise<void>;
  applyLocale: (locale: Locale) => void;
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: 'loading',
  me: null,
  users: [],
  needsSetup: false,
  livekitConfigured: false,

  bootstrap: async () => {
    try {
      const [state, meRes] = await Promise.all([
        api.get<{ needsSetup: boolean; livekitConfigured: boolean }>('/auth/state'),
        api.get<{ user: MeUser }>('/auth/me'),
      ]);
      set({
        status: 'authenticated',
        me: meRes.user,
        needsSetup: state.needsSetup,
        livekitConfigured: state.livekitConfigured,
      });
      void get().refreshUsers();
      // Announce ourselves on the socket and subscribe to all channel rooms.
      const socket = getSocket();
      try {
        const channels = await api.get<{ channels: Array<{ id: string }> }>('/channels');
        socket.emit('channels:subscribe', channels.channels.map((c) => c.id));
      } catch { /* channels load happens elsewhere */ }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        try {
          const state = await api.get<{ needsSetup: boolean; livekitConfigured: boolean }>('/auth/state');
          set({ status: 'guest', me: null, needsSetup: state.needsSetup, livekitConfigured: state.livekitConfigured });
        } catch {
          set({ status: 'guest', me: null });
        }
      } else {
        // Server temporarily unreachable — stay in loading and let the UI retry.
        throw err;
      }
    }
  },

  refreshUsers: async () => {
    try {
      const res = await api.get<{ users: PublicUser[] }>('/users');
      set({ users: res.users });
    } catch { /* ignore */ }
  },

  login: async (username, password) => {
    const res = await api.post<{ user: PublicUser }>('/auth/login', { username, password });
    await get().bootstrap();
    void res;
  },

  register: async (input) => {
    await api.post('/auth/register', input);
    await get().bootstrap();
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      set({ status: 'guest', me: null, users: [] });
    }
  },

  updateProfile: async (input) => {
    const res = await api.patch<{ user: PublicUser }>('/users/me', input);
    const me = get().me;
    if (me) set({ me: { ...me, ...res.user } });
    void get().refreshUsers();
  },

  applyLocale: (locale) => {
    const me = get().me;
    if (me) set({ me: { ...me, locale } });
  },
}));

/** Find a user by id from the cached member list. */
export function findUser(users: PublicUser[], id: string): PublicUser | undefined {
  return users.find((u) => u.id === id);
}

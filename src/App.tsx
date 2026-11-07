import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n/index.js';
import { useAuth } from './stores/auth.js';
import { useChat } from './stores/chat.js';
import { usePresence } from './stores/presence.js';
import { useVoice } from './stores/voice.js';
import { AuthPage } from './features/auth/AuthPage.js';
import { AppLayout } from './features/layout/AppLayout.js';
import { ChannelChat } from './features/chat/ChannelChat.js';
import { VoiceRoomView } from './features/voice/VoiceRoomView.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { ProfilePage } from './features/profile/ProfilePage.js';
import { AdminPage } from './features/admin/AdminPage.js';
import { NotFoundPage } from './features/NotFoundPage.js';
import { Splash } from './components/ui.js';

export default function App() {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const initChatSocket = useChat((s) => s.initSocket);
  const initPresence = usePresence((s) => s.init);
  const initVoiceSocket = useVoice((s) => s.initSocket);

  useEffect(() => {
    void bootstrap().catch(() => {});
  }, [bootstrap]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    initChatSocket();
    initPresence();
    initVoiceSocket();
  }, [status, initChatSocket, initPresence, initVoiceSocket]);

  return (
    <I18nProvider initialLocale={useAuth.getState().me?.locale as 'fa' | 'en' | undefined}>
      <BrowserRouter>
        {status === 'loading' ? (
          <Splash />
        ) : status === 'guest' ? (
          <Routes>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/login" element={<Navigate to="/app" replace />} />
            <Route path="/register" element={<Navigate to="/app" replace />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<ChannelRoot />} />
              <Route path="channel/:channelId" element={<ChannelChat />} />
              <Route path="voice/:channelId" element={<VoiceRoomView />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        )}
      </BrowserRouter>
    </I18nProvider>
  );
}

/** /app without a channel id → first text channel. */
function ChannelRoot() {
  const channels = useChat((s) => s.channels);
  const firstText = channels.find((c) => c.kind === 'text');
  if (firstText) return <Navigate to={`/app/channel/${firstText.id}`} replace />;
  return <div className="flex h-full items-center justify-center text-mist-500">…</div>;
}

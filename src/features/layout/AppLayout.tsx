import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { MembersPanel } from './MembersPanel.js';
import { RadioSelectorModal } from '../radio/RadioSelectorModal.js';
import { RemoteAudioRenderer } from '../voice/RemoteAudio.js';
import { ToastViewport } from '../../components/ui.js';
import { useUi } from '../../stores/ui.js';
import { useChat } from '../../stores/chat.js';
import { useVoice } from '../../stores/voice.js';
import { useI18n } from '../../i18n/index.js';

export function AppLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const mobileNavOpen = useUi((s) => s.mobileNavOpen);
  const setMobileNav = useUi((s) => s.setMobileNav);
  const loadChannels = useChat((s) => s.loadChannels);
  const channelsLoaded = useChat((s) => s.channelsLoaded);
  const radioModalChannelId = useChat((s) => s.radioModalChannelId);
  const setRadioModal = useChat((s) => s.setRadioModal);
  const openRadioSelector = useVoice((s) => s.openRadioSelector);

  useEffect(() => {
    if (!channelsLoaded) void loadChannels();
  }, [channelsLoaded, loadChannels]);

  // Route clicks close the mobile drawer.
  useEffect(() => {
    if (mobileNavOpen) setMobileNav(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-900">
      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      {/* Sidebar: fixed drawer on mobile, static column on desktop */}
      <div
        className={`fixed inset-y-0 start-0 z-40 w-72 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0'
        }`}
      >
        <Sidebar />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>

      <MembersPanel />

      {/* Keeps remote (and radio) audio alive across route changes */}
      <RemoteAudioRenderer />

      {radioModalChannelId && (
        <RadioSelectorModal
          channelId={radioModalChannelId}
          onClose={() => {
            setRadioModal(null);
            openRadioSelector(null);
          }}
        />
      )}

      <ToastViewport />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { ParticipantEvent, Track, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { useVoice } from '../../stores/voice.js';

/**
 * Attaches every remote audio track to its own <audio> element with an
 * independent per-participant volume (0..1, persisted per user).
 *
 * Mounted at the app layout level so audio keeps playing while the user
 * navigates between chat and voice views.
 */
export function RemoteAudioRenderer() {
  const participants = useVoice((s) => s.remoteParticipants);
  const volumes = useVoice((s) => s.volumes);
  const deafened = useVoice((s) => s.deafened);

  return (
    <div className="hidden" aria-hidden>
      {participants.map((participant) => (
        <ParticipantAudio
          key={participant.identity}
          participant={participant}
          volume={deafened ? 0 : (volumes[participant.identity] ?? 1)}
        />
      ))}
    </div>
  );
}

function ParticipantAudio({
  participant,
  volume,
}: {
  participant: RemoteParticipant;
  volume: number;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let current: RemoteTrack | null = null;

    const findAudioTrack = (): RemoteTrack | null => {
      const mic = participant.getTrackPublication(Track.Source.Microphone)?.track;
      if (mic) return mic;
      // The radio bot publishes with an unknown source.
      for (const pub of participant.trackPublications.values()) {
        if (pub.kind === Track.Kind.Audio && pub.track) return pub.track;
      }
      return null;
    };

    const attach = () => {
      const track = findAudioTrack();
      if (track && track !== current) {
        try {
          current?.detach(el);
        } catch { /* ignore */ }
        current = track;
        try {
          track.attach(el);
        } catch { /* ignore */ }
        el.volume = volume;
      } else if (!track && current) {
        try {
          current.detach(el);
        } catch { /* ignore */ }
        current = null;
      }
    };

    attach();
    participant.on(ParticipantEvent.TrackSubscribed, attach);
    participant.on(ParticipantEvent.TrackUnsubscribed, attach);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, attach);
      participant.off(ParticipantEvent.TrackUnsubscribed, attach);
      try {
        current?.detach(el);
      } catch { /* ignore */ }
    };
    // Recompute when the participant object identity changes (store refresh).
  }, [participant]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);

  return <audio ref={ref} autoPlay />;
}

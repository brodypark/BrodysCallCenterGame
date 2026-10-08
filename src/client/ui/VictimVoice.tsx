import { type ReactElement, useEffect, useRef } from "react";
import { finishedSpeaking } from "@client/net/callActions";

/** Exposes the loudness (0-255) for the face animation. Kept here so anything can read it. */
import { getAudioContext } from "@client/voice/audioUnlock";

export let victimLoudness = 0;

export function VictimVoice({
  lineId,
  muted,
}: {
  lineId: number | null;
  muted: boolean;
}): ReactElement | null {
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioRef.current || contextRef.current) {
      return;
    }
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      try {
        const sharedCtx = getAudioContext();
        const ctx = sharedCtx || new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        
        contextRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLoudness = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] ?? 0;
          }
          victimLoudness = sum / dataArray.length;
          frameRef.current = requestAnimationFrame(updateLoudness);
        };
        updateLoudness();
      } catch (error) {
        console.error("Failed to initialize VictimVoice AudioContext:", error);
      }
    }

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      victimLoudness = 0;
      contextRef.current = null;
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      autoPlay
      src={lineId != null ? `/api/voice/victim/${lineId}` : undefined}
      muted={muted}
      onEnded={() => {
        if (lineId != null) finishedSpeaking(lineId);
      }}
      onError={(e) => {
        if (lineId != null) {
          console.warn("Victim speech failed to load/play, falling back to text.", e);
          finishedSpeaking(lineId);
        }
      }}
      style={{ display: "none" }}
    />
  );
}


"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";

type PlaybackMode = "recorded" | "tts" | null;

type PlayWordButtonProps = {
  lemma: string;
  spokenText?: string | null;
  audioUrl?: string | null;
};

function selectTtsVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();

  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-ca")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    voices[0] ??
    null
  );
}

export function PlayWordButton({ lemma, spokenText, audioUrl }: PlayWordButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      audioRef.current?.pause();

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function speakWithTts() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      throw new Error("TTS is not available in this browser.");
    }

    const utterance = new SpeechSynthesisUtterance((spokenText ?? lemma).trim());
    const voice = selectTtsVoice();

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-CA";
    }

    utterance.rate = 0.9;

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error("TTS playback failed."));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function handlePlay() {
    setError("");
    setIsPlaying(true);

    try {
      if (audioUrl) {
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.pause();
        audio.currentTime = 0;
        audio.src = audioUrl;
        await audio.play();
        setPlaybackMode("recorded");
        return;
      }

      await speakWithTts();
      setPlaybackMode("tts");
    } catch {
      try {
        await speakWithTts();
        setPlaybackMode("tts");
      } catch (ttsError) {
        setError(ttsError instanceof Error ? ttsError.message : "Unable to play this word.");
      }
    } finally {
      setIsPlaying(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handlePlay} disabled={isPlaying} className="tap-button-secondary">
        {isPlaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
        {audioUrl ? "Play audio" : "Play with TTS"}
      </button>

      <p className="text-xs text-slate-500">
        {playbackMode === "tts"
          ? "Played with browser TTS fallback."
          : "Uses recorded audio when available, then falls back to browser TTS."}
      </p>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

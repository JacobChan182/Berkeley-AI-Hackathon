"use client";

import { useCallback, useRef, useState } from "react";
import type { Speaker } from "@/lib/events";

export function LiveMic({
  active,
  onTranscript,
}: {
  active: boolean;
  onTranscript: (text: string, speaker: Speaker) => void;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Use Demo mode.");
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) onTranscript(text, "unknown");
      }
    };

    recognition.onerror = () => setError("Speech recognition error.");
    recognition.onend = () => {
      if (listening && active) recognition.start();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [active, listening, onTranscript]);

  if (!active) {
    if (listening) stop();
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {!listening ? (
        <button
          onClick={start}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
        >
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          Start Mic
        </button>
      ) : (
        <button
          onClick={stop}
          className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800"
        >
          Stop Mic
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

declare global {
  interface Window {
    SpeechRecognition: new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start(): void;
      stop(): void;
      onresult: ((event: {
        results: { isFinal: boolean; [index: number]: { transcript: string } }[];
      }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
    };
    webkitSpeechRecognition: Window["SpeechRecognition"];
  }
}

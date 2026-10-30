"use client";

import { useEffect, useRef, useState, useCallback, type MouseEvent } from "react";
import { Icon } from "@/components/ui/Icon";

export interface VoiceSearchMicProps {
  /** Callback fired whenever speech is transcribed (interim or final) */
  onTranscript: (transcript: string) => void;
  /** Size variant for the button */
  size?: "xs" | "sm" | "md";
  /** Additional CSS classes */
  className?: string;
  /** Automatically trigger listening on mount */
  autoStart?: boolean;
  /** Callback notifying parent when listening state changes */
  onListeningChange?: (isListening: boolean) => void;
}

export function VoiceSearchMic({
  onTranscript,
  size = "sm",
  className = "",
  autoStart = false,
  onListeningChange,
}: VoiceSearchMicProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeTranscriptRef = useRef("");

  // Check Web Speech API support on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const notifyListening = useCallback(
    (listening: boolean) => {
      setIsListening(listening);
      onListeningChange?.(listening);
    },
    [onListeningChange]
  );

  const stopListening = useCallback(() => {
    // forget it before stopping: stop() fires onend, which calls stopListening again
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors if already stopped
      }
    }
    notifyListening(false);
  }, [notifyListening]);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMessage("Voice search not supported in this browser");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    // If already active, stop
    if (recognitionRef.current) {
      stopListening();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US"; // Default English as requested
      recognition.maxAlternatives = 1;

      activeTranscriptRef.current = "";

      recognition.onstart = () => {
        setErrorMessage(null);
        notifyListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentText = "";
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item && item[0]) {
            currentText += item[0].transcript;
          }
        }
        currentText = currentText.trim();
        if (currentText) {
          activeTranscriptRef.current = currentText;
          onTranscript(currentText);
        }
      };

      recognition.onerror = (event: any) => {
        const error = event.error;
        if (error === "not-allowed") {
          setErrorMessage("Microphone access denied");
        } else if (error === "no-speech") {
          // Silent timeout if user didn't speak
        } else if (error !== "aborted") {
          setErrorMessage("Voice error: " + error);
        }
        stopListening();
        setTimeout(() => setErrorMessage(null), 3500);
      };

      recognition.onend = () => {
        stopListening();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn("Speech recognition start failed:", err);
      setErrorMessage("Could not start microphone");
      stopListening();
      setTimeout(() => setErrorMessage(null), 3000);
    }
  }, [onTranscript, notifyListening, stopListening]);

  // Handle autoStart prop
  useEffect(() => {
    if (autoStart && isSupported) {
      startListening();
    }
  }, [autoStart, isSupported, startListening]);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const iconSizes = {
    xs: "size-3.5",
    sm: "size-4",
    md: "size-5",
  };

  const btnSizes = {
    xs: "p-1 h-6 w-6",
    sm: "p-1 h-7 w-7",
    md: "p-1.5 h-8 w-8",
  };

  const titleText = !isSupported
    ? "Voice search not supported in this browser"
    : errorMessage
    ? errorMessage
    : isListening
    ? "Listening… Speak in English (click to stop)"
    : "Search by voice (English)";

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <button
        type="button"
        onClick={handleClick}
        title={titleText}
        aria-label={titleText}
        aria-pressed={isListening}
        className={`relative inline-flex items-center justify-center rounded-md transition-all duration-200 cursor-pointer select-none ${btnSizes[size]} ${
          isListening
            ? "bg-red-500/15 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)] ring-1 ring-red-500/50"
            : "text-muted hover:text-ink hover:bg-raised/70 active:scale-95"
        } ${className}`}
      >
        {/* Pulsing ring animation when active */}
        {isListening && (
          <span className="absolute inset-0 rounded-md bg-red-500/25 animate-ping pointer-events-none" />
        )}

        <Icon
          name="mic"
          className={`transition-transform duration-200 ${iconSizes[size]} ${
            isListening ? "scale-110 text-red-500" : ""
          }`}
        />

        {/* Small live audio indicator dot */}
        {isListening && (
          <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
      </button>

      {/* Floating toast / error popup */}
      {errorMessage && (
        <div
          role="alert"
          className="absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md bg-danger px-2 py-1 text-2xs font-medium text-white shadow-lg pointer-events-none z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

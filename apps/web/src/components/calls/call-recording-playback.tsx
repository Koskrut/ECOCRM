"use client";

import { Download, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

export type CallRecordingSession = {
  id: string;
  url: string;
  durationSec?: number | null;
  title?: string;
  subtitle?: string;
};

type ActivateOptions = {
  autoPlay?: boolean;
};

type PlaybackContextValue = {
  session: CallRecordingSession | null;
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTime: number;
  duration: number | null;
  playbackRate: (typeof PLAYBACK_RATES)[number];
  activate: (session: CallRecordingSession, opts?: ActivateOptions) => void;
  dismiss: () => void;
  toggle: () => void;
  pause: () => void;
  seekRatio: (ratio: number) => void;
  cycleSpeed: () => void;
  restart: () => void;
  isActive: (id: string) => boolean;
};

const CallRecordingPlaybackContext = createContext<PlaybackContextValue | null>(null);

export function useCallRecordingPlayback(): PlaybackContextValue {
  const ctx = useContext(CallRecordingPlaybackContext);
  if (!ctx) {
    throw new Error("useCallRecordingPlayback must be used within CallRecordingPlaybackProvider");
  }
  return ctx;
}

export function useCallRecordingPlaybackOptional(): PlaybackContextValue | null {
  return useContext(CallRecordingPlaybackContext);
}

export function formatAudioTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StickyDock({
  session,
  isPlaying,
  isLoading,
  hasError,
  currentTime,
  duration,
  playbackRate,
  onToggle,
  onDismiss,
  onSeek,
  onCycleSpeed,
  onRestart,
}: {
  session: CallRecordingSession;
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTime: number;
  duration: number | null;
  playbackRate: (typeof PLAYBACK_RATES)[number];
  onToggle: () => void;
  onDismiss: () => void;
  onSeek: (ratio: number) => void;
  onCycleSpeed: () => void;
  onRestart: () => void;
}) {
  const progressRef = useRef<HTMLDivElement | null>(null);
  const progress =
    duration && duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {session.title?.trim() || "Запис дзвінка"}
          </div>
          {session.subtitle ? (
            <div className="truncate text-xs text-zinc-500">{session.subtitle}</div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-[2] items-center gap-2.5">
          <button
            type="button"
            onClick={onToggle}
            disabled={isLoading && !isPlaying}
            aria-label={isPlaying ? "Пауза" : "Відтворити"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {isLoading && !isPlaying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-4 w-4" aria-hidden />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div
              ref={progressRef}
              role="slider"
              aria-label="Прогрес відтворення"
              aria-valuemin={0}
              aria-valuemax={duration ?? 0}
              aria-valuenow={Math.floor(currentTime)}
              tabIndex={0}
              onClick={(e) => {
                const bar = progressRef.current;
                if (!bar || !duration) return;
                const rect = bar.getBoundingClientRect();
                if (rect.width <= 0) return;
                onSeek((e.clientX - rect.left) / rect.width);
              }}
              onKeyDown={(e) => {
                if (!duration) return;
                const step = e.shiftKey ? 10 : 5;
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  onSeek((currentTime + step) / duration);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  onSeek(Math.max(0, currentTime - step) / duration);
                }
              }}
              className="group relative h-2 cursor-pointer rounded-full bg-zinc-200"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-75"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] tabular-nums text-zinc-500">
              <span>
                {formatAudioTime(currentTime)}
                {duration ? ` / ${formatAudioTime(duration)}` : ""}
              </span>
              {hasError ? <span className="text-red-600">Не вдалося відтворити</span> : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onRestart}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title="З початку"
              aria-label="З початку"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCycleSpeed}
              className="min-w-[2.5rem] rounded px-2 py-1 text-xs font-medium tabular-nums text-zinc-600 hover:bg-zinc-100"
              title="Швидкість відтворення"
            >
              {playbackRate}x
            </button>
            <a
              href={session.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title="Завантажити"
              aria-label="Завантажити запис"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title="Закрити"
              aria-label="Закрити плеєр"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CallRecordingPlaybackProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAutoPlayRef = useRef(false);
  const [session, setSession] = useState<CallRecordingSession | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);

  const effectiveDuration = useMemo(() => {
    if (duration != null && duration > 0) return duration;
    if (session?.durationSec != null && session.durationSec > 0) return session.durationSec;
    return null;
  }, [duration, session?.durationSec]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const playAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !session?.url) return;
    setHasError(false);
    try {
      setIsLoading(true);
      await audio.play();
      setIsPlaying(true);
    } catch {
      setHasError(true);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }, [session?.url]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void playAudio();
  }, [isPlaying, pause, playAudio]);

  const seekRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !effectiveDuration) return;
      const next = Math.max(0, Math.min(effectiveDuration, ratio * effectiveDuration));
      audio.currentTime = next;
      setCurrentTime(next);
    },
    [effectiveDuration],
  );

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = PLAYBACK_RATES.indexOf(prev);
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    seekRatio(0);
    if (!isPlaying) void playAudio();
  }, [isPlaying, playAudio, seekRatio]);

  const dismiss = useCallback(() => {
    pause();
    setSession(null);
    setCurrentTime(0);
    setDuration(null);
    setHasError(false);
    setIsLoading(false);
  }, [pause]);

  const activate = useCallback(
    (next: CallRecordingSession, opts?: ActivateOptions) => {
      const autoPlay = opts?.autoPlay ?? true;
      if (session?.id === next.id) {
        if (autoPlay) toggle();
        return;
      }
      pendingAutoPlayRef.current = autoPlay;
      setSession(next);
      setCurrentTime(0);
      setHasError(false);
      setIsLoading(false);
      setIsPlaying(false);
      if (next.durationSec != null && next.durationSec > 0) setDuration(next.durationSec);
      else setDuration(null);
    },
    [session?.id, toggle],
  );

  useEffect(() => {
    if (!session?.url || !pendingAutoPlayRef.current) return;
    pendingAutoPlayRef.current = false;
    void playAudio();
  }, [session?.id, session?.url, playAudio]);

  const isActive = useCallback((id: string) => session?.id === id, [session?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate, session?.url]);

  useEffect(() => {
    document.body.style.paddingBottom = session ? "5.5rem" : "";
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [session]);

  const value = useMemo<PlaybackContextValue>(
    () => ({
      session,
      isPlaying,
      isLoading,
      hasError,
      currentTime,
      duration: effectiveDuration,
      playbackRate,
      activate,
      dismiss,
      toggle,
      pause,
      seekRatio,
      cycleSpeed,
      restart,
      isActive,
    }),
    [
      session,
      isPlaying,
      isLoading,
      hasError,
      currentTime,
      effectiveDuration,
      playbackRate,
      activate,
      dismiss,
      toggle,
      pause,
      seekRatio,
      cycleSpeed,
      restart,
      isActive,
    ],
  );

  return (
    <CallRecordingPlaybackContext.Provider value={value}>
      {children}
      {session ? (
        <>
          <audio
            ref={audioRef}
            src={session.url}
            preload="metadata"
            onLoadStart={() => setIsLoading(true)}
            onWaiting={() => setIsLoading(true)}
            onCanPlay={() => setIsLoading(false)}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
              setIsLoading(false);
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={(e) => {
              setIsPlaying(false);
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setCurrentTime(d);
            }}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
              setIsPlaying(false);
            }}
          />
          <StickyDock
            session={session}
            isPlaying={isPlaying}
            isLoading={isLoading}
            hasError={hasError}
            currentTime={currentTime}
            duration={effectiveDuration}
            playbackRate={playbackRate}
            onToggle={toggle}
            onDismiss={dismiss}
            onSeek={seekRatio}
            onCycleSpeed={cycleSpeed}
            onRestart={restart}
          />
        </>
      ) : null}
    </CallRecordingPlaybackContext.Provider>
  );
}

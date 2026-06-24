"use client";

import { Download, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  formatAudioTime,
  useCallRecordingPlaybackOptional,
  type CallRecordingSession,
} from "./call-recording-playback";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;
const ACTIVE_AUDIO_EVENT = "crm-call-recording-play";

type RecordingStatus = "READY" | "PENDING" | "FAILED" | "NONE" | string;

type Props = {
  url?: string | null;
  status?: string | null;
  durationSec?: number | null;
  variant?: "default" | "compact";
  className?: string;
  sessionId?: string;
  title?: string;
  subtitle?: string;
  /** When true (default), playback goes to the global sticky dock if available. */
  useDock?: boolean;
};

function normalizeStatus(status?: string | null): RecordingStatus {
  const s = (status ?? "").trim().toUpperCase();
  if (s === "READY" || s === "PENDING" || s === "FAILED") return s;
  return s || "NONE";
}

function statusLabel(status: RecordingStatus): string {
  if (status === "READY") return "Готова";
  if (status === "PENDING") return "Обробляється";
  if (status === "FAILED") return "Помилка";
  return "Немає запису";
}

function statusTone(status: RecordingStatus): string {
  if (status === "READY") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "PENDING") return "text-amber-700 bg-amber-50 border-amber-200";
  if (status === "FAILED") return "text-red-700 bg-red-50 border-red-200";
  return "text-zinc-500 bg-zinc-50 border-zinc-200";
}

function buildSession(
  id: string,
  url: string,
  durationSec: number | null | undefined,
  title: string | undefined,
  subtitle: string | undefined,
): CallRecordingSession {
  return { id, url, durationSec, title, subtitle };
}

export function CallRecordingPlayer({
  url,
  status,
  durationSec,
  variant = "default",
  className = "",
  sessionId,
  title,
  subtitle,
  useDock = true,
}: Props) {
  const playback = useCallRecordingPlaybackOptional();
  const fallbackId = useId();
  const resolvedSessionId = sessionId ?? fallbackId;
  const normalizedStatus = normalizeStatus(status);
  const canPlay = !!url && normalizedStatus === "READY";
  const dockEnabled = useDock && playback != null && canPlay;

  if (dockEnabled && playback) {
    return (
      <DockLinkedPlayer
        playback={playback}
        session={buildSession(resolvedSessionId, url!, durationSec, title, subtitle)}
        variant={variant}
        className={className}
      />
    );
  }

  return (
    <StandalonePlayer
      url={url}
      canPlay={canPlay}
      normalizedStatus={normalizedStatus}
      durationSec={durationSec}
      variant={variant}
      className={className}
      playerId={resolvedSessionId}
    />
  );
}

function DockLinkedPlayer({
  playback,
  session,
  variant,
  className,
}: {
  playback: NonNullable<ReturnType<typeof useCallRecordingPlaybackOptional>>;
  session: CallRecordingSession;
  variant: "default" | "compact";
  className: string;
}) {
  const isActive = playback.isActive(session.id);
  const isPlaying = isActive && playback.isPlaying;
  const isLoading = isActive && playback.isLoading;
  const hasError = isActive && playback.hasError;
  const currentTime = isActive ? playback.currentTime : 0;
  const effectiveDuration = isActive ? playback.duration : session.durationSec ?? null;
  const playbackRate = playback.playbackRate;
  const progressRef = useRef<HTMLDivElement | null>(null);

  const progress =
    effectiveDuration && effectiveDuration > 0
      ? Math.min(100, (currentTime / effectiveDuration) * 100)
      : 0;

  const activate = useCallback(() => {
    playback.activate(session, { autoPlay: true });
  }, [playback, session]);

  const toggle = useCallback(() => {
    if (isActive) playback.toggle();
    else playback.activate(session, { autoPlay: true });
  }, [isActive, playback, session]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (!isActive) {
        playback.activate(session, { autoPlay: false });
      }
      playback.seekRatio(ratio);
    },
    [isActive, playback, session],
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || !effectiveDuration) return;
      const rect = bar.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      if (!isActive) playback.activate(session, { autoPlay: false });
      playback.seekRatio(ratio);
    },
    [effectiveDuration, isActive, playback, session],
  );

  const isCompact = variant === "compact";

  if (isCompact && !isActive) {
    return (
      <button
        type="button"
        onClick={activate}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ${className}`}
        title="Слухати запис"
      >
        <Play className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        Слухати
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg border ${
        isActive ? "border-emerald-200 bg-emerald-50/50" : "border-zinc-200 bg-zinc-50/80"
      } ${isCompact ? "px-2 py-1.5" : "px-3 py-2"} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex items-center gap-2 ${isCompact ? "" : "gap-2.5"}`}>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={isLoading && !isPlaying}
          aria-label={isPlaying ? "Пауза" : "Відтворити"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
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
            aria-valuemax={effectiveDuration ?? 0}
            aria-valuenow={Math.floor(currentTime)}
            tabIndex={0}
            onClick={handleProgressClick}
            onKeyDown={(e) => {
              if (!effectiveDuration) return;
              const step = e.shiftKey ? 10 : 5;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                seekToRatio((currentTime + step) / effectiveDuration);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                seekToRatio(Math.max(0, currentTime - step) / effectiveDuration);
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
              {effectiveDuration ? ` / ${formatAudioTime(effectiveDuration)}` : ""}
            </span>
            {hasError ? <span className="text-red-600">Не вдалося відтворити</span> : null}
          </div>
        </div>

        {!isCompact ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (!isActive) playback.activate(session, { autoPlay: false });
                playback.restart();
              }}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
              title="З початку"
              aria-label="З початку"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={playback.cycleSpeed}
              className="min-w-[2.25rem] rounded px-1.5 py-1 text-[11px] font-medium tabular-nums text-zinc-600 hover:bg-zinc-200"
              title="Швидкість відтворення"
            >
              {playbackRate}x
            </button>
            <a
              href={session.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
              title="Завантажити"
              aria-label="Завантажити запис"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={playback.cycleSpeed}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500 hover:bg-zinc-200"
            title="Швидкість відтворення"
          >
            {playbackRate}x
          </button>
        )}
      </div>
    </div>
  );
}

function StandalonePlayer({
  url,
  canPlay,
  normalizedStatus,
  durationSec,
  variant,
  className,
  playerId,
}: {
  url?: string | null;
  canPlay: boolean;
  normalizedStatus: RecordingStatus;
  durationSec?: number | null;
  variant: "default" | "compact";
  className: string;
  playerId: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(
    durationSec != null && durationSec > 0 ? durationSec : null,
  );
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);

  const effectiveDuration =
    duration != null && Number.isFinite(duration) && duration > 0
      ? duration
      : durationSec != null && durationSec > 0
        ? durationSec
        : null;

  const progress =
    effectiveDuration && effectiveDuration > 0
      ? Math.min(100, (currentTime / effectiveDuration) * 100)
      : 0;

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;
    setHasError(false);
    window.dispatchEvent(
      new CustomEvent<{ id: string }>(ACTIVE_AUDIO_EVENT, { detail: { id: playerId } }),
    );
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
  }, [canPlay, playerId]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, pause, play]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !effectiveDuration) return;
      const next = Math.max(0, Math.min(effectiveDuration, ratio * effectiveDuration));
      audio.currentTime = next;
      setCurrentTime(next);
    },
    [effectiveDuration],
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || !effectiveDuration) return;
      const rect = bar.getBoundingClientRect();
      if (rect.width <= 0) return;
      seekToRatio((e.clientX - rect.left) / rect.width);
    },
    [effectiveDuration, seekToRatio],
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
    seekToRatio(0);
    if (!isPlaying) void play();
  }, [isPlaying, play, seekToRatio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate, url]);

  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== playerId) pause();
    };
    window.addEventListener(ACTIVE_AUDIO_EVENT, onOtherPlay);
    return () => window.removeEventListener(ACTIVE_AUDIO_EVENT, onOtherPlay);
  }, [pause, playerId]);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setIsLoading(false);
    setHasError(false);
    if (durationSec != null && durationSec > 0) setDuration(durationSec);
    else setDuration(null);
  }, [url, durationSec]);

  if (!canPlay) {
    if (variant === "compact" && normalizedStatus === "NONE") {
      return <span className={`text-zinc-400 ${className}`}>—</span>;
    }
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${statusTone(normalizedStatus)} ${className}`}
      >
        <span className="font-medium">Запис:</span>
        <span>{statusLabel(normalizedStatus)}</span>
      </div>
    );
  }

  const isCompact = variant === "compact";

  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-zinc-50/80 ${
        isCompact ? "px-2 py-1.5" : "px-3 py-2"
      } ${className}`}
    >
      <audio
        ref={audioRef}
        src={url ?? undefined}
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

      <div className={`flex items-center gap-2 ${isCompact ? "" : "gap-2.5"}`}>
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={isLoading && !isPlaying}
          aria-label={isPlaying ? "Пауза" : "Відтворити"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
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
            aria-valuemax={effectiveDuration ?? 0}
            aria-valuenow={Math.floor(currentTime)}
            tabIndex={0}
            onClick={handleProgressClick}
            onKeyDown={(e) => {
              if (!effectiveDuration) return;
              const step = e.shiftKey ? 10 : 5;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                seekToRatio((currentTime + step) / effectiveDuration);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                seekToRatio(Math.max(0, currentTime - step) / effectiveDuration);
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
              {effectiveDuration ? ` / ${formatAudioTime(effectiveDuration)}` : ""}
            </span>
            {hasError ? <span className="text-red-600">Не вдалося відтворити</span> : null}
          </div>
        </div>

        {!isCompact ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={restart}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
              title="З початку"
              aria-label="З початку"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={cycleSpeed}
              className="min-w-[2.25rem] rounded px-1.5 py-1 text-[11px] font-medium tabular-nums text-zinc-600 hover:bg-zinc-200"
              title="Швидкість відтворення"
            >
              {playbackRate}x
            </button>
            <a
              href={url ?? undefined}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
              title="Завантажити"
              aria-label="Завантажити запис"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={cycleSpeed}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500 hover:bg-zinc-200"
            title="Швидкість відтворення"
          >
            {playbackRate}x
          </button>
        )}
      </div>
    </div>
  );
}

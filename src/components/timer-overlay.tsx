import { Mic } from "lucide-react";
import { useEffect } from "react";
import { formatClock } from "@/lib/holds/format";
import { useHoldStore } from "@/lib/holds/store";
import type { VoiceApi } from "@/lib/holds/use-voice";

export function TimerOverlay({ voice }: { voice: VoiceApi }) {
  const overlay = useHoldStore((s) => s.timer.overlay);
  const running = useHoldStore((s) => s.timer.running);
  const paused = useHoldStore((s) => s.timer.paused);
  const movementId = useHoldStore((s) => s.timer.movementId);
  const mode = useHoldStore((s) => s.timer.mode);
  const targetMs = useHoldStore((s) => s.timer.targetMs);
  const movements = useHoldStore((s) => s.movements);
  const voiceState = useHoldStore((s) => s.voice);
  const now = useHoldStore((s) => s.now);
  const cue = useHoldStore((s) => s.cue);
  const pauseTimer = useHoldStore((s) => s.pauseTimer);
  const resumeTimer = useHoldStore((s) => s.resumeTimer);
  const stopTimer = useHoldStore((s) => s.stopTimer);
  const closeOverlay = useHoldStore((s) => s.closeOverlay);

  useEffect(() => {
    if (!overlay) return;
    voice.start();
  }, [overlay, voice]);

  useEffect(() => {
    if (!overlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
      if (e.key === " ") {
        e.preventDefault();
        if (paused || !running) resumeTimer();
        else pauseTimer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay, paused, running, closeOverlay, pauseTimer, resumeTimer]);

  if (!overlay) return null;

  const movement = movements.find((m) => m.id === movementId);
  const live =
    running && !paused && useHoldStore.getState().timer.startedAt != null
      ? now - (useHoldStore.getState().timer.startedAt as number)
      : 0;
  const elapsed = useHoldStore.getState().timer.accumulatedMs + live;
  const displayMs = mode === "down" && targetMs != null ? Math.max(0, targetMs - elapsed) : elapsed;
  const progress =
    targetMs && targetMs > 0 ? Math.min(1, elapsed / targetMs) : running && !paused ? 0.08 : 0;

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-bg text-fg overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={movement ? `${movement.name} timer` : "Timer"}
      onPointerDown={voice.start}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 42%, color-mix(in oklab, var(--color-surface) 80%, transparent) 0%, var(--color-bg) 68%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-border">
        <div
          className="h-full bg-live transition-[width] duration-150 ease-linear"
          style={{ width: `${Math.max(progress * 100, running && !paused ? 2 : 0)}%` }}
        />
      </div>

      <header className="relative z-10 flex items-start justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-7">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">
            {paused ? "Paused" : running ? "Holding" : "Ready"}
          </p>
          <p className="mt-1 font-display text-3xl tracking-tight text-fg sm:text-4xl">
            {movement?.name ?? "Hold"}
          </p>
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            voice.pushStart();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            voice.pushEnd();
          }}
          onClick={(e) => {
            e.stopPropagation();
            voice.start();
          }}
          className="flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm text-live touch-manipulation"
          aria-label="Listening"
        >
          <Mic className="size-4" />
          {voice.pushing || voiceState.listening ? "Listening" : "Hold to talk"}
        </button>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
        <time
          className="font-mono text-timer font-medium tabular-nums text-fg"
          dateTime={`PT${Math.floor(displayMs / 1000)}S`}
        >
          {formatClock(displayMs, displayMs < 3_600_000)}
        </time>
        <p className="mt-6 font-display text-3xl tracking-tight text-fg sm:text-4xl">
          {cue ?? "Say stop"}
        </p>
        <p className="mt-2 text-sm text-muted">
          {voiceState.transcript
            ? voiceState.transcript
            : voiceState.listening || voice.pushing
              ? "or pause · or done"
              : "Allow the mic, then speak"}
        </p>
      </div>

      <footer className="relative z-10 flex items-center justify-center gap-3 px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (paused || !running) resumeTimer();
            else pauseTimer();
          }}
          className="min-h-12 min-w-24 rounded-full px-5 text-sm text-muted shadow-[var(--shadow-border)] touch-manipulation hover:text-fg"
        >
          {paused || !running ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            stopTimer();
          }}
          className="min-h-12 min-w-28 rounded-full bg-live px-6 text-sm font-medium text-accent-fg touch-manipulation"
        >
          Stop
        </button>
      </footer>
    </div>
  );
}

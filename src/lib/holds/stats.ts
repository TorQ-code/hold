import { localDayKey } from "./format";
import type { HoldSession } from "./types";

export function currentStreak(sessions: HoldSession[], now = new Date()): number {
  const days = new Set(sessions.map((s) => localDayKey(new Date(s.endedAt))));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(localDayKey(cursor))) return 0;
  }
  let n = 0;
  while (days.has(localDayKey(cursor))) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function weekStart(d = new Date()): Date {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
}

export function weekVolume(sessions: HoldSession[], now = new Date()) {
  const start = weekStart(now).getTime();
  const week = sessions.filter((s) => new Date(s.endedAt).getTime() >= start);
  return {
    count: week.length,
    totalMs: week.reduce((n, s) => n + s.durationMs, 0),
  };
}

export function lifetimeMs(sessions: HoldSession[]): number {
  return sessions.reduce((n, s) => n + s.durationMs, 0);
}

export function bestOf(sessions: HoldSession[], movementId?: string | null): number {
  return sessions.reduce((best, s) => {
    if (movementId && s.movementId !== movementId) return best;
    return Math.max(best, s.durationMs);
  }, 0);
}

export function movementSeries(sessions: HoldSession[], movementId: string, limit = 16) {
  return sessions
    .filter((s) => s.movementId === movementId)
    .slice()
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    .slice(-limit)
    .map((s, i) => ({
      i: i + 1,
      label: localDayKey(new Date(s.endedAt)).slice(5),
      seconds: Math.round(s.durationMs / 1000),
      ms: s.durationMs,
      endedAt: s.endedAt,
    }));
}

export function weeklySeries(sessions: HoldSession[], weeks = 8, now = new Date()) {
  const start = weekStart(now);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const from = new Date(start);
    from.setDate(from.getDate() - (weeks - 1 - i) * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    const slice = sessions.filter((s) => {
      const t = new Date(s.endedAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    });
    return {
      label: `${from.getMonth() + 1}/${from.getDate()}`,
      seconds: Math.round(slice.reduce((n, s) => n + s.durationMs, 0) / 1000),
      count: slice.length,
    };
  });
  return buckets;
}

import { currentStreak, lifetimeMs } from "./stats";
import type { HoldSession, Movement } from "./types";

export type AwardDef = {
  id: string;
  name: string;
  blurb: string;
};

export const AWARD_CATALOG: AwardDef[] = [
  { id: "first-hold", name: "First Hold", blurb: "You started the log." },
  { id: "half-minute", name: "Half Minute", blurb: "Any hold of 30 seconds." },
  { id: "full-minute", name: "Full Minute", blurb: "A full 60 seconds without dropping." },
  { id: "the-two", name: "The Two", blurb: "Two minutes. Rare air." },
  { id: "iron-bar", name: "Iron Bar", blurb: "Dead hang for 90 seconds." },
  { id: "three-days", name: "Three Days", blurb: "Holds on three days in a row." },
  { id: "seven-days", name: "Seven Days", blurb: "A full week of showing up." },
  { id: "ten-logs", name: "Ten Logs", blurb: "Ten holds in the book." },
  { id: "fifty-logs", name: "Fifty Logs", blurb: "Fifty holds. That's a practice." },
  { id: "hour-logged", name: "Hour Logged", blurb: "Sixty minutes of holds, lifetime." },
  { id: "specialist", name: "Specialist", blurb: "Ten of the same movement." },
  { id: "all-rounder", name: "All-Rounder", blurb: "Four different movements logged." },
];

const byId = new Map(AWARD_CATALOG.map((a) => [a.id, a]));

export function awardById(id: string): AwardDef | undefined {
  return byId.get(id);
}

function longest(sessions: HoldSession[], movementId?: string): number {
  return sessions.reduce((best, s) => {
    if (movementId && s.movementId !== movementId) return best;
    return Math.max(best, s.durationMs);
  }, 0);
}

export function unlockedAwardIds(sessions: HoldSession[], movements: Movement[]): string[] {
  if (sessions.length === 0) return [];
  const streak = currentStreak(sessions);
  const life = lifetimeMs(sessions);
  const byMove = new Map<string, number>();
  for (const s of sessions) byMove.set(s.movementId, (byMove.get(s.movementId) ?? 0) + 1);
  const deadHangId = movements.find((m) => m.id === "dead-hang" || /dead hang/i.test(m.name))?.id;

  const have: string[] = [];
  if (sessions.length >= 1) have.push("first-hold");
  if (longest(sessions) >= 30_000) have.push("half-minute");
  if (longest(sessions) >= 60_000) have.push("full-minute");
  if (longest(sessions) >= 120_000) have.push("the-two");
  if (deadHangId && longest(sessions, deadHangId) >= 90_000) have.push("iron-bar");
  if (streak >= 3) have.push("three-days");
  if (streak >= 7) have.push("seven-days");
  if (sessions.length >= 10) have.push("ten-logs");
  if (sessions.length >= 50) have.push("fifty-logs");
  if (life >= 60 * 60_000) have.push("hour-logged");
  if ([...byMove.values()].some((n) => n >= 10)) have.push("specialist");
  if (byMove.size >= 4) have.push("all-rounder");
  return have;
}

export function freshAwards(
  sessions: HoldSession[],
  movements: Movement[],
  seen: Record<string, string>,
): AwardDef[] {
  return unlockedAwardIds(sessions, movements)
    .filter((id) => !seen[id])
    .map((id) => byId.get(id))
    .filter((a): a is AwardDef => Boolean(a));
}

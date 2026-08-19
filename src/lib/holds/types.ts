export type Movement = {
  id: string;
  name: string;
  aliases: string[];
  targetSeconds: number | null;
  createdAt: string;
};

export type HoldSession = {
  id: string;
  movementId: string;
  durationMs: number;
  startedAt: string;
  endedAt: string;
};

export type Reminder = {
  id: string;
  movementId: string | null;
  minutes: number;
  fireAt: string;
  label: string;
};

export type TimerMode = "up" | "down";

export type TimerState = {
  running: boolean;
  paused: boolean;
  overlay: boolean;
  movementId: string | null;
  startedAt: number | null;
  accumulatedMs: number;
  mode: TimerMode;
  targetMs: number | null;
  lastCueSec: number;
};

export type VoiceState = {
  listening: boolean;
  supported: boolean;
  transcript: string;
  lastHeard: string;
  error: string | null;
  speaking: boolean;
  needsGesture: boolean;
};

export type Settings = {
  speak: boolean;
  chime: boolean;
  handsFree: boolean;
  motivateEvery: 15 | 30;
};

export type BreakPrompt = {
  reminderId: string;
  movementId: string | null;
  label: string;
};

export type VoiceIntent =
  | { type: "start"; movementQuery: string | null; seconds: number | null }
  | { type: "stop" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "remind"; minutes: number; movementQuery: string | null }
  | { type: "cancelReminders" }
  | { type: "addMovement"; name: string }
  | { type: "unknown"; raw: string };

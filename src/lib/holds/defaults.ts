import type { Movement, Settings, TimerState } from "./types";

export const STORAGE_KEY = "hold.app.v1";

export const SEED_MOVEMENTS: Movement[] = [
  {
    id: "dead-hang",
    name: "Dead Hang",
    aliases: ["hang", "deadhang", "dead hang", "hanging", "pull up hang", "bar hang", "dead hung", "dead hand", "dad hang", "the hang"],
    targetSeconds: 60,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "plank",
    name: "Plank",
    aliases: ["plank", "planking", "forearm plank", "high plank", "planks", "blank", "plant"],
    targetSeconds: 60,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "wall-sit",
    name: "Wall Sit",
    aliases: ["wall sit", "wallsit", "wall squat", "wall hold", "wall set", "wall sat", "waltz sit"],
    targetSeconds: 60,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "deep-squat",
    name: "Deep Squat",
    aliases: ["squat", "deep squat", "squat hold", "resting squat", "deep squad", "squats"],
    targetSeconds: 90,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "hollow-hold",
    name: "Hollow Hold",
    aliases: ["hollow", "hollow body", "hollow hold", "hallow hold", "hello hold", "holo hold"],
    targetSeconds: 30,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "shoulder-opener",
    name: "Shoulder Opener",
    aliases: ["shoulder", "shoulders", "doorway stretch", "chest opener", "shoulder stretch", "soldier opener"],
    targetSeconds: 45,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "calf-stretch",
    name: "Calf Stretch",
    aliases: ["calf", "calves", "calf stretch", "calf stretch hold", "cough stretch"],
    targetSeconds: 40,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "neck-reset",
    name: "Desk Neck Reset",
    aliases: ["neck", "neck stretch", "neck reset", "desk neck", "neck rest", "nick reset"],
    targetSeconds: 30,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  speak: true,
  chime: true,
  handsFree: false,
  motivateEvery: 15,
};

export const DEFAULT_TIMER: TimerState = {
  running: false,
  paused: false,
  overlay: false,
  movementId: null,
  startedAt: null,
  accumulatedMs: 0,
  mode: "up",
  targetMs: null,
  lastCueSec: 0,
};

export const REMINDER_PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;

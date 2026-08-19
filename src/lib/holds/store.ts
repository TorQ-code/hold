import { create } from "zustand";
import { DEFAULT_SETTINGS, DEFAULT_TIMER, SEED_MOVEMENTS, STORAGE_KEY } from "./defaults";
import { freshAwards, unlockedAwardIds, type AwardDef } from "./awards";
import { formatSpokenDuration } from "./format";
import { cueForSeconds } from "./motivate";
import { matchMovement, parseCommand, playChime, speak } from "./voice";
import type {
  BreakPrompt,
  HoldSession,
  Movement,
  Reminder,
  Settings,
  TimerState,
  VoiceState,
} from "./types";

type PersistSlice = {
  movements: Movement[];
  sessions: HoldSession[];
  reminders: Reminder[];
  settings: Settings;
  seenAwards: Record<string, string>;
};

type RemoteSlice = {
  movements: Movement[];
  sessions: HoldSession[];
  reminders: Reminder[];
};

type HoldStore = PersistSlice & {
  hydrated: boolean;
  timer: TimerState;
  voice: VoiceState;
  prompt: BreakPrompt | null;
  cue: string | null;
  seenAwards: Record<string, string>;
  justEarned: AwardDef[];
  now: number;
  dismissJustEarned: () => void;
  hydrate: () => void;
  tick: () => void;
  applyCommand: (raw: string) => string;
  startTimer: (movementId: string, opts?: { seconds?: number | null; mode?: TimerState["mode"] }) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => { personalBest: boolean; awards: AwardDef[] };
  resetTimer: () => void;
  closeOverlay: () => void;
  addMovement: (name: string, targetSeconds?: number | null) => Movement | null;
  updateMovement: (id: string, patch: Partial<Pick<Movement, "name" | "targetSeconds" | "aliases">>) => void;
  removeMovement: (id: string) => void;
  addReminder: (minutes: number, movementId?: string | null) => Reminder | null;
  cancelReminder: (id: string) => void;
  cancelAllReminders: () => void;
  fireDueReminders: () => void;
  dismissPrompt: () => void;
  acceptPrompt: () => void;
  setListening: (on: boolean) => void;
  setTranscript: (text: string, isFinal: boolean) => void;
  setVoiceError: (error: string | null) => void;
  setVoiceSupported: (supported: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setNeedsGesture: (needs: boolean) => void;
  patchSettings: (patch: Partial<Settings>) => void;
  mergeRemote: (data: RemoteSlice) => void;
  elapsedMs: () => number;
};

function newId(): string {
  return crypto.randomUUID();
}

function persist(slice: PersistSlice) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
  } catch {
    /* ignore quota */
  }
}

function readPersist(): PersistSlice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistSlice;
  } catch {
    return null;
  }
}

function sliceOf(s: PersistSlice): PersistSlice {
  return {
    movements: s.movements,
    sessions: s.sessions,
    reminders: s.reminders,
    settings: s.settings,
    seenAwards: s.seenAwards,
  };
}

function elapsedFrom(timer: TimerState, now: number): number {
  const live = timer.running && !timer.paused && timer.startedAt != null ? now - timer.startedAt : 0;
  return timer.accumulatedMs + live;
}

let wakeLock: WakeLockSentinel | null = null;

async function requestWakeLock() {
  try {
    if (typeof navigator !== "undefined" && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  void wakeLock?.release();
  wakeLock = null;
}


let cueHide: ReturnType<typeof setTimeout> | null = null;

function maybeMotivate(
  get: () => HoldStore,
  set: (partial: Partial<HoldStore> | ((s: HoldStore) => Partial<HoldStore>)) => void,
) {
  const { timer, settings } = get();
  if (!timer.running || timer.paused) return;
  const every = settings.motivateEvery;
  if (every !== 15 && every !== 30) return;
  const elapsed = elapsedFrom(timer, Date.now());
  if (timer.mode === "down" && timer.targetMs != null && timer.targetMs - elapsed < 600) return;
  const sec = Math.floor(elapsed / 1000);
  const milestone = Math.floor(sec / every) * every;
  if (milestone <= 0 || milestone <= timer.lastCueSec) return;
  const line = cueForSeconds(milestone);
  set({
    timer: { ...get().timer, lastCueSec: milestone },
    cue: line,
  });
  if (cueHide) clearTimeout(cueHide);
  if (typeof window !== "undefined") {
    cueHide = setTimeout(() => {
      if (get().cue === line) set({ cue: null });
    }, 2800);
  }
  if (settings.speak) void speak(line, { lock: false });
}


function seedSeen(
  sessions: HoldSession[],
  movements: Movement[],
  seen: Record<string, string>,
): Record<string, string> {
  const next = { ...seen };
  const when = sessions[sessions.length - 1]?.endedAt ?? new Date().toISOString();
  for (const id of unlockedAwardIds(sessions, movements)) {
    if (!next[id]) next[id] = when;
  }
  return next;
}

export const useHoldStore = create<HoldStore>((set, get) => ({
  hydrated: false,
  movements: SEED_MOVEMENTS,
  sessions: [],
  reminders: [],
  seenAwards: {},
  justEarned: [],
  settings: DEFAULT_SETTINGS,
  timer: { ...DEFAULT_TIMER },
  voice: {
    listening: false,
    supported: false,
    transcript: "",
    lastHeard: "",
    error: null,
    speaking: false,
    needsGesture: false,
  },
  prompt: null,
  cue: null,
  now: Date.now(),

  elapsedMs: () => elapsedFrom(get().timer, Date.now()),

  hydrate: () => {
    if (get().hydrated) return;
    const saved = readPersist();
    if (!saved) {
      set({ hydrated: true });
      return;
    }
    const movements = saved.movements.length > 0 ? saved.movements : SEED_MOVEMENTS;
    set({
      hydrated: true,
      movements,
      sessions: saved.sessions ?? [],
      reminders: saved.reminders ?? [],
      seenAwards: seedSeen(saved.sessions ?? [], movements, saved.seenAwards ?? {}),
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    });
  },

  tick: () => {
    const now = Date.now();
    set({ now });
    const { timer } = get();
    if (timer.running && !timer.paused && timer.mode === "down" && timer.targetMs != null) {
      const elapsed = elapsedFrom(timer, now);
      if (elapsed >= timer.targetMs) {
        get().stopTimer();
        get().fireDueReminders();
        return;
      }
    }
    maybeMotivate(get, set);
    get().fireDueReminders();
  },

  applyCommand: (raw) => {
    const { movements, timer, settings, sessions } = get();
    const intent = parseCommand(raw, {
      timerActive: timer.running || timer.overlay,
      movements,
    });
    const say = (msg: string) => {
      if (settings.speak) void speak(msg);
      return msg;
    };

    switch (intent.type) {
      case "start": {
        let movement = intent.movementQuery ? matchMovement(intent.movementQuery, movements) : null;
        if (!movement && !intent.movementQuery) {
          const lastId = timer.movementId ?? sessions[0]?.movementId ?? null;
          movement = lastId ? movements.find((m) => m.id === lastId) ?? null : null;
        }
        if (!movement && !intent.movementQuery) return say("Which exercise shall I start?");
        if (!movement) {
          return say(`I heard ${intent.movementQuery}. Say start dead hang, or start plank.`);
        }
        if (timer.running && timer.movementId === movement.id) return movement.name;
        get().startTimer(movement.id, { seconds: intent.seconds });
        return `Beginning ${movement.name}.`;
      }
      case "stop": {
        const ms = get().elapsedMs();
        const name = movements.find((m) => m.id === timer.movementId)?.name ?? "Hold";
        if (!timer.running && !timer.overlay) return "";
        get().stopTimer();
        return `${name} complete. ${formatSpokenDuration(ms)}.`;
      }
      case "pause": {
        if (!timer.running || timer.paused) return "";
        get().pauseTimer();
        return say("Paused.");
      }
      case "resume": {
        if (!timer.paused && !timer.running) return "";
        get().resumeTimer();
        return say("Resuming.");
      }
      case "reset": {
        get().resetTimer();
        return say("Timer reset.");
      }
      case "remind": {
        const movement = intent.movementQuery ? matchMovement(intent.movementQuery, movements) : null;
        const reminder = get().addReminder(intent.minutes, movement?.id ?? null);
        if (!reminder) return "";
        const label = movement ? ` for ${movement.name}` : "";
        return say(`I'll remind you in ${intent.minutes} minute${intent.minutes === 1 ? "" : "s"}${label}.`);
      }
      case "cancelReminders": {
        get().cancelAllReminders();
        return say("All reminders cancelled.");
      }
      case "addMovement": {
        const created = get().addMovement(intent.name);
        if (!created) return "";
        return say(`${created.name} added.`);
      }
      default:
        return "";
    }
  },

  startTimer: (movementId, opts) => {
    const movement = get().movements.find((m) => m.id === movementId);
    if (!movement) return;
    const seconds = opts?.seconds ?? null;
    const targetMs = seconds != null ? seconds * 1000 : movement.targetSeconds ? movement.targetSeconds * 1000 : null;
    const mode = opts?.mode ?? (seconds != null ? "down" : "up");
    set({
      prompt: null,
      timer: {
        running: true,
        paused: false,
        overlay: true,
        movementId,
        startedAt: Date.now(),
        accumulatedMs: 0,
        mode,
        targetMs,
        lastCueSec: 0,
      },
    });
    void requestWakeLock();
    if (get().settings.speak) void speak(`Beginning ${movement.name}.`);
  },

  pauseTimer: () => {
    const { timer } = get();
    if (!timer.running || timer.paused) return;
    const now = Date.now();
    set({
      timer: {
        ...timer,
        paused: true,
        accumulatedMs: elapsedFrom(timer, now),
        startedAt: null,
      },
    });
  },

  resumeTimer: () => {
    const { timer } = get();
    if (!timer.movementId) return;
    set({
      timer: {
        ...timer,
        running: true,
        paused: false,
        overlay: true,
        startedAt: Date.now(),
      },
    });
    void requestWakeLock();
  },

  stopTimer: () => {
    const { timer, sessions, movements, seenAwards } = get();
    const now = Date.now();
    const durationMs = elapsedFrom(timer, now);
    const nextSessions = [...sessions];
    let personalBest = false;
    if (timer.movementId && durationMs >= 1000) {
      const prevBest = sessions.reduce(
        (best, s) => (s.movementId === timer.movementId ? Math.max(best, s.durationMs) : best),
        0,
      );
      personalBest = durationMs > prevBest;
      nextSessions.unshift({
        id: newId(),
        movementId: timer.movementId,
        durationMs,
        startedAt: new Date(now - durationMs).toISOString(),
        endedAt: new Date(now).toISOString(),
      });
    }
    const awards = freshAwards(nextSessions, movements, seenAwards);
    const nextSeen = { ...seenAwards };
    const earnedAt = new Date(now).toISOString();
    for (const a of awards) nextSeen[a.id] = earnedAt;
    set((s) => {
      const next = {
        ...s,
        sessions: nextSessions,
        timer: { ...DEFAULT_TIMER },
        cue: null,
        seenAwards: nextSeen,
        justEarned: awards,
      };
      persist(sliceOf(next));
      return next;
    });
    releaseWakeLock();
    if (get().settings.speak && durationMs >= 800) {
      const name = movements.find((m) => m.id === timer.movementId)?.name ?? "Hold";
      let line = `${name} complete. ${formatSpokenDuration(durationMs)}.`;
      if (personalBest) line += " Personal best.";
      if (awards[0]) line += ` New award. ${awards[0].name}.`;
      void speak(line);
    }
    return { personalBest, awards };
  },

  resetTimer: () => {
    const { timer } = get();
    if (!timer.overlay) {
      set({ timer: { ...DEFAULT_TIMER } });
      return;
    }
    set({
      timer: {
        ...timer,
        running: false,
        paused: true,
        startedAt: null,
        accumulatedMs: 0,
        lastCueSec: 0,
      },
      cue: null,
    });
  },

  closeOverlay: () => {
    const { timer } = get();
    if (timer.running) get().stopTimer();
    else {
      set({ timer: { ...DEFAULT_TIMER } });
      releaseWakeLock();
    }
  },

  addMovement: (name, targetSeconds = null) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const exists = get().movements.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return exists;
    const movement: Movement = {
      id: newId(),
      name: trimmed.replace(/\b\w/g, (c) => c.toUpperCase()),
      aliases: [trimmed.toLowerCase()],
      targetSeconds: targetSeconds ?? null,
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const next = { ...s, movements: [...s.movements, movement] };
      persist(sliceOf(next));
      return next;
    });
    return movement;
  },

  updateMovement: (id, patch) => {
    set((s) => {
      const next = {
        ...s,
        movements: s.movements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      };
      persist(sliceOf(next));
      return next;
    });
  },

  removeMovement: (id) => {
    set((s) => {
      const next = { ...s, movements: s.movements.filter((m) => m.id !== id) };
      persist(sliceOf(next));
      return next;
    });
  },

  addReminder: (minutes, movementId = null) => {
    if (minutes < 1 || minutes > 24 * 60) return null;
    const movement = movementId ? get().movements.find((m) => m.id === movementId) : null;
    const reminder: Reminder = {
      id: newId(),
      movementId: movement?.id ?? null,
      minutes,
      fireAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      label: movement ? movement.name : "Break",
    };
    set((s) => {
      const next = { ...s, reminders: [...s.reminders, reminder] };
      persist(sliceOf(next));
      return next;
    });
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    return reminder;
  },

  cancelReminder: (id) => {
    set((s) => {
      const next = { ...s, reminders: s.reminders.filter((r) => r.id !== id) };
      persist(sliceOf(next));
      return next;
    });
  },

  cancelAllReminders: () => {
    set((s) => {
      const next = { ...s, reminders: [] };
      persist(sliceOf(next));
      return next;
    });
  },

  fireDueReminders: () => {
    const { reminders, settings, prompt } = get();
    if (prompt) return;
    const now = Date.now();
    const due = reminders.find((r) => new Date(r.fireAt).getTime() <= now);
    if (!due) return;
    set((s) => {
      const next = {
        ...s,
        reminders: s.reminders.filter((r) => r.id !== due.id),
        prompt: { reminderId: due.id, movementId: due.movementId, label: due.label },
      };
      persist(sliceOf(next));
      return next;
    });
    if (settings.chime) playChime();
    if (settings.speak) void speak(`Time for ${due.label}.`);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("HOLD", { body: `Time for ${due.label}.`, silent: true });
      } catch {
        /* ignore */
      }
    }
  },

  dismissPrompt: () => set({ prompt: null }),

  dismissJustEarned: () => set({ justEarned: [] }),

  acceptPrompt: () => {
    const { prompt } = get();
    if (!prompt) return;
    set({ prompt: null });
    if (prompt.movementId) get().startTimer(prompt.movementId);
  },

  setListening: (on) =>
    set((s) => ({ voice: { ...s.voice, listening: on, error: on ? null : s.voice.error } })),

  setTranscript: (text, isFinal) =>
    set((s) => ({
      voice: {
        ...s.voice,
        transcript: isFinal ? "" : text,
        lastHeard: isFinal ? text : s.voice.lastHeard,
      },
    })),

  setVoiceError: (error) => set((s) => ({ voice: { ...s.voice, error, listening: error ? false : s.voice.listening } })),

  setVoiceSupported: (supported) => set((s) => ({ voice: { ...s.voice, supported } })),

  setSpeaking: (speaking) => set((s) => ({ voice: { ...s.voice, speaking } })),

  setNeedsGesture: (needsGesture) => set((s) => ({ voice: { ...s.voice, needsGesture } })),

  patchSettings: (patch) => {
    set((s) => {
      const next = { ...s, settings: { ...s.settings, ...patch } };
      persist(sliceOf(next));
      return next;
    });
  },

  mergeRemote: (data) => {
    set((s) => {
      const byId = new Map<string, Movement>();
      for (const m of data.movements) byId.set(m.id, m);
      for (const m of s.movements) if (!byId.has(m.id)) byId.set(m.id, m);
      const sess = new Map<string, HoldSession>();
      for (const x of [...data.sessions, ...s.sessions]) sess.set(x.id, x);
      const rems = new Map<string, Reminder>();
      for (const x of [...data.reminders, ...s.reminders]) rems.set(x.id, x);
      const next = {
        ...s,
        movements: [...byId.values()],
        sessions: [...sess.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt)),
        reminders: [...rems.values()],
      };
      persist(sliceOf(next));
      return next;
    });
  },
}));

export function selectPersonalBest(sessions: HoldSession[], movementId: string): number {
  return sessions.reduce((best, s) => (s.movementId === movementId ? Math.max(best, s.durationMs) : best), 0);
}

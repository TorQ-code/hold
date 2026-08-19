import { playBytes, speakBrowser, stopAudio, unlockAudio, wait } from "./audio";
import { isIOS } from "./platform";
import type { Movement, VoiceIntent } from "./types";

const WORD_NUM: Record<string, number> = {
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  twentyfive: 25,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
  sixty: 60,
  ninety: 90,
};

function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[!.?,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberToken(token: string): number | null {
  const compact = token.replace(/[\s-]/g, "");
  if (WORD_NUM[compact] != null) return WORD_NUM[compact];
  const n = Number.parseInt(token, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDurationToMinutes(raw: string): { minutes: number; rest: string } | null {
  const m = raw.match(
    /(?:in\s+)?(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty[\s-]?five|twenty|thirty|forty[\s-]?five|forty|sixty|ninety)\s*(hours?|hrs?|minutes?|mins?|minute|min)?/,
  );
  if (!m || m.index == null) return null;
  const n = parseNumberToken(m[1]);
  if (n == null || n <= 0) return null;
  const unit = (m[2] ?? "minutes").toLowerCase();
  const minutes = unit.startsWith("hour") || unit.startsWith("hr") ? n * 60 : n;
  const rest = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim();
  return { minutes, rest };
}

function parseSeconds(raw: string): { seconds: number; rest: string } | null {
  const m = raw.match(
    /(?:for\s+)?(\d+|fifteen|twenty|thirty|forty[\s-]?five|sixty|ninety)\s*(seconds?|secs?|s)\b/,
  );
  if (!m || m.index == null) return null;
  const n = parseNumberToken(m[1]);
  if (n == null) return null;
  const rest = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).trim();
  return { seconds: n, rest };
}

function stripFiller(s: string): string {
  return s
    .replace(/\b(please|the|a|an|my|me|to do|to|for|timer|exercise)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_RE =
  /\b(stop|end|done|finish|enough|release|drop|let go|that's it|thats it|that is it|i'm done|im done|i am done|cancel timer|stop timer|end timer|stop the timer|end the timer|stop hang|stop plank|stop hold)\b/;
const PAUSE_RE = /\b(pause|hold on|wait|freeze|pause timer)\b/;
const RESUME_RE = /\b(resume|continue|unpause|keep going|start again)\b/;

export function parseCommand(
  raw: string,
  ctx: { timerActive?: boolean; movements?: Movement[] } = {},
): VoiceIntent {
  const t = clean(raw);
  if (!t) return { type: "unknown", raw };

  if (STOP_RE.test(t) || /^(stop|end|finish|done)(\s+(the\s+)?timer)?$/.test(t)) {
    return { type: "stop" };
  }
  if (ctx.timerActive && PAUSE_RE.test(t)) {
    return { type: "pause" };
  }
  if (ctx.timerActive && RESUME_RE.test(t)) {
    return { type: "resume" };
  }
  if (/^(pause|hold on|wait|freeze)(\s+(the\s+)?timer)?$/.test(t)) {
    return { type: "pause" };
  }
  if (/^(resume|continue|unpause|keep going)(\s+(the\s+)?timer)?$/.test(t)) {
    return { type: "resume" };
  }
  if (/^reset(\s+(the\s+)?timer)?$/.test(t)) {
    return { type: "reset" };
  }
  if (/cancel (all )?reminders?/.test(t) || t === "cancel reminder") {
    return { type: "cancelReminders" };
  }

  if (/^(add|new|create|save)\s+(a\s+)?(movement|exercise|hold)\b/.test(t)) {
    const name = t
      .replace(/^(add|new|create|save)\s+(a\s+)?(movement|exercise|hold)\s+(called\s+|named\s+)?/, "")
      .trim();
    if (name) return { type: "addMovement", name };
  }

  if (
    /\bremind\b/.test(t) ||
    /^set reminder\b/.test(t) ||
    /^reminder\b/.test(t) ||
    /^break in\b/.test(t)
  ) {
    const parsed = parseDurationToMinutes(t);
    if (parsed) {
      let rest = parsed.rest
        .replace(/\b(remind( me)?|set reminder|reminder|break in|me|in)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      rest = rest.replace(/^(to|for)\s+/, "");
      const q = stripFiller(rest);
      return {
        type: "remind",
        minutes: parsed.minutes,
        movementQuery: q || null,
      };
    }
  }

  // Initiation is always "Start [exercise]" — never a bare name.
  const startAt = t.search(/\b(start|begin)\b/);
  if (startAt >= 0 && !/\bstart again\b/.test(t)) {
    let rest = t.slice(startAt).replace(/^(start|begin)\s+/, "");
    const sec = parseSeconds(rest);
    let seconds: number | null = null;
    if (sec) {
      seconds = sec.seconds;
      rest = sec.rest;
    }
    rest = rest
      .replace(/\b(the|a|an|my)\s+/g, " ")
      .replace(/\btimer\b/g, " ")
      .replace(/\b(for|on)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const q = stripFiller(rest);
    return { type: "start", movementQuery: q || null, seconds };
  }

  return { type: "unknown", raw };
}

export function matchMovement(query: string, movements: Movement[]): Movement | null {
  const q = clean(query);
  if (!q) return null;

  const scored = movements
    .map((m) => ({ m, score: scoreMovement(q, m) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.m ?? null;
}

function scoreMovement(q: string, m: Movement): number {
  const name = clean(m.name);
  if (q === name) return 100;
  const aliases = m.aliases.map(clean);
  if (aliases.includes(q)) return 90;
  if (name.startsWith(q) || aliases.some((a) => a.startsWith(q))) return 70;
  if (name.includes(q) || aliases.some((a) => a.includes(q))) return 55;
  const words = q.split(" ").filter(Boolean);
  if (words.length && words.every((w) => name.includes(w) || aliases.some((a) => a.includes(w)))) {
    return 40 + words.length;
  }
  return 0;
}

type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function getSpeechRecognitionCtor(): (new () => Recog) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let voiceBusy = false;
let busyUntil = 0;
let onSpeakStart: (() => void) | null = null;

export function setSpeakGate(fn: (() => void) | null) {
  onSpeakStart = fn;
}

export function isVoiceBusy(): boolean {
  return voiceBusy || Date.now() < busyUntil;
}

export function markVoiceBusy(ms = 800) {
  voiceBusy = true;
  busyUntil = Date.now() + ms;
}

export function clearVoiceBusy() {
  voiceBusy = false;
  busyUntil = Date.now() + 350;
}

const clipCache = new Map<string, ArrayBuffer>();

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function warmJarvis(extra: string[] = []) {
  if (typeof window === "undefined") return;
  const lines = [
    "Ready.",
    "Listening.",
    "Paused.",
    "Resuming.",
    "Timer reset.",
    "Fifteen seconds. Stay with it.",
    "Thirty seconds. Well held.",
    "Forty-five. Keep going.",
    "One minute. Impressive.",
    "Stay with it.",
    "Good. Hold.",
    "That's it.",
    "Steady now.",
    "Don't let go.",
    "You're doing well.",
    "Breathe. Hold.",
    "Still strong.",
    "Well held.",
    ...extra,
  ];
  void (async () => {
    for (const line of lines) {
      if (clipCache.has(line)) continue;
      const clip = await fetchJarvisClip(line);
      if (!clip) break;
      clipCache.set(line, clip.bytes);
    }
  })();
}

async function fetchJarvisClip(text: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok || res.status === 204) return null;
    const type = res.headers.get("content-type") || "audio/mpeg";
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

export async function speak(text: string, opts?: { lock?: boolean }): Promise<void> {
  if (typeof window === "undefined") return;
  const line = text.trim();
  if (!line) return;
  unlockAudio();
  const ios = isIOS();
  const lock = opts?.lock !== false || ios;
  if (lock) markVoiceBusy(12_000);
  stopAudio();
  onSpeakStart?.();
  if (ios) await wait(60);
  try {
    const cached = clipCache.get(line);
    if (cached) {
      await playBytes(cached.slice(0));
      return;
    }
    // Speak now so a tap always produces sound. Cache Jarvis behind it.
    const pending = fetchJarvisClip(line).then((clip) => {
      if (clip) {
        if (clipCache.size > 40) {
          const first = clipCache.keys().next().value;
          if (first) clipCache.delete(first);
        }
        clipCache.set(line, clip.bytes);
      }
      return clip;
    });
    await speakBrowser(line);
    await pending;
  } catch {
    try {
      await speakBrowser(line);
    } catch {
      /* next tap re-unlocks */
    }
  } finally {
    if (lock) clearVoiceBusy();
  }
}

export function playChime() {
  if (typeof window === "undefined") return;
  unlockAudio();
  const audio =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audio) return;
  const ctx = new audio();
  void ctx.resume();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = now + i * 0.11;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.58);
  });
  window.setTimeout(() => void ctx.close(), 1200);
}

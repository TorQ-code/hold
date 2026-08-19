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

function clean(raw: string | null | undefined): string {
  return String(raw ?? "")
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
  if (/^(yes|yeah|yep|yup|sure|ok|okay|please|do it|add it|add that|yes please)$/.test(t)) {
    return { type: "confirmYes" };
  }
  if (/^(no|nope|nah|cancel|don't|dont|do not|no thanks|no thank you)$/.test(t)) {
    return { type: "confirmNo" };
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

  // Initiation is "Start [exercise]".
  const startAt = t.search(/\b(start|starting|started|begin|beginning)\b/);
  if (startAt >= 0 && !/\bstart again\b/.test(t)) {
    let rest = t
      .slice(startAt)
      .replace(/^(start|starting|started|begin|beginning)\s+/, "");
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
  const q = normalizeQuery(query);
  if (!q) return null;

  const owner = uniqueNameTokens(movements);
  if (!q.includes(" ")) {
    const only = owner.get(q);
    if (only) return only;
  }

  const scored = movements
    .map((m) => ({ m, score: scoreMovement(q, m) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 68) return null;
  const runner = scored[1];
  if (runner && runner.score >= 68 && best.score - runner.score < 12) return null;
  return best.m;
}

function compact(s: string): string {
  return s.replace(/[\s-']/g, "");
}

const GENERIC_TOKENS = new Set(["hold", "timer", "stretch", "body", "deep", "desk", "reset", "opener"]);

function stemWord(word: string): string {
  const irregular: Record<string, string> = {
    calves: "calf",
    hanging: "hang",
    planking: "plank",
    squatting: "squat",
    sitting: "sit",
  };
  if (irregular[word]) return irregular[word];
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function normalizeQuery(raw: string): string {
  return clean(raw)
    .split(" ")
    .filter(Boolean)
    .map(stemWord)
    .join(" ");
}

function uniqueNameTokens(movements: Movement[]): Map<string, Movement> {
  const counts = new Map<string, Movement[]>();
  for (const m of movements) {
    const tokens = new Set(normalizeQuery(m.name).split(" ").filter(Boolean));
    for (const token of tokens) {
      const list = counts.get(token) ?? [];
      if (!list.includes(m)) list.push(m);
      counts.set(token, list);
    }
  }
  const unique = new Map<string, Movement>();
  for (const [token, list] of counts) {
    if (list.length === 1 && !GENERIC_TOKENS.has(token)) unique.set(token, list[0]);
  }
  return unique;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function closePhrase(q: string, name: string): number {
  if (!q || !name) return 0;
  if (q === name) return 100;
  const cq = compact(q);
  const cn = compact(name);
  if (cq === cn) return 92;
  if (q.length >= 5 && !GENERIC_TOKENS.has(q) && (name.startsWith(q) || name.split(" ").includes(q))) return 80;
  if (name.length >= 6 && editDistance(cq, cn) === 1) return 74;
  return 0;
}

function closeToken(q: string, name: string): boolean {
  if (q === name) return true;
  if (q.length >= 5 && editDistance(q, name) === 1) return true;
  return false;
}

function scoreMovement(q: string, m: Movement): number {
  const name = normalizeQuery(m.name);
  const aliases = [name, ...(m.aliases ?? []).map(normalizeQuery)];
  let best = 0;
  for (const alias of aliases) best = Math.max(best, closePhrase(q, alias));

  const qWords = q.split(" ").filter(Boolean);
  const pools = aliases.map((a) => a.split(" ").filter(Boolean));
  if (qWords.length >= 2) {
    for (const pool of pools) {
      if (qWords.every((w) => pool.some((n) => closeToken(w, n)))) {
        best = Math.max(best, 76);
      }
    }
  }
  return best;
}

export function resolveHeard(
  candidates: string[],
  ctx: { timerActive?: boolean; movements?: Movement[] },
): { text: string; intent: VoiceIntent } | null {
  const unique = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
  if (!unique.length) return null;
  const movements = ctx.movements ?? [];
  let fallback: { text: string; intent: VoiceIntent } | null = null;
  for (const text of unique) {
    const intent = parseCommand(text, ctx);
    if (
      intent.type === "stop" ||
      intent.type === "pause" ||
      intent.type === "resume" ||
      intent.type === "confirmYes" ||
      intent.type === "confirmNo"
    ) {
      return { text, intent };
    }
    if (intent.type === "start") {
      if (!intent.movementQuery || matchMovement(intent.movementQuery, movements)) {
        return { text, intent };
      }
    }
    if (!fallback && intent.type !== "unknown") fallback = { text, intent };
  }
  return fallback ?? { text: unique[0], intent: parseCommand(unique[0], ctx) };
}

type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; length?: number; [index: number]: { transcript: string } }>;
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

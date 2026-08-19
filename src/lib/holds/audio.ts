import { isIOS } from "./platform";

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentEl: HTMLAudioElement | null = null;
let primed = false;
const pool: HTMLAudioElement[] = [];

function AC(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

export function getAudioContext(): AudioContext | null {
  const Ctor = AC();
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") {
    ctx = new Ctor();
    gain = ctx.createGain();
    gain.gain.value = isIOS() ? 1.12 : 1.85;
    gain.connect(ctx.destination);
  }
  return ctx;
}

function makeEl(): HTMLAudioElement {
  const el = new Audio();
  el.preload = "auto";
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.volume = 1;
  return el;
}

function takeEl(): HTMLAudioElement {
  const el = pool.pop() ?? makeEl();
  currentEl = el;
  return el;
}

function recycle(el: HTMLAudioElement) {
  el.onended = null;
  el.onerror = null;
  el.oncanplaythrough = null;
  if (currentEl === el) currentEl = null;
  if (pool.length < 2) pool.push(el);
}

/** Call on taps. Never hijacks the element that is speaking. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const audio = getAudioContext();
  if (audio && audio.state !== "running") void audio.resume();
  if (primed) return;
  primed = true;
  if (audio) {
    try {
      const buf = audio.createBuffer(1, 1, 22050);
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      src.start(0);
    } catch {
      primed = false;
    }
  }
  const el = makeEl();
  el.src = SILENT_WAV;
  void el
    .play()
    .then(() => {
      el.pause();
      pool.push(el);
    })
    .catch(() => {
      primed = false;
    });
}

export function stopAudio() {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      /* ignore */
    }
    currentSource = null;
  }
  if (currentEl) {
    currentEl.pause();
    recycle(currentEl);
  }
}

export function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

export async function playBytes(bytes: ArrayBuffer, mime = "audio/mpeg"): Promise<void> {
  const audio = getAudioContext();
  if (audio && audio.state !== "running") void audio.resume();

  if (isIOS()) {
    await playViaElement(bytes, mime);
    return;
  }
  if (audio) {
    try {
      const buffer = await decode(audio, bytes.slice(0));
      await playBuffer(audio, buffer);
      return;
    } catch {
      /* element fallback */
    }
  }
  await playViaElement(bytes, mime);
}

function decode(audio: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const fail = (err?: unknown) => reject(err ?? new Error("decode"));
    try {
      const p = audio.decodeAudioData(bytes, resolve, fail);
      if (p && typeof p.then === "function") void p.then(resolve, fail);
    } catch (err) {
      fail(err);
    }
  });
}

function playBuffer(audio: AudioContext, buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const src = audio.createBufferSource();
      src.buffer = buffer;
      src.connect(gain ?? audio.destination);
      currentSource = src;
      src.onended = () => {
        if (currentSource === src) currentSource = null;
        resolve();
      };
      src.start(0);
    } catch (err) {
      reject(err);
    }
  });
}

function playViaElement(bytes: ArrayBuffer, mime: string): Promise<void> {
  const el = takeEl();
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      recycle(el);
      if (ok) resolve();
      else reject(new Error("element"));
    };
    el.onended = () => finish(true);
    el.onerror = () => finish(false);
    const start = () => {
      el.oncanplaythrough = null;
      const play = el.play();
      if (play && typeof play.then === "function") void play.catch(() => finish(false));
    };
    el.oncanplaythrough = start;
    el.src = url;
    window.setTimeout(() => {
      if (!settled && el.paused) start();
    }, 180);
  });
}

export async function speakBrowser(text: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickBritishVoice();
    if (voice) u.voice = voice;
    u.lang = "en-GB";
    u.rate = 1.04;
    u.pitch = 0.94;
    u.volume = 1;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    window.setTimeout(finish, Math.min(7000, 800 + text.length * 80));
    synth.speak(u);
  });
}

function pickBritishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const ranked = voices
    .map((v) => {
      const n = `${v.name} ${v.lang}`.toLowerCase();
      let score = 0;
      if (v.lang.toLowerCase().startsWith("en-gb")) score += 8;
      if (/\b(uk|british|england|daniel|george|arthur|malcolm|oliver|ryan)\b/.test(n)) score += 6;
      if (/\bmale\b/.test(n)) score += 3;
      if (/\b(female|woman|samantha|karen|moira|tessa|fiona|zira|susan)\b/.test(n)) score -= 10;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score > 0 ? ranked[0].v : (voices.find((v) => v.lang.startsWith("en")) ?? null);
}

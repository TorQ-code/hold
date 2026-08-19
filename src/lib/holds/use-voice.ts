import { useCallback, useEffect, useRef, useState } from "react";
import { unlockAudio } from "./audio";
import { isIOS } from "./platform";
import { getSpeechRecognitionCtor, isVoiceBusy, parseCommand, setSpeakGate, warmJarvis } from "./voice";
import { useHoldStore } from "./store";

export type VoiceApi = {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  pushStart: () => void;
  pushEnd: () => void;
  pushing: boolean;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function useVoice() {
  const recRef = useRef<{
    start: () => void;
    stop: () => void;
    abort: () => void;
  } | null>(null);
  const wantRef = useRef(true);
  const runningRef = useRef(false);
  const lastStopAt = useRef(0);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pushingRef = useRef(false);
  const [pushing, setPushing] = useState(false);
  const applyCommand = useHoldStore((s) => s.applyCommand);
  const setListening = useHoldStore((s) => s.setListening);
  const setTranscript = useHoldStore((s) => s.setTranscript);
  const setVoiceError = useHoldStore((s) => s.setVoiceError);
  const setVoiceSupported = useHoldStore((s) => s.setVoiceSupported);
  const setNeedsGesture = useHoldStore((s) => s.setNeedsGesture);

  const boot = useCallback(() => {
    const rec = recRef.current;
    if (!rec || !wantRef.current || runningRef.current || isVoiceBusy() || pushingRef.current) return;
    try {
      rec.start();
      runningRef.current = true;
      setListening(true);
      setNeedsGesture(false);
      setVoiceError(null);
    } catch {
      /* already started */
    }
  }, [setListening, setNeedsGesture, setVoiceError]);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    const canRecord = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    setVoiceSupported(Boolean(Ctor) || canRecord);
    if (!Ctor) {
      if (!canRecord) {
        setVoiceError("This browser cannot listen. Type a command, or open Chrome / Safari.");
      }
      return;
    }

    const rec = new Ctor();
    const ios = isIOS();
    rec.continuous = !ios;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 3;

    rec.onresult = (ev) => {
      if (isVoiceBusy() || pushingRef.current) return;
      let interim = "";
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      const live = (finalText || interim).trim();
      if (interim) setTranscript(interim, false);

      const state = useHoldStore.getState();
      const timerActive = state.timer.running || state.timer.overlay;
      const early = parseCommand(live, { timerActive, movements: state.movements });
      const now = Date.now();
      if ((early.type === "stop" || early.type === "pause") && now - lastStopAt.current > 1200) {
        lastStopAt.current = now;
        setTranscript(live, true);
        applyCommand(live);
        if (ios) runningRef.current = false;
        return;
      }
      if (finalText.trim()) {
        setTranscript(finalText.trim(), true);
        applyCommand(finalText.trim());
        if (ios) runningRef.current = false;
      }
    };

    rec.onerror = (ev) => {
      runningRef.current = false;
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setVoiceError("Allow the microphone once — then start and stop by voice.");
        setNeedsGesture(true);
        setListening(false);
        return;
      }
      if (ev.error === "audio-capture") {
        setVoiceError("No microphone found.");
        return;
      }
    };

    rec.onend = () => {
      runningRef.current = false;
      if (wantRef.current && !isVoiceBusy() && !pushingRef.current) {
        window.setTimeout(() => boot(), ios ? 320 : 180);
      } else if (!wantRef.current) {
        setListening(false);
      }
    };

    recRef.current = rec;
    setSpeakGate(() => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      runningRef.current = false;
    });
    if (useHoldStore.getState().settings.handsFree) {
      wantRef.current = true;
      boot();
    }
    return () => {
      wantRef.current = false;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      runningRef.current = false;
      setSpeakGate(null);
    };
  }, [applyCommand, boot, setListening, setNeedsGesture, setTranscript, setVoiceError, setVoiceSupported]);

  const start = useCallback(() => {
    unlockAudio();
    const names = useHoldStore.getState().movements.map((m) => `Beginning ${m.name}.`);
    warmJarvis(names);
    const canListen = Boolean(getSpeechRecognitionCtor()) || Boolean(navigator.mediaDevices?.getUserMedia);
    if (!canListen) {
      setVoiceError("Voice is not supported here. Type a command instead.");
      return;
    }
    wantRef.current = true;
    useHoldStore.getState().patchSettings({ handsFree: true });
    setListening(true);
    boot();
  }, [boot, setListening, setVoiceError]);

  const stop = useCallback(() => {
    wantRef.current = false;
    useHoldStore.getState().patchSettings({ handsFree: false });
    setListening(false);
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    runningRef.current = false;
  }, [setListening]);

  const toggle = useCallback(() => {
    if (wantRef.current || useHoldStore.getState().voice.listening) stop();
    else start();
  }, [start, stop]);

  const pushStart = useCallback(() => {
    if (pushingRef.current) return;
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      start();
      return;
    }
    pushingRef.current = true;
    setPushing(true);
    useHoldStore.setState((s) => ({ voice: { ...s.voice, transcript: "Listening…" } }));
    void (async () => {
      try {
        try {
          recRef.current?.abort();
        } catch {
          /* ignore */
        }
        runningRef.current = false;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRef.current = stream;
        const mime = pickRecorderMime();
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorderRef.current = rec;
        rec.start();
        setListening(true);
        setNeedsGesture(false);
        setVoiceError(null);
      } catch {
        pushingRef.current = false;
        setPushing(false);
        setVoiceError("Allow the microphone once — then hold the mic to speak.");
        setNeedsGesture(true);
      }
    })();
  }, [setListening, setNeedsGesture, setVoiceError, start]);

  const pushEnd = useCallback(() => {
    if (!pushingRef.current) return;
    const rec = recorderRef.current;
    const stream = mediaRef.current;
    recorderRef.current = null;
    mediaRef.current = null;
    if (!rec || rec.state === "inactive") {
      pushingRef.current = false;
      setPushing(false);
      stream?.getTracks().forEach((t) => t.stop());
      if (wantRef.current) boot();
      return;
    }
    rec.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      pushingRef.current = false;
      setPushing(false);
      void (async () => {
        try {
          const { transcribeCommand } = await import("./stt");
          const b64 = await blobToBase64(blob);
          const result = await transcribeCommand({ data: { audio: b64, type } });
          if (result.ok && result.text) {
            setTranscript(result.text, true);
            applyCommand(result.text);
          } else {
            setTranscript("", true);
          }
        } catch {
          setVoiceError("Could not hear that. Try again, or type the command.");
        } finally {
          if (wantRef.current) boot();
        }
      })();
    };
    try {
      rec.stop();
    } catch {
      pushingRef.current = false;
      setPushing(false);
      stream?.getTracks().forEach((t) => t.stop());
    }
  }, [applyCommand, boot, setTranscript, setVoiceError]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && wantRef.current) boot();
    };
    const onPointer = () => {
      unlockAudio();
      if (wantRef.current && !runningRef.current && !pushingRef.current) boot();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onPointer);
    const watch = window.setInterval(() => {
      if (wantRef.current && !runningRef.current && !isVoiceBusy() && !pushingRef.current) boot();
    }, isIOS() ? 900 : 1500);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onPointer);
      window.clearInterval(watch);
    };
  }, [boot]);

  const overlay = useHoldStore((s) => s.timer.overlay);
  useEffect(() => {
    if (overlay && useHoldStore.getState().settings.handsFree) start();
  }, [overlay, start]);

  return { start, stop, toggle, pushStart, pushEnd, pushing };
}

import { format, formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, Bell, Mic, MicOff, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AwardToast } from "@/components/award-toast";
import { BreakPrompt } from "@/components/break-prompt";
import { ProgressSection } from "@/components/progress-section";
import { TimerOverlay } from "@/components/timer-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { REMINDER_PRESETS } from "@/lib/holds/defaults";
import { formatClock, formatCompact, isSameLocalDay } from "@/lib/holds/format";
import { currentStreak } from "@/lib/holds/stats";
import { selectPersonalBest, useHoldStore } from "@/lib/holds/store";
import { useCloudSync } from "@/lib/holds/use-sync";
import { unlockAudio } from "@/lib/holds/audio";
import { isIOS, isStandalone } from "@/lib/holds/platform";
import { type VoiceApi, useVoice } from "@/lib/holds/use-voice";
import { cn } from "@/lib/utils";

type View = "home" | "progress" | "remind";

export function HoldApp() {
  const hydrate = useHoldStore((s) => s.hydrate);
  const tick = useHoldStore((s) => s.tick);
  useCloudSync();
  const voice = useVoice();

  useEffect(() => {
    hydrate();
    tick();
    const id = window.setInterval(() => useHoldStore.getState().tick(), 80);
    return () => window.clearInterval(id);
  }, [hydrate, tick]);

  useEffect(() => {
    voice.start();
  }, [voice.start]);

  useEffect(() => {
    const onFirst = () => unlockAudio();
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => window.removeEventListener("pointerdown", onFirst);
  }, []);

  return (
    <>
      <Shell voice={voice} />
      <BreakPrompt />
      <AwardToast />
      <TimerOverlay voice={voice} />
    </>
  );
}

function Shell({ voice }: { voice: VoiceApi }) {
  const [view, setView] = useState<View>("home");

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-10">
        {view === "home" ? (
          <>
            <AppHeader />
            <VoiceDock voice={voice} />
            <NextReminder onOpen={() => setView("remind")} />
            <MovementSection />
            <HomeNav onChange={setView} />
            <InstallHint />
          </>
        ) : (
          <>
            <SubHead
              title={view === "progress" ? "Progress" : "Remind"}
              onBack={() => setView("home")}
            />
            {view === "progress" ? (
              <>
                <ProgressSection />
                <SessionSection />
              </>
            ) : (
              <ReminderSection />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="grid size-11 place-items-center rounded-full text-muted shadow-[var(--shadow-border)] hover:text-fg"
        aria-label="Back"
      >
        <ArrowLeft className="size-4" />
      </button>
      <h1 className="font-display text-4xl tracking-tight">{title}</h1>
    </header>
  );
}

function AppHeader() {
  const settings = useHoldStore((s) => s.settings);
  const patchSettings = useHoldStore((s) => s.patchSettings);
  const sessions = useHoldStore((s) => s.sessions);
  const today = useMemo(() => {
    const todays = sessions.filter((s) => isSameLocalDay(s.endedAt));
    return {
      count: todays.length,
      total: todays.reduce((n, s) => n + s.durationMs, 0),
    };
  }, [sessions]);
  const streak = currentStreak(sessions);

  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <p className="font-display text-5xl leading-none tracking-tight text-fg sm:text-6xl">HOLD</p>
        <p className="mt-3 font-mono text-sm tabular-nums text-muted">
          {streak > 0 ? `${streak} day streak` : "No streak yet"}
          {today.count > 0 ? ` · ${formatCompact(today.total)} today` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => patchSettings({ speak: !settings.speak })}
          className="grid size-11 place-items-center rounded-full text-muted shadow-[var(--shadow-border)] transition-colors hover:text-fg"
          aria-label={settings.speak ? "Mute Jarvis" : "Unmute Jarvis"}
        >
          {settings.speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
        <AuthSlot />
      </div>
    </header>
  );
}

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) {
    return <div className="size-11 animate-pulse rounded-full bg-surface-2" />;
  }
  if (!user) {
    return (
      <Button variant="outline" size="sm" className="rounded-full" asChild>
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="size-9 rounded-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
        />
      ) : (
        <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-sm font-medium">
          {(user.displayName ?? "U").charAt(0).toUpperCase()}
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}

function VoiceDock({ voice }: { voice: VoiceApi }) {
  const state = useHoldStore((s) => s.voice);
  const applyCommand = useHoldStore((s) => s.applyCommand);
  const [draft, setDraft] = useState("");
  const holdTimer = useRef(0);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    applyCommand(text);
    setDraft("");
  }

  const live = voice.pushing || state.listening;

  return (
    <section className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
      {!live && (
        <button
          type="button"
          onClick={voice.start}
          className="mb-3 flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-3 text-left"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-live text-accent-fg">
            <Mic className="size-5" />
          </span>
          <span className="text-sm">
            <span className="block font-medium text-fg">Tap to listen</span>
            <span className="text-muted">Then say Start dead hang.</span>
          </span>
        </button>
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            window.clearTimeout(holdTimer.current);
            holdTimer.current = window.setTimeout(() => voice.pushStart(), 280);
          }}
          onPointerUp={() => {
            window.clearTimeout(holdTimer.current);
            if (voice.pushing) voice.pushEnd();
            else if (state.listening) voice.toggle();
            else voice.start();
          }}
          onPointerCancel={() => {
            window.clearTimeout(holdTimer.current);
            voice.pushEnd();
          }}
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-full transition-colors touch-manipulation",
            live
              ? "listening-pulse bg-live text-accent-fg"
              : "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
          )}
          aria-pressed={live}
          aria-label={voice.pushing ? "Release to send" : live ? "Listening" : "Hold to speak"}
        >
          {live ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={state.listening ? state.transcript || "Start dead hang" : "Start dead hang"}
          aria-label="Voice or typed command"
          className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
        />
      </form>
      <p className="mt-3 px-1 text-xs text-subtle">
        {state.error ? (
          <span className="text-danger">{state.error}</span>
        ) : state.lastHeard ? (
          <>Heard “{state.lastHeard}”</>
        ) : (
          <>Start dead hang · Stop · or hold the mic</>
        )}
      </p>
      {isIOS() ? (
        <p className="mt-2 px-1 text-xs text-subtle">
          If Jarvis is silent, flip the Ring switch on and tap the screen once.
        </p>
      ) : null}
    </section>
  );
}

function NextReminder({ onOpen }: { onOpen: () => void }) {
  const reminders = useHoldStore((s) => s.reminders);
  const now = useHoldStore((s) => s.now);
  const next = reminders[0];
  if (!next) return null;
  const left = Math.max(0, new Date(next.fireAt).getTime() - now);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left shadow-[var(--shadow-border)]"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Bell className="size-4 shrink-0 text-live" />
        <span className="truncate text-sm text-fg">{next.label}</span>
      </span>
      <span className="font-mono text-sm tabular-nums text-muted">{formatClock(left, false)}</span>
    </button>
  );
}

function HomeNav({ onChange }: { onChange: (v: View) => void }) {
  const awards = useHoldStore((s) => s.seenAwards);
  const earned = Object.keys(awards).length;
  return (
    <nav className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => onChange("progress")}
        aria-label="Progress"
        className="rounded-xl bg-surface px-4 py-4 text-left shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)]"
      >
        <span className="block text-xs uppercase tracking-[0.14em] text-subtle">Progress</span>
        <span className="mt-1 block text-sm text-fg">Charts, awards, log</span>
        <span className="mt-2 block font-mono text-xs tabular-nums text-muted">
          {earned} award{earned === 1 ? "" : "s"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("remind")}
        aria-label="Remind"
        className="rounded-xl bg-surface px-4 py-4 text-left shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)]"
      >
        <span className="block text-xs uppercase tracking-[0.14em] text-subtle">Remind</span>
        <span className="mt-1 block text-sm text-fg">From five minutes</span>
        <span className="mt-2 block text-xs text-muted">Or say remind me in five</span>
      </button>
    </nav>
  );
}

function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (!isIOS()) return;
    if (window.localStorage.getItem("hold.installHint") === "1") return;
    setShow(true);
  }, []);
  if (!show) return null;
  return (
    <p className="text-center text-xs text-subtle">
      iPhone: Share, then Add to Home Screen.{" "}
      <button
        type="button"
        className="underline-offset-2 hover:text-fg hover:underline"
        onClick={() => {
          window.localStorage.setItem("hold.installHint", "1");
          setShow(false);
        }}
      >
        Dismiss
      </button>
    </p>
  );
}

function MovementSection() {
  const movements = useHoldStore((s) => s.movements);
  const sessions = useHoldStore((s) => s.sessions);
  const startTimer = useHoldStore((s) => s.startTimer);
  const removeMovement = useHoldStore((s) => s.removeMovement);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-display text-3xl tracking-tight">Start</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="h-9 rounded-full px-3 text-xs text-muted hover:text-fg"
            aria-pressed={editing}
          >
            {editing ? "Done" : "Edit"}
          </button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {movements.map((m) => {
          const pb = selectPersonalBest(sessions, m.id);
          return (
            <li key={m.id}>
              <article className="relative flex h-full min-h-28 flex-col rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)]">
                <button
                  type="button"
                  onClick={() => startTimer(m.id)}
                  className="flex flex-1 flex-col items-start text-left"
                >
                  <span className="font-medium leading-snug text-fg">{m.name}</span>
                  <span className="mt-auto pt-6 font-mono text-sm tabular-nums text-muted">
                    {pb > 0 ? formatClock(pb, false) : m.targetSeconds ? `${m.targetSeconds}s` : "—"}
                  </span>
                </button>
                {editing ? (
                  <button
                    type="button"
                    onClick={() => removeMovement(m.id)}
                    className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-subtle hover:text-danger"
                    aria-label={`Remove ${m.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>
      <AddMovementDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}

function AddMovementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const addMovement = useHoldStore((s) => s.addMovement);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const created = addMovement(name, target ? Number(target) : null);
    if (created) {
      setName("");
      setTarget("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New movement</DialogTitle>
          <DialogDescription>Then say Start, plus the name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="movement-name">Name</Label>
            <Input
              id="movement-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dead hang"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="movement-target">Goal seconds (optional)</Label>
            <Input
              id="movement-target"
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="60"
            />
          </div>
          <Button type="submit" className="w-full rounded-full">
            Save movement
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReminderSection() {
  const reminders = useHoldStore((s) => s.reminders);
  const now = useHoldStore((s) => s.now);
  const addReminder = useHoldStore((s) => s.addReminder);
  const cancelReminder = useHoldStore((s) => s.cancelReminder);
  const movements = useHoldStore((s) => s.movements);
  const settings = useHoldStore((s) => s.settings);
  const patchSettings = useHoldStore((s) => s.patchSettings);
  const [custom, setCustom] = useState("");
  const [forId, setForId] = useState<string>("");

  function setMinutes(mins: number) {
    addReminder(mins, forId || null);
  }

  function submitCustom(e: FormEvent) {
    e.preventDefault();
    const n = Number(custom);
    if (!Number.isFinite(n) || n < 1) return;
    setMinutes(n);
    setCustom("");
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Label htmlFor="chime-toggle">Chime</Label>
          <Switch
            id="chime-toggle"
            checked={settings.chime}
            onCheckedChange={(checked) => patchSettings({ chime: checked })}
          />
        </div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Label htmlFor="remind-for" className="shrink-0">
            For
          </Label>
          <select
            id="remind-for"
            value={forId}
            onChange={(e) => setForId(e.target.value)}
            className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">Any break</option>
            {movements.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {REMINDER_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className="h-11 min-w-14 rounded-full px-4 text-sm font-medium text-fg shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)]"
            >
              {m}m
            </button>
          ))}
        </div>
        <form onSubmit={submitCustom} className="mt-3 flex gap-2">
          <Input
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Custom minutes"
            aria-label="Custom reminder minutes"
          />
          <Button type="submit" variant="secondary">
            Set
          </Button>
        </form>
        {reminders.length > 0 && (
          <ul className="mt-5 space-y-2">
            {reminders.map((r) => {
              const left = Math.max(0, new Date(r.fireAt).getTime() - now);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Bell className="size-4 shrink-0 text-live" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{r.label}</p>
                      <p className="font-mono text-xs tabular-nums text-muted">
                        {formatClock(left, false)} left
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelReminder(r.id)}
                    className="text-xs text-muted hover:text-fg"
                  >
                    Cancel
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <CoachInterval />
    </section>
  );
}

function CoachInterval() {
  const every = useHoldStore((s) => s.settings.motivateEvery);
  const patchSettings = useHoldStore((s) => s.patchSettings);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <span className="text-sm text-muted">Cue during a hold</span>
      <div className="flex gap-2">
        {([15, 30] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => patchSettings({ motivateEvery: n })}
            className={cn(
              "h-9 rounded-full px-3 text-xs font-medium",
              every === n ? "bg-live text-accent-fg" : "text-muted shadow-[var(--shadow-border)] hover:text-fg",
            )}
            aria-pressed={every === n}
          >
            {n}s
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionSection() {
  const sessions = useHoldStore((s) => s.sessions);
  const movements = useHoldStore((s) => s.movements);
  const nameOf = (id: string) => movements.find((m) => m.id === id)?.name ?? "Hold";

  return (
    <section className="mt-10">
      <h2 className="mb-4 font-display text-3xl tracking-tight">Log</h2>
      {sessions.length === 0 ? (
        <p className="rounded-xl bg-surface px-5 py-10 text-center text-sm text-muted shadow-[var(--shadow-border)]">
          No holds yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          {sessions.slice(0, 24).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{nameOf(s.movementId)}</p>
                <p className="text-xs text-subtle">
                  {format(new Date(s.endedAt), "MMM d · h:mm a")} ·{" "}
                  {formatDistanceToNowStrict(new Date(s.endedAt), { addSuffix: true })}
                </p>
              </div>
              <Badge variant="accent" className="font-mono tabular-nums">
                {formatClock(s.durationMs, false)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

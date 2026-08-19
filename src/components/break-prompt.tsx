import { Button } from "@/components/ui/button";
import { useHoldStore } from "@/lib/holds/store";

export function BreakPrompt() {
  const prompt = useHoldStore((s) => s.prompt);
  const accept = useHoldStore((s) => s.acceptPrompt);
  const dismiss = useHoldStore((s) => s.dismissPrompt);
  const overlay = useHoldStore((s) => s.timer.overlay);

  if (!prompt || overlay) return null;

  return (
    <div className="overlay-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Time</p>
      <h2 className="mt-3 font-display text-5xl tracking-tight text-fg sm:text-6xl">{prompt.label}</h2>
      <p className="mt-4 max-w-sm text-muted">
        Your reminder just landed. Start the hold, or dismiss and stay in the day.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {prompt.movementId ? (
          <Button size="lg" className="min-w-36 rounded-full" onClick={accept}>
            Start
          </Button>
        ) : null}
        <Button variant="secondary" size="lg" className="min-w-36 rounded-full" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

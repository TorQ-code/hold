import { Award } from "lucide-react";
import { useEffect } from "react";
import { useHoldStore } from "@/lib/holds/store";

export function AwardToast() {
  const justEarned = useHoldStore((s) => s.justEarned);
  const dismiss = useHoldStore((s) => s.dismissJustEarned);
  const overlay = useHoldStore((s) => s.timer.overlay);
  const first = justEarned[0];

  useEffect(() => {
    if (!first || overlay) return;
    const id = window.setTimeout(dismiss, 5200);
    return () => window.clearTimeout(id);
  }, [first, overlay, dismiss]);

  if (!first || overlay) return null;

  return (
    <button
      type="button"
      onClick={dismiss}
      className="overlay-in fixed inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left shadow-[var(--shadow-border-hover)]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-live text-accent-fg">
        <Award className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-[0.16em] text-subtle">New award</span>
        <span className="block font-medium text-fg">{first.name}</span>
        <span className="block text-sm text-muted">{first.blurb}</span>
      </span>
    </button>
  );
}

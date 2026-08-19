import { useEffect, useRef } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  addSessionFn,
  clearRemindersFn,
  deleteMovementFn,
  deleteReminderFn,
  listHoldData,
  upsertMovementFn,
  upsertReminderFn,
} from "./server";
import { useHoldStore } from "./store";

export function useCloudSync() {
  const { user, isPending } = useCurrentUserState();
  const ready = useRef(false);

  useEffect(() => {
    if (isPending || !user) {
      ready.current = false;
      return;
    }
    let cancelled = false;
    void listHoldData()
      .then((data) => {
        if (cancelled) return;
        useHoldStore.getState().mergeRemote(data);
        ready.current = true;
        for (const m of useHoldStore.getState().movements) {
          void upsertMovementFn({ data: m }).catch(() => undefined);
        }
      })
      .catch(() => {
        ready.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [user, isPending]);

  useEffect(() => {
    if (!user) return;
    const unsub = useHoldStore.subscribe((state, prev) => {
      if (!ready.current) return;
      if (state.sessions.length > prev.sessions.length) {
        const added = state.sessions.find((s) => !prev.sessions.some((p) => p.id === s.id));
        if (added) void addSessionFn({ data: added }).catch(() => undefined);
      }
      if (state.movements !== prev.movements) {
        for (const m of state.movements) {
          const before = prev.movements.find((p) => p.id === m.id);
          if (!before || before !== m) void upsertMovementFn({ data: m }).catch(() => undefined);
        }
        for (const p of prev.movements) {
          if (!state.movements.some((m) => m.id === p.id)) {
            void deleteMovementFn({ data: p.id }).catch(() => undefined);
          }
        }
      }
      if (state.reminders !== prev.reminders) {
        if (state.reminders.length === 0 && prev.reminders.length > 0) {
          void clearRemindersFn().catch(() => undefined);
        } else {
          for (const r of state.reminders) {
            if (!prev.reminders.some((p) => p.id === r.id)) {
              void upsertReminderFn({ data: r }).catch(() => undefined);
            }
          }
          for (const p of prev.reminders) {
            if (!state.reminders.some((r) => r.id === p.id)) {
              void deleteReminderFn({ data: p.id }).catch(() => undefined);
            }
          }
        }
      }
    });
    return unsub;
  }, [user]);
}

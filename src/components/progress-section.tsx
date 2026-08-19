import { format } from "date-fns";
import { Award, Flame } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AWARD_CATALOG } from "@/lib/holds/awards";
import { formatClock, formatCompact } from "@/lib/holds/format";
import { bestOf, currentStreak, movementSeries, weekVolume, weeklySeries } from "@/lib/holds/stats";
import { useHoldStore } from "@/lib/holds/store";
import { cn } from "@/lib/utils";

export function ProgressSection() {
  const sessions = useHoldStore((s) => s.sessions);
  const movements = useHoldStore((s) => s.movements);
  const seen = useHoldStore((s) => s.seenAwards);
  const lastId = sessions[0]?.movementId ?? movements[0]?.id ?? "";
  const [moveId, setMoveId] = useState(lastId);
  const [ready, setReady] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  useEffect(() => setReady(true), []);

  const selected = movements.find((m) => m.id === moveId) ?? movements[0];
  const series = useMemo(
    () => (selected ? movementSeries(sessions, selected.id) : []),
    [sessions, selected],
  );
  const weeks = useMemo(() => weeklySeries(sessions), [sessions]);
  const streak = currentStreak(sessions);
  const week = weekVolume(sessions);
  const pb = selected ? bestOf(sessions, selected.id) : 0;
  const earned = AWARD_CATALOG.filter((a) => Boolean(seen[a.id]));
  const locked = AWARD_CATALOG.filter((a) => !seen[a.id]);

  return (
    <section>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Streak" value={streak === 0 ? "—" : `${streak}d`} hint="in a row" />
        <Stat
          label="Week"
          value={week.count === 0 ? "—" : formatCompact(week.totalMs)}
          hint={`${week.count} hold${week.count === 1 ? "" : "s"}`}
        />
        <Stat label="Best" value={pb > 0 ? formatClock(pb, false) : "—"} hint={selected?.name ?? ""} />
      </div>

      <div className="mt-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-subtle">Hold length</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {movements.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMoveId(m.id)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium touch-manipulation",
                selected?.id === m.id
                  ? "bg-live text-accent-fg"
                  : "text-muted shadow-[var(--shadow-border)] hover:text-fg",
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
        {series.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No {selected?.name.toLowerCase() ?? "holds"} yet.
          </p>
        ) : !ready ? (
          <div className="h-52" />
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}s`}
                  width={40}
                />
                <Tooltip content={<HoldTooltip />} />
                <Line
                  type="monotone"
                  dataKey="seconds"
                  stroke="var(--color-live)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-live)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Weekly volume</p>
        <div className="mt-3 h-40 w-full">
          {ready ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}s`}
                  width={40}
                />
                <Tooltip content={<WeekTooltip />} />
                <Bar dataKey="seconds" fill="var(--color-live)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>

      <div className="mt-10 mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-tight">Awards</h2>
          <p className="mt-1 text-sm text-muted">
            {earned.length} of {AWARD_CATALOG.length}
          </p>
        </div>
        {locked.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowLocked((v) => !v)}
            className="text-xs text-muted hover:text-fg"
          >
            {showLocked ? "Hide locked" : `Show ${locked.length} locked`}
          </button>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {(showLocked ? AWARD_CATALOG : earned).map((a) => {
          const when = seen[a.id];
          return (
            <li
              key={a.id}
              className={cn(
                "rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
                when ? "text-fg" : "opacity-40",
              )}
            >
              <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-live">
                {a.id.includes("day") ? <Flame className="size-4" /> : <Award className="size-4" />}
              </span>
              <p className="mt-3 font-medium leading-snug">{a.name}</p>
              <p className="mt-1 text-xs text-muted">{a.blurb}</p>
              {when ? (
                <p className="mt-2 font-mono text-xs tabular-nums text-subtle">
                  {format(new Date(when), "MMM d")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {earned.length === 0 && !showLocked ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-center text-sm text-muted shadow-[var(--shadow-border)]">
          Awards appear after you stop a hold.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-3 shadow-[var(--shadow-border)] sm:px-4">
      <p className="text-xs uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums text-fg sm:text-2xl">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>
    </div>
  );
}

function HoldTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; seconds: number; endedAt: string } }[];
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg shadow-[var(--shadow-border)]">
      <p className="font-mono tabular-nums">{p.seconds}s</p>
      <p className="text-muted">{format(new Date(p.endedAt), "MMM d · h:mm a")}</p>
    </div>
  );
}

function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; seconds: number; count: number } }[];
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-fg shadow-[var(--shadow-border)]">
      <p className="font-mono tabular-nums">
        {p.seconds}s · {p.count} holds
      </p>
      <p className="text-muted">Week of {p.label}</p>
    </div>
  );
}

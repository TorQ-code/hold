import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { HoldSession, Movement, Reminder } from "./types";

type MovementRow = {
  id: string;
  name: string;
  aliases: string;
  target_seconds: number | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  movement_id: string;
  duration_ms: number;
  started_at: string;
  ended_at: string;
};

type ReminderRow = {
  id: string;
  movement_id: string | null;
  minutes: number;
  fire_at: string;
  label: string;
};

export const listHoldData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const movements = await sql<MovementRow>`
      select id, name, aliases, target_seconds, created_at
      from movements
      where user_id = ${context.userId}
      order by created_at asc
    `;
    const sessions = await sql<SessionRow>`
      select id, movement_id, duration_ms, started_at, ended_at
      from hold_sessions
      where user_id = ${context.userId}
      order by ended_at desc
      limit 200
    `;
    const reminders = await sql<ReminderRow>`
      select id, movement_id, minutes, fire_at, label
      from hold_reminders
      where user_id = ${context.userId}
      order by fire_at asc
    `;
    return {
      movements: movements.map(
        (m): Movement => ({
          id: m.id,
          name: m.name,
          aliases: safeJsonArray(m.aliases),
          targetSeconds: m.target_seconds,
          createdAt: String(m.created_at),
        }),
      ),
      sessions: sessions.map(
        (s): HoldSession => ({
          id: s.id,
          movementId: s.movement_id,
          durationMs: Number(s.duration_ms),
          startedAt: String(s.started_at),
          endedAt: String(s.ended_at),
        }),
      ),
      reminders: reminders.map(
        (r): Reminder => ({
          id: r.id,
          movementId: r.movement_id,
          minutes: Number(r.minutes),
          fireAt: String(r.fire_at),
          label: r.label,
        }),
      ),
    };
  });

export const upsertMovementFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Movement) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const aliases = JSON.stringify(data.aliases);
    await sql`
      insert into movements (id, user_id, name, aliases, target_seconds, created_at)
      values (${data.id}, ${context.userId}, ${data.name}, ${aliases}, ${data.targetSeconds}, ${data.createdAt})
      on conflict (user_id, id) do update set
        name = excluded.name,
        aliases = excluded.aliases,
        target_seconds = excluded.target_seconds
    `;
  });

export const deleteMovementFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from movements where id = ${id} and user_id = ${context.userId}`;
  });

export const addSessionFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: HoldSession) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into hold_sessions (id, user_id, movement_id, duration_ms, started_at, ended_at)
      values (${data.id}, ${context.userId}, ${data.movementId}, ${data.durationMs}, ${data.startedAt}, ${data.endedAt})
      on conflict (user_id, id) do nothing
    `;
  });

export const upsertReminderFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Reminder) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into hold_reminders (id, user_id, movement_id, minutes, fire_at, label)
      values (${data.id}, ${context.userId}, ${data.movementId}, ${data.minutes}, ${data.fireAt}, ${data.label})
      on conflict (user_id, id) do update set
        movement_id = excluded.movement_id,
        minutes = excluded.minutes,
        fire_at = excluded.fire_at,
        label = excluded.label
    `;
  });

export const deleteReminderFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from hold_reminders where id = ${id} and user_id = ${context.userId}`;
  });

export const clearRemindersFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`delete from hold_reminders where user_id = ${context.userId}`;
  });

function safeJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

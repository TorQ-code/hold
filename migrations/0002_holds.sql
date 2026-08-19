create table if not exists movements (
  id text not null,
  user_id text not null,
  name text not null,
  aliases text not null default '[]',
  target_seconds int,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists movements_user_id_idx on movements (user_id);

create table if not exists hold_sessions (
  id text not null,
  user_id text not null,
  movement_id text not null,
  duration_ms int not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  primary key (user_id, id)
);
create index if not exists hold_sessions_user_id_idx on hold_sessions (user_id, ended_at desc);

create table if not exists hold_reminders (
  id text not null,
  user_id text not null,
  movement_id text,
  minutes int not null,
  fire_at timestamptz not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists hold_reminders_user_id_idx on hold_reminders (user_id);

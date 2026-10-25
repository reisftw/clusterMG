create table if not exists maintenance_active_sessions (
  session_id text primary key,
  user_id text not null,
  user_email text,
  user_role text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists maintenance_active_sessions_last_seen_idx
  on maintenance_active_sessions (last_seen_at desc);

create index if not exists maintenance_active_sessions_user_seen_idx
  on maintenance_active_sessions (user_id, last_seen_at desc);

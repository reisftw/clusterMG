create table if not exists app_sessions (
  jti text primary key,
  uid text not null references app_users(uid) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists app_sessions_uid_idx
  on app_sessions (uid);

create index if not exists app_sessions_expires_at_idx
  on app_sessions (expires_at);

create index if not exists app_sessions_active_idx
  on app_sessions (uid, expires_at)
  where revoked_at is null;

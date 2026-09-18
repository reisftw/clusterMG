alter table if exists app_sessions
  add column if not exists refresh_token_hash text,
  add column if not exists refresh_expires_at timestamptz,
  add column if not exists refreshed_at timestamptz;

create index if not exists app_sessions_refresh_token_hash_idx
  on app_sessions (refresh_token_hash)
  where refresh_token_hash is not null and revoked_at is null;

create index if not exists app_sessions_refresh_expires_at_idx
  on app_sessions (refresh_expires_at)
  where refresh_token_hash is not null and revoked_at is null;

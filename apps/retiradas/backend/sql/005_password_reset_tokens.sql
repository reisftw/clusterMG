create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  uid text not null references app_users(uid) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'password_reset',
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_uid_idx
  on password_reset_tokens(uid);

create index if not exists password_reset_tokens_active_idx
  on password_reset_tokens(token_hash, expires_at)
  where used_at is null;

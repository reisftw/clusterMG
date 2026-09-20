create table if not exists email_mfa_challenges (
  id text primary key,
  uid text not null references app_users(uid) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts integer not null default 0,
  requested_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists email_mfa_challenges_uid_idx
  on email_mfa_challenges(uid, created_at desc);

create index if not exists email_mfa_challenges_active_idx
  on email_mfa_challenges(id, expires_at)
  where used_at is null;

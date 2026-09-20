alter table app_users
  add column if not exists password_hash text,
  add column if not exists password_salt text,
  add column if not exists password_algorithm text not null default 'pbkdf2_sha256',
  add column if not exists session_version integer not null default 1,
  add column if not exists disabled boolean not null default false,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists last_login_at timestamptz;

create index if not exists app_users_email_idx
  on app_users (lower(email));

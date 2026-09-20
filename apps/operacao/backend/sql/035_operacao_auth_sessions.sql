create table if not exists rot_sessions (
	id text primary key,
	user_id text not null references rot_users(id) on delete cascade,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	revoked_at timestamptz
);

create index if not exists idx_rot_sessions_user on rot_sessions(user_id);
create index if not exists idx_rot_sessions_active
	on rot_sessions(user_id, expires_at)
	where revoked_at is null;

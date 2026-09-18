create table if not exists finan_password_resets (
	id text primary key,
	user_id text not null references finan_users(id) on delete cascade,
	token_hash text not null unique,
	expires_at timestamptz not null,
	consumed_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_finan_password_resets_user
	on finan_password_resets(user_id);

create index if not exists idx_finan_password_resets_token
	on finan_password_resets(token_hash);

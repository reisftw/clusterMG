-- Inscricoes de push (Web Push/VAPID) por dispositivo/navegador. Um
-- usuario pode ter varias (celular, desktop, mais de um navegador) —
-- cada uma e uma linha independente, identificada pelo endpoint (unico
-- por navegador/dispositivo/service worker).
create table if not exists finan_push_subscriptions (
	id text primary key,
	user_id text not null references finan_users(id) on delete cascade,
	endpoint text not null unique,
	p256dh text not null,
	auth text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists finan_push_subscriptions_user_id_idx
	on finan_push_subscriptions (user_id);

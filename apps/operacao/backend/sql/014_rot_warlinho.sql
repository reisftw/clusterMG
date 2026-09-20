-- Warlinho (assistente com IA real via Gemini, tool use restrito aos
-- dados do ROT) — mesmo padrao do Financeirinho/Victorinho do Finan
-- (apps/finan/backend/sql/025_finan_financeirinho.sql), so que pro
-- dominio do ROT (chamados, plantoes, ausencias, feriados, agenda,
-- ranking). Historico de conversas por usuario, puramente aditivo.
create table if not exists rot_warlinho_conversas (
	id text primary key,
	user_id text references rot_users(id) on delete cascade,
	titulo text not null default 'Conversa com o Warlinho',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists rot_warlinho_conversas_user_idx
	on rot_warlinho_conversas (user_id, updated_at desc);

create table if not exists rot_warlinho_mensagens (
	id text primary key,
	conversa_id text not null references rot_warlinho_conversas(id) on delete cascade,
	papel text not null check (papel in ('usuario', 'assistente')),
	conteudo text not null,
	-- Quais ferramentas o modelo chamou pra montar esta resposta (auditoria/
	-- transparencia — nao usado pra nada critico, so exibicao opcional).
	tool_calls jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists rot_warlinho_mensagens_conversa_idx
	on rot_warlinho_mensagens (conversa_id, created_at asc);

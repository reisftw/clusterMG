-- Financeirinho v2 (assistente com IA real via Gemini, tool use restrito
-- aos dados do Finan) — historico de conversas, pra manter contexto entre
-- mensagens e permitir reabrir a conversa depois. Puramente aditivo.
create table if not exists finan_financeirinho_conversas (
	id text primary key,
	user_id text references finan_users(id) on delete cascade,
	titulo text not null default 'Conversa com o Financeirinho',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists finan_financeirinho_conversas_user_idx
	on finan_financeirinho_conversas (user_id, updated_at desc);

create table if not exists finan_financeirinho_mensagens (
	id text primary key,
	conversa_id text not null references finan_financeirinho_conversas(id) on delete cascade,
	papel text not null check (papel in ('usuario', 'assistente')),
	conteudo text not null,
	-- Quais ferramentas o modelo chamou pra montar esta resposta (auditoria/
	-- transparencia — nao usado pra nada critico, so exibicao opcional).
	tool_calls jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists finan_financeirinho_mensagens_conversa_idx
	on finan_financeirinho_mensagens (conversa_id, created_at asc);

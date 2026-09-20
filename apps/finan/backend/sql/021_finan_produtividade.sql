-- Roteiro Finan #18 (Metas financeiras), #21 (Favoritos/dashboard
-- pessoal) e #25 (Central de indicadores). Tres tabelas novas, aditivas,
-- sem FK dura entre elas.
create table if not exists finan_metas (
	id text primary key,
	titulo text not null,
	descricao text,
	valor_base numeric(14, 2) not null default 0,
	valor_atual numeric(14, 2) not null default 0,
	valor_alvo numeric(14, 2) not null default 0,
	data_inicio date not null default current_date,
	data_alvo date,
	status text not null default 'ativa',
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Favoritos por usuario (dashboard pessoal). Chave primaria e o proprio
-- user_id: cada usuario tem exatamente uma linha com a lista de atalhos.
create table if not exists finan_user_preferences (
	user_id text primary key references finan_users(id) on delete cascade,
	favoritos jsonb not null default '[]'::jsonb,
	updated_at timestamptz not null default now()
);

-- Formula deliberadamente restrita a "metricaA operador metricaB" (nao
-- texto livre nem eval) — metrica_a/metrica_b sao chaves de um catalogo
-- fixo no backend (indicadores/routes.js), nunca SQL/expressao do usuario.
create table if not exists finan_indicadores (
	id text primary key,
	nome text not null,
	metrica_a text not null,
	operador text not null default '/',
	metrica_b text not null,
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now()
);

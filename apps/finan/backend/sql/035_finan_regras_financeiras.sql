-- Roteiro Finan #40 (Fase 4D — Regras financeiras configuráveis, v1
-- restrito): cadastrar limiares sem alterar código ("despesa acima de
-- R$ 50 mil gera alerta"). Catálogo FIXO de tipos de regra (não um
-- motor genérico livre — decisão já tomada no próprio roteiro: "um
-- motor genérico e livre é um projeto bem maior e mais arriscado de
-- manter").
create table if not exists finan_regras_financeiras (
	id text primary key,
	tipo text not null, -- 'despesa_acima_limite' | 'conta_sem_nf_acima_limite'
	nome text not null,
	parametros jsonb not null default '{}'::jsonb, -- { limiteValor: number }
	ativa boolean not null default true,
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists finan_regras_financeiras_ativa_idx
	on finan_regras_financeiras (ativa) where ativa;

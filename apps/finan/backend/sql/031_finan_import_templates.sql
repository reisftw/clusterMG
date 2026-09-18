-- Roteiro Finan #35 (Fase 4B — Importador universal com templates,
-- estende #17): mapeamento de colunas ("Coluna A = fornecedor") salvo
-- uma vez e reaplicado quando a planilha de um sistema externo mudar de
-- layout, em vez de reconfigurar toda importação.
create table if not exists finan_import_templates (
	id text primary key,
	nome text not null,
	descricao text,
	entidade_alvo text not null default 'fornecedores', -- fornecedores (v1 — ver Roteiro #35 pra evolucao pra outras entidades)
	mapeamento jsonb not null default '{}'::jsonb, -- { campoAlvo: "nome da coluna na planilha" }
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists finan_import_templates_entidade_idx
	on finan_import_templates (entidade_alvo);

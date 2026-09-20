-- Roteiro Finan #48 (Fase 4F — Conciliação inteligente): extrato
-- bancário importado (via Central de Importações, Roteiro #35 — nova
-- entidade-alvo "extrato_bancario") + sugestão automática de
-- correspondência com títulos em aberto (contas a pagar/receber).
create table if not exists finan_extrato_bancario (
	id text primary key,
	data date not null,
	descricao text not null,
	valor numeric(14, 2) not null default 0,
	conciliado boolean not null default false,
	conciliado_tipo text, -- 'contas_pagar' | 'contas_receber'
	conciliado_id text,
	conciliado_em timestamptz,
	conciliado_por_id text,
	conciliado_por_nome text,
	created_at timestamptz not null default now()
);

create index if not exists finan_extrato_bancario_conciliado_idx
	on finan_extrato_bancario (conciliado) where not conciliado;

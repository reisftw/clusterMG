-- Roteiro Finan #46 (Fase 4E — Business Case dentro do Finan): item
-- independente — calculadora de ROI/payback/VPL/TIR, sem depender de
-- nenhum outro item da lista. Guarda os casos calculados pra referencia
-- futura (nao e obrigatorio salvar pra calcular — ver /calcular).
create table if not exists finan_business_cases (
	id text primary key,
	nome text not null,
	investimento_inicial numeric(14, 2) not null default 0,
	economia_mensal numeric(14, 2) not null default 0,
	prazo_meses integer not null default 12,
	taxa_desconto_mensal numeric(7, 4) not null default 0, -- ex.: 0.01 = 1% ao mes
	resultados jsonb not null default '{}'::jsonb, -- { roi, paybackMeses, vpl, tir }
	created_by_id text,
	created_by_nome text,
	created_at timestamptz not null default now()
);

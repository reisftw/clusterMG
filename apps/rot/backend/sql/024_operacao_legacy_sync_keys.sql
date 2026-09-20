-- Chaves de sincronizacao com as colecoes legadas do Retiradas.
-- Additive-only: permite backfill idempotente sem duplicar registros.

alter table if exists operacao_agentes
	add column if not exists legacy_path text;

alter table if exists operacao_empresas
	add column if not exists legacy_path text;

alter table if exists operacao_tecnicos
	add column if not exists legacy_path text;

alter table if exists operacao_acertos_estoque
	add column if not exists legacy_path text,
	add column if not exists source_payload jsonb not null default '{}'::jsonb;

alter table if exists operacao_entregas_tecnicos
	add column if not exists legacy_path text,
	add column if not exists source_payload jsonb not null default '{}'::jsonb;

alter table if exists operacao_auditoria_bolsa
	add column if not exists legacy_path text,
	add column if not exists source_payload jsonb not null default '{}'::jsonb;

create unique index if not exists idx_operacao_agentes_legacy_path
	on operacao_agentes(legacy_path)
	where legacy_path is not null;

create unique index if not exists idx_operacao_empresas_legacy_path
	on operacao_empresas(legacy_path)
	where legacy_path is not null;

create unique index if not exists idx_operacao_tecnicos_legacy_path
	on operacao_tecnicos(legacy_path)
	where legacy_path is not null;

create unique index if not exists idx_operacao_acertos_legacy_path
	on operacao_acertos_estoque(legacy_path)
	where legacy_path is not null;

create unique index if not exists idx_operacao_entregas_legacy_path
	on operacao_entregas_tecnicos(legacy_path)
	where legacy_path is not null;

create unique index if not exists idx_operacao_auditoria_legacy_path
	on operacao_auditoria_bolsa(legacy_path)
	where legacy_path is not null;

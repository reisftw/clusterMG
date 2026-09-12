-- Feature: Movimentacoes (devolucao de equipamento ao estoque via Portal de
-- Movimentacoes/Playground) com conciliacao automatica contra O.S. abertas
-- no mapa/match (ordens_servico, ver ordensRepository.js).
--
-- Hoje a fonte de dados e o Playground/Sempre (endpoint /nota, ja usado por
-- tecnicosBolsaAuditoria.js). O desenho fica preparado para trocar de fonte
-- no futuro (Hubsoft nativo) sem mudar o schema: os campos abaixo sao
-- genericos (nao amarrados a nomenclatura de um provedor especifico) e quem
-- decide o provedor e o service (movimentacoesEntregas.js), nao o banco.
--
-- Aditiva: tabelas novas, nao mexe em nada existente.

create table if not exists movimentacoes_estoque (
	id text primary key,
	nota_id text,
	numero text,
	movimento_estoque_id text,
	tipo_operacao text,
	emitido_em timestamptz,
	empresa_nome text,
	parceiro_nome text,
	registrado_por text,
	produto_nome text,
	produto_codigo text,
	serie text,
	observacao_raw text,
	status_match text not null default 'pendente'
		check (status_match in ('pendente', 'casada', 'sem_match')),
	os_numero text,
	os_collection text,
	casada_em timestamptz,
	removido_mapa_em timestamptz,
	removido_match_em timestamptz,
	raw_payload jsonb,
	criado_em timestamptz not null default now(),
	atualizado_em timestamptz not null default now()
);

-- Uma mesma devolucao (mesma nota + mesmo item/serie) nao deve ser
-- processada duas vezes pela varredura.
create unique index if not exists movimentacoes_estoque_dedupe_idx
	on movimentacoes_estoque (
		coalesce(movimento_estoque_id, ''),
		coalesce(nota_id, ''),
		coalesce(serie, ''),
		coalesce(produto_codigo, '')
	);

create index if not exists movimentacoes_estoque_emitido_em_idx
	on movimentacoes_estoque (emitido_em);
create index if not exists movimentacoes_estoque_empresa_idx
	on movimentacoes_estoque (empresa_nome);
create index if not exists movimentacoes_estoque_registrado_por_idx
	on movimentacoes_estoque (registrado_por);
create index if not exists movimentacoes_estoque_status_match_idx
	on movimentacoes_estoque (status_match);
create index if not exists movimentacoes_estoque_serie_idx
	on movimentacoes_estoque (serie);

create table if not exists movimentacoes_config (
	id text primary key default 'global',
	enabled boolean not null default true,
	daily_scan_time text not null default '03:00',
	timezone text not null default 'America/Sao_Paulo',
	last_run_date text,
	last_run_at timestamptz,
	updated_at timestamptz not null default now(),
	updated_by text
);

create table if not exists movimentacoes_scan_jobs (
	id text primary key,
	status text not null default 'queued'
		check (status in ('queued', 'running', 'completed', 'failed')),
	stage text,
	percent integer not null default 0,
	total integer not null default 0,
	processed integer not null default 0,
	casadas integer not null default 0,
	sem_match integer not null default 0,
	manual boolean not null default false,
	resultado jsonb,
	error text,
	created_at timestamptz not null default now(),
	started_at timestamptz,
	finished_at timestamptz,
	created_by text,
	created_by_name text
);

create index if not exists movimentacoes_scan_jobs_created_at_idx
	on movimentacoes_scan_jobs (created_at desc);

-- RBAC: catalogo de permissoes + concessao padrao (mesmo padrao de
-- 018_tecnicos_bolsa_auditoria.sql). admin ja enxerga tudo via "*"
-- (rolePermissions.js), por isso nao precisa de linha propria aqui.
insert into app_permissions (
	id, section_id, section_label, feature_id, feature_label, action,
	description, sort_order, legacy_permission, active, deprecated
) values
	(
		'movimentacoes.view', 'movimentacoes', 'Movimentações', 'movimentacoes',
		'Movimentações', 'view',
		'Visualizar devoluções de equipamento e a conciliação com O.S. abertas.',
		360, null, true, false
	),
	(
		'movimentacoes.manage', 'movimentacoes', 'Movimentações', 'movimentacoes',
		'Movimentações', 'manage',
		'Executar a varredura manual e configurar o horário da varredura automática.',
		361, null, true, false
	)
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	description = excluded.description,
	sort_order = excluded.sort_order,
	active = true,
	deprecated = false;

insert into app_role_permissions (role_id, permission)
select role_id, permission
from (
	values
		('supervisor', 'movimentacoes.view'),
		('supervisor', 'movimentacoes.manage'),
		('backoffice_retirada', 'movimentacoes.view'),
		('backoffice_retirada', 'movimentacoes.manage'),
		('backoffice', 'movimentacoes.view'),
		('backoffice', 'movimentacoes.manage')
) as seed(role_id, permission)
where exists (select 1 from app_roles where id = seed.role_id)
on conflict do nothing;

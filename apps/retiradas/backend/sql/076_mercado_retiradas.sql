create extension if not exists pgcrypto;

create table if not exists mercado_config_versions (
	id uuid primary key default gen_random_uuid(),
	version integer not null,
	active boolean not null default true,
	config jsonb not null default '{}'::jsonb,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now(),
	unique(version)
);

create unique index if not exists mercado_config_versions_active_idx
	on mercado_config_versions (active)
	where active;

create table if not exists mercado_empresa_habilitacoes (
	empresa_id text primary key,
	empresa_nome text not null,
	enabled boolean not null default true,
	cidades_autorizadas text[] not null default '{}',
	limite_lotes integer not null default 3,
	limite_por_cidade integer not null default 1,
	observacoes text,
	updated_by_uid text,
	updated_by_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists mercado_lotes (
	id uuid primary key default gen_random_uuid(),
	codigo text not null unique,
	status text not null default 'DRAFT'
		check (status in ('DRAFT', 'AVAILABLE', 'ACCEPTED', 'IN_EXECUTION', 'SUBMITTED', 'APPROVED', 'CANCELED', 'WITHDRAWN')),
	cidade text not null,
	bairros text[] not null default '{}',
	equipamento_tipo text not null,
	quantidade_os integer not null default 0,
	dificuldade text not null default 'NORMAL',
	valor_potencial numeric(12,2) not null default 0,
	valor_contratado numeric(12,2),
	sla_hours integer not null default 72,
	regularization_days integer not null default 7,
	config_version_id uuid references mercado_config_versions(id),
	config_snapshot jsonb not null default '{}'::jsonb,
	pricing_snapshot jsonb not null default '{}'::jsonb,
	accepted_by_empresa_id text,
	accepted_by_empresa_nome text,
	accepted_by_uid text,
	accepted_by_name text,
	accepted_at timestamptz,
	withdraw_deadline_at timestamptz,
	submitted_at timestamptz,
	approved_at timestamptz,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists mercado_lotes_status_idx on mercado_lotes (status);
create index if not exists mercado_lotes_cidade_idx on mercado_lotes (cidade);
create index if not exists mercado_lotes_empresa_status_idx
	on mercado_lotes (accepted_by_empresa_id, status);

create table if not exists mercado_lote_os (
	id uuid primary key default gen_random_uuid(),
	lote_id uuid not null references mercado_lotes(id) on delete cascade,
	ordem_servico_id text references ordens_servico(id) on delete set null,
	num_os text,
	codigo_cliente text,
	nome_cliente text,
	telefone text,
	endereco text,
	bairro text,
	cidade text,
	equipamento_tipo text,
	mac_addr text,
	status text not null default 'PENDING'
		check (status in ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CORRECTION_REQUESTED', 'CANCELED')),
	desfecho text check (
		desfecho is null or
		desfecho in ('RECUPERADA', 'TENTATIVAS_ESGOTADAS', 'RECUSA_COMPROVADA', 'IMPOSSIBILIDADE_OPERACIONAL', 'DEVOLUCAO_PREVIA_CONFIRMADA')
	),
	valor_contratado numeric(12,2) not null default 0,
	valor_aprovado numeric(12,2),
	sla_due_at timestamptz,
	sla_suspended_until timestamptz,
	submitted_at timestamptz,
	approved_at timestamptz,
	source_payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists mercado_lote_os_lote_idx on mercado_lote_os (lote_id);
create index if not exists mercado_lote_os_ordem_idx on mercado_lote_os (ordem_servico_id);
create index if not exists mercado_lote_os_status_idx on mercado_lote_os (status, desfecho);
create unique index if not exists mercado_lote_os_lote_ordem_unique_idx
	on mercado_lote_os (lote_id, coalesce(ordem_servico_id, num_os));

create table if not exists mercado_lote_eventos (
	id uuid primary key default gen_random_uuid(),
	lote_id uuid references mercado_lotes(id) on delete cascade,
	lote_os_id uuid references mercado_lote_os(id) on delete cascade,
	tipo text not null,
	descricao text not null,
	payload jsonb not null default '{}'::jsonb,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now()
);

create index if not exists mercado_lote_eventos_lote_idx on mercado_lote_eventos (lote_id, created_at desc);

create table if not exists mercado_tentativas (
	id uuid primary key default gen_random_uuid(),
	lote_os_id uuid not null references mercado_lote_os(id) on delete cascade,
	canal text not null,
	resultado text not null,
	observacao text,
	evidencia_url text,
	tentativa_at timestamptz not null default now(),
	approved_status text not null default 'PENDING'
		check (approved_status in ('PENDING', 'APPROVED', 'REJECTED')),
	valor_protegido numeric(12,2) not null default 0,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists mercado_tentativas_os_idx on mercado_tentativas (lote_os_id, tentativa_at desc);

create table if not exists mercado_agendamentos (
	id uuid primary key default gen_random_uuid(),
	lote_os_id uuid not null references mercado_lote_os(id) on delete cascade,
	agendado_para timestamptz not null,
	origem text,
	confirmado boolean not null default false,
	evidencia_url text,
	desconto_aplicado boolean not null default false,
	valor_desconto numeric(12,2) not null default 0,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists mercado_agendamentos_os_idx on mercado_agendamentos (lote_os_id, agendado_para);

create table if not exists mercado_evidencias (
	id uuid primary key default gen_random_uuid(),
	lote_os_id uuid not null references mercado_lote_os(id) on delete cascade,
	tipo text not null,
	url text,
	descricao text,
	payload jsonb not null default '{}'::jsonb,
	approved_status text not null default 'PENDING'
		check (approved_status in ('PENDING', 'APPROVED', 'REJECTED')),
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists mercado_evidencias_os_idx on mercado_evidencias (lote_os_id, created_at desc);

create table if not exists mercado_suspensoes (
	id uuid primary key default gen_random_uuid(),
	empresa_id text not null,
	empresa_nome text,
	status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED', 'CANCELED')),
	motivo text not null,
	origem_lote_id uuid references mercado_lotes(id) on delete set null,
	start_at timestamptz not null default now(),
	end_at timestamptz,
	reincidencia integer not null default 1,
	review_payload jsonb not null default '{}'::jsonb,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists mercado_suspensoes_empresa_idx on mercado_suspensoes (empresa_id, status, end_at);

create table if not exists mercado_aprovacoes (
	id uuid primary key default gen_random_uuid(),
	lote_id uuid references mercado_lotes(id) on delete cascade,
	lote_os_id uuid references mercado_lote_os(id) on delete cascade,
	status text not null check (status in ('APPROVED', 'REJECTED', 'CORRECTION_REQUESTED', 'EXCEPTION_CLOSED')),
	justificativa text,
	payload jsonb not null default '{}'::jsonb,
	created_by_uid text,
	created_by_name text,
	created_at timestamptz not null default now()
);

create index if not exists mercado_aprovacoes_lote_idx on mercado_aprovacoes (lote_id, created_at desc);

create table if not exists mercado_financeiro_apuracoes (
	id uuid primary key default gen_random_uuid(),
	competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
	empresa_id text not null,
	empresa_nome text,
	status text not null default 'DRAFT'
		check (status in ('DRAFT', 'READY', 'APPROVED', 'PAID', 'CANCELED')),
	total_contratado numeric(12,2) not null default 0,
	total_aprovado numeric(12,2) not null default 0,
	total_liberado numeric(12,2) not null default 0,
	total_pago numeric(12,2) not null default 0,
	summary jsonb not null default '{}'::jsonb,
	created_by_uid text,
	created_by_name text,
	paid_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique(competencia, empresa_id)
);

create table if not exists mercado_financeiro_lancamentos (
	id uuid primary key default gen_random_uuid(),
	apuracao_id uuid references mercado_financeiro_apuracoes(id) on delete cascade,
	lote_id uuid references mercado_lotes(id) on delete set null,
	lote_os_id uuid references mercado_lote_os(id) on delete set null,
	tipo text not null check (tipo in ('RETIRADA', 'TENTATIVA', 'DESCONTO_AGENDAMENTO', 'PENALIZACAO', 'AJUSTE')),
	descricao text not null,
	valor numeric(12,2) not null,
	payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists mercado_financeiro_lancamentos_apuracao_idx
	on mercado_financeiro_lancamentos (apuracao_id);

drop trigger if exists mercado_empresa_habilitacoes_touch_updated_at on mercado_empresa_habilitacoes;
create trigger mercado_empresa_habilitacoes_touch_updated_at
before update on mercado_empresa_habilitacoes
for each row execute function touch_updated_at();

drop trigger if exists mercado_lotes_touch_updated_at on mercado_lotes;
create trigger mercado_lotes_touch_updated_at
before update on mercado_lotes
for each row execute function touch_updated_at();

drop trigger if exists mercado_lote_os_touch_updated_at on mercado_lote_os;
create trigger mercado_lote_os_touch_updated_at
before update on mercado_lote_os
for each row execute function touch_updated_at();

with permissions(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('mercado.dashboard.view', 'mercado', 'Mercado', 'dashboard', 'Dashboard', 'view', 1300, 'Visualizar dashboard executivo do Mercado.'),
		('mercado.lotes.view', 'mercado', 'Mercado', 'lotes', 'Lotes', 'view', 1310, 'Visualizar lotes do Mercado.'),
		('mercado.lotes.manage', 'mercado', 'Mercado', 'lotes', 'Lotes', 'manage', 1311, 'Criar, publicar, cancelar e administrar lotes.'),
		('mercado.lotes.accept', 'mercado', 'Mercado', 'lotes', 'Lotes', 'manage', 1312, 'Aceitar lotes disponiveis para empresa vinculada.'),
		('mercado.lotes.withdraw', 'mercado', 'Mercado', 'lotes', 'Lotes', 'manage', 1313, 'Desistir de lote dentro das regras.'),
		('mercado.execucao.view', 'mercado', 'Mercado', 'execucao', 'Execução', 'view', 1320, 'Visualizar execução de OS do Mercado.'),
		('mercado.execucao.manage', 'mercado', 'Mercado', 'execucao', 'Execução', 'manage', 1321, 'Registrar desfechos, tentativas, agendamentos e evidencias.'),
		('mercado.execucao.evidencias', 'mercado', 'Mercado', 'execucao', 'Execução', 'manage', 1322, 'Enviar e manter evidencias de execução.'),
		('mercado.backoffice.view', 'mercado', 'Mercado', 'backoffice', 'BackOffice', 'view', 1330, 'Visualizar fila de conferência do Mercado.'),
		('mercado.backoffice.manage', 'mercado', 'Mercado', 'backoffice', 'BackOffice', 'manage', 1331, 'Solicitar correcoes e administrar analises.'),
		('mercado.backoffice.approve', 'mercado', 'Mercado', 'backoffice', 'BackOffice', 'manage', 1332, 'Aprovar, rejeitar e encerrar excecoes.'),
		('mercado.financeiro.view', 'mercado', 'Mercado', 'financeiro', 'Financeiro', 'view', 1340, 'Visualizar apuracoes financeiras.'),
		('mercado.financeiro.manage', 'mercado', 'Mercado', 'financeiro', 'Financeiro', 'manage', 1341, 'Gerar, aprovar e registrar pagamentos.'),
		('mercado.financeiro.export', 'mercado', 'Mercado', 'financeiro', 'Financeiro', 'manage', 1342, 'Exportar apuracoes financeiras.'),
		('mercado.auditoria.view', 'mercado', 'Mercado', 'auditoria', 'Auditoria', 'view', 1350, 'Visualizar auditoria e timeline.'),
		('mercado.config.view', 'mercado', 'Mercado', 'config', 'Configurações', 'view', 1360, 'Visualizar configuracoes do Mercado nas Configuracoes do Retiradas.'),
		('mercado.config.manage', 'mercado', 'Mercado', 'config', 'Configurações', 'manage', 1361, 'Gerenciar configuracoes versionadas do Mercado.')
)
insert into app_permissions (
	id, section_id, section_label, feature_id, feature_label, action, sort_order,
	legacy_permission, description, active, deprecated
)
select id, section_id, section_label, feature_id, feature_label, action, sort_order,
	null, description, true, false
from permissions
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true,
	deprecated = false;

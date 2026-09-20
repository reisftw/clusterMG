-- Fase C do dominio Seguranca do Trabalho: fundacao dos protocolos.
-- Referencia entidades ja existentes (rot_users, regionais,
-- regional_cidades = bases, operacao_empresas, rot_assets, rot_aprs)
-- em vez de duplicar cadastro de colaborador/empresa/regional/base/ativo.

-- Numeracao sequencial do protocolo (SST-AAAA-NNNNNN), reiniciando por
-- ano. Mesmo espirito de lock+incremento do rot_asset_code_patterns,
-- mas tabela propria: o gerador de ativo carrega semantica de
-- categoria/tipo/empresa que nao faz sentido pra protocolo SST.
create table if not exists sst_protocol_sequences (
	year integer primary key,
	next_number bigint not null default 1
);

create table if not exists sst_protocols (
	id text primary key,
	protocol_number text not null unique,

	type text not null check (type in (
		'quase_acidente','acidente','incidente','desvio','inspecao_nao_conforme',
		'solicitacao','risco_identificado','atividade_interrompida','epi_epc','outro'
	)),
	subject text not null,
	description text,

	status text not null default 'ABERTO' check (status in (
		'ABERTO','EM_TRIAGEM','EM_ANALISE','EM_TRATATIVA','AGUARDANDO_INFORMACAO',
		'AGUARDANDO_VALIDACAO','CONCLUIDO','CANCELADO','DUPLICADO'
	)),
	priority text not null default 'media' check (priority in ('baixa','media','alta','critica')),

	operation_scope text check (operation_scope in ('ROT','FIELD','DELIVERY')),
	regional_id text references regionais(id) on delete set null,
	base_id uuid references regional_cidades(id) on delete set null,
	company_id uuid references operacao_empresas(id) on delete set null,

	employee_id text references rot_users(id) on delete set null,
	requested_by text references rot_users(id) on delete set null,
	assigned_to text references rot_users(id) on delete set null,

	asset_id text references rot_assets(id) on delete set null,
	apr_id text references rot_aprs(id) on delete set null,
	related_protocol_id text references sst_protocols(id) on delete set null,

	location text,
	risk_present boolean,

	closed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_sst_protocols_status on sst_protocols(status);
create index if not exists idx_sst_protocols_priority on sst_protocols(priority);
create index if not exists idx_sst_protocols_assigned_to on sst_protocols(assigned_to);
create index if not exists idx_sst_protocols_regional on sst_protocols(regional_id);
create index if not exists idx_sst_protocols_employee on sst_protocols(employee_id);
create index if not exists idx_sst_protocols_created_at on sst_protocols(created_at desc);

drop trigger if exists sst_protocols_touch_updated_at on sst_protocols;
create trigger sst_protocols_touch_updated_at
before update on sst_protocols
for each row execute function touch_updated_at();

-- Timeline do protocolo — mesmo padrao do rot_asset_timeline, so trocando
-- asset_id por protocol_id. Gerada automaticamente pelas acoes do
-- sistema (criado, atribuido, status alterado, etc.), nunca editavel.
create table if not exists sst_protocol_timeline (
	id bigserial primary key,
	protocol_id text not null references sst_protocols(id) on delete cascade,
	event_type text not null,
	title text not null,
	description text,
	before_data jsonb,
	after_data jsonb,
	created_by text references rot_users(id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists idx_sst_protocol_timeline_protocol on sst_protocol_timeline(protocol_id, created_at);

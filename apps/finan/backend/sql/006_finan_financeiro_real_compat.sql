create or replace function touch_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

create table if not exists finan_config (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists finan_reports (
	id text primary key,
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create table if not exists finan_serasa_movimentacoes (
	id text primary key,
	data date,
	ano integer,
	mes integer,
	tipo text,
	operacao text,
	descricao text,
	valor numeric(14, 2) not null default 0,
	direction text,
	is_net_revenue boolean not null default false,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_serasa_clientes_base (
	ano integer not null,
	mes integer not null,
	clientes integer not null default 0,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb,
	primary key (ano, mes)
);

create table if not exists finan_tarifas_faturas (
	id text primary key,
	ano integer not null,
	mes integer not null,
	metric text not null,
	quantidade numeric(14, 2) not null default 0,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_tarifas_formas_pagamento (
	id text primary key,
	ano integer not null,
	mes integer not null,
	forma text not null,
	quantidade numeric(14, 2) not null default 0,
	valor numeric(14, 2) not null default 0,
	percent numeric(10, 4) not null default 0,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_tarifas_receita_cliente (
	id text primary key,
	ano integer not null,
	mes integer not null,
	cliente_codigo text,
	cliente_nome text,
	forma_cobranca text,
	valor numeric(14, 2) not null default 0,
	quantidade numeric(14, 2) not null default 0,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_tarifas_mensais (
	id text primary key,
	ano integer not null,
	mes integer not null,
	banco text,
	valor numeric(14, 2) not null default 0,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_tarifas_cobranca_clientes (
	id text primary key,
	ano integer not null,
	mes integer not null,
	forma_cobranca text,
	clientes numeric(14, 2) not null default 0,
	valor_aproximado numeric(14, 2) not null default 0,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_tarifas_boletos (
	id text primary key,
	tarifa text not null,
	valor numeric(14, 4) not null default 0,
	formas_pagamento text,
	source_hash text not null unique,
	legacy_path text,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_import_logs (
	id text primary key,
	source_id text,
	label text,
	status text,
	message text,
	imported_rows integer,
	payload jsonb,
	legacy_path text unique,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create table if not exists finan_reports_meta (
	report_id text primary key,
	import_info jsonb not null default '{}'::jsonb,
	summary jsonb not null default '{}'::jsonb,
	blocos_detectados jsonb not null default '[]'::jsonb,
	blocos_nao_mapeados jsonb not null default '[]'::jsonb,
	legacy_path text unique,
	legacy_document_id text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	source_payload jsonb
);

create index if not exists idx_finan_serasa_mov_periodo on finan_serasa_movimentacoes (ano, mes, data);
create index if not exists idx_finan_serasa_mov_direction on finan_serasa_movimentacoes (direction);
create index if not exists idx_finan_tarifas_faturas_periodo on finan_tarifas_faturas (ano, mes, metric);
create index if not exists idx_finan_tarifas_pag_periodo on finan_tarifas_formas_pagamento (ano, mes, forma);
create index if not exists idx_finan_tarifas_receita_periodo on finan_tarifas_receita_cliente (ano, mes, cliente_nome);
create index if not exists idx_finan_tarifas_mensais_periodo on finan_tarifas_mensais (ano, mes, banco);
create index if not exists idx_finan_tarifas_cobranca_periodo on finan_tarifas_cobranca_clientes (ano, mes, forma_cobranca);
create index if not exists idx_finan_import_logs_created on finan_import_logs (created_at desc);

drop trigger if exists finan_serasa_movimentacoes_touch_updated_at on finan_serasa_movimentacoes;
create trigger finan_serasa_movimentacoes_touch_updated_at
before update on finan_serasa_movimentacoes
for each row execute function touch_updated_at();

drop trigger if exists finan_serasa_clientes_base_touch_updated_at on finan_serasa_clientes_base;
create trigger finan_serasa_clientes_base_touch_updated_at
before update on finan_serasa_clientes_base
for each row execute function touch_updated_at();

drop trigger if exists finan_tarifas_faturas_touch_updated_at on finan_tarifas_faturas;
create trigger finan_tarifas_faturas_touch_updated_at
before update on finan_tarifas_faturas
for each row execute function touch_updated_at();

drop trigger if exists finan_tarifas_formas_pagamento_touch_updated_at on finan_tarifas_formas_pagamento;
create trigger finan_tarifas_formas_pagamento_touch_updated_at
before update on finan_tarifas_formas_pagamento
for each row execute function touch_updated_at();

drop trigger if exists finan_tarifas_receita_cliente_touch_updated_at on finan_tarifas_receita_cliente;
create trigger finan_tarifas_receita_cliente_touch_updated_at
before update on finan_tarifas_receita_cliente
for each row execute function touch_updated_at();

drop trigger if exists finan_tarifas_mensais_touch_updated_at on finan_tarifas_mensais;
create trigger finan_tarifas_mensais_touch_updated_at
before update on finan_tarifas_mensais
for each row execute function touch_updated_at();

drop trigger if exists finan_tarifas_cobranca_clientes_touch_updated_at on finan_tarifas_cobranca_clientes;
create trigger finan_tarifas_cobranca_clientes_touch_updated_at
before update on finan_tarifas_cobranca_clientes
for each row execute function touch_updated_at();

drop trigger if exists finan_tarifas_boletos_touch_updated_at on finan_tarifas_boletos;
create trigger finan_tarifas_boletos_touch_updated_at
before update on finan_tarifas_boletos
for each row execute function touch_updated_at();

drop trigger if exists finan_import_logs_touch_updated_at on finan_import_logs;
create trigger finan_import_logs_touch_updated_at
before update on finan_import_logs
for each row execute function touch_updated_at();

drop trigger if exists finan_reports_meta_touch_updated_at on finan_reports_meta;
create trigger finan_reports_meta_touch_updated_at
before update on finan_reports_meta
for each row execute function touch_updated_at();


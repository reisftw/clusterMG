-- Saúde Pós-Ativação: classificação auditável e eventos futuros de suporte.
-- Continua read-only em relação ao HubSoft; as tabelas abaixo armazenam apenas
-- evidências observadas pelo sistema Operação.

create table if not exists hubsoft_activation_support_events (
	id uuid primary key default gen_random_uuid(),
	sync_run_id uuid references hubsoft_activation_sync_runs(id) on delete set null,
	hubsoft_attendance_id bigint,
	hubsoft_cliente_servico_id bigint not null,
	hubsoft_order_id bigint,
	opened_at timestamptz,
	closed_at timestamptz,
	attendance_type text,
	attendance_category text not null default 'UNKNOWN',
	affects_activation_quality boolean not null default false,
	raw_summary text,
	source_hash text not null,
	raw_payload_sanitized jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists idx_hubsoft_activation_support_events_unique_attendance
	on hubsoft_activation_support_events(hubsoft_attendance_id)
	where hubsoft_attendance_id is not null;

create index if not exists idx_hubsoft_activation_support_events_cliente
	on hubsoft_activation_support_events(hubsoft_cliente_servico_id, opened_at desc);

create index if not exists idx_hubsoft_activation_support_events_quality
	on hubsoft_activation_support_events(affects_activation_quality, opened_at desc);

drop trigger if exists hubsoft_activation_support_events_touch_updated_at on hubsoft_activation_support_events;
create trigger hubsoft_activation_support_events_touch_updated_at
before update on hubsoft_activation_support_events
for each row execute function touch_updated_at();

create table if not exists hubsoft_activation_health_snapshots (
	id uuid primary key default gen_random_uuid(),
	activation_snapshot_id uuid not null references hubsoft_activation_os_snapshots(id) on delete cascade,
	hubsoft_order_id bigint not null,
	hubsoft_cliente_servico_id bigint,
	health_status text not null,
	days_since_activation integer,
	health_window text,
	reasons jsonb not null default '[]'::jsonb,
	evidence jsonb not null default '{}'::jsonb,
	source_hash text not null,
	evaluated_at timestamptz not null default now(),
	is_current boolean not null default true,
	created_at timestamptz not null default now(),
	constraint hubsoft_activation_health_status_chk
		check (health_status in ('SAUDAVEL', 'ATENCAO', 'CRITICO', 'SEM_DADOS')),
	constraint hubsoft_activation_health_window_chk
		check (health_window in ('D+1', 'D+7', 'D+15', 'D+30', 'FORA_DA_JANELA', 'SEM_DATA'))
);

create unique index if not exists idx_hubsoft_activation_health_current_unique
	on hubsoft_activation_health_snapshots(activation_snapshot_id)
	where is_current = true;

create index if not exists idx_hubsoft_activation_health_status
	on hubsoft_activation_health_snapshots(health_status, evaluated_at desc)
	where is_current = true;

create index if not exists idx_hubsoft_activation_health_order_history
	on hubsoft_activation_health_snapshots(hubsoft_order_id, evaluated_at desc);

with catalog(id, section_id, section_label, feature_id, feature_label, action, sort_order, description) as (
	values
		('ativacoes.saude.visualizar', 'ativacoes', 'Ativações', 'ativacoes_saude', 'Saúde Pós-Ativação', 'view', 704, 'Visualizar fila de saúde pós-ativação.'),
		('ativacoes.saude.exportar', 'ativacoes', 'Ativações', 'ativacoes_saude', 'Saúde Pós-Ativação', 'export', 705, 'Exportar dados de saúde pós-ativação.')
)
insert into rot_permissions (
	id, section_id, section_label, feature_id, feature_label, action, sort_order, description
)
select id, section_id, section_label, feature_id, feature_label, action, sort_order, description
from catalog
on conflict (id) do update set
	section_id = excluded.section_id,
	section_label = excluded.section_label,
	feature_id = excluded.feature_id,
	feature_label = excluded.feature_label,
	action = excluded.action,
	sort_order = excluded.sort_order,
	description = excluded.description,
	active = true,
	updated_at = now();

insert into rot_role_permissions (role_id, permission_id)
select r.id, p.id
from rot_roles r
cross join rot_permissions p
where p.id in ('ativacoes.saude.visualizar', 'ativacoes.saude.exportar')
  and (
  	r.permissions ? '*'
  	or exists (
  		select 1 from rot_role_permissions rp
  		where rp.role_id = r.id and rp.permission_id = '*'
  	)
  )
on conflict do nothing;

-- Registro de alertas ja enviados do Calendario Financeiro, pra evitar
-- reenviar o mesmo alerta (mesmo evento/ocorrencia + mesmo usuario +
-- mesma antecedencia) toda vez que o job diario rodar. event_key e o
-- id do evento avulso OU o id sintetico da ocorrencia de regra
-- (ex.: "rule_<id>_2026-09-08"), igual ao que ja aparece no calendario.
create table if not exists finan_calendar_event_notifications (
	id text primary key,
	event_key text not null,
	user_id text not null references finan_users(id) on delete cascade,
	lead_time_days integer not null,
	sent_at timestamptz not null default now()
);

create unique index if not exists finan_calendar_event_notifications_unique_idx
	on finan_calendar_event_notifications (event_key, user_id, lead_time_days);

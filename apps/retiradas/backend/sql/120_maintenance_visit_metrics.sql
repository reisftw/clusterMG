-- Visitas agregadas por dia e dispositivo para preservar o historico sem
-- manter cada heartbeat indefinidamente.
-- Rollback: drop trigger maintenance_sw_visit_metrics_trigger on
-- maintenance_service_worker_events; drop function aggregate_maintenance_visit();
-- drop table maintenance_visit_metrics_daily;

create table if not exists maintenance_visit_metrics_daily (
  visit_day date not null,
  client_id text not null,
  visits bigint not null default 0 check (visits >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (visit_day, client_id)
);

create index if not exists maintenance_visit_metrics_daily_day_idx
  on maintenance_visit_metrics_daily (visit_day desc);

create or replace function aggregate_maintenance_visit()
returns trigger
language plpgsql
as $$
begin
  if new.event_type = 'HEARTBEAT' then
    insert into maintenance_visit_metrics_daily (
      visit_day, client_id, visits, first_seen_at, last_seen_at
    ) values (
      (new.occurred_at at time zone 'America/Sao_Paulo')::date,
      coalesce(nullif(new.client_id, ''), 'anonymous'),
      1,
      new.occurred_at,
      new.occurred_at
    )
    on conflict (visit_day, client_id) do update set
      visits = maintenance_visit_metrics_daily.visits + 1,
      first_seen_at = least(maintenance_visit_metrics_daily.first_seen_at, excluded.first_seen_at),
      last_seen_at = greatest(maintenance_visit_metrics_daily.last_seen_at, excluded.last_seen_at);
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_sw_visit_metrics_trigger
  on maintenance_service_worker_events;
create trigger maintenance_sw_visit_metrics_trigger
after insert on maintenance_service_worker_events
for each row execute function aggregate_maintenance_visit();

insert into maintenance_visit_metrics_daily (
  visit_day, client_id, visits, first_seen_at, last_seen_at
)
select
  (occurred_at at time zone 'America/Sao_Paulo')::date,
  coalesce(nullif(client_id, ''), 'anonymous'),
  count(*)::bigint,
  min(occurred_at),
  max(occurred_at)
from maintenance_service_worker_events
where event_type = 'HEARTBEAT'
group by 1, 2
on conflict (visit_day, client_id) do update set
  visits = greatest(maintenance_visit_metrics_daily.visits, excluded.visits),
  first_seen_at = least(maintenance_visit_metrics_daily.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(maintenance_visit_metrics_daily.last_seen_at, excluded.last_seen_at);

comment on table maintenance_visit_metrics_daily is
  'Contagem diaria agregada de visitas por dispositivo; nao armazena cada acesso individual.';

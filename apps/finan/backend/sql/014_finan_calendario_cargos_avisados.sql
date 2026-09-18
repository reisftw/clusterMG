-- Calendario Financeiro: quais cargos devem ser avisados/ver um evento no
-- Resumo Matinal. Array vazio = visivel pra todo mundo (comportamento
-- atual, sem quebrar eventos ja cadastrados).
alter table finan_financial_events
	add column if not exists notify_role_ids text[] not null default '{}';

alter table finan_calendar_event_rules
	add column if not exists notify_role_ids text[] not null default '{}';

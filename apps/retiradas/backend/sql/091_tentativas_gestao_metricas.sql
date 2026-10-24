-- Normaliza contatos históricos da Central de Tentativas e adiciona índices
-- para as agregações gerenciais. Migração aditiva e idempotente.

update tentativas_contacts
set effective_contact = true,
    contact_state = case when contact_state = 'STARTED' then 'RESPONSE_CONFIRMED' else contact_state end,
    response_at = coalesce(response_at, confirmed_at, updated_at, created_at),
    updated_at = now()
where sent_confirmed = true
  and effective_contact = false
  and upper(coalesce(result, '')) in (
    'RESPONDED_SCHEDULE',
    'STORE_DELIVERY',
    'CALLBACK_REQUESTED',
    'RESPONDED_CALLBACK',
    'REFUSED',
    'ALREADY_RETURNED',
    'SCHEDULED',
    'RESPONDED'
  );

create index if not exists tentativas_contacts_created_opportunity_idx
  on tentativas_contacts (created_at, opportunity_id)
  where sent_confirmed = true;

create index if not exists tentativas_contacts_effective_created_idx
  on tentativas_contacts (created_at, opportunity_id)
  where sent_confirmed = true and effective_contact = true;

create index if not exists tentativas_opportunities_completed_idx
  on tentativas_opportunities (completed_at, id)
  where completed_at is not null;

create index if not exists tentativas_recovery_equipments_validated_idx
  on tentativas_recovery_equipments (validated_at, recovery_id)
  where status = 'CONFIRMED';

-- Garante que somente tecnicos sejam proprietarios de carteiras de Tentativas.
-- Registros e atribuicoes sao encerrados de forma historica; nenhum dado e apagado.

with invalid_owners as (
  select c.id
    from tentativas_technician_cities c
    left join app_users u
      on u.uid = c.user_id
      or lower(u.email) = lower(coalesce(c.user_email, ''))
   where c.active = true
     and u.uid is not null
     and lower(coalesce(u.role, '')) <> 'tecnico'
)
update tentativas_technician_cities c
   set active = false,
       updated_at = now()
 where c.id in (select id from invalid_owners);

update tentativas_assignments a
   set released_at = now(),
       release_reason = 'PROPRIETARIO_NAO_TECNICO',
       updated_at = now()
 where a.released_at is null
   and exists (
     select 1
       from app_users u
      where (u.uid = a.technician_user_id or lower(u.email) = lower(coalesce(a.technician_email, '')))
        and lower(coalesce(u.role, '')) <> 'tecnico'
   );

create index if not exists tentativas_assignments_city_active_owner_idx
  on tentativas_assignments (lower(coalesce(cidade, '')), technician_user_id)
  where released_at is null;

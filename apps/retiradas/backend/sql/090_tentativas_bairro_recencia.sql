update tentativas_opportunities opportunity
   set bairro = coalesce(source.bairro, opportunity.bairro),
       latitude = coalesce(opportunity.latitude, source.latitude),
       longitude = coalesce(opportunity.longitude, source.longitude),
       updated_at = now()
  from (
    select distinct on (num_os)
           num_os,
           coalesce(
             nullif(trim(bairro), ''),
             nullif(trim(source_payload->>'bairro'), ''),
             nullif(trim(source_payload#>>'{endereco,bairro}'), '')
           ) as bairro,
           latitude,
           longitude
      from ordens_servico
     where source_collection = 'match_os_abertas'
       and nullif(trim(num_os), '') is not null
     order by num_os, updated_at desc nulls last
  ) source
 where opportunity.os = source.num_os
   and (
     (source.bairro is not null and opportunity.bairro is distinct from source.bairro)
     or (opportunity.latitude is null and source.latitude is not null)
     or (opportunity.longitude is null and source.longitude is not null)
   );

update tentativas_opportunities
   set priority = case
     when coalesce(last_result, '') in ('RESPONDED', 'CALLBACK_REQUESTED') then 'ALTA'
     when coalesce(attempt_count, 0) = 0 and coalesce(os_age_days, 0) <= 7 then 'ALTA'
     when coalesce(attempt_count, 0) = 0 and coalesce(os_age_days, 0) <= 30 then 'MEDIA'
     else 'BAIXA'
   end,
   updated_at = now()
 where active = true;

create index if not exists tentativas_opportunities_recent_idx
  on tentativas_opportunities (active, os_opened_at desc, priority_score desc);

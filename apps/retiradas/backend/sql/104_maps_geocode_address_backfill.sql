-- Reprocessa o backlog do Maps com variacoes progressivas do endereco.
-- A migration e aditiva e preserva todas as coordenadas ja resolvidas.

alter table if exists maps_geocode_cache
  add column if not exists search_variants jsonb not null default '[]'::jsonb,
  add column if not exists variant_index integer not null default 0;

update maps_geocode_jobs job
   set status = 'REFRESH',
       updated_at = now()
 where not exists (
   select 1
     from maps_order_locations location
    where location.order_id = job.order_id
      and location.latitude between -34 and 6
      and location.longitude between -74 and -33
 );

update maps_geocode_cache cache
   set status = 'PENDING',
       variant_index = 0,
       next_attempt_at = null,
       last_error = null,
       resolved_at = null,
       updated_at = now()
 where cache.status <> 'RESOLVED'
   and exists (
     select 1
       from maps_geocode_jobs job
      where job.address_hash = cache.address_hash
        and job.status = 'REFRESH'
   );

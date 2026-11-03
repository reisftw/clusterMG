-- migration:no-transaction
create index concurrently if not exists maps_geocode_cache_ready_idx
  on maps_geocode_cache (created_at)
  where status in ('PENDING', 'RETRY');

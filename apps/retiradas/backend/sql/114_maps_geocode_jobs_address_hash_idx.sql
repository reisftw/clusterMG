-- migration:no-transaction
create index concurrently if not exists maps_geocode_jobs_address_hash_idx
  on maps_geocode_jobs (address_hash);

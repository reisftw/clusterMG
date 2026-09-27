alter table map_sync_updates add column if not exists profile text not null default 'MAPA';
create index if not exists map_sync_updates_profile_detected_idx on map_sync_updates(profile, detected_at desc);

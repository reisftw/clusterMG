create index if not exists hubsoft_sync_records_ranking_period_idx
	on hubsoft_sync_records (profile, active, source_date, production_channel);

create index if not exists hubsoft_sync_records_ranking_owner_idx
	on hubsoft_sync_records (
		profile,
		active,
		production_channel,
		production_owner_id,
		source_date
	);

create index if not exists hubsoft_sync_records_ranking_city_idx
	on hubsoft_sync_records (profile, active, source_city, source_date);

create index if not exists hubsoft_sync_records_ranking_raw_excerpt_gin_idx
	on hubsoft_sync_records using gin (raw_excerpt);

create index if not exists hubsoft_sync_records_ranking_technician_id_idx
	on hubsoft_sync_records ((raw_excerpt #>> '{tecnicos,0,id}'))
	where active = true;

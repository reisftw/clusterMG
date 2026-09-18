create table rot_aprs (
 id text primary key,
 author_id text not null references rot_users(id),
 author_name text not null,
 regional_id text not null references rot_regionals(id),
 regional_name text not null,
 manager_ids text[] not null default '{}',
 manager_names text[] not null default '{}',
 participants text not null,
 activity_date date not null,
 ticket text not null,
 answers jsonb not null,
 missing_ppe jsonb not null default '[]',
 observations text not null default '',
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 accuracy double precision not null check (accuracy >= 0),
 location_at timestamptz not null,
 risk_status text not null check (risk_status in ('interromper','verificar','sem_impedimento_informado')),
 checklist_version integer not null default 1,
 created_at timestamptz not null default now()
);
create index rot_aprs_regional_date_idx on rot_aprs(regional_id, created_at desc, id);
create index rot_aprs_author_date_idx on rot_aprs(author_id, created_at desc, id);
create table rot_apr_photos (
 id text primary key,
 apr_id text not null references rot_aprs(id) on delete cascade,
 mime text not null check (mime in ('image/jpeg','image/png')),
 data bytea not null check (octet_length(data) <= 4194304),
 created_at timestamptz not null default now()
);
create index rot_apr_photos_apr_idx on rot_apr_photos(apr_id);
create table rot_apr_alerts (
 apr_id text not null references rot_aprs(id) on delete cascade,
 user_id text not null references rot_users(id) on delete cascade,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 primary key (apr_id,user_id)
);
create index rot_apr_alerts_unread_idx on rot_apr_alerts(user_id,created_at desc) where read_at is null;

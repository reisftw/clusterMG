create extension if not exists pgcrypto;

alter table rot_audit_logs
	add column if not exists previous_hash text,
	add column if not exists event_hash text;

create or replace function rot_audit_logs_hash_before_insert()
returns trigger as $$
declare
	last_hash text;
	payload text;
begin
	select event_hash
	  into last_hash
	  from rot_audit_logs
	 where event_hash is not null
	 order by id desc
	 limit 1;

	new.previous_hash = last_hash;
	payload = coalesce(new.previous_hash, '') || '|' ||
		coalesce(new.user_id, '') || '|' ||
		coalesce(new.user_name, '') || '|' ||
		coalesce(new.action, '') || '|' ||
		coalesce(new.entity, '') || '|' ||
		coalesce(new.entity_id, '') || '|' ||
		coalesce(new.before_data::text, '') || '|' ||
		coalesce(new.after_data::text, '') || '|' ||
		coalesce(new.ip_address, '') || '|' ||
		coalesce(new.user_agent, '') || '|' ||
		coalesce(new.created_at::text, '');
	new.event_hash = encode(digest(payload, 'sha256'), 'hex');
	return new;
end;
$$ language plpgsql;

drop trigger if exists rot_audit_logs_hash_before_insert on rot_audit_logs;
create trigger rot_audit_logs_hash_before_insert
before insert on rot_audit_logs
for each row execute function rot_audit_logs_hash_before_insert();

create or replace function rot_audit_logs_prevent_mutation()
returns trigger as $$
begin
	if current_setting('rot.audit_maintenance', true) = 'on' then
		if tg_op = 'DELETE' then
			return old;
		end if;
		return new;
	end if;
	raise exception 'rot_audit_logs is append-only';
end;
$$ language plpgsql;

drop trigger if exists rot_audit_logs_prevent_update on rot_audit_logs;
create trigger rot_audit_logs_prevent_update
before update on rot_audit_logs
for each row execute function rot_audit_logs_prevent_mutation();

drop trigger if exists rot_audit_logs_prevent_delete on rot_audit_logs;
create trigger rot_audit_logs_prevent_delete
before delete on rot_audit_logs
for each row execute function rot_audit_logs_prevent_mutation();

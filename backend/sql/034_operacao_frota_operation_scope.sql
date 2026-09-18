alter table if exists rot_vehicles
	add column if not exists operation_scope text not null default 'ROT';

update rot_vehicles
   set operation_scope = 'ROT'
 where operation_scope is null
    or btrim(operation_scope) = '';

alter table if exists rot_vehicles
	drop constraint if exists rot_vehicles_operation_scope_check;

alter table if exists rot_vehicles
	add constraint rot_vehicles_operation_scope_check
	check (operation_scope in ('ROT', 'FIELD', 'DELIVERY'));

create index if not exists idx_rot_vehicles_operation_scope
	on rot_vehicles(operation_scope);

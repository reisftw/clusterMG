insert into app_role_permissions (role_id, permission)
select role_id, permission
from (
	values
		('backoffice', 'service_orders.requests.create'),
		('backoffice_retirada', 'service_orders.requests.create')
) as seed(role_id, permission)
where exists (select 1 from app_roles where app_roles.id = seed.role_id)
on conflict do nothing;

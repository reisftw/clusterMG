begin;

alter table if exists maps_assignment_requests
  alter column order_id drop not null;

alter table if exists maps_assignment_requests
  drop constraint if exists maps_assignment_requests_order_id_fkey;

alter table if exists maps_assignment_requests
  add constraint maps_assignment_requests_order_id_fkey
  foreign key (order_id) references ordens_servico(id)
  on update cascade on delete set null;

alter table if exists maps_route_items
  drop constraint if exists maps_route_items_order_id_fkey;

alter table if exists maps_route_items
  add constraint maps_route_items_order_id_fkey
  foreign key (order_id) references ordens_servico(id)
  on update cascade on delete cascade;

commit;

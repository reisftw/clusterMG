# Rollback - Entrega em Loja

O rollback deve ser executado somente após desativar as rotas e confirmar um backup verificável do banco. Ele remove todos os recebimentos registrados pelo módulo.

```sql
begin;

drop table if exists store_delivery_events;
drop table if exists store_delivery_items;
drop table if exists store_deliveries;
alter table app_users drop column if exists managed_store_location_ids;
alter table app_users drop column if exists store_location_id;
drop table if exists store_locations;
drop sequence if exists store_delivery_protocol_seq;
delete from app_role_permissions
where role_id in ('atendente_loja', 'supervisor_loja', 'coordenador_loja')
  and permission like 'loja.%';

commit;
```

Depois, publique a versão anterior da aplicação e valide `/api/health`, login e as rotas de Ordem de Serviço.

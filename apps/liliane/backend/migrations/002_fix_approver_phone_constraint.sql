begin;

alter table approvers drop constraint if exists approvers_phone_e164_check;
alter table approvers add constraint approvers_phone_e164_check
  check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

insert into schema_migrations(version) values ('002_fix_approver_phone_constraint') on conflict do nothing;
commit;

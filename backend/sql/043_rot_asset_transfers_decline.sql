-- Suporte a recusar uma transferencia pendente de aceite (ate agora só
-- existia "aceitar" — o recebedor nao tinha como recusar, nem como ver
-- a pendencia sem a permissao de gestao ativos.transferir).

alter table rot_asset_transfers add column if not exists declined_by text references rot_users(id) on delete set null;
alter table rot_asset_transfers add column if not exists declined_at timestamptz;

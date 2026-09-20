-- Motivo obrigatorio ao recusar/cancelar uma transferencia pendente —
-- guardado separado de `reason` (motivo da transferencia original, quem
-- pediu) pra nao sobrescrever esse historico.

alter table rot_asset_transfers add column if not exists decline_reason text;

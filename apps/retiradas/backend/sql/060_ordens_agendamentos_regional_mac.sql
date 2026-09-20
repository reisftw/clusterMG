-- Fase E da otimizacao tecnica (docs/TECHNICAL-AUDIT.md, achados #1 e #2;
-- plano completo em docs/DATABASE-CONSTRAINTS-PLAN.md).
--
-- Dados verificados em homologacao antes de escrever esta migration
-- (49464 ordens_servico, 207 agendamentos):
--   - regional "orfa" (sem match em regionais.nome): so 26 linhas com o
--     valor literal "Sem Regional" (placeholder legitimo de "sem
--     regional definida") em ordens_servico, e 2 linhas em agendamentos
--     ("Metropolitana SUB 1" e "ONNET" — provavel erro de digitacao/
--     import). Por isso regional_id fica NULLABLE (nunca NOT NULL) —
--     essas linhas simplesmente nao recebem regional_id, sem quebrar nada.
--   - agendamentos.status/turno: 0 valores fora do enum usado pelo
--     AgendamentoWriteDTO (Fase C). CHECK seguro.
--   - MAC (mac_addr/phy_addr) em ordens_servico: 0 colisoes de formato
--     apos normalizar (mesmo MAC gravado em dois formatos diferentes em
--     linhas diferentes). Backfill de normalizacao protegido por preflight
--     pareado (sql-tools/preflight_060_ordens_agendamentos_regional_mac.sql)
--     porque producao nao foi verificada diretamente (só homologação).
--
-- Aditiva: coluna nova nullable, indices novos, CHECK so em cima de enum
-- ja validado. Nao remove/renomeia nada existente. `regional` (texto)
-- continua existindo — regional_id e um complemento, nao substituicao
-- (padrao de migracao evolutiva: coluna nova -> suporta as duas -> so
-- depois considerar remover a antiga, numa release futura).

alter table ordens_servico
	add column if not exists regional_id text references regionais(id) on delete set null;

alter table agendamentos
	add column if not exists regional_id text references regionais(id) on delete set null;

update ordens_servico os
set regional_id = r.id
from regionais r
where os.regional_id is null
	and os.regional is not null and os.regional <> ''
	and lower(r.nome) = lower(os.regional);

update agendamentos a
set regional_id = r.id
from regionais r
where a.regional_id is null
	and a.regional is not null and a.regional <> ''
	and lower(r.nome) = lower(a.regional);

create index if not exists ordens_servico_regional_id_idx on ordens_servico(regional_id);
create index if not exists agendamentos_regional_id_idx on agendamentos(regional_id);

-- Enum ja validado pelo AgendamentoWriteDTO (Fase C) e confirmado limpo
-- (0 violacao) nos dados reais de homologacao.
alter table agendamentos
	add constraint agendamentos_status_check
	check (status is null or status in (
		'Aguardando dia','Enviado ao tecnico','Entregue','Concluido','Nao recolhido','Cancelado'
	));

alter table agendamentos
	add constraint agendamentos_turno_check
	check (turno is null or turno in ('Manha','Tarde','Noite','Integral'));

-- Normalizacao canonica de MAC (vps/api/src/macUtils.js: uppercase, sem
-- separador) nos dados JA EXISTENTES — a escrita nova ja normaliza sozinha
-- desde a mudanca em ordensRepository.js. So atualiza quando o valor
-- normalizado for diferente do atual, pra nao gerar churn de updated_at
-- desnecessario em linha nenhuma.
update ordens_servico
set mac_addr = upper(regexp_replace(mac_addr, '[^0-9A-Fa-f]', '', 'g'))
where mac_addr is not null
	and mac_addr <> upper(regexp_replace(mac_addr, '[^0-9A-Fa-f]', '', 'g'));

update ordens_servico
set phy_addr = upper(regexp_replace(phy_addr, '[^0-9A-Fa-f]', '', 'g'))
where phy_addr is not null
	and phy_addr <> upper(regexp_replace(phy_addr, '[^0-9A-Fa-f]', '', 'g'));

-- UNIQUE de MAC NAO adicionado nesta migration — ver
-- docs/DATABASE-CONSTRAINTS-PLAN.md secao 1: mesmo com 0 colisoes
-- encontradas em homologacao, producao nao foi verificada diretamente
-- (sem acesso liberado no momento desta migration). Fica pro backlog,
-- depois de confirmar o mesmo relatorio de colisao contra producao.

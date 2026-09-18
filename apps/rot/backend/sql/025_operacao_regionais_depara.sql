-- Consolida regionais importadas do sistema antigo no cadastro canonico.
-- O sync legado criava nomes como "Regional | Central Mineira"; daqui em
-- diante essas referencias ficam apontadas para a regional canonica.

begin;

create temp table _operacao_regionais_depara on commit drop as
select src.id as source_id, tgt.id as target_id
from (
	values
		('Regional | Central Mineira', 'CENTRAL MINEIRA'),
		('Regional | Centro Oeste', 'CENTRO OESTE'),
		('Regional | Metropolitana Sub-1', 'METROPOLITANA SUB1'),
		('Regional | Metropolitana Sub-2', 'METROPOLITANA SUB2'),
		('Regional | Metropolitana Sub-3', 'METROPOLITANA SUB3'),
		('Regional | Oeste de Minas', 'OESTE DE MINAS'),
		('Regional | Sul de Minas', 'SUL DE MINAS')
) as m(source_name, target_name)
join regionais src on lower(src.nome) = lower(m.source_name)
join regionais tgt on lower(tgt.nome) = lower(m.target_name)
where src.id <> tgt.id;

insert into regional_cidades (regional_id, nome, tipo, legacy_path, legacy_document_id, source_payload, created_at, updated_at)
select d.target_id, c.nome, c.tipo, c.legacy_path, c.legacy_document_id, c.source_payload, c.created_at, now()
from regional_cidades c
join _operacao_regionais_depara d on d.source_id = c.regional_id
on conflict (regional_id, lower(nome)) do update set
	tipo = coalesce(excluded.tipo, regional_cidades.tipo),
	legacy_path = coalesce(excluded.legacy_path, regional_cidades.legacy_path),
	legacy_document_id = coalesce(excluded.legacy_document_id, regional_cidades.legacy_document_id),
	source_payload = coalesce(excluded.source_payload, regional_cidades.source_payload),
	updated_at = now();

create temp table _operacao_cidades_depara on commit drop as
select src.id as source_id, tgt.id as target_id
from regional_cidades src
join _operacao_regionais_depara d on d.source_id = src.regional_id
join regional_cidades tgt on tgt.regional_id = d.target_id and lower(tgt.nome) = lower(src.nome)
where src.id <> tgt.id;

update rot_users u
set city_id = d.target_id::text
from _operacao_cidades_depara d
where u.city_id = d.source_id::text;

update operacao_tecnicos t
set cidade_id = d.target_id
from _operacao_cidades_depara d
where t.cidade_id = d.source_id;

update operacao_agentes a
set cidade_id = d.target_id
from _operacao_cidades_depara d
where a.cidade_id = d.source_id;

insert into operacao_empresa_regionais (empresa_id, regional_id, created_by, created_at)
select er.empresa_id, d.target_id, er.created_by, er.created_at
from operacao_empresa_regionais er
join _operacao_regionais_depara d on d.source_id = er.regional_id
on conflict do nothing;

delete from operacao_empresa_regionais er
using _operacao_regionais_depara d
where er.regional_id = d.source_id;

insert into regional_operation_scopes (regional_id, operation_type, created_at)
select d.target_id, s.operation_type, s.created_at
from regional_operation_scopes s
join _operacao_regionais_depara d on d.source_id = s.regional_id
on conflict do nothing;

delete from regional_operation_scopes s
using _operacao_regionais_depara d
where s.regional_id = d.source_id;

create temp table _operacao_agentes_duplicados on commit drop as
select src.id as source_agent_id, tgt.id as target_agent_id
from operacao_agentes src
join _operacao_regionais_depara d on d.source_id = src.regional_id
join operacao_agentes tgt on tgt.regional_id = d.target_id
	and lower(tgt.cidade_nome) = lower(src.cidade_nome)
	and tgt.ativo = true
where src.ativo = true and src.id <> tgt.id;

insert into operacao_empresa_agentes (empresa_id, agente_id, created_by, created_at)
select ea.empresa_id, d.target_agent_id, ea.created_by, ea.created_at
from operacao_empresa_agentes ea
join _operacao_agentes_duplicados d on d.source_agent_id = ea.agente_id
on conflict do nothing;

delete from operacao_empresa_agentes ea
using _operacao_agentes_duplicados d
where ea.agente_id = d.source_agent_id;

insert into operacao_agente_operation_scopes (agente_id, operation_type, created_at)
select d.target_agent_id, s.operation_type, s.created_at
from operacao_agente_operation_scopes s
join _operacao_agentes_duplicados d on d.source_agent_id = s.agente_id
on conflict do nothing;

delete from operacao_agente_operation_scopes s
using _operacao_agentes_duplicados d
where s.agente_id = d.source_agent_id;

update operacao_agentes a
set ativo = false, updated_at = now()
from _operacao_agentes_duplicados d
where a.id = d.source_agent_id;

update operacao_agentes a
set regional_id = d.target_id, updated_at = now()
from _operacao_regionais_depara d
where a.regional_id = d.source_id and a.ativo = true;

update regional_responsaveis t
set regional_id = d.target_id
from _operacao_regionais_depara d
where t.regional_id = d.source_id;

update operacao_tecnicos t
set regional_id = d.target_id
from _operacao_regionais_depara d
where t.regional_id = d.source_id;

update operacao_acertos_estoque t
set regional_id = d.target_id
from _operacao_regionais_depara d
where t.regional_id = d.source_id;

update operacao_entregas_tecnicos t
set regional_id = d.target_id
from _operacao_regionais_depara d
where t.regional_id = d.source_id;

update operacao_auditoria_bolsa t
set regional_id = d.target_id
from _operacao_regionais_depara d
where t.regional_id = d.source_id;

delete from regional_cidades c
using _operacao_regionais_depara d
where c.regional_id = d.source_id;

delete from regionais r
using _operacao_regionais_depara d
where r.id = d.source_id;

commit;

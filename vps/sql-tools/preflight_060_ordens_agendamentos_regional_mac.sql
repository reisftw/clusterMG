-- Preflight de vps/sql/060_ordens_agendamentos_regional_mac.sql (Fase E).
-- Convencao: query somente leitura, uma linha por violacao encontrada —
-- 0 linhas = seguro pra aplicar a migration (ver vps/sql-tools/README.md).
--
-- Só verifica o backfill de normalizacao de MAC: é a unica parte desta
-- migration que pode gerar um problema real (duas linhas diferentes cujo
-- mac_addr, depois de normalizado, colidiria no mesmo valor canonico —
-- isso NAO impede a migration de rodar tecnicamente, mas sinaliza que
-- duas ordens diferentes podem estar referenciando o mesmo equipamento e
-- merece revisao humana antes de normalizar/considerar unicidade no
-- futuro). As colunas novas (regional_id) sao NULLABLE e o CHECK de
-- status/turno de agendamentos já é auto-protegido pelo proprio Postgres
-- (a migration falha e reverte sozinha se algum dado violar o CHECK).
with normalizado as (
	select
		id,
		mac_addr,
		upper(regexp_replace(coalesce(mac_addr, ''), '[^0-9A-Fa-f]', '', 'g')) as mac_canonico
	from ordens_servico
	where mac_addr is not null and mac_addr <> ''
)
select
	mac_canonico,
	count(*) as linhas,
	count(distinct mac_addr) as formatos_distintos,
	array_agg(distinct mac_addr) as valores_originais,
	array_agg(id) as ids_afetados
from normalizado
where length(mac_canonico) = 12 and mac_canonico <> 'FFFFFFFFFFFF'
group by mac_canonico
having count(distinct mac_addr) > 1
order by linhas desc;

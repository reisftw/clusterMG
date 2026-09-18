-- Pre-flight de integridade para a migration 010_finan_data_integrity_constraints.sql
--
-- SOMENTE LEITURA. Nenhum UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE.
-- Rode isto manualmente contra o Postgres de PRODUCAO antes de aplicar a
-- migration 010 la. Cada bloco abaixo corresponde a uma constraint que a
-- migration pretende adicionar. Se qualquer bloco retornar linhas
-- (violation_count > 0), a constraint correspondente NAO deve ser aplicada
-- em producao sem antes corrigir ou decidir o que fazer com esses dados —
-- a migration 010 ja evita quebrar sozinha (ver comentarios nela), mas
-- este script existe para voce revisar o que sera afetado ANTES de rodar
-- qualquer coisa.
--
-- Uso sugerido:
--   psql "$FINAN_DATABASE_URL" -f apps/finan/backend/sql/preflight_010_finan_integrity.sql

\echo '=== 1. NOT NULL: finan_orcamento_lancamentos.ano/mes ==='
select count(*) as violation_count
from finan_orcamento_lancamentos
where ano is null or mes is null;

\echo '=== 2. NOT NULL: finan_serasa_movimentacoes.ano/mes ==='
select count(*) as violation_count
from finan_serasa_movimentacoes
where ano is null or mes is null;

\echo '=== 3. CHECK: periodos invalidos em finan_orcamento_lancamentos (mes fora de 1-12) ==='
select count(*) as violation_count
from finan_orcamento_lancamentos
where mes is not null and (mes < 1 or mes > 12);

\echo '=== 4. CHECK: periodos invalidos em finan_orcamento_matriz (mes fora de 1-12) ==='
select count(*) as violation_count
from finan_orcamento_matriz
where mes < 1 or mes > 12;

\echo '=== 5. CHECK: anos fora do intervalo plausivel (2000-2100) em finan_orcamento_lancamentos ==='
select count(*) as violation_count, min(ano) as menor_ano, max(ano) as maior_ano
from finan_orcamento_lancamentos
where ano is not null and (ano < 2000 or ano > 2100);

\echo '=== 6. CHECK: anos fora do intervalo plausivel (2000-2100) em finan_orcamento_matriz ==='
select count(*) as violation_count, min(ano) as menor_ano, max(ano) as maior_ano
from finan_orcamento_matriz
where ano < 2000 or ano > 2100;

\echo '=== 7. FK orfa: finan_centros_custo.diretoria_id -> finan_diretorias.id ==='
select count(*) as violation_count
from finan_centros_custo c
where c.diretoria_id is not null
  and not exists (select 1 from finan_diretorias d where d.id = c.diretoria_id);

\echo '=== 8. FK orfa: finan_orcamento_matriz.conta_id -> finan_contas.id ==='
select count(*) as violation_count
from finan_orcamento_matriz m
where m.conta_id is not null
  and not exists (select 1 from finan_contas c where c.id = m.conta_id);

\echo '=== 9. FK orfa: finan_orcamento_matriz.centro_custo_id -> finan_centros_custo.id ==='
select count(*) as violation_count
from finan_orcamento_matriz m
where m.centro_custo_id is not null
  and not exists (select 1 from finan_centros_custo c where c.id = m.centro_custo_id);

\echo '=== 10. FK orfa: finan_orcamento_lancamentos.conta_id -> finan_contas.id ==='
select count(*) as violation_count
from finan_orcamento_lancamentos l
where l.conta_id is not null
  and not exists (select 1 from finan_contas c where c.id = l.conta_id);

\echo '=== 11. FK orfa: finan_orcamento_lancamentos.centro_custo_id -> finan_centros_custo.id ==='
select count(*) as violation_count
from finan_orcamento_lancamentos l
where l.centro_custo_id is not null
  and not exists (select 1 from finan_centros_custo c where c.id = l.centro_custo_id);

\echo '=== 12. FK orfa: finan_equipe_cargos.setor_id -> finan_equipe_setores.id ==='
select count(*) as violation_count
from finan_equipe_cargos g
where g.setor_id is not null
  and not exists (select 1 from finan_equipe_setores s where s.id = g.setor_id);

\echo '=== 13. FK orfa: finan_equipe_colaboradores.cargo_id -> finan_equipe_cargos.id ==='
select count(*) as violation_count
from finan_equipe_colaboradores co
where co.cargo_id is not null
  and not exists (select 1 from finan_equipe_cargos g where g.id = co.cargo_id);

\echo '=== 14. FK orfa: finan_equipe_colaboradores.gestor_id -> finan_equipe_colaboradores.id ==='
select count(*) as violation_count
from finan_equipe_colaboradores co
where co.gestor_id is not null
  and not exists (select 1 from finan_equipe_colaboradores g2 where g2.id = co.gestor_id);

\echo '=== 15. FK orfa: finan_equipe_setores.responsavel_id -> finan_equipe_colaboradores.id ==='
select count(*) as violation_count
from finan_equipe_setores s
where s.responsavel_id is not null
  and not exists (select 1 from finan_equipe_colaboradores co where co.id = s.responsavel_id);

\echo '=== 16. FK orfa: finan_filiais.matriz_id -> finan_matrizes.id ==='
select count(*) as violation_count
from finan_filiais f
where f.matriz_id is not null
  and not exists (select 1 from finan_matrizes m where m.id = f.matriz_id);

\echo '=== 17. Hierarquia: finan_contas.parent_id -> finan_contas.id (orfaos) ==='
select count(*) as violation_count
from finan_contas a
where a.parent_id is not null
  and not exists (select 1 from finan_contas p where p.id = a.parent_id);

\echo '=== 18. Hierarquia: finan_contas — auto-referencia (parent_id = id) ==='
select count(*) as violation_count
from finan_contas
where parent_id is not null and parent_id = id;

\echo '=== 19. Hierarquia: finan_contas — ciclo indireto (ate 10 niveis) ==='
with recursive chain(id, parent_id, depth, path) as (
	select id, parent_id, 1, array[id]
	from finan_contas
	where parent_id is not null
	union all
	select c.id, a.parent_id, c.depth + 1, c.path || a.parent_id
	from chain c
	join finan_contas a on a.id = c.parent_id
	where c.depth < 10 and not a.parent_id = any(c.path)
)
select count(*) as violation_count
from chain
where parent_id = any(path[1:array_length(path,1)-1]);

\echo '=== 20. Hierarquia: finan_centros_custo.parent_id -> finan_centros_custo.id (orfaos) ==='
select count(*) as violation_count
from finan_centros_custo a
where a.parent_id is not null
  and not exists (select 1 from finan_centros_custo p where p.id = a.parent_id);

\echo '=== 21. Hierarquia: finan_centros_custo — auto-referencia (parent_id = id) ==='
select count(*) as violation_count
from finan_centros_custo
where parent_id is not null and parent_id = id;

\echo '=== 22. Duplicidade: finan_users.email (case-insensitive) ==='
select lower(email) as email, count(*) as ocorrencias
from finan_users
group by lower(email)
having count(*) > 1;

\echo '=== 23. Duplicidade: finan_integration_configs.provider (mais de um id por provider) ==='
select provider, count(*) as ocorrencias
from finan_integration_configs
group by provider
having count(*) > 1;

\echo '=== Fim do pre-flight. Se QUALQUER violation_count acima for > 0, ==='
\echo '=== NAO aplique a constraint correspondente em producao sem antes decidir o que fazer com esses dados. ==='

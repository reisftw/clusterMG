-- Rollback da migration 010_finan_data_integrity_constraints.sql.
--
-- NAO EXECUTAR AUTOMATICAMENTE. Isto e um script de emergencia, preparado
-- e testado contra o Postgres de teste, para uso manual caso a 010 cause
-- algum problema inesperado em producao.
--
-- So remove exatamente o que a 010 adiciona (17 constraints nomeadas +
-- NOT NULL em 4 colunas). Nunca toca nas migrations 001-009 nem em dado
-- nenhum. Cada DROP usa "if exists", entao e seguro rodar mesmo se a 010
-- tiver pulado alguma constraint especifica (por causa de dado invalido) —
-- o DROP dela simplesmente nao encontra nada e segue em frente.
--
-- Uso: psql "$FINAN_DATABASE_URL" -f apps/finan/backend/sql-tools/rollback_010_finan_data_integrity_constraints.sql
-- Depois de rodar, tambem e preciso apagar a linha da migration da tabela
-- de controle, senao o runner nao vai tentar reaplicar a 010:
--   delete from finan_migrations where id = '010_finan_data_integrity_constraints.sql';

begin;

-- P3
alter table finan_integration_configs drop constraint if exists uq_finan_integration_configs_provider;

-- P2
alter table finan_filiais drop constraint if exists fk_finan_filiais_matriz;
alter table finan_centros_custo drop constraint if exists fk_finan_centros_custo_parent;
alter table finan_contas drop constraint if exists fk_finan_contas_parent;
alter table finan_orcamento_matriz drop constraint if exists chk_finan_orcamento_matriz_ano;
alter table finan_orcamento_lancamentos drop constraint if exists chk_finan_orcamento_lancamentos_ano;
alter table finan_orcamento_matriz drop constraint if exists chk_finan_orcamento_matriz_mes;
alter table finan_orcamento_lancamentos drop constraint if exists chk_finan_orcamento_lancamentos_mes;

-- P1 (equipe)
alter table finan_equipe_setores drop constraint if exists fk_finan_equipe_setores_responsavel;
alter table finan_equipe_colaboradores drop constraint if exists fk_finan_equipe_colaboradores_gestor;
alter table finan_equipe_colaboradores drop constraint if exists fk_finan_equipe_colaboradores_cargo;
alter table finan_equipe_cargos drop constraint if exists fk_finan_equipe_cargos_setor;

-- P1 (orcamento)
alter table finan_orcamento_lancamentos drop constraint if exists fk_finan_orcamento_lancamentos_centro;
alter table finan_orcamento_lancamentos drop constraint if exists fk_finan_orcamento_lancamentos_conta;
alter table finan_orcamento_matriz drop constraint if exists fk_finan_orcamento_matriz_centro;
alter table finan_orcamento_matriz drop constraint if exists fk_finan_orcamento_matriz_conta;

-- P1 (diretoria)
alter table finan_centros_custo drop constraint if exists fk_finan_centros_custo_diretoria;

-- P1 (NOT NULL)
alter table finan_serasa_movimentacoes alter column mes drop not null;
alter table finan_serasa_movimentacoes alter column ano drop not null;
alter table finan_orcamento_lancamentos alter column mes drop not null;
alter table finan_orcamento_lancamentos alter column ano drop not null;

commit;

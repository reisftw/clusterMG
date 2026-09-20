-- Constraints de integridade estrutural para o Finan, baseadas na 2a etapa
-- da auditoria tecnica (relacionamentos confirmados no codigo/JOINs, nao
-- so pelo nome da coluna — ver relatorio).
--
-- Estrategia "verifica-e-so-entao-aplica": cada constraint abaixo e
-- independente das demais. Antes de criar, o bloco conta quantas linhas
-- violariam a regra; se count = 0, aplica; se count > 0, so avisa
-- (RAISE NOTICE) e NAO aplica aquela constraint especifica — as outras
-- continuam sendo avaliadas normalmente. Isso torna esta migration segura
-- de rodar mesmo sem preflight manual, mas o script
-- sql/preflight_010_finan_integrity.sql ainda deve ser rodado manualmente
-- em producao ANTES, porque "a migration nao quebrou nada" e diferente de
-- "todas as constraints desejadas foram de fato aplicadas" — se algum
-- bloco pular, os NOTICEs no log da migration dizem exatamente qual e
-- quantas linhas violam, para voce decidir o que fazer com esse dado.
--
-- IMPORTANTE: "tecnicamente validada" (roda sem erro, testada contra
-- Postgres de teste limpo e com fixtures propositalmente ruins) e
-- diferente de "validada contra os dados de producao" — isso so acontece
-- depois que alguem rodar o preflight contra o banco real. Ver relatorio.

-- ============================================================
-- P1 — NOT NULL em ano/mes
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_lancamentos
	where ano is null or mes is null;

	if violation_count = 0 then
		execute 'alter table finan_orcamento_lancamentos alter column ano set not null';
		execute 'alter table finan_orcamento_lancamentos alter column mes set not null';
	else
		raise notice 'PULADO: finan_orcamento_lancamentos.ano/mes NOT NULL — % linha(s) com ano ou mes nulo.', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_serasa_movimentacoes
	where ano is null or mes is null;

	if violation_count = 0 then
		execute 'alter table finan_serasa_movimentacoes alter column ano set not null';
		execute 'alter table finan_serasa_movimentacoes alter column mes set not null';
	else
		raise notice 'PULADO: finan_serasa_movimentacoes.ano/mes NOT NULL — % linha(s) com ano ou mes nulo.', violation_count;
	end if;
end $$;

-- ============================================================
-- P1 — FK diretoria (finan_centros_custo.diretoria_id)
-- ON DELETE SET NULL: deletar uma diretoria nao deve travar nem apagar o
-- centro de custo, so desvincular (mesmo comportamento que o codigo ja
-- assume implicitamente hoje).
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_centros_custo c
	where c.diretoria_id is not null
	  and not exists (select 1 from finan_diretorias d where d.id = c.diretoria_id);

	if violation_count = 0 then
		execute 'alter table finan_centros_custo
			add constraint fk_finan_centros_custo_diretoria
			foreign key (diretoria_id) references finan_diretorias(id) on delete set null';
	else
		raise notice 'PULADO: FK finan_centros_custo.diretoria_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

-- ============================================================
-- P1 — FK conta/centro de custo no orcamento (matriz e lancamentos)
-- ON DELETE RESTRICT: um lancamento/matriz financeiro nao pode ficar orfao
-- silenciosamente (ao contrario da equipe, aqui "sumir a referencia" muda
-- relatorio financeiro) — bloquear a exclusao da conta/centro forca uma
-- decisao explicita em vez de corromper o dado.
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_matriz m
	where m.conta_id is not null
	  and not exists (select 1 from finan_contas c where c.id = m.conta_id);

	if violation_count = 0 then
		execute 'alter table finan_orcamento_matriz
			add constraint fk_finan_orcamento_matriz_conta
			foreign key (conta_id) references finan_contas(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_orcamento_matriz.conta_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_matriz m
	where m.centro_custo_id is not null
	  and not exists (select 1 from finan_centros_custo c where c.id = m.centro_custo_id);

	if violation_count = 0 then
		execute 'alter table finan_orcamento_matriz
			add constraint fk_finan_orcamento_matriz_centro
			foreign key (centro_custo_id) references finan_centros_custo(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_orcamento_matriz.centro_custo_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_lancamentos l
	where l.conta_id is not null
	  and not exists (select 1 from finan_contas c where c.id = l.conta_id);

	if violation_count = 0 then
		execute 'alter table finan_orcamento_lancamentos
			add constraint fk_finan_orcamento_lancamentos_conta
			foreign key (conta_id) references finan_contas(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_orcamento_lancamentos.conta_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_lancamentos l
	where l.centro_custo_id is not null
	  and not exists (select 1 from finan_centros_custo c where c.id = l.centro_custo_id);

	if violation_count = 0 then
		execute 'alter table finan_orcamento_lancamentos
			add constraint fk_finan_orcamento_lancamentos_centro
			foreign key (centro_custo_id) references finan_centros_custo(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_orcamento_lancamentos.centro_custo_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

-- ============================================================
-- P1 — FKs da estrutura de equipe
-- ON DELETE SET NULL: replica o que financeiroEquipeRepository.js ja faz
-- manualmente hoje (ex.: ao deletar um cargo, zera cargo_id dos
-- colaboradores). Com a FK, isso passa a ser garantido pelo banco mesmo
-- que um caminho de codigo novo esqueca de fazer isso na mao.
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_equipe_cargos g
	where g.setor_id is not null
	  and not exists (select 1 from finan_equipe_setores s where s.id = g.setor_id);

	if violation_count = 0 then
		execute 'alter table finan_equipe_cargos
			add constraint fk_finan_equipe_cargos_setor
			foreign key (setor_id) references finan_equipe_setores(id) on delete set null';
	else
		raise notice 'PULADO: FK finan_equipe_cargos.setor_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_equipe_colaboradores co
	where co.cargo_id is not null
	  and not exists (select 1 from finan_equipe_cargos g where g.id = co.cargo_id);

	if violation_count = 0 then
		execute 'alter table finan_equipe_colaboradores
			add constraint fk_finan_equipe_colaboradores_cargo
			foreign key (cargo_id) references finan_equipe_cargos(id) on delete set null';
	else
		raise notice 'PULADO: FK finan_equipe_colaboradores.cargo_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_equipe_colaboradores co
	where co.gestor_id is not null
	  and not exists (select 1 from finan_equipe_colaboradores g2 where g2.id = co.gestor_id);

	if violation_count = 0 then
		execute 'alter table finan_equipe_colaboradores
			add constraint fk_finan_equipe_colaboradores_gestor
			foreign key (gestor_id) references finan_equipe_colaboradores(id) on delete set null';
	else
		raise notice 'PULADO: FK finan_equipe_colaboradores.gestor_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_equipe_setores s
	where s.responsavel_id is not null
	  and not exists (select 1 from finan_equipe_colaboradores co where co.id = s.responsavel_id);

	if violation_count = 0 then
		execute 'alter table finan_equipe_setores
			add constraint fk_finan_equipe_setores_responsavel
			foreign key (responsavel_id) references finan_equipe_colaboradores(id) on delete set null';
	else
		raise notice 'PULADO: FK finan_equipe_setores.responsavel_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

-- ============================================================
-- P2 — CHECK de mes/ano
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_lancamentos
	where mes is not null and (mes < 1 or mes > 12);

	if violation_count = 0 then
		execute 'alter table finan_orcamento_lancamentos
			add constraint chk_finan_orcamento_lancamentos_mes check (mes is null or mes between 1 and 12)';
	else
		raise notice 'PULADO: CHECK finan_orcamento_lancamentos.mes — % linha(s) fora de 1-12.', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_matriz
	where mes < 1 or mes > 12;

	if violation_count = 0 then
		execute 'alter table finan_orcamento_matriz
			add constraint chk_finan_orcamento_matriz_mes check (mes between 1 and 12)';
	else
		raise notice 'PULADO: CHECK finan_orcamento_matriz.mes — % linha(s) fora de 1-12.', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_lancamentos
	where ano is not null and (ano < 2000 or ano > 2100);

	if violation_count = 0 then
		execute 'alter table finan_orcamento_lancamentos
			add constraint chk_finan_orcamento_lancamentos_ano check (ano is null or ano between 2000 and 2100)';
	else
		raise notice 'PULADO: CHECK finan_orcamento_lancamentos.ano — % linha(s) fora de 2000-2100.', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_orcamento_matriz
	where ano < 2000 or ano > 2100;

	if violation_count = 0 then
		execute 'alter table finan_orcamento_matriz
			add constraint chk_finan_orcamento_matriz_ano check (ano between 2000 and 2100)';
	else
		raise notice 'PULADO: CHECK finan_orcamento_matriz.ano — % linha(s) fora de 2000-2100.', violation_count;
	end if;
end $$;

-- ============================================================
-- P2 — hierarquias auto-referentes (parent_id)
-- ON DELETE RESTRICT: nao permite apagar um "pai" que ainda tem filhos
-- apontando pra ele (forca reorganizar a arvore antes).
-- Auto-referencia (parent_id = id) e ciclo indireto sao bloqueados pelo
-- proprio preflight/relatorio, nao pela FK (FK so impede orfao, nao
-- ciclo — ver Fase 5 do relatorio).
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_contas a
	where a.parent_id is not null
	  and not exists (select 1 from finan_contas p where p.id = a.parent_id);

	if violation_count = 0 then
		execute 'alter table finan_contas
			add constraint fk_finan_contas_parent
			foreign key (parent_id) references finan_contas(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_contas.parent_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_centros_custo a
	where a.parent_id is not null
	  and not exists (select 1 from finan_centros_custo p where p.id = a.parent_id);

	if violation_count = 0 then
		execute 'alter table finan_centros_custo
			add constraint fk_finan_centros_custo_parent
			foreign key (parent_id) references finan_centros_custo(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_centros_custo.parent_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

-- ============================================================
-- P2 — finan_filiais.matriz_id
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from finan_filiais f
	where f.matriz_id is not null
	  and not exists (select 1 from finan_matrizes m where m.id = f.matriz_id);

	if violation_count = 0 then
		execute 'alter table finan_filiais
			add constraint fk_finan_filiais_matriz
			foreign key (matriz_id) references finan_matrizes(id) on delete restrict';
	else
		raise notice 'PULADO: FK finan_filiais.matriz_id — % linha(s) orfa(s).', violation_count;
	end if;
end $$;

-- ============================================================
-- P3 — UNIQUE(provider) em finan_integration_configs
-- ============================================================

do $$
declare
	violation_count integer;
begin
	select count(*) into violation_count
	from (
		select provider from finan_integration_configs group by provider having count(*) > 1
	) dup;

	if violation_count = 0 then
		execute 'alter table finan_integration_configs
			add constraint uq_finan_integration_configs_provider unique (provider)';
	else
		raise notice 'PULADO: UNIQUE finan_integration_configs.provider — % provider(s) duplicado(s).', violation_count;
	end if;
end $$;

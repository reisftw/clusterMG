// Teste de regressao para o bug real encontrado em producao: GET
// /api/finan/orcamento/detalhes derrubava o processo inteiro porque a
// query da secao "empresas" referenciava `e.codigo`, uma coluna que nunca
// existiu em finan_matrizes (o campo mora dentro de source_payload).
//
// Roda a MESMA query que orcamento/routes.js executa, direto contra o
// Postgres de teste, com uma linha de finan_matrizes populada (incluindo
// source_payload.codigo) — se a coluna errada voltasse, este teste falha
// com o mesmo erro 42703 que apareceu no journal de producao.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	closeFinanTestPool,
	getFinanTestPool,
	isTestDatabaseAvailable,
	truncateFinanTestTables,
} from "./pgTestEnv.js";

const dbAvailable = await isTestDatabaseAvailable();

// A mesma query de "empresas" de orcamento/routes.js (GET /detalhes),
// copiada aqui de proposito — um teste de regressao deve travar a query
// exata que quebrou, nao uma reconstrucao aproximada.
const EMPRESAS_QUERY = `
	with matriz as (
		select
			coalesce(
				source_payload->>'matrizId',
				source_payload->>'empresaId',
				source_payload->>'companyId',
				source_payload->>'empresa'
			) as empresa_id,
			coalesce(sum(orcado), 0)::numeric as orcado
		from finan_orcamento_matriz
		where ano = $1 and mes = $2
		group by coalesce(
			source_payload->>'matrizId',
			source_payload->>'empresaId',
			source_payload->>'companyId',
			source_payload->>'empresa'
		)
	),
	lancamentos as (
		select empresa_id, coalesce(sum(realizado), 0)::numeric as realizado
		from finan_orcamento_lancamentos
		where ano = $1 and mes = $2
		group by empresa_id
	),
	base as (
		select
			empresa_id,
			sum(orcado)::numeric as orcado,
			sum(realizado)::numeric as realizado
		from (
			select empresa_id, orcado, 0::numeric as realizado from matriz
			union all
			select empresa_id, 0::numeric as orcado, realizado from lancamentos
		) x
		group by empresa_id
	)
	select
		coalesce(e.id, base.empresa_id, 'sem-empresa') as id,
		e.source_payload->>'codigo' as codigo,
		coalesce(e.nome, 'Empresa não informada') as nome,
		coalesce(
			e.source_payload->>'grupo',
			e.source_payload->>'group',
			resolve_group.grupo,
			''
		) as grupo,
		coalesce(base.orcado, 0)::numeric as orcado,
		coalesce(base.realizado, 0)::numeric as realizado
	from base
	left join finan_matrizes e on e.id = base.empresa_id
	left join lateral (
		select coalesce(base.empresa_id, e.source_payload->>'codigo', '') as grupo
	) resolve_group on true
	where coalesce(base.orcado, 0) <> 0 or coalesce(base.realizado, 0) <> 0
	order by abs(coalesce(base.realizado, 0)) desc, nome
`;

describe.skipIf(!dbAvailable)("integracao: regressao orcamento/routes.js (bug e.codigo)", () => {
	beforeEach(async () => {
		await truncateFinanTestTables();
		await getFinanTestPool().query(
			`insert into finan_matrizes (id, nome, source_payload)
			 values ('mtz-1', 'Sempre Internet', $1::jsonb)`,
			[JSON.stringify({ codigo: "MTZ01", grupo: "Sempre" })],
		);
		await getFinanTestPool().query(
			`insert into finan_orcamento_lancamentos (id, ano, mes, empresa_id, orcado, realizado, source_hash)
			 values ('lanc-empresa-1', 2026, 9, 'mtz-1', 1000, 800, 'hash-regressao-empresa')`,
		);
	});

	afterAll(async () => {
		await closeFinanTestPool();
	});

	it("query de empresas do /detalhes NAO falha mais com 'column e.codigo does not exist'", async () => {
		await expect(
			getFinanTestPool().query(EMPRESAS_QUERY, [2026, 9]),
		).resolves.toBeDefined();
	});

	it("codigo da empresa vem de source_payload->>'codigo', nao de uma coluna inexistente", async () => {
		const { rows } = await getFinanTestPool().query(EMPRESAS_QUERY, [2026, 9]);
		const empresa = rows.find((row) => row.id === "mtz-1");
		expect(empresa).toBeDefined();
		expect(empresa.codigo).toBe("MTZ01");
		expect(empresa.grupo).toBe("Sempre");
	});

	it("empresa sem source_payload.codigo nao quebra a query (fica null, nao erro)", async () => {
		await getFinanTestPool().query(
			"update finan_matrizes set source_payload = '{}'::jsonb where id = 'mtz-1'",
		);
		const { rows } = await getFinanTestPool().query(EMPRESAS_QUERY, [2026, 9]);
		const empresa = rows.find((row) => row.id === "mtz-1");
		expect(empresa.codigo).toBeNull();
	});
});

// Confirma, contra Postgres real, como NUMERIC(14,2) trafega pelo driver
// `pg` e se agregacoes (SUM) no banco evitam erro de ponto flutuante.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	closeFinanTestPool,
	getFinanTestPool,
	isTestDatabaseAvailable,
	truncateFinanTestTables,
} from "./pgTestEnv.js";

const dbAvailable = await isTestDatabaseAvailable();

describe.skipIf(!dbAvailable)("integracao: precisao monetaria (numeric 14,2)", () => {
	beforeEach(async () => {
		await truncateFinanTestTables();
		await getFinanTestPool().query(
			"insert into finan_contas (id, nome) values ('conta-precisao', 'Conta Precisao')",
		);
		await getFinanTestPool().query(
			"insert into finan_centros_custo (id, nome) values ('centro-precisao', 'Centro Precisao')",
		);
	});

	afterAll(async () => {
		await closeFinanTestPool();
	});

	it("o driver pg entrega NUMERIC como STRING, nao como number", async () => {
		const { rows } = await getFinanTestPool().query(
			`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id, orcado)
			 values (gen_random_uuid(), 2026, 9, 'conta-precisao', 'centro-precisao', 10.99)
			 returning orcado`,
		);
		// Esse e o comportamento real do node-postgres para o tipo NUMERIC:
		// ele nao converte para float (evitaria perda de precisao em valores
		// grandes), entao chega como string. Qualquer codigo que fizer
		// `valor + 1` sem `Number(valor)` primeiro vai CONCATENAR, nao somar.
		expect(typeof rows[0].orcado).toBe("string");
		expect(rows[0].orcado).toBe("10.99");
	});

	it("SUM no Postgres de varios valores 'perigosos' para float bate exato, em string", async () => {
		const valores = ["0.01", "0.10", "10.99", "999999.99"];
		for (const [index, valor] of valores.entries()) {
			// eslint-disable-next-line no-await-in-loop
			await getFinanTestPool().query(
				`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id, orcado)
				 values (gen_random_uuid(), 2026, $1, 'conta-precisao', 'centro-precisao', $2)`,
				[index + 1, valor],
			);
		}
		const { rows } = await getFinanTestPool().query(
			"select sum(orcado)::numeric(14,2) as total from finan_orcamento_matriz where conta_id = 'conta-precisao'",
		);
		// soma exata esperada: 0.01+0.10+10.99+999999.99 = 1000011.09
		expect(rows[0].total).toBe("1000011.09");
		// Contraste: a mesma soma feita ingenuamente em ponto flutuante JS
		// (parseFloat de cada string + operador `+`) e o tipo de erro que
		// queremos que o Postgres evite carregar para o app:
		const somaFloatIngenua = valores.reduce((acc, value) => acc + parseFloat(value), 0);
		// Este teste documenta o risco, nao afirma que o JS sempre erra aqui
		// especificamente — o ponto e que o Postgres, feito a soma, entrega
		// o resultado ja correto e arredondado como string, sem essa
		// exposicao.
		expect(Number(rows[0].total)).toBeCloseTo(somaFloatIngenua, 2);
	});

	it("valores no limite (0.01 e 999999.99) fazem ida e volta sem perder precisao", async () => {
		const { rows } = await getFinanTestPool().query(
			`insert into finan_orcamento_matriz (id, ano, mes, conta_id, centro_custo_id, orcado, realizado)
			 values (gen_random_uuid(), 2026, 9, 'conta-precisao', 'centro-precisao', $1, $2)
			 returning orcado, realizado`,
			["0.01", "999999.99"],
		);
		expect(rows[0].orcado).toBe("0.01");
		expect(rows[0].realizado).toBe("999999.99");
	});
});

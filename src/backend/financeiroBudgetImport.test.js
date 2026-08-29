import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("financeiro budget import config merge", () => {
	let mergeBudgetConfigFromRows;

	beforeAll(() => {
		process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
		mergeBudgetConfigFromRows =
			require("../../vps/api/src/financeiro").__testables
				.mergeBudgetConfigFromRows;
	});

	it("reuses an existing cost center by code without remapping another center with the same name", () => {
		const result = mergeBudgetConfigFromRows(
			{
				centers: [
					{
						id: "110701",
						codigo: "110701",
						reduzida: "110.701",
						nome: "ROT",
						parentId: "1107",
						parentCodigo: "1107",
						tipoPlano: "A",
						nivel: 4,
						categoriaPrincipal: "Operacoes",
					},
				],
				accounts: [],
				companies: [],
				branches: [],
				partners: [],
				matrix: [],
			},
			[
				{
					codCc: "110701",
					nomeCc: "ROT",
					codConta: "1211",
					nomeConta: "Energia",
					data: "2026-08-24",
					ano: 2026,
					numMes: 8,
					realizado: 100,
					orcado: 0,
					diretoria: "Manutencao de Rede",
				},
			],
			{ uid: "test-user", email: "test@example.com" },
		);

		const rotCenters = result.config.centers.filter(
			(center) => center.nome === "ROT",
		);
		const rot110701 = result.config.centers.find(
			(center) => center.id === "110701",
		);
		const rot150302 = result.config.centers.find(
			(center) => center.id === "150302",
		);

		expect(result.created.centers).toBe(0);
		expect(rot110701).toMatchObject({
			id: "110701",
			codigo: "110701",
			parentId: "1107",
			parentCodigo: "1107",
			categoriaPrincipal: "Operacoes",
		});
		expect(rot150302).toMatchObject({
			id: "150302",
			codigo: "150302",
			parentId: "1503",
			parentCodigo: "1503",
		});
		expect(rotCenters.map((center) => center.id).sort()).toEqual([
			"110701",
			"150302",
		]);
		expect(result.config.matrix[0]).toMatchObject({
			costCenterId: "110701",
			year: 2026,
		});
	});
});

import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const repositoryPath = require.resolve("./api/src/financeiroEquipeRepository.js");
const dbPath = require.resolve("./api/src/db.js");

function clearModules() {
	delete require.cache[repositoryPath];
	delete require.cache[dbPath];
}

function loadRepository(dbQuery) {
	clearModules();
	require.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: { query: dbQuery },
	};
	return require("./api/src/financeiroEquipeRepository.js");
}

describe("financeiroEquipeRepository", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("lista cargos e colaboradores da equipe financeira", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						id: "c4a2f411-9845-46b9-8a83-19f2e43bdcf0",
						nome: "Coordenação",
						descricao: "",
						cor: "#2563eb",
						responsavel_id: null,
						responsavel_nome: null,
						ordem: 1,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
						nome: "Coordenador Financeiro",
						setor_id: null,
						setor: null,
						descricao: "Coordena a rotina financeira.",
						ordem: 1,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "21768bee-00f7-4214-8c0d-b697cb23cb01",
						nome: "Maria Silva",
						setor: "Contas a Receber",
						cargo_id: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
						cargo_nome: "Coordenador Financeiro",
						cargo_descricao: "Coordena a rotina financeira.",
						formacao: "Administração",
						atividades: "Acompanha recebíveis.",
						gestor_id: null,
						avatar_url: null,
						pos_x: "120",
						pos_y: "80",
						ordem: 2,
						ativo: true,
					},
				],
			});
		const repository = loadRepository(dbQuery);

		const equipe = await repository.listEquipe();

		expect(equipe.setores).toEqual([
			expect.objectContaining({
				nome: "Coordenação",
				cor: "#2563eb",
			}),
		]);
		expect(equipe.cargos).toEqual([
			expect.objectContaining({
				nome: "Coordenador Financeiro",
				setor: "",
				setorId: null,
			}),
		]);
		expect(equipe.colaboradores).toEqual([
			expect.objectContaining({
				nome: "Maria Silva",
				setor: "Contas a Receber",
				cargoNome: "Coordenador Financeiro",
				posX: 120,
				posY: 80,
			}),
		]);
	});

	it("cria cargo validando nome obrigatório sem vincular setor", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						id: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
						nome: "Analista Financeiro",
						setor_id: null,
						setor: null,
						descricao: "Contas a pagar.",
						ordem: 0,
					},
				],
			});
		const repository = loadRepository(dbQuery);

		await expect(repository.createCargo({ nome: "" })).rejects.toThrow(
			"Informe o nome do cargo.",
		);
		const cargo = await repository.createCargo(
			{ nome: "Analista Financeiro", descricao: "Contas a pagar." },
			{ nome: "Admin" },
		);

		expect(dbQuery.mock.calls[0][0]).toContain(
			"insert into financeiro_equipe_cargos",
		);
		expect(cargo).toMatchObject({ nome: "Analista Financeiro", setor: "" });
	});

	it("bloqueia exclusão de cargo em uso", async () => {
		const dbQuery = vi.fn(async () => ({ rows: [{ total: 2 }] }));
		const repository = loadRepository(dbQuery);

		await expect(
			repository.deleteCargo("7f5f0f68-4d5e-4994-8a77-14fd1169b1ed"),
		).rejects.toMatchObject({
			status: 409,
			statusCode: 409,
			message: "Este cargo ainda possui colaboradores vinculados.",
		});
		expect(dbQuery.mock.calls[0][0]).toContain(
			"from financeiro_equipe_colaboradores",
		);
	});

	it("desvincula colaboradores inativos antes de excluir cargo", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [{ total: 0 }] })
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({
				rows: [{ id: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed" }],
			});
		const repository = loadRepository(dbQuery);

		await expect(
			repository.deleteCargo("7f5f0f68-4d5e-4994-8a77-14fd1169b1ed"),
		).resolves.toEqual({
			ok: true,
			id: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
		});
		expect(dbQuery.mock.calls[1][0]).toContain("set cargo_id = null");
		expect(dbQuery.mock.calls[2][0]).toContain(
			"delete from financeiro_equipe_cargos",
		);
	});

	it("retorna 409 quando o banco ainda impede excluir cargo por vínculo", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({ rows: [{ total: 0 }] })
			.mockResolvedValueOnce({ rows: [] })
			.mockRejectedValueOnce({ code: "23503" });
		const repository = loadRepository(dbQuery);

		await expect(
			repository.deleteCargo("7f5f0f68-4d5e-4994-8a77-14fd1169b1ed"),
		).rejects.toMatchObject({
			statusCode: 409,
			message: "Este cargo ainda possui vínculos e não pode ser excluído.",
		});
	});

	it("cria colaborador exigindo setor e cargo", async () => {
		const repository = loadRepository(vi.fn());

		await expect(
			repository.createColaborador({
				nome: "João Souza",
				cargoId: "",
				setor: "",
			}),
		).rejects.toThrow("Selecione o setor do colaborador.");
		await expect(
			repository.createColaborador({
				nome: "João Souza",
				cargoId: "",
				setor: "CP",
			}),
		).rejects.toThrow("Selecione um cargo.");
	});

	it("move colaborador atualizando setor, gestor e posição", async () => {
		const dbQuery = vi
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						id: "21768bee-00f7-4214-8c0d-b697cb23cb01",
						setor: "CP",
						ordem: 0,
						gestor_id: null,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "8c16f752-1496-47e3-a1b4-83b3f2c0cf42",
						nome: "CR",
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [{ id: "21768bee-00f7-4214-8c0d-b697cb23cb01" }],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "c4a2f411-9845-46b9-8a83-19f2e43bdcf0",
						nome: "CP",
						cor: "#2563eb",
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
						nome: "Analista",
						setor: null,
					},
				],
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "21768bee-00f7-4214-8c0d-b697cb23cb01",
						nome: "Maria Silva",
						setor: "CR",
						cargo_nome: "Analista",
						pos_x: "300",
						pos_y: "120",
						ativo: true,
					},
				],
			});
		const repository = loadRepository(dbQuery);

		const moved = await repository.moveColaborador(
			"21768bee-00f7-4214-8c0d-b697cb23cb01",
			{
				gestorId: "7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
				setor: "CR",
				posX: 300,
				posY: 120,
			},
			{ email: "admin@example.com" },
		);

		expect(dbQuery.mock.calls[2][0]).toContain(
			"update financeiro_equipe_colaboradores",
		);
		expect(dbQuery.mock.calls[2][1]).toEqual([
			"21768bee-00f7-4214-8c0d-b697cb23cb01",
			"7f5f0f68-4d5e-4994-8a77-14fd1169b1ed",
			"CR",
			300,
			120,
			0,
			"admin@example.com",
		]);
		expect(moved).toMatchObject({ nome: "Maria Silva", setor: "CR" });
	});
});

import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const servicePath = require.resolve("./api/src/movimentacoesOrdensFechadas.js");
const sempreIntegrationPath = require.resolve("./api/src/sempreIntegration.js");
const repositoryPath = require.resolve(
	"./api/src/movimentacoesOrdensFechadasRepository.js",
);

function clearModules() {
	[servicePath, sempreIntegrationPath, repositoryPath].forEach((modulePath) => {
		delete require.cache[modulePath];
	});
}

function stubModule(modulePath, exportsValue) {
	require.cache[modulePath] = {
		id: modulePath,
		filename: modulePath,
		loaded: true,
		exports: exportsValue,
	};
}

function loadService({ requestSempreRaw, createJob, updateJob, getJob }) {
	clearModules();
	stubModule(sempreIntegrationPath, { requestSempreRaw });
	stubModule(repositoryPath, { createJob, updateJob, getJob });
	return require("./api/src/movimentacoesOrdensFechadas.js");
}

describe("movimentacoesOrdensFechadas", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("marca entregue quando acha QUALQUER movimentacao (nao so devolucao de comodato) do cliente no periodo", async () => {
		const requestSempreRaw = vi.fn(async () => ({
			data: [
				{
					numero: "9001",
					emitido_em: "2026-08-10T10:00:00.000Z",
					tipo_operacao: { descricao: "Saída para instalação" },
					parceiro: { nome_razaosocial: "Cleide dos Anjos de Souza" },
				},
			],
			meta: { totalPages: 1 },
		}));
		const createJob = vi.fn(async () => ({ id: "job-1", status: "queued" }));
		const updateJob = vi.fn(async () => ({ id: "job-1" }));
		let jobSalvo = null;
		updateJob.mockImplementation(async (id, patch) => {
			if (patch.resultado) jobSalvo = patch;
			return { id, ...patch };
		});

		const service = loadService({ requestSempreRaw, createJob, updateJob, getJob: vi.fn() });

		await service.runConciliacao({
			rows: [{ nome: "Cleide dos Anjos de Souza", cidade: "Belo Horizonte" }],
			dataInicio: "2026-08-01T00:00:00.000Z",
			dataFim: "2026-08-31T23:59:59.000Z",
			user: { uid: "u1" },
		});
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(jobSalvo).toBeTruthy();
		expect(jobSalvo.status).toBe("completed");
		expect(jobSalvo.entregues).toBe(1);
		expect(jobSalvo.naoEntregues).toBe(0);
		expect(jobSalvo.resultado.itens[0]).toMatchObject({
			nome: "Cleide dos Anjos de Souza",
			entregue: true,
		});
		expect(jobSalvo.resultado.itens[0].movimentacao.tipoOperacao).toBe(
			"Saída para instalação",
		);
	});

	it("marca nao entregue quando nenhuma nota do periodo casa com o cliente", async () => {
		const requestSempreRaw = vi.fn(async () => ({ data: [], meta: { totalPages: 1 } }));
		let jobSalvo = null;
		const updateJob = vi.fn(async (id, patch) => {
			if (patch.resultado) jobSalvo = patch;
			return { id, ...patch };
		});

		const service = loadService({
			requestSempreRaw,
			createJob: vi.fn(async () => ({ id: "job-2", status: "queued" })),
			updateJob,
			getJob: vi.fn(),
		});

		await service.runConciliacao({
			rows: [{ nome: "Cliente Sem Movimentacao", cidade: "Contagem" }],
			dataInicio: "2026-08-01T00:00:00.000Z",
			dataFim: "2026-08-31T23:59:59.000Z",
			user: {},
		});
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(jobSalvo.entregues).toBe(0);
		expect(jobSalvo.naoEntregues).toBe(1);
		expect(jobSalvo.resultado.itens[0].entregue).toBe(false);
		expect(jobSalvo.resultado.itens[0].movimentacao).toBeNull();
	});

	it("rejeita planilha sem coluna de nome reconhecida", async () => {
		const service = loadService({
			requestSempreRaw: vi.fn(),
			createJob: vi.fn(),
			updateJob: vi.fn(),
			getJob: vi.fn(),
		});

		await expect(
			service.runConciliacao({
				rows: [{ coluna_qualquer: "valor" }],
				dataInicio: "2026-08-01T00:00:00.000Z",
				dataFim: "2026-08-31T23:59:59.000Z",
			}),
		).rejects.toThrow(/Planilha vazia/);
	});

	it("rejeita quando periodo nao e informado", async () => {
		const service = loadService({
			requestSempreRaw: vi.fn(),
			createJob: vi.fn(),
			updateJob: vi.fn(),
			getJob: vi.fn(),
		});

		await expect(
			service.runConciliacao({ rows: [{ nome: "Cliente X" }] }),
		).rejects.toThrow(/período/);
	});

	it("reconhece a coluna real da planilha (nome_razaosocial, codigo_cliente, data_termino_executado)", async () => {
		const requestSempreRaw = vi.fn(async () => ({
			data: [
				{
					numero: "9001",
					emitido_em: "2026-08-10T10:00:00.000Z",
					tipo_operacao: { descricao: "DEVOLUÇÃO DE COMODATO" },
					parceiro: { nome_razaosocial: "ZIRLENE APARECIDA SILVA DE PAULA" },
				},
			],
			meta: { totalPages: 1 },
		}));
		let jobSalvo = null;
		const updateJob = vi.fn(async (id, patch) => {
			if (patch.resultado) jobSalvo = patch;
			return { id, ...patch };
		});

		const service = loadService({
			requestSempreRaw,
			createJob: vi.fn(async () => ({ id: "job-real", status: "queued" })),
			updateJob,
			getJob: vi.fn(),
		});

		await service.runConciliacao({
			rows: [
				{
					nome_razaosocial: "ZIRLENE APARECIDA SILVA DE PAULA",
					codigo_cliente: "414007",
					cidade: "Sarzedo",
					data_termino_executado: "23/02/2026",
				},
			],
			dataInicio: "2026-08-01T00:00:00.000Z",
			dataFim: "2026-08-31T23:59:59.000Z",
		});
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(jobSalvo.entregues).toBe(1);
		expect(jobSalvo.resultado.itens[0]).toMatchObject({
			nome: "ZIRLENE APARECIDA SILVA DE PAULA",
			codigo: "414007",
			cidade: "Sarzedo",
			fechamento: "23/02/2026",
			entregue: true,
		});
	});

	it("quebra periodo largo em janelas e para de consultar assim que todas as linhas ja casaram", async () => {
		const requestSempreRaw = vi.fn(async () => ({
			data: [
				{
					numero: "9001",
					emitido_em: "2026-01-05T10:00:00.000Z",
					tipo_operacao: { descricao: "Qualquer tipo" },
					parceiro: { nome_razaosocial: "Cliente Um" },
				},
			],
			meta: { totalPages: 1 },
		}));
		let jobSalvo = null;
		const updateJob = vi.fn(async (id, patch) => {
			if (patch.resultado) jobSalvo = patch;
			return { id, ...patch };
		});

		const service = loadService({
			requestSempreRaw,
			createJob: vi.fn(async () => ({ id: "job-janelas", status: "queued" })),
			updateJob,
			getJob: vi.fn(),
		});

		// 90 dias / janelas de 15 dias = 6 janelas, mas a linha casa logo na
		// primeira (Cliente Um aparece ja no 1o lote de notas).
		await service.runConciliacao({
			rows: [{ nome: "Cliente Um", cidade: "BH" }],
			dataInicio: "2026-01-01T00:00:00.000Z",
			dataFim: "2026-03-31T23:59:59.000Z",
		});
		for (let i = 0; i < 10; i += 1) {
			await new Promise((resolve) => setImmediate(resolve));
		}

		expect(requestSempreRaw).toHaveBeenCalledTimes(1);
		expect(jobSalvo.entregues).toBe(1);
		expect(jobSalvo.resultado.itens[0].entregue).toBe(true);
	});
});

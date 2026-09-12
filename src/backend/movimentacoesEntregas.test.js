import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const servicePath = require.resolve("./api/src/movimentacoesEntregas.js");
const sempreIntegrationPath = require.resolve("./api/src/sempreIntegration.js");
const ordensRepositoryPath = require.resolve("./api/src/ordensRepository.js");
const movimentacoesRepositoryPath = require.resolve(
	"./api/src/movimentacoesRepository.js",
);

function clearModules() {
	[
		servicePath,
		sempreIntegrationPath,
		ordensRepositoryPath,
		movimentacoesRepositoryPath,
	].forEach((modulePath) => {
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

function noteDevolucaoComodato({ serie = "6C4CBCC488B8", parceiro = "Cleide dos Anjos de Souza" } = {}) {
	return {
		id: "nota-1",
		numero: "1001",
		externo_id: "movimento_estoque_id=2369046",
		emitido_em: "2026-08-28T15:58:13.000Z",
		observacao: "Operacao: Retirada | movimento_estoque_id: 2369046",
		tipo_operacao: { descricao: "Devolução de comodato" },
		empresa: { nome_razaosocial: "ON TELECOM LTDA" },
		parceiro: { nome_razaosocial: parceiro },
		usuario_cadastro: { email: "akengenharia19@sempreinternet.com.br" },
		itens: [
			{
				serie,
				produto: { descricao: "ONT GPON XX530V AX3000 WIFI 6", codigo: "S1.05.110.01" },
			},
		],
	};
}

function loadService({
	requestSempreRaw,
	findOrdensAbertasBySerie,
	deleteDocument,
	upsertMovimentacao,
	marcarComoCasada,
	marcarComoSemMatch,
}) {
	clearModules();
	stubModule(sempreIntegrationPath, { requestSempreRaw });
	stubModule(ordensRepositoryPath, {
		findOrdensAbertasBySerie,
		deleteDocument,
	});
	stubModule(movimentacoesRepositoryPath, {
		upsertMovimentacao,
		marcarComoCasada,
		marcarComoSemMatch,
		createScanJob: vi.fn(async () => ({ id: "job-1", status: "queued" })),
		updateScanJob: vi.fn(async () => ({ id: "job-1" })),
		getScanJob: vi.fn(async () => ({ id: "job-1", status: "completed" })),
	});
	return require("./api/src/movimentacoesEntregas.js");
}

describe("movimentacoesEntregas", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("casa devolucao com O.S. aberta (mesmo cliente + serie) e remove do mapa/match", async () => {
		const requestSempreRaw = vi.fn(async () => ({
			data: [noteDevolucaoComodato()],
			meta: { totalPages: 1 },
		}));
		const findOrdensAbertasBySerie = vi.fn(async () => [
			{
				path: "match_os_abertas/321",
				collectionPath: "match_os_abertas",
				data: { num_os: "321", nome_cliente: "Cleide dos Anjos de Souza" },
			},
		]);
		const deleteDocument = vi.fn(async () => {});
		const upsertMovimentacao = vi.fn(async (movimento) => ({
			id: "mov-1",
			statusMatch: "pendente",
			...movimento,
		}));
		const marcarComoCasada = vi.fn(async (id, patch) => ({
			id,
			statusMatch: "casada",
			...patch,
		}));
		const marcarComoSemMatch = vi.fn();

		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie,
			deleteDocument,
			upsertMovimentacao,
			marcarComoCasada,
			marcarComoSemMatch,
		});

		const job = await service.runScan({ user: { uid: "u1" }, manual: true });
		// runScan dispara o processamento via setImmediate; aguarda o loop de
		// eventos liberar antes de checar o resultado.
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(job.id).toBeTruthy();
		expect(findOrdensAbertasBySerie).toHaveBeenCalledWith("6C4CBCC488B8");
		expect(deleteDocument).toHaveBeenCalledWith("match_os_abertas/321");
		expect(marcarComoCasada).toHaveBeenCalledWith("mov-1", {
			osNumero: "321",
			osCollection: "match_os_abertas",
		});
		expect(marcarComoSemMatch).not.toHaveBeenCalled();
	});

	it("marca como sem match quando nenhuma O.S. aberta tem a mesma serie", async () => {
		const requestSempreRaw = vi.fn(async () => ({
			data: [noteDevolucaoComodato()],
			meta: { totalPages: 1 },
		}));
		const findOrdensAbertasBySerie = vi.fn(async () => []);
		const deleteDocument = vi.fn(async () => {});
		const upsertMovimentacao = vi.fn(async (movimento) => ({
			id: "mov-2",
			statusMatch: "pendente",
			...movimento,
		}));
		const marcarComoCasada = vi.fn();
		const marcarComoSemMatch = vi.fn(async (id) => ({ id, statusMatch: "sem_match" }));

		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie,
			deleteDocument,
			upsertMovimentacao,
			marcarComoCasada,
			marcarComoSemMatch,
		});

		await service.runScan({ user: { uid: "u1" }, manual: true });
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(deleteDocument).not.toHaveBeenCalled();
		expect(marcarComoCasada).not.toHaveBeenCalled();
		expect(marcarComoSemMatch).toHaveBeenCalledWith("mov-2");
	});

	it("nao casa quando a serie bate mas o cliente da O.S. e diferente do parceiro da devolucao", async () => {
		const requestSempreRaw = vi.fn(async () => ({
			data: [noteDevolucaoComodato({ parceiro: "Outro Cliente Qualquer" })],
			meta: { totalPages: 1 },
		}));
		const findOrdensAbertasBySerie = vi.fn(async () => [
			{
				path: "ordens_abertas/999",
				collectionPath: "ordens_abertas",
				data: { num_os: "999", nome_cliente: "Cleide dos Anjos de Souza" },
			},
		]);
		const deleteDocument = vi.fn(async () => {});
		const upsertMovimentacao = vi.fn(async (movimento) => ({
			id: "mov-3",
			statusMatch: "pendente",
			...movimento,
		}));
		const marcarComoCasada = vi.fn();
		const marcarComoSemMatch = vi.fn(async (id) => ({ id, statusMatch: "sem_match" }));

		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie,
			deleteDocument,
			upsertMovimentacao,
			marcarComoCasada,
			marcarComoSemMatch,
		});

		await service.runScan({ user: { uid: "u1" }, manual: true });
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(deleteDocument).not.toHaveBeenCalled();
		expect(marcarComoSemMatch).toHaveBeenCalledWith("mov-3");
	});

	it("ignora notas que nao sao Devolucao de comodato", async () => {
		const outraNota = noteDevolucaoComodato();
		outraNota.tipo_operacao = { descricao: "Saída para instalação" };
		const requestSempreRaw = vi.fn(async () => ({
			data: [outraNota],
			meta: { totalPages: 1 },
		}));
		const upsertMovimentacao = vi.fn();
		const findOrdensAbertasBySerie = vi.fn();

		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie,
			deleteDocument: vi.fn(),
			upsertMovimentacao,
			marcarComoCasada: vi.fn(),
			marcarComoSemMatch: vi.fn(),
		});

		await service.runScan({ user: { uid: "u1" }, manual: true });
		await new Promise((resolve) => setImmediate(resolve));

		expect(upsertMovimentacao).not.toHaveBeenCalled();
		expect(findOrdensAbertasBySerie).not.toHaveBeenCalled();
	});

	it("ignora Devolucao de comodato cuja Operacao na observacao nao e Retirada", async () => {
		const notaEntrada = noteDevolucaoComodato();
		notaEntrada.observacao =
			"Operacao: Entrada | Origem: Estoque | movimento_estoque_id: 2369047";
		const requestSempreRaw = vi.fn(async () => ({
			data: [notaEntrada],
			meta: { totalPages: 1 },
		}));
		const upsertMovimentacao = vi.fn();
		const findOrdensAbertasBySerie = vi.fn();

		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie,
			deleteDocument: vi.fn(),
			upsertMovimentacao,
			marcarComoCasada: vi.fn(),
			marcarComoSemMatch: vi.fn(),
		});

		await service.runScan({ user: { uid: "u1" }, manual: true });
		await new Promise((resolve) => setImmediate(resolve));

		expect(upsertMovimentacao).not.toHaveBeenCalled();
		expect(findOrdensAbertasBySerie).not.toHaveBeenCalled();
	});

	it("ignora item cujo produto nao e ONT/ONU, roteador ou camera de video (insumo/conector)", async () => {
		const notaComInsumo = noteDevolucaoComodato();
		notaComInsumo.itens = [
			{ serie: "AA11BB22CC33", produto: { descricao: "Conector RJ45", codigo: "X1" } },
		];
		const requestSempreRaw = vi.fn(async () => ({
			data: [notaComInsumo],
			meta: { totalPages: 1 },
		}));
		const upsertMovimentacao = vi.fn();
		const findOrdensAbertasBySerie = vi.fn();

		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie,
			deleteDocument: vi.fn(),
			upsertMovimentacao,
			marcarComoCasada: vi.fn(),
			marcarComoSemMatch: vi.fn(),
		});

		await service.runScan({ user: { uid: "u1" }, manual: true });
		await new Promise((resolve) => setImmediate(resolve));

		expect(upsertMovimentacao).not.toHaveBeenCalled();
		expect(findOrdensAbertasBySerie).not.toHaveBeenCalled();
	});

	it("usa a janela de datas informada (varredura do ano todo) em vez das ultimas 24h", async () => {
		const requestSempreRaw = vi.fn(async () => ({ data: [], meta: { totalPages: 1 } }));
		const service = loadService({
			requestSempreRaw,
			findOrdensAbertasBySerie: vi.fn(),
			deleteDocument: vi.fn(),
			upsertMovimentacao: vi.fn(),
			marcarComoCasada: vi.fn(),
			marcarComoSemMatch: vi.fn(),
		});

		await service.runScan({
			user: { uid: "u1" },
			manual: true,
			dataInicio: "2026-01-01T00:00:00.000Z",
			dataFim: "2026-08-30T00:00:00.000Z",
		});
		await new Promise((resolve) => setImmediate(resolve));

		const url = requestSempreRaw.mock.calls[0][0];
		expect(url).toContain("filter.emitido_em=%24gte%3A2026-01-01T00%3A00%3A00.000Z");
		expect(url).toContain("filter.emitido_em=%24lte%3A2026-08-30T00%3A00%3A00.000Z");
	});
});

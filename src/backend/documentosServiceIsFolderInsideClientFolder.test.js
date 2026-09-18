import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const apiDir = path.join(process.cwd(), "vps/api/src");
const modulePath = require.resolve(
	path.join(apiDir, "documentos/services/documentosService.js"),
);
const documentsPath = require.resolve(path.join(apiDir, "documents.js"));
const regionaisRepositoryPath = require.resolve(
	path.join(apiDir, "regionaisRepository.js"),
);
const emailServicePath = require.resolve(path.join(apiDir, "emailService.js"));
const notificationsServicePath = require.resolve(
	path.join(apiDir, "notificationsService.js"),
);
const documentosRepositoryPath = require.resolve(
	path.join(apiDir, "documentos/repositories/documentosRepository.js"),
);
const drivePath = require.resolve(
	path.join(apiDir, "documentos/services/googleDriveService.js"),
);

function clearModules() {
	for (const p of [
		modulePath,
		documentsPath,
		regionaisRepositoryPath,
		emailServicePath,
		notificationsServicePath,
		documentosRepositoryPath,
		drivePath,
	]) {
		delete require.cache[p];
	}
}

function setMock(mockPath, exports) {
	require.cache[mockPath] = {
		id: mockPath,
		filename: mockPath,
		loaded: true,
		exports,
	};
}

function loadService({
	getFileMetadata,
	repositoryOverrides,
	emailServiceOverrides,
} = {}) {
	clearModules();
	setMock(documentsPath, {});
	setMock(regionaisRepositoryPath, {});
	setMock(emailServicePath, {
		getConfig: vi.fn(async () => ({})),
		sendMail: vi.fn(async () => ({ ok: true })),
		createEmailTemplate: vi.fn(() => "<html></html>"),
		...emailServiceOverrides,
	});
	setMock(notificationsServicePath, {});
	setMock(documentosRepositoryPath, {
		getBillingLog: vi.fn(async () => null),
		getLatestSubmissionByEmpresaMes: vi.fn(async () => null),
		listSubmissionFiles: vi.fn(async () => []),
		recordBillingLog: vi.fn(async () => ({})),
		...repositoryOverrides,
	});
	setMock(drivePath, { getFileMetadata: getFileMetadata || vi.fn() });
	return require(modulePath);
}

// achado javascript:S3776 (docs/SONARQUBE-MAP.md): isFolderInsideClientFolder
// e o controle de acesso que impede um usuario navegar pra fora da pasta
// do cliente no Drive (path traversal). Sem cobertura nenhuma antes desta
// sessao — testes escritos ANTES do refactor de complexidade pra travar o
// comportamento de seguranca real.
describe("documentosService isFolderInsideClientFolder", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	it("retorna false quando falta folderId ou clientFolderId", async () => {
		const { isFolderInsideClientFolder } = loadService();
		expect(
			await isFolderInsideClientFolder({ folderId: "", clientFolderId: "root" }),
		).toBe(false);
		expect(
			await isFolderInsideClientFolder({ folderId: "abc", clientFolderId: "" }),
		).toBe(false);
	});

	it("retorna true quando o folder e o proprio folder raiz do cliente", async () => {
		const { isFolderInsideClientFolder } = loadService();
		expect(
			await isFolderInsideClientFolder({
				folderId: "root123",
				clientFolderId: "root123",
			}),
		).toBe(true);
	});

	it("retorna true quando o folder e filho direto do folder raiz", async () => {
		const getFileMetadata = vi.fn(async (id) => {
			if (id === "child1") return { parents: ["root123"] };
			return { parents: [] };
		});
		const { isFolderInsideClientFolder } = loadService({ getFileMetadata });
		const result = await isFolderInsideClientFolder({
			folderId: "child1",
			clientFolderId: "root123",
		});
		expect(result).toBe(true);
		expect(getFileMetadata).toHaveBeenCalledWith("child1", "id,parents");
	});

	it("retorna true quando o folder e neto (2 niveis) do folder raiz", async () => {
		const getFileMetadata = vi.fn(async (id) => {
			if (id === "grandchild") return { parents: ["child1"] };
			if (id === "child1") return { parents: ["root123"] };
			return { parents: [] };
		});
		const { isFolderInsideClientFolder } = loadService({ getFileMetadata });
		const result = await isFolderInsideClientFolder({
			folderId: "grandchild",
			clientFolderId: "root123",
		});
		expect(result).toBe(true);
	});

	it("retorna false quando o folder esta fora da arvore do cliente (raiz diferente)", async () => {
		const getFileMetadata = vi.fn(async (id) => {
			if (id === "outroFolder") return { parents: ["outraRaiz"] };
			if (id === "outraRaiz") return { parents: [] };
			return { parents: [] };
		});
		const { isFolderInsideClientFolder } = loadService({ getFileMetadata });
		const result = await isFolderInsideClientFolder({
			folderId: "outroFolder",
			clientFolderId: "root123",
		});
		expect(result).toBe(false);
	});

	it("ignora erro do Drive numa etapa da cadeia e continua tentando outros ramos", async () => {
		const getFileMetadata = vi.fn(async (id) => {
			if (id === "comErro") throw new Error("Drive API falhou");
			if (id === "child1") return { parents: ["root123"] };
			return { parents: [] };
		});
		const { isFolderInsideClientFolder } = loadService({ getFileMetadata });
		// Simula duas cadeias de parentesco distintas passadas como
		// currentIds iniciais nao e possivel diretamente (funcao so aceita
		// um folderId), entao testamos que uma falha isolada nao quebra a
		// funcao inteira quando o proprio folderId inicial falha.
		const result = await isFolderInsideClientFolder({
			folderId: "comErro",
			clientFolderId: "root123",
		});
		expect(result).toBe(false);
	});
});

// achado javascript:S3776 (docs/SONARQUBE-MAP.md): processBillingForEmpresa
// foi extraida do loop de runBillingNotifications. Testes escritos ANTES
// do refactor de complexidade pra travar o comportamento (skip por falta
// de e-mail, skip por log ja existente, skip sem pendencia, envio real,
// erro capturado).
describe("documentosService processBillingForEmpresa", () => {
	afterEach(() => {
		clearModules();
		vi.restoreAllMocks();
	});

	const baseArgs = () => ({
		month: "2026-09",
		stamp: "20260907",
		force: false,
		config: { emailSubject: "Assunto" },
		fields: [{ id: "f1", nome: "Contrato", obrigatorio: true }],
	});

	it("retorna skip quando a empresa nao tem e-mail do responsavel", async () => {
		const { processBillingForEmpresa } = loadService();
		const result = await processBillingForEmpresa(
			{ documentId: "emp1", data: { nome: "Empresa 1" } },
			baseArgs(),
		);
		expect(result).toBe("skip");
	});

	it("retorna skip quando ja existe log de cobranca e force e false", async () => {
		const { processBillingForEmpresa } = loadService({
			repositoryOverrides: {
				getBillingLog: vi.fn(async () => ({ id: "log1" })),
			},
		});
		const result = await processBillingForEmpresa(
			{
				documentId: "emp1",
				data: { nome: "Empresa 1", email: "resp@empresa.com" },
			},
			baseArgs(),
		);
		expect(result).toBe("skip");
	});

	it("retorna skip quando nao ha campo pendente", async () => {
		const { processBillingForEmpresa } = loadService({
			repositoryOverrides: {
				getLatestSubmissionByEmpresaMes: vi.fn(async () => ({ id: "sub1" })),
				listSubmissionFiles: vi.fn(async () => [
					{ fieldId: "f1", status: "aprovado", isDocument: true },
				]),
			},
		});
		const result = await processBillingForEmpresa(
			{
				documentId: "emp1",
				data: { nome: "Empresa 1", email: "resp@empresa.com" },
			},
			baseArgs(),
		);
		expect(result).toBe("skip");
	});

	it("envia o lembrete e registra o log quando ha pendencia", async () => {
		const recordBillingLog = vi.fn(async () => ({}));
		const sendMail = vi.fn(async () => ({ ok: true }));
		const { processBillingForEmpresa } = loadService({
			repositoryOverrides: { recordBillingLog },
			emailServiceOverrides: { sendMail },
		});
		const result = await processBillingForEmpresa(
			{
				documentId: "emp1",
				data: { nome: "Empresa 1", email: "resp@empresa.com" },
			},
			baseArgs(),
		);
		expect(result).toBe("sent");
		expect(sendMail).toHaveBeenCalledTimes(1);
		expect(recordBillingLog).toHaveBeenCalledTimes(1);
	});

	// Nota: sendDocumentEmail (chamada interna) ja engole falha de sendMail
	// com .catch(() => null) antes de devolver — isso e comportamento
	// PRE-EXISTENTE (nao mudou com o refactor de complexidade), entao o
	// try/catch de processBillingForEmpresa so e alcancado por uma falha
	// em recordBillingLog, nao no envio do e-mail em si.
	it("captura erro do recordBillingLog e devolve { error } em vez de propagar", async () => {
		const { processBillingForEmpresa } = loadService({
			repositoryOverrides: {
				recordBillingLog: vi.fn(async () => {
					throw new Error("Falha ao gravar log de cobranca");
				}),
			},
		});
		const result = await processBillingForEmpresa(
			{
				documentId: "emp1",
				data: { nome: "Empresa 1", email: "resp@empresa.com" },
			},
			baseArgs(),
		);
		expect(result).toEqual({
			error: { empresaId: "emp1", error: expect.any(String) },
		});
	});
});

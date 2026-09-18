// Testes de assinatura real de arquivo (magic bytes) pra upload de imóveis
// (Fase H — docs/TECHNICAL-AUDIT.md, achado #19): MIME/extensão sozinhos
// são só o que o cliente afirma (spoofável) — agora o conteúdo real
// também é conferido, mesmo padrão já usado em avatar/documentos.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const apiDir = path.join(process.cwd(), "vps/api/src");
const routerPath = require.resolve(path.join(apiDir, "imoveis.js"));
const repositoryPath = require.resolve(path.join(apiDir, "imoveisRepository.js"));
const drivePath = require.resolve(
	path.join(apiDir, "documentos/services/googleDriveService.js"),
);

// imoveis.js requer imoveisRepository.js e googleDriveService.js no topo —
// o segundo puxa (transitivamente) documentosRepository.js -> db.js, que
// lanca erro sincrono sem env var de conexao. Mockamos os dois (mesmo
// padrao ja usado em src/backend/imoveisRoutes.test.js) so pra poder
// requerer o modulo e testar a funcao pura de assinatura de arquivo.
require.cache[repositoryPath] = { id: repositoryPath, filename: repositoryPath, loaded: true, exports: {} };
require.cache[drivePath] = { id: drivePath, filename: drivePath, loaded: true, exports: {} };
const { isAllowedImovelFileBuffer } = require(routerPath);

function bufferFrom(bytes) {
	return { buffer: Buffer.from(bytes) };
}

describe("imoveis — isAllowedImovelFileBuffer", () => {
	it("aceita PDF real (assinatura %PDF-)", () => {
		expect(isAllowedImovelFileBuffer({ buffer: Buffer.from("%PDF-1.4\n...") })).toBe(true);
	});

	it("aceita PNG real", () => {
		expect(isAllowedImovelFileBuffer(bufferFrom([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(true);
	});

	it("aceita JPEG real", () => {
		expect(isAllowedImovelFileBuffer(bufferFrom([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
	});

	it("aceita MP4/MOV real (caixa ftyp)", () => {
		// bytes 0-3 = tamanho da caixa (arbitrario), 4-7 = "ftyp"
		expect(
			isAllowedImovelFileBuffer(
				bufferFrom([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
			),
		).toBe(true);
	});

	it("aceita WEBM real (cabeçalho EBML)", () => {
		expect(isAllowedImovelFileBuffer(bufferFrom([0x1a, 0x45, 0xdf, 0xa3]))).toBe(true);
	});

	it("aceita XLSX real (zip: PK\\x03\\x04)", () => {
		expect(isAllowedImovelFileBuffer(bufferFrom([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
	});

	it("aceita XLS legado real (assinatura OLE2)", () => {
		expect(
			isAllowedImovelFileBuffer(
				bufferFrom([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
			),
		).toBe(true);
	});

	it("rejeita arquivo com extensão/MIME de PDF mas conteúdo diferente (spoofado)", () => {
		expect(isAllowedImovelFileBuffer({ buffer: Buffer.from("<html>nao e um pdf</html>") })).toBe(
			false,
		);
	});

	it("rejeita buffer vazio/ausente", () => {
		expect(isAllowedImovelFileBuffer({ buffer: Buffer.alloc(0) })).toBe(false);
		expect(isAllowedImovelFileBuffer({})).toBe(false);
		expect(isAllowedImovelFileBuffer(undefined)).toBe(false);
	});

	it("rejeita um executável renomeado pra .pdf (assinatura MZ)", () => {
		expect(isAllowedImovelFileBuffer(bufferFrom([0x4d, 0x5a, 0x90, 0x00]))).toBe(false);
	});
});

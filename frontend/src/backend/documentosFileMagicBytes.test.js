import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const apiDir = path.join(process.cwd(), "vps/api/src");
const routerPath = require.resolve(
	path.join(apiDir, "documentos/routes/documentosRoutes.js"),
);
const controllerPath = require.resolve(
	path.join(apiDir, "documentos/controllers/documentosController.js"),
);

require.cache[controllerPath] = {
	id: controllerPath,
	filename: controllerPath,
	loaded: true,
	exports: {},
};

const { isAllowedDocumentBuffer } = require(routerPath);

function file(bytes) {
	return { buffer: Buffer.from(bytes) };
}

describe("documentos — isAllowedDocumentBuffer", () => {
	it("aceita PDF, PNG e JPEG por assinatura real", () => {
		expect(isAllowedDocumentBuffer({ buffer: Buffer.from("%PDF-1.7\n") })).toBe(
			true,
		);
		expect(isAllowedDocumentBuffer(file([0x89, 0x50, 0x4e, 0x47]))).toBe(
			true,
		);
		expect(isAllowedDocumentBuffer(file([0xff, 0xd8, 0xff, 0xe0]))).toBe(
			true,
		);
	});

	it("rejeita executavel ou HTML renomeado como PDF", () => {
		expect(isAllowedDocumentBuffer(file([0x4d, 0x5a, 0x90, 0x00]))).toBe(
			false,
		);
		expect(
			isAllowedDocumentBuffer({
				buffer: Buffer.from("<script>alert('xss')</script>"),
			}),
		).toBe(false);
	});

	it("rejeita buffer vazio ou ausente", () => {
		expect(isAllowedDocumentBuffer({ buffer: Buffer.alloc(0) })).toBe(false);
		expect(isAllowedDocumentBuffer({})).toBe(false);
		expect(isAllowedDocumentBuffer(undefined)).toBe(false);
	});
});

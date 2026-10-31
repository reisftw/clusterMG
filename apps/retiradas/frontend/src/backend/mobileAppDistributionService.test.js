import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(path.join(process.cwd(), "apps/retiradas/backend/package.json"));

process.env.PGHOST ||= "127.0.0.1";
process.env.PGUSER ||= "test";
process.env.PGPASSWORD ||= "test";
process.env.PGDATABASE ||= "test";

const mobileApp = require(
	path.join(process.cwd(), "apps/retiradas/backend/api/src/mobileAppDistributionService.js"),
);

describe("Distribuicao do aplicativo Android", () => {
	it("aceita versoes rastreaveis e bloqueia nomes inseguros", () => {
		expect(mobileApp.normalizeVersionName("1.2.0-prod")).toBe("1.2.0-prod");
		expect(() => mobileApp.normalizeVersionName("../../app")).toThrow(/versao valida/);
	});

	it("valida o codigo numerico da versao", () => {
		expect(mobileApp.normalizeVersionCode("3")).toBe(3);
		expect(mobileApp.normalizeVersionCode("")).toBeNull();
		expect(() => mobileApp.normalizeVersionCode("3.2")).toThrow(/inteiro positivo/);
	});

	it("mantem pacote e certificado iguais no TWA e no Digital Asset Links", () => {
		const manifest = JSON.parse(
			fs.readFileSync("apps/retiradas/android-twa/twa-manifest.json", "utf8"),
		);
		const assetLinks = JSON.parse(
			fs.readFileSync(
				"apps/retiradas/frontend/public/.well-known/assetlinks.json",
				"utf8",
			),
		);
		expect(assetLinks[0].target.package_name).toBe(manifest.packageId);
		expect(assetLinks[0].target.sha256_cert_fingerprints).toContain(
			manifest.fingerprints[0].value,
		);
	});
});

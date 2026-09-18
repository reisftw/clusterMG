import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readConfig(relativePath) {
	return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("nginx CSP configs", () => {
	it("does not allow broad inline styles in style-src", () => {
		for (const configPath of ["apps/rot/ops/nginx-rot.conf.example", "vps/nginx/retiradas.conf"]) {
			const config = readConfig(configPath);

			expect(config).not.toContain("style-src 'self' 'unsafe-inline'");
			expect(config).toContain("style-src-attr 'unsafe-inline'");
			expect(config).toContain("object-src 'none'");
		}
	});
});

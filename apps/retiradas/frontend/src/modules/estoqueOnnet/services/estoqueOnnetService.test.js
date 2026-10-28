import { describe, expect, it } from "vitest";
import {
	formatOnnetMac,
	inferOnnetManufacturer,
	normalizeOnnetMac,
} from "./estoqueOnnetService";

describe("estoqueOnnetService", () => {
	it("aceita identificador Onnet alfanumerico com 12 caracteres", () => {
		expect(normalizeOnnetMac("fhtt99f06b30")).toBe("FHTT99F06B30");
		expect(formatOnnetMac("fhtt99f06b30")).toBe("FHTT99F06B30");
	});

	it("mantem a formatacao de MAC hexadecimal convencional", () => {
		expect(formatOnnetMac("a8-32-9a-00-00-00")).toBe("A8:32:9A:00:00:00");
		expect(inferOnnetManufacturer("a8329a000000")).toBe("FiberHome");
	});
});

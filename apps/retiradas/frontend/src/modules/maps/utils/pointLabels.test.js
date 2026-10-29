import { describe, expect, it } from "vitest";
import { formatMapClientLabel } from "./pointLabels";

describe("formatMapClientLabel", () => {
	it("exibe o codigo antes do nome do cliente", () => {
		expect(formatMapClientLabel({ clientCode: "586377", clientName: "Fabiana Cruz" }))
			.toBe("(586377) Fabiana Cruz");
	});

	it("mantem o nome quando o codigo nao esta disponivel", () => {
		expect(formatMapClientLabel({ clientName: "Fabiana Cruz" })).toBe("Fabiana Cruz");
	});
});

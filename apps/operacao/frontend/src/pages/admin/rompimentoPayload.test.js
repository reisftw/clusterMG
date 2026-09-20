import { describe, expect, it } from "vitest";
import { buildRompimentoPayload } from "./rompimentoPayload";

const baseInput = {
	regionalId: "regional-1",
	ticketNumber: "  TCK-123  ",
	nextStatus: "em_tratativa",
	cidade: "Belo Horizonte",
	pontoALat: "",
	pontoALng: "",
	pontoB: null,
	materiais: {},
	outros: "",
	fibraTipo: "",
	fibraMetros: "",
};

describe("buildRompimentoPayload", () => {
	it("monta o payload basico e aparea o ticketNumber", () => {
		const payload = buildRompimentoPayload(baseInput);

		expect(payload).toMatchObject({
			regionalId: "regional-1",
			ticketNumber: "TCK-123",
			status: "em_tratativa",
			clienteNome: "",
			cidade: "Belo Horizonte",
			pontoA: null,
			pontoB: null,
			materiais: {},
			outros: "",
			fibraTipo: "",
			fibraMetros: "",
		});
	});

	it("monta pontoA quando lat e lng estao preenchidos (estado com GPS marcado)", () => {
		const payload = buildRompimentoPayload({
			...baseInput,
			pontoALat: "-19.9",
			pontoALng: "-43.9",
		});

		expect(payload.pontoA).toEqual({ lat: -19.9, lng: -43.9 });
	});

	it("mantem pontoA nulo quando so um dos dois (lat/lng) esta preenchido", () => {
		expect(buildRompimentoPayload({ ...baseInput, pontoALat: "-19.9", pontoALng: "" }).pontoA).toBeNull();
		expect(buildRompimentoPayload({ ...baseInput, pontoALat: "", pontoALng: "-43.9" }).pontoA).toBeNull();
	});

	it("preserva pontoB, materiais e dados de fibra tal como recebidos (estado com imagens/materiais)", () => {
		const pontoB = { lat: -19.91, lng: -43.91 };
		const materiais = { CEO: 2, CTO: 1 };
		const payload = buildRompimentoPayload({
			...baseInput,
			pontoB,
			materiais,
			outros: "cabo extra",
			fibraTipo: "AS80 12FO",
			fibraMetros: "150",
		});

		expect(payload.pontoB).toBe(pontoB);
		expect(payload.materiais).toBe(materiais);
		expect(payload.outros).toBe("cabo extra");
		expect(payload.fibraTipo).toBe("AS80 12FO");
		expect(payload.fibraMetros).toBe("150");
	});

	it("monta o payload de finalizacao (status concluido) com os mesmos campos", () => {
		const payload = buildRompimentoPayload({ ...baseInput, nextStatus: "concluido" });
		expect(payload.status).toBe("concluido");
	});
});

import { describe, expect, it } from "vitest";
import {
	periodBounds,
	summarize,
} from "./MensageriaRelatoriosPage.jsx";

describe("MensageriaRelatoriosPage summary", () => {
	it("filtra respostas e agendamentos pelo periodo selecionado", () => {
		const data = {
			historico: [
				{
					id: "hist-set",
					status: "enviado",
					telefone: "5531999990000",
					codigo_cliente: "100",
					cidade: "Contagem",
					criadoEm: "2026-09-01T10:00:00.000Z",
				},
				{
					id: "hist-ago",
					status: "enviado",
					telefone: "5531888880000",
					codigo_cliente: "200",
					cidade: "Betim",
					criadoEm: "2026-08-20T10:00:00.000Z",
				},
			],
			callbacks: [
				{
					id: "cb-set-1",
					telefone: "5531999990000",
					codigo_cliente: "100",
					cidade: "Contagem",
					recebidoEm: "2026-09-01T11:00:00.000Z",
				},
				{
					id: "cb-set-2",
					telefone: "5531999990000",
					codigo_cliente: "100",
					cidade: "Contagem",
					recebidoEm: "2026-09-01T11:05:00.000Z",
				},
				{
					id: "cb-ago",
					telefone: "5531888880000",
					codigo_cliente: "200",
					cidade: "Betim",
					recebidoEm: "2026-08-20T11:00:00.000Z",
				},
			],
			agendamentos: [
				{
					id: "ag-set",
					telefone: "5531999990000",
					codigo_cliente: "100",
					cidade: "Contagem",
					data: "2026-09-01",
					status: "agendado",
				},
				{
					id: "ag-ago",
					telefone: "5531888880000",
					codigo_cliente: "200",
					cidade: "Betim",
					data: "2026-08-20",
					status: "agendado",
				},
			],
		};

		const summary = summarize(data, periodBounds("month", 8, "2", 2026));

		expect(summary.totalMessages).toBe(1);
		expect(summary.responses).toBe(1);
		expect(summary.scheduled).toBe(1);
		expect(summary.responseRate).toBe(100);
		expect(summary.scheduleRate).toBe(100);
		expect(summary.byCity).toEqual([
			expect.objectContaining({
				cidade: "Contagem",
				enviados: 1,
				respostas: 2,
				agendados: 1,
			}),
		]);
	});
});

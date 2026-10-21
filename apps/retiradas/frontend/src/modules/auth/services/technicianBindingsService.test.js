import { describe, expect, it } from "vitest";
import {
	collectAppointmentTechnicianNames,
	collectMetasTechnicianNames,
} from "./technicianBindingsService";

describe("technicianBindingsService", () => {
	it("lista nomes únicos das bases de metas", () => {
		const result = collectMetasTechnicianNames({
			Outubro: {
				technicians: [{ name: "ANA SILVA" }, { name: "BRUNO LIMA" }],
				onnet: { technicians: [{ name: "ANA SILVA" }] },
			},
		});
		expect(result).toEqual(["ANA SILVA", "BRUNO LIMA"]);
	});

	it("lista nomes únicos usados nos agendamentos", () => {
		expect(
			collectAppointmentTechnicianNames([
				{ tecnico_nome: "Carlos Souza" },
				{ tecnicoNome: "Carlos Souza" },
				{ tecnico: "Débora Alves" },
			]),
		).toEqual(["Carlos Souza", "Débora Alves"]);
	});
});

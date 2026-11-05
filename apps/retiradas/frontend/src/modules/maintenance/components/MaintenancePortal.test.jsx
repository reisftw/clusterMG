import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthlyVisitsChart, SystemTopology } from "./MaintenancePortal";

describe("SystemTopology", () => {
	it("representa usuarios reais e abre os detalhes do servico selecionado", () => {
		const { container } = render(
			<SystemTopology
				dashboard={{
					presence: { online_users: 3 },
					status: {
						summary: { offline: 0 },
						services: [
							{ id: "api", name: "API principal", status: "online", details: { responseMs: 18 } },
						],
					},
				}}
			/>,
		);

		expect(container.querySelectorAll(".maintenance-user-cloud i")).toHaveLength(3);
		expect(screen.getByText("Fluxo estavel")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /API principal/i }));
		expect(screen.getByText("SERVICO SELECIONADO")).toBeInTheDocument();
		expect(screen.getByText("Resposta em 18 ms")).toBeInTheDocument();
	});
});

describe("MonthlyVisitsChart", () => {
	it("mostra visitas e dispositivos consolidados por mes", () => {
		render(
			<MonthlyVisitsChart
				items={[{ month: "2026-11", visits: 1234, unique_visitors: 87 }]}
			/>,
		);

		expect(screen.getByText("1.234")).toBeInTheDocument();
		expect(screen.getByText("87 dispositivo(s)")).toBeInTheDocument();
		expect(screen.getByText("nov. de 26")).toBeInTheDocument();
	});
});

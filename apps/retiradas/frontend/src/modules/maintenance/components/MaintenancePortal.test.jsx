import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SystemTopology } from "./MaintenancePortal";

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

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DashboardHighlights,
	MapUpdateNotice,
	OperationalRotation,
} from "./OperationalPanels";

describe("operational panel timing", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	it("alternates every minute and restarts the timer after a manual change", () => {
		render(<OperationalRotation><div>Dia</div><div>Semana</div></OperationalRotation>);
		expect(screen.getByText("Dia")).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(60000));
		expect(screen.getByText("Semana")).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(30000));
		fireEvent.click(screen.getByRole("button", { name: "Indicador 1" }));
		act(() => vi.advanceTimersByTime(30000));
		expect(screen.getByText("Dia")).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(30000));
		expect(screen.getByText("Semana")).toBeInTheDocument();
	});
	it("closes the map notice after exactly 20 seconds and supports closing manually", () => {
		const onClose = vi.fn();
		const update = { id: "fixture", detectedAt: "2026-09-27T12:00:00Z", addedCount: 3, executedCount: 1, otherRemovedCount: 1, currentTotal: 11, previousTotal: 10 };
		render(<MapUpdateNotice update={update} onClose={onClose} />);
		act(() => vi.advanceTimersByTime(19999));
		expect(onClose).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(1));
		expect(onClose).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "Fechar atualização" }));
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it("shows day highlights with tabs and automatic rotation", () => {
		render(
			<DashboardHighlights
				closedCities={[{ label: "Betim", total: 3 }]}
				openedCities={[{ label: "Patrocínio", total: 12 }]}
				technicians={[{ label: "João Silva", total: 5, type: "FIELD" }]}
			/>,
		);

		expect(screen.getByText("Fechamentos por cidade")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("tab", { name: /Técnicos/i }));
		expect(
			screen.getByText("Técnicos que mais fecharam hoje"),
		).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(10000));
		expect(screen.getByText("Cidades com mais aberturas hoje")).toBeInTheDocument();
	});

	it("mantem Outras cidades no fim dos rankings de fechamentos e aberturas", () => {
		const { container } = render(
			<DashboardHighlights
				closedCities={[
					{ label: "Outras cidades", total: 30 },
					{ label: "Betim", total: 8 },
					{ label: "Igarapé", total: 4 },
				]}
				openedCities={[
					{ label: "Outras cidades", total: 40 },
					{ label: "Uberlândia", total: 12 },
					{ label: "Patrocínio", total: 7 },
				]}
				technicians={[]}
			/>,
		);

		const rankingLabels = () =>
			[...container.querySelectorAll(".acomp-highlight-rank-line strong")].map(
				(element) => element.textContent,
			);

		expect(rankingLabels()).toEqual(["Betim", "Igarapé", "Outras cidades"]);
		fireEvent.click(screen.getByRole("tab", { name: /Aberturas/i }));
		expect(rankingLabels()).toEqual([
			"Uberlândia",
			"Patrocínio",
			"Outras cidades",
		]);
	});

	it("mostra o total real de técnicos e agrupa os demais após os quatro primeiros", () => {
		const technicians = Array.from({ length: 7 }, (_, index) => ({
			id: `tech-${index + 1}`,
			label: `Técnico ${index + 1}`,
			total: 10 - index,
		}));
		const { container } = render(
			<DashboardHighlights
				closedCities={[]}
				openedCities={[]}
				technicians={technicians}
				techniciansTotal={7}
			/>,
		);

		expect(
			container.querySelectorAll(".acomp-highlight-metric strong")[1],
		).toHaveTextContent("7");
		fireEvent.click(screen.getByRole("tab", { name: /Técnicos/i }));
		expect(screen.getByText("Outros técnicos")).toBeInTheDocument();
		expect(screen.getByText("3 técnicos")).toBeInTheDocument();
		expect(
			container.querySelectorAll(".acomp-highlight-rank-row"),
		).toHaveLength(5);
	});
});

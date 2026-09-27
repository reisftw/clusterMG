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
});

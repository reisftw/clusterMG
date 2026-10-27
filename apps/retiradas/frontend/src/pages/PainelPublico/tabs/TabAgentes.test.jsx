import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TabAgentes from "./TabAgentes";

vi.mock("chart.js/auto", () => ({
	Chart: vi.fn(),
}));

describe("TabAgentes", () => {
	it("exibe estado vazio ao selecionar um mes sem dados", () => {
		render(<TabAgentes allData={{}} month="Dezembro" lastUpdate="" />);

		expect(screen.getByText("Sem dados para este mês")).toBeInTheDocument();
		expect(screen.getByText("Aguardando sincronização com a VPS.")).toBeInTheDocument();
	});
});

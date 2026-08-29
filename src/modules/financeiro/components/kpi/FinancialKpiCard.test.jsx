import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FinancialKpiCard from "./FinancialKpiCard";

describe("FinancialKpiCard", () => {
	it("renders a currency KPI with positive trend", () => {
		render(
			<FinancialKpiCard
				item={{
					title: "Receita total",
					value: 1234.56,
					type: "currency",
					trend: { status: "positive", direction: "up", percent: 12.3 },
					trendLabel: "vs. anterior",
					icon: "CircleDollarSign",
					color: "emerald",
				}}
			/>,
		);

		expect(screen.getByText("Receita total")).toBeInTheDocument();
		expect(screen.getByText("R$ 1.234,56")).toBeInTheDocument();
		expect(screen.getByText("↑ 12,3% vs. anterior")).toHaveClass(
			"text-emerald-700",
		);
	});

	it("renders loading and negative trend states", () => {
		render(
			<FinancialKpiCard
				loading
				item={{
					title: "Saldo",
					value: 0,
					type: "currency",
					trend: { status: "negative", direction: "down", percent: 4.5 },
					icon: "Wallet",
				}}
			/>,
		);

		expect(screen.getByText("Saldo")).toBeInTheDocument();
		expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
		expect(screen.getByText("↓ 4,5%")).toHaveClass("text-red-700");
	});

	it("supports compact centered mode and hidden trend", () => {
		const { container } = render(
			<FinancialKpiCard
				compact
				centered
				index={1}
				item={{
					title: "Clientes",
					value: 20,
					type: "number",
					hideTrend: true,
					helper: "Base atual",
					icon: "Users",
					color: "blue",
				}}
			/>,
		);

		expect(screen.getByText("2. Clientes")).toBeInTheDocument();
		expect(screen.getByText("20")).toBeInTheDocument();
		expect(screen.getByText("Base atual")).toBeInTheDocument();
		expect(screen.queryByText("Sem comparativo")).not.toBeInTheDocument();
		expect(container.firstChild).toHaveClass("min-h-[104px]", "flex");
	});
});

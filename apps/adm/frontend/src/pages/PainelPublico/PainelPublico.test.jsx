import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PainelPublico from "./PainelPublico";

const painelMocks = vi.hoisted(() => ({
	retiradas: vi.fn(),
	agentes: vi.fn(),
	mapaOS: vi.fn(),
}));

vi.mock("./hooks/useRetiradas", () => ({
	useRetiradas: painelMocks.retiradas,
}));

vi.mock("./hooks/useAgentes", () => ({
	useAgentes: painelMocks.agentes,
}));

vi.mock("./hooks/useMapaOS", () => ({
	useMapaOS: painelMocks.mapaOS,
}));

vi.mock("../../utils/mes", () => ({
	obterMesAtual: () => "Março",
}));

vi.mock("./components/HeaderPainel", () => ({
	default: ({ month, activeTab, onMonthChange }) => (
		<header>
			<span data-testid="painel-month">{month}</span>
			<span data-testid="painel-tab">{activeTab}</span>
			<button type="button" onClick={() => onMonthChange("Janeiro")}>
				trocar mes
			</button>
		</header>
	),
}));

vi.mock("./tabs/TabRetiradas", () => ({
	default: ({ month, allData, forcaTarefa }) => (
		<section data-testid="tab-retiradas">
			Retiradas {month} {Object.keys(allData).join(",")} {forcaTarefa?.status}
		</section>
	),
}));

vi.mock("./tabs/TabAgentes", () => ({
	default: ({ month, allData }) => (
		<section data-testid="tab-agentes">
			Agentes {month} {Object.keys(allData).join(",")}
		</section>
	),
}));

vi.mock("./tabs/TabMapaOS", () => ({
	default: ({ month, allData }) => (
		<section data-testid="tab-mapa">
			Mapa {month} {Object.keys(allData).join(",")}
		</section>
	),
}));

vi.mock("../../components/ui/RetorninhoLoader", () => ({
	default: ({ title, description }) => (
		<div role="status">
			{title} {description}
		</div>
	),
}));

vi.mock("../../components/layout/MelzFooter", () => ({
	default: () => <footer>Melz Footer</footer>,
}));

function baseHook(overrides = {}) {
	return {
		allData: {},
		loading: false,
		fbStatus: "ok",
		lastUpdate: "2026-08-16T00:00:00.000Z",
		forcaTarefa: null,
		agentesData: {},
		feriadosSet: null,
		...overrides,
	};
}

describe("PainelPublico", () => {
	beforeEach(() => {
		painelMocks.retiradas.mockReturnValue(baseHook());
		painelMocks.agentes.mockReturnValue(baseHook());
		painelMocks.mapaOS.mockReturnValue(baseHook());
	});

	it("renderiza loading enquanto a aba ativa carrega", () => {
		painelMocks.retiradas.mockReturnValue(baseHook({ loading: true }));

		render(<PainelPublico initialTab="retiradas" />);

		expect(screen.getByRole("status")).toHaveTextContent("Carregando dados");
		expect(screen.queryByTestId("tab-retiradas")).not.toBeInTheDocument();
	});

	it("renderiza a aba de retiradas e permite alterar o mes pelo cabecalho", async () => {
		const user = userEvent.setup();
		painelMocks.retiradas.mockReturnValue(
			baseHook({
				allData: {
					Março: { totalOS: 10 },
					Janeiro: { totalOS: 5 },
				},
				forcaTarefa: { status: "ativa" },
			}),
		);

		render(<PainelPublico initialTab="retiradas" />);

		expect(screen.getByTestId("tab-retiradas")).toHaveTextContent(
			"Retiradas Março",
		);

		await user.click(screen.getByRole("button", { name: /trocar mes/i }));

		expect(screen.getByTestId("tab-retiradas")).toHaveTextContent(
			"Retiradas Janeiro",
		);
	});

	it("nao troca para mes antigo quando o mes atual nao possui indicadores", () => {
		painelMocks.retiradas.mockReturnValue(
			baseHook({
				allData: {
					Janeiro: { totalOS: 0 },
					Julho: { totalOS: 15 },
				},
			}),
		);

		render(<PainelPublico initialTab="retiradas" />);

		expect(screen.getByTestId("painel-month")).toHaveTextContent("Março");
		expect(screen.getByTestId("tab-retiradas")).toHaveTextContent(
			"Retiradas Março",
		);
	});

	it("renderiza mapa sem trocar automaticamente o mes", () => {
		painelMocks.mapaOS.mockReturnValue(
			baseHook({
				allData: {
					Agosto: { totalOS: 99 },
				},
			}),
		);

		render(<PainelPublico initialTab="mapa" />);

		expect(screen.getByTestId("painel-tab")).toHaveTextContent("mapa");
		expect(screen.getByTestId("painel-month")).toHaveTextContent("Março");
		expect(screen.getByTestId("tab-mapa")).toHaveTextContent("Mapa Março");
	});
});

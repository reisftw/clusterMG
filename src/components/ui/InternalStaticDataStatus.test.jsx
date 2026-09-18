import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
	getInternalStaticDataMeta: vi.fn(),
}));

vi.mock("../../services/internalStaticDataService", () => ({
	SNAPSHOT_DOMAINS: { DASHBOARD: "dashboard" },
	INTERNAL_STATIC_DATA_UPDATED_EVENT: "internal-static-data-updated",
	getInternalStaticDataMeta: mocks.getInternalStaticDataMeta,
}));

vi.mock("../../services/dataDate", () => ({
	resolveDataDate: vi.fn((value) => (value ? new Date(value) : null)),
}));

async function renderComponent(props = {}) {
	const mod = await import("./InternalStaticDataStatus.jsx");
	const Component = mod.default;
	return render(<Component {...props} />);
}

describe("InternalStaticDataStatus", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("mantem o tom azul quando a tela pode operar com fallback saudavel", async () => {
		mocks.getInternalStaticDataMeta.mockResolvedValue({
			available: false,
			generatedAt: null,
		});

		const { container } = await renderComponent({ fallbackIsHealthy: true });

		await waitFor(() => {
			expect(screen.getByText("Leitura pela VPS")).toBeInTheDocument();
		});

		expect(
			screen.getByText(
				/segue operando normalmente com leitura direta pela API da VPS/i,
			),
		).toBeInTheDocument();
		expect(container.firstChild.className).toContain("bg-blue-50");
	});

	it("mantem o aviso ambar quando o fallback nao deve ser tratado como saudavel", async () => {
		mocks.getInternalStaticDataMeta.mockResolvedValue({
			available: false,
			generatedAt: null,
		});

		const { container } = await renderComponent();

		await waitFor(() => {
			expect(screen.getByText("Leitura pela VPS")).toBeInTheDocument();
		});

		expect(
			screen.getByText(/sem snapshot interno segmentado disponivel agora/i),
		).toBeInTheDocument();
		expect(container.firstChild.className).toContain("bg-amber-50");
	});
});

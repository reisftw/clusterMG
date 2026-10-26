import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MensageriaTurboModal from "./MensageriaTurboModal";

const serviceMocks = vi.hoisted(() => ({
	status: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
}));

vi.mock("../services/mensageriaService", () => ({
	buscarStatusTurboMensageria: serviceMocks.status,
	iniciarTurboMensageria: serviceMocks.start,
	pararTurboMensageria: serviceMocks.stop,
}));

describe("MensageriaTurboModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		serviceMocks.status.mockResolvedValue({
			turbo: { status: "idle", running: false, target: 300, sent: 0 },
		});
		serviceMocks.start.mockResolvedValue({
			turbo: { status: "running", running: true, target: 300, sent: 0 },
		});
		serviceMocks.stop.mockResolvedValue({
			turbo: { status: "stopping", running: true, target: 300, sent: 5 },
		});
	});

	it("explica o lote e inicia o Turbo pelo modal", async () => {
		render(<MensageriaTurboModal open={true} onClose={vi.fn()} />);

		expect(screen.getByText(/até 300 clientes/i)).toBeInTheDocument();
		expect(screen.getByText(/intervalo fixo de 2 segundos/i)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /iniciar 300 envios/i }));

		await waitFor(() => expect(serviceMocks.start).toHaveBeenCalledTimes(1));
		expect(await screen.findByRole("button", { name: /interromper turbo/i })).toBeInTheDocument();
	});

	it("mostra os clientes processados e o progresso", async () => {
		serviceMocks.status.mockResolvedValue({
			turbo: {
				status: "running",
				running: true,
				target: 300,
				sent: 1,
				failed: 0,
				items: [
					{
						id: "fila-1",
						codigoCliente: "12345",
						cliente: "Cliente Teste",
						os: "OS-1",
						outcome: "sent",
						processedAt: "2026-10-26T10:00:00.000Z",
					},
				],
			},
		});

		render(<MensageriaTurboModal open={true} onClose={vi.fn()} />);

		expect(await screen.findByText("12345 - Cliente Teste")).toBeInTheDocument();
		expect(screen.getByText("1 / 300")).toBeInTheDocument();
		expect(screen.getByText("Enviado")).toBeInTheDocument();
	});
});

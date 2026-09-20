import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditarUsuarioModal from "./EditarUsuarioModal";

const mocks = vi.hoisted(() => ({
	atualizarUsuarioAdmin: vi.fn(),
	listarEmpresasAdmin: vi.fn(),
	listarRegionaisAdmin: vi.fn(),
}));
const onClose = vi.fn();
const onSalvo = vi.fn();

vi.mock("../services/authService", () => ({
	atualizarUsuarioAdmin: mocks.atualizarUsuarioAdmin,
	enviarAvatarAdmin: vi.fn(),
	gerarLinkPrimeiroAcessoAdmin: vi.fn(),
	listarEmpresasAdmin: mocks.listarEmpresasAdmin,
	listarRegionaisAdmin: mocks.listarRegionaisAdmin,
}));

vi.mock("../../regionais/hooks/useRegionais", () => ({
	useRegionais: () => ({
		regionais: [{ id: "r1", nome: "Metropolitana" }],
	}),
}));

describe("EditarUsuarioModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.listarRegionaisAdmin.mockResolvedValue([
			{ id: "r1", nome: "Metropolitana" },
		]);
		mocks.listarEmpresasAdmin.mockResolvedValue([]);
	});

	it("salva as alteracoes do usuario", async () => {
		mocks.atualizarUsuarioAdmin.mockResolvedValueOnce();

		render(
			<EditarUsuarioModal
				usuario={{
					id: "u1",
					nome: "Maria",
					email: "maria@empresa.com",
					// "backoffice_retirada" e cargo do sistema Retiradas, nao
					// existe em CARGOS_ADM — usando um cargo real do ADM aqui.
					role: "supervisor_administrativo",
					regional: "",
				}}
				currentUser={{ role: "admin" }}
				onClose={onClose}
				onSalvo={onSalvo}
			/>,
		);

		fireEvent.change(screen.getByPlaceholderText("Digite o nome completo"), {
			target: { value: "Maria Silva" },
		});

		fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

		await waitFor(() =>
			expect(mocks.atualizarUsuarioAdmin).toHaveBeenCalledWith("u1", {
				nome: "Maria Silva",
				email: "maria@empresa.com",
				role: "supervisor_administrativo",
				regional: "",
				empresaId: "",
				empresaNome: "",
				avatarUrl: "",
			}),
		);
		expect(onSalvo).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});
});

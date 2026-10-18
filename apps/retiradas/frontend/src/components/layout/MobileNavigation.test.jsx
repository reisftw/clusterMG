import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MobileBottomNav, MobileMoreSheet } from "./MobileNavigation";

const mocks = vi.hoisted(() => ({
	signOut: vi.fn(),
	toggleTheme: vi.fn(),
	currentUser: {
		nome: "Rodrigo Reis",
		email: "rodrigo@empresa.com",
		role: "admin",
	},
}));

vi.mock("../../context/AuthContext", () => ({
	useAuthContext: () => ({
		currentUser: mocks.currentUser,
		signOut: mocks.signOut,
	}),
}));

vi.mock("../../context/ThemeContext", () => ({
	useTheme: () => ({ isDark: false, toggleTheme: mocks.toggleTheme }),
}));

describe("MobileNavigation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("mantém os cinco atalhos principais da navegação mobile", () => {
		render(
			<MemoryRouter initialEntries={["/"]}>
				<MobileBottomNav onOpenMore={vi.fn()} />
			</MemoryRouter>,
		);

		expect(screen.getByRole("navigation", { name: /navegação principal/i })).toBeTruthy();
		expect(screen.getByText("Início")).toBeTruthy();
		expect(screen.getByText("Minhas OS")).toBeTruthy();
		expect(screen.getByText("Tentativas")).toBeTruthy();
		expect(screen.getByText("Mapa")).toBeTruthy();
		expect(screen.getByText("Mais")).toBeTruthy();
	});

	it("exibe opções administrativas e permite encerrar a sessão", () => {
		render(
			<MemoryRouter>
				<MobileMoreSheet open={true} onClose={vi.fn()} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Gestão e administração")).toBeTruthy();
		expect(screen.getByText("Usuários")).toBeTruthy();
		expect(screen.getByText("Cargos e permissões")).toBeTruthy();
		expect(screen.getByText("Cancelamentos")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Sair" }));
		expect(mocks.signOut).toHaveBeenCalledOnce();
	});
});

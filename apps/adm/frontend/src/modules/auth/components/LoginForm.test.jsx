import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginForm from "./LoginForm";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	login: vi.fn(),
	toggleTheme: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual("react-router-dom");
	return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("../../../context/useAuthContext", () => ({
	useAuthContext: () => ({ login: mocks.login, error: null }),
}));

vi.mock("../../../context/ThemeContext", () => ({
	useTheme: () => ({ isDark: false, toggleTheme: mocks.toggleTheme }),
}));

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("envia login e navega para o dashboard", async () => {
		mocks.login.mockResolvedValueOnce();

		render(
			<MemoryRouter>
				<LoginForm />
			</MemoryRouter>,
		);

		fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
			target: { value: "admin@empresa.com" },
		});
		fireEvent.change(screen.getByPlaceholderText("••••••••"), {
			target: { value: "123456" },
		});
		fireEvent.click(screen.getByRole("button", { name: /entrar no sistema/i }));

		await waitFor(() =>
			expect(mocks.login).toHaveBeenCalledWith(
				"admin@empresa.com",
				"123456",
				"",
			),
		);
		expect(mocks.navigate).toHaveBeenCalled();
	});
});

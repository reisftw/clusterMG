import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TrocarSenhaModal from "./TrocarSenhaModal";

const mocks = vi.hoisted(() => ({
  trocarSenha: vi.fn(),
  atualizarPerfilFirestore: vi.fn(),
  refreshUser: vi.fn(),
}));
const onClose = vi.fn();

vi.mock("../services/authService", () => ({
  trocarSenha: mocks.trocarSenha,
  atualizarPerfilFirestore: mocks.atualizarPerfilFirestore,
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuthContext: () => ({
    currentUser: { id: "u1" },
    refreshUser: mocks.refreshUser,
  }),
}));

describe("TrocarSenhaModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valida confirmacao de senha", async () => {
    render(<TrocarSenhaModal onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("Senha atual"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mínimo 6 caracteres"), {
      target: { value: "abcdef" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repita a nova senha"), {
      target: { value: "xxxxxx" },
    });

    fireEvent.click(screen.getByRole("button", { name: /salvar senha/i }));

    expect(await screen.findByText("As senhas não coincidem.")).toBeInTheDocument();
  });

  it("salva a nova senha com sucesso", async () => {
    mocks.trocarSenha.mockResolvedValueOnce();
    mocks.atualizarPerfilFirestore.mockResolvedValueOnce();
    mocks.refreshUser.mockResolvedValueOnce();

    render(<TrocarSenhaModal onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("Senha atual"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mínimo 6 caracteres"), {
      target: { value: "abcdef" },
    });
    fireEvent.change(screen.getByPlaceholderText("Repita a nova senha"), {
      target: { value: "abcdef" },
    });

    fireEvent.click(screen.getByRole("button", { name: /salvar senha/i }));

    await waitFor(() =>
      expect(mocks.trocarSenha).toHaveBeenCalledWith("123456", "abcdef"),
    );
    expect(mocks.atualizarPerfilFirestore).toHaveBeenCalledWith("u1", {
      trocar_senha: false,
    });
    expect(mocks.refreshUser).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

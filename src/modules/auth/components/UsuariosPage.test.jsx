import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UsuariosPage from "./UsuariosPage";

const mocks = vi.hoisted(() => ({
  getOrLoadCachedValue: vi.fn(),
  invalidateCache: vi.fn(),
  logFirestoreRead: vi.fn(),
  criarUsuario: vi.fn(),
  deletarUsuario: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock("../../../services/firebase", () => ({
  db: { name: "db" },
  functions: { name: "functions" },
}));

vi.mock("../../../services/firestoreCache", () => ({
  getOrLoadCachedValue: mocks.getOrLoadCachedValue,
  invalidateCache: mocks.invalidateCache,
}));

vi.mock("../../../services/firestoreMonitoring", () => ({
  logFirestoreRead: mocks.logFirestoreRead,
}));

vi.mock("../../regionais/hooks/useRegionais", () => ({
  useRegionais: () => ({
    regionais: [{ id: "r1", nome: "Metropolitana" }],
  }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: mocks.httpsCallable,
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock("../../../components/ui/Spinner", () => ({
  default: () => <div>loading...</div>,
}));

vi.mock("./EditarUsuarioModal", () => ({
  default: () => <div>editar modal</div>,
}));

describe("UsuariosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrLoadCachedValue.mockResolvedValue({
      data: [
        {
          id: "1",
          nome: "Admin",
          email: "admin@empresa.com",
          role: "admin",
          regional: "Metropolitana",
        },
      ],
    });
    mocks.criarUsuario.mockResolvedValue({
      data: {
        uid: "novo-uid",
        passwordResetLink: "https://example.com/reset",
      },
    });
    mocks.deletarUsuario.mockResolvedValue({ data: { success: true } });
    mocks.httpsCallable.mockImplementation((instance, name) => {
      if (name === "criarUsuario") return mocks.criarUsuario;
      if (name === "deletarUsuario") return mocks.deletarUsuario;
      throw new Error(`Callable nao mockado: ${name}`);
    });
  });

  it("cria um novo usuario via cloud function e exibe o link de primeiro acesso", async () => {
    render(<UsuariosPage />);

    expect(await screen.findByText("Usuarios")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /novo usuario/i }));

    expect(screen.queryByText(/Senha \*/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Nome completo"), {
      target: { value: "Novo Usuario" },
    });
    fireEvent.change(screen.getByPlaceholderText("email@exemplo.com"), {
      target: { value: "novo@empresa.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /criar usuario/i }));

    await waitFor(() =>
      expect(mocks.criarUsuario).toHaveBeenCalledWith({
        email: "novo@empresa.com",
        nome: "Novo Usuario",
        role: "tecnico",
        regional: "",
      }),
    );

    expect(mocks.invalidateCache).toHaveBeenCalled();
    expect(await screen.findByText("Primeiro acesso gerado")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/reset")).toBeInTheDocument();
  });
});

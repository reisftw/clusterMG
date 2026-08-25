import { act, renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "./useAuth";

const authMocks = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithGoogleCredential: vi.fn(),
  logout: vi.fn(),
  fetchUserProfile: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
}));

vi.mock("../services/authService", () => ({
  loginWithEmail: authMocks.loginWithEmail,
  loginWithGoogleCredential: authMocks.loginWithGoogleCredential,
  logout: authMocks.logout,
  fetchUserProfile: authMocks.fetchUserProfile,
  subscribeToAuthChanges: authMocks.subscribeToAuthChanges,
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.loginWithEmail.mockResolvedValue({
      user: { uid: "user-1" },
    });
    authMocks.loginWithGoogleCredential.mockResolvedValue({
      user: { uid: "user-1" },
    });
  });

  it("carrega o perfil do usuario autenticado", async () => {
    authMocks.subscribeToAuthChanges.mockImplementation((callback) => {
      callback({ uid: "user-1" });
      return () => {};
    });
    authMocks.fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nome: "Maria",
      trocar_senha: true,
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentUser?.nome).toBe("Maria");
    expect(result.current.trocarSenhaObrigatorio).toBe(true);
  });

  it("executa login e logout", async () => {
    authMocks.subscribeToAuthChanges.mockImplementation(() => () => {});
    authMocks.fetchUserProfile.mockResolvedValue({
      id: "user-1",
      trocar_senha: false,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login("a@b.com", "123456");
    });
    expect(authMocks.loginWithEmail).toHaveBeenCalledWith("a@b.com", "123456", "");

    await act(async () => {
      await result.current.signOut();
    });
    expect(authMocks.logout).toHaveBeenCalled();
    expect(result.current.currentUser).toBeNull();
  });

  it("define erro amigavel quando o login falha", async () => {
    authMocks.subscribeToAuthChanges.mockImplementation(() => () => {});
    authMocks.loginWithEmail.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() => useAuth());
    let capturedError;

    await act(async () => {
      try {
        await result.current.login("a@b.com", "errada");
      } catch (error) {
        capturedError = error;
      }
    });

    expect(capturedError?.message).toBe("fail");
    expect(result.current.error).toBe("fail");
  });

  it("executa login com Google", async () => {
    authMocks.subscribeToAuthChanges.mockImplementation(() => () => {});
    authMocks.fetchUserProfile.mockResolvedValue({
      id: "user-1",
      trocar_senha: false,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.loginWithGoogle("google-token");
    });

    expect(authMocks.loginWithGoogleCredential).toHaveBeenCalledWith(
      "google-token",
      "",
    );
    expect(result.current.currentUser?.id).toBe("user-1");
  });
});

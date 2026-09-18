import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_STORAGE_KEY = "retiradas_vps_auth_session_v1";

async function freshModule() {
	vi.resetModules();
	return import("./vpsAuthSession.js");
}

describe("SEC-001: vpsAuthSession nunca persiste o token JWT no localStorage", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	it("nao grava o campo token ao salvar uma sessao", async () => {
		const { setVpsAuthSession, getVpsAuthToken } = await freshModule();

		setVpsAuthSession({
			token: "jwt-super-secreto",
			csrfToken: "csrf-1",
			user: { id: "user-1", name: "Fulano" },
		});

		const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
		expect(raw).not.toBeNull();
		const stored = JSON.parse(raw);
		expect(stored).not.toHaveProperty("token");
		expect(stored.user).toEqual({ id: "user-1", name: "Fulano" });

		// o token continua acessivel em memoria durante a vida da aba
		expect(getVpsAuthToken()).toBe("jwt-super-secreto");
	});

	it("perde o token em memoria apos recarregar o modulo (sem persistencia)", async () => {
		const mod1 = await freshModule();
		mod1.setVpsAuthSession({
			token: "jwt-super-secreto",
			csrfToken: "csrf-1",
			user: { id: "user-1", name: "Fulano" },
		});

		// simula um refresh de pagina: novo carregamento do modulo, mesmo
		// localStorage
		const mod2 = await freshModule();
		expect(mod2.getVpsAuthToken()).toBe("");
		expect(mod2.getVpsAuthSession()?.user).toEqual({ id: "user-1", name: "Fulano" });
	});

	it("faz cleanup de um token remanescente de sessao antiga gravada antes da correcao", async () => {
		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({
				csrfToken: "csrf-antigo",
				token: "jwt-de-sessao-antiga-vazado",
				user: { id: "user-2", name: "Ciclana" },
			}),
		);

		const { getVpsAuthToken, getVpsAuthSession } = await freshModule();

		// a leitura na inicializacao ja reescreve o localStorage sem o token
		const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
		const stored = JSON.parse(raw);
		expect(stored).not.toHaveProperty("token");
		expect(getVpsAuthToken()).toBe("");
		expect(getVpsAuthSession()?.user).toEqual({ id: "user-2", name: "Ciclana" });
	});

	it("remove a sessao do localStorage no logout", async () => {
		const { setVpsAuthSession, clearVpsAuthSession } = await freshModule();
		setVpsAuthSession({
			token: "jwt-1",
			csrfToken: "csrf-1",
			user: { id: "user-1", name: "Fulano" },
		});
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

		clearVpsAuthSession();
		expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
	});
});

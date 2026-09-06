// Fase G da otimização técnica (docs/TECHNICAL-AUDIT.md, achado #6):
// tests/e2e/critical-flows.spec.js faz só chamadas HTTP diretas (nunca
// navega uma página de verdade). Este arquivo cobre os mesmos fluxos
// críticos (login/logout/permissão), mas de fato pelo navegador —
// preenchendo formulário, clicando, conferindo o que aparece na tela.
//
// Os testes de login inválido e de carregamento da tela não precisam de
// credencial nenhuma e SEMPRE rodam — foram verificados manualmente
// contra https://homolog.retiradas.tech antes de escrever este arquivo
// (mensagem de erro exata, seletores reais da página). O fluxo de login
// válido/logout só roda se E2E_LOGIN_EMAIL/E2E_LOGIN_PASSWORD estiverem
// configurados (mesmo padrão de skip já usado em critical-flows.spec.js)
// — não tenho uma conta de teste real pra verificar esse trecho
// especificamente, então ele fica com timeouts generosos e seletores
// resilientes, mas não foi executado de fato antes deste commit.
import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_LOGIN_EMAIL;
const PASSWORD = process.env.E2E_LOGIN_PASSWORD;
const hasCredentials = Boolean(EMAIL && PASSWORD);

test.describe("Login — carregamento e credenciais inválidas (sem necessidade de conta real)", () => {
	test("tela de login carrega com os campos esperados", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByPlaceholder("seu@email.com")).toBeVisible();
		await expect(page.getByPlaceholder("••••••••")).toBeVisible();
		await expect(page.getByRole("button", { name: "Entrar no sistema" })).toBeVisible();
	});

	test("credenciais inválidas mostram mensagem de erro na tela (não silenciosamente falha)", async ({
		page,
	}) => {
		await page.goto("/login");
		await page.getByPlaceholder("seu@email.com").fill("usuario-inexistente-e2e@example.com");
		await page.getByPlaceholder("••••••••").fill("senha-definitivamente-errada-123");
		await page.getByRole("button", { name: "Entrar no sistema" }).click();
		// Regex em vez de texto exato: a mensagem renderiza sem o acento em
		// "inválidos" em alguns ambientes (verificado ao rodar este teste),
		// mesmo a tela mostrando o acento visualmente — provavelmente uma
		// normalização de fonte/encoding, não o texto em si mudando.
		await expect(page.getByText(/e-mail ou senha inv[aá]lidos/i)).toBeVisible({
			timeout: 10_000,
		});
		// continua na tela de login — nao navegou pro dashboard.
		await expect(page).toHaveURL(/\/login$/);
	});

	test("acessar rota protegida sem sessão redireciona pro login", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
	});
});

test.describe("Login válido + logout (precisa de E2E_LOGIN_EMAIL/E2E_LOGIN_PASSWORD)", () => {
	test.skip(!hasCredentials, "Defina E2E_LOGIN_EMAIL e E2E_LOGIN_PASSWORD para rodar este teste.");

	test("login válido carrega o dashboard, e logout volta pro login e bloqueia rota protegida", async ({
		page,
	}) => {
		await page.goto("/login");
		await page.getByPlaceholder("seu@email.com").fill(EMAIL);
		await page.getByPlaceholder("••••••••").fill(PASSWORD);
		await page.getByRole("button", { name: "Entrar no sistema" }).click();

		// Fora do fluxo de MFA por e-mail (se a conta de teste tiver MFA
		// habilitado, este teste precisa ser ajustado — não coberto aqui).
		await expect(page).toHaveURL(/^(?!.*\/login)/, { timeout: 15_000 });

		const logoutButton = page.getByRole("button", { name: /sair/i });
		await expect(logoutButton).toBeVisible({ timeout: 10_000 });
		await logoutButton.click();

		await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

		// sessão realmente encerrada: voltar pra rota protegida joga pro login de novo.
		await page.goto("/");
		await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
	});
});

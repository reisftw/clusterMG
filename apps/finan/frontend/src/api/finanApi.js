// SEC-004: a sessao do Finan vive num cookie HttpOnly setado pelo backend
// (login/mfa/verify) — o frontend nao guarda mais token nenhum em
// localStorage nem monta header Authorization; todo fetch manda
// credentials:"include" pra o cookie ir junto automaticamente.

// `Content-Type: application/json` nunca pode ser forcado quando o corpo
// e FormData (upload de arquivo/multipart): o navegador so gera o
// boundary correto (`multipart/form-data; boundary=...`) sozinho quando
// NENHUM Content-Type e passado explicitamente — forcar "application/json"
// aqui faz o fetch mandar bytes multipart com cabecalho dizendo que e
// JSON, e o body-parser do backend quebra tentando fazer JSON.parse no
// boundary ("Unexpected token '-', \"------WebK\"... is not valid JSON",
// bug real visto em producao ao importar planilha de orcamento via
// requestFinanFinanceiroApi). As duas outras funcoes abaixo nao tem
// nenhum caller com FormData hoje, mas levam a mesma protecao por
// consistencia e pra nao reintroduzir esse bug se alguem usar FormData
// aqui no futuro.
function buildFinanHeaders(options) {
	const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
	return {
		...(isFormData ? {} : { "Content-Type": "application/json" }),
		...(options.headers || {}),
	};
}

export async function requestFinanApi(path, options = {}) {
	const response = await fetch(`/api/finan${path}`, {
		...options,
		cache: "no-store",
		credentials: "include",
		headers: buildFinanHeaders(options),
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

// As rotas de compatibilidade (compat/routes.js no backend, ex.:
// /notifications*) sao montadas em "/api" puro, sem o prefixo "/finan" —
// diferente de requestFinanApi (que usa "/api/finan...").
export async function requestFinanCompatApi(path, options = {}) {
	const response = await fetch(`/api${path}`, {
		...options,
		cache: "no-store",
		credentials: "include",
		headers: buildFinanHeaders(options),
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

export async function requestFinanFinanceiroApi(path, options = {}) {
	const response = await fetch(`/api/financeiro${path}`, {
		...options,
		cache: "no-store",
		credentials: "include",
		headers: buildFinanHeaders(options),
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		// UX_AUDIT.md, Fase 1: faltava `.status` aqui (diferente de
		// requestFinanApi/requestFinanCompatApi, que já expõem) — sem isso,
		// nenhuma tela que usa este client consegue distinguir "servidor
		// fora" (erro de rede, sem status) de "essa funcionalidade ainda não
		// existe" (500 conhecido, ex.: DRE) de "sem permissão" (403).
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

export async function loginFinan(email, password) {
	const data = await requestFinanApi("/auth/login", {
		method: "POST",
		body: JSON.stringify({ email, password }),
	});
	if (data.mfaRequired) return data;
	return { user: data.user };
}

export async function verifyFinanEmailMfa(challengeId, code) {
	const data = await requestFinanApi("/auth/mfa/email/verify", {
		method: "POST",
		body: JSON.stringify({ challengeId, code }),
	});
	return { user: data.user };
}

export async function requestFinanPasswordReset(email) {
	return requestFinanApi("/auth/password/forgot", {
		method: "POST",
		body: JSON.stringify({ email }),
	});
}

export async function resetFinanPassword(token, password) {
	return requestFinanApi("/auth/password/reset", {
		method: "POST",
		body: JSON.stringify({ token, password }),
	});
}

export async function fetchFinanMe() {
	const data = await requestFinanApi("/auth/me");
	return data.user;
}

export async function logoutFinan() {
	await requestFinanApi("/auth/logout", { method: "POST" });
}

export async function fetchFinanPinStatus() {
	const data = await requestFinanApi("/auth/pin/status");
	return {
		configured: Boolean(data.configured),
		idleTimeoutMinutes: Number(data.idleTimeoutMinutes) || 20,
	};
}

export async function setupFinanPin({ pin, secretWord, currentPin }) {
	return requestFinanApi("/auth/pin/setup", {
		method: "POST",
		body: JSON.stringify({ pin, secretWord, currentPin }),
	});
}

export async function verifyFinanPin(pin) {
	return requestFinanApi("/auth/pin/verify", {
		method: "POST",
		body: JSON.stringify({ pin }),
	});
}

export async function requestFinanPinRecovery(email) {
	return requestFinanApi("/auth/pin/recover/request", {
		method: "POST",
		body: JSON.stringify({ email }),
	});
}

export async function confirmFinanPinRecovery({ token, secretWord, newPin }) {
	return requestFinanApi("/auth/pin/recover/confirm", {
		method: "POST",
		body: JSON.stringify({ token, secretWord, newPin }),
	});
}

export async function changeFinanPassword({ currentPassword, newPassword }) {
	return requestFinanApi("/auth/password/change", {
		method: "POST",
		body: JSON.stringify({ currentPassword, newPassword }),
	});
}

export async function uploadFinanOwnAvatar(file) {
	const formData = new FormData();
	formData.append("avatar", file);
	const response = await fetch("/api/finan/auth/avatar", {
		method: "POST",
		cache: "no-store",
		credentials: "include",
		body: formData,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data.avatarUrl;
}

export async function fetchFinanCalendarEvents({ from, to } = {}) {
	const params = new URLSearchParams();
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	const query = params.toString();
	const data = await requestFinanApi(`/calendario-financeiro${query ? `?${query}` : ""}`);
	return data.events || [];
}

export async function createFinanCalendarEvent(payload) {
	const data = await requestFinanApi("/calendario-financeiro", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.event;
}

export async function updateFinanCalendarEvent(id, payload) {
	const data = await requestFinanApi(`/calendario-financeiro/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.event;
}

export async function deleteFinanCalendarEvent(id) {
	return requestFinanApi(`/calendario-financeiro/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanCalendarCatalog(kind) {
	const data = await requestFinanApi(`/calendario-financeiro/config/${kind}`);
	return data.items || [];
}

export async function createFinanCalendarCatalogItem(kind, payload) {
	const data = await requestFinanApi(`/calendario-financeiro/config/${kind}`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.item;
}

export async function deleteFinanCalendarCatalogItem(kind, id) {
	return requestFinanApi(`/calendario-financeiro/config/${kind}/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanCalendarHolidays({ from, to, city } = {}) {
	const params = new URLSearchParams();
	if (from) params.set("from", from);
	if (to) params.set("to", to);
	if (city) params.set("city", city);
	const query = params.toString();
	const data = await requestFinanApi(`/calendario-financeiro/feriados${query ? `?${query}` : ""}`);
	return data.holidays || [];
}

export async function createFinanCalendarHoliday(payload) {
	const data = await requestFinanApi("/calendario-financeiro/feriados", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.holiday;
}

export async function deleteFinanCalendarHoliday(id) {
	return requestFinanApi(`/calendario-financeiro/feriados/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanCalendarRules() {
	const data = await requestFinanApi("/calendario-financeiro/regras");
	return data.rules || [];
}

export async function createFinanCalendarRule(payload) {
	const data = await requestFinanApi("/calendario-financeiro/regras", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.rule;
}

export async function updateFinanCalendarRule(id, payload) {
	const data = await requestFinanApi(`/calendario-financeiro/regras/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.rule;
}

export async function deleteFinanCalendarRule(id) {
	return requestFinanApi(`/calendario-financeiro/regras/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function fetchFinanPushVapidPublicKey() {
	const data = await requestFinanApi("/push/vapid-public-key");
	return { enabled: Boolean(data.enabled), publicKey: data.publicKey || "" };
}

export async function fetchFinanPushStatus() {
	const data = await requestFinanApi("/push/status");
	return { enabled: Boolean(data.enabled), subscribed: Boolean(data.subscribed) };
}

export async function subscribeFinanPush(subscription) {
	return requestFinanApi("/push/subscribe", {
		method: "POST",
		body: JSON.stringify({ subscription }),
	});
}

export async function unsubscribeFinanPush(endpoint) {
	return requestFinanApi("/push/unsubscribe", {
		method: "POST",
		body: JSON.stringify({ endpoint }),
	});
}

export async function fetchFinanPinManageableUsers() {
	const data = await requestFinanApi("/pin-admin/users");
	return data.users || [];
}

export async function unlockFinanUserPin(userId) {
	return requestFinanApi(`/pin-admin/${encodeURIComponent(userId)}/unlock`, {
		method: "POST",
	});
}

export async function resetFinanUserPin(userId) {
	return requestFinanApi(`/pin-admin/${encodeURIComponent(userId)}/reset`, {
		method: "POST",
	});
}

export async function fetchFinanUsers() {
	const data = await requestFinanApi("/usuarios");
	return data.users || [];
}

export async function fetchFinanRoles() {
	const data = await requestFinanApi("/usuarios/roles");
	return data.roles || [];
}

export async function createFinanRole(payload) {
	const data = await requestFinanApi("/usuarios/roles", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data.role;
}

export async function updateFinanRole(id, payload) {
	const data = await requestFinanApi(`/usuarios/roles/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.role;
}

export async function deleteFinanRole(id) {
	return requestFinanApi(`/usuarios/roles/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function updateFinanUser(id, payload) {
	const data = await requestFinanApi(`/usuarios/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
	return data.user;
}

// CRUD completo de usuarios (criar/editar nome+email+avatar+senha
// temporaria, nao so role/status/mfa) — rotas ricas de compat/routes.js
// (/admin/users*), mesmo padrao de criacao/edicao do UsuariosPage.jsx do
// Retiradas (NovoUsuarioModal/EditarUsuarioModal).
export async function fetchFinanAdminUsers() {
	const data = await requestFinanCompatApi("/admin/users");
	return { items: data.items || [], stats: data.stats || {} };
}

export async function createFinanAdminUser(payload) {
	return requestFinanCompatApi("/admin/users", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function updateFinanAdminUser(id, payload) {
	const data = await requestFinanCompatApi(`/admin/users/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.user;
}

export async function deleteFinanAdminUser(id) {
	return requestFinanCompatApi(`/admin/users/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export async function generateFinanUserFirstAccess(id) {
	return requestFinanCompatApi(`/admin/users/${encodeURIComponent(id)}/first-access`, {
		method: "POST",
	});
}

export async function uploadFinanAdminAvatar(file) {
	const formData = new FormData();
	formData.append("avatar", file);
	const response = await fetch("/api/admin/avatars", {
		method: "POST",
		cache: "no-store",
		credentials: "include",
		body: formData,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data.avatarUrl;
}

export async function fetchFinanSettingsSummary() {
	const data = await requestFinanApi("/configuracoes/summary");
	return data.summary || {};
}

export async function fetchFinanSettingSection(section) {
	const data = await requestFinanApi(`/configuracoes/section/${encodeURIComponent(section)}`);
	return data;
}

export async function saveFinanSettingSection(section, value) {
	const data = await requestFinanApi(`/configuracoes/section/${encodeURIComponent(section)}`, {
		method: "PUT",
		body: JSON.stringify({ value }),
	});
	return data.setting;
}

export async function fetchFinanDatabaseStatus() {
	const data = await requestFinanApi("/configuracoes/database");
	return data;
}

export async function fetchFinanAuditLogs() {
	const data = await requestFinanApi("/configuracoes/audit-logs");
	return data.logs || [];
}

export async function fetchFinanIntegrations() {
	const data = await requestFinanApi("/integracoes");
	return data.integracoes || [];
}

export async function fetchFinanIntegration(provider) {
	const data = await requestFinanApi(`/integracoes/${encodeURIComponent(provider)}`);
	return data.integracao;
}

export async function saveFinanIntegration(provider, payload) {
	const data = await requestFinanApi(`/integracoes/${encodeURIComponent(provider)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data.integracao;
}

export async function testFinanIntegration(provider) {
	const data = await requestFinanApi(`/integracoes/${encodeURIComponent(provider)}/test`, {
		method: "POST",
	});
	return data.result;
}

// BrasilAPI (proxy do backend — ver brasilapi/routes.js): consulta de CNPJ
// ativo/dados de empresa (modal de Nota Fiscal + card da Dashboard), lista
// de bancos, taxas/índices oficiais e câmbio em tempo real.
export async function fetchFinanCnpj(cnpj) {
	const data = await requestFinanApi(`/brasilapi/cnpj/${encodeURIComponent(String(cnpj || "").replace(/\D/g, ""))}`);
	return data?.empresa;
}

export async function fetchFinanBancos() {
	const data = await requestFinanApi("/brasilapi/bancos");
	return data?.bancos || [];
}

export async function fetchFinanTaxas() {
	const data = await requestFinanApi("/brasilapi/taxas");
	return data?.taxas || [];
}

export async function fetchFinanCambio(moedas) {
	const params = moedas?.length ? `?moedas=${encodeURIComponent(moedas.join(","))}` : "";
	const data = await requestFinanApi(`/brasilapi/cambio${params}`);
	return data?.cotacoes || [];
}

// Notas Fiscais, Contas a Pagar/Receber e Caixa de Entrada — Fase 3 do
// roteiro (pré-requisito + #16).
export async function fetchFinanNotas() {
	const data = await requestFinanApi("/notas");
	return data?.notas || [];
}

export async function createFinanNota(payload) {
	const data = await requestFinanApi("/notas", { method: "POST", body: JSON.stringify(payload) });
	return data?.nota;
}

export async function updateFinanNota(id, payload) {
	const data = await requestFinanApi(`/notas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data?.nota;
}

export async function deleteFinanNota(id) {
	return requestFinanApi(`/notas/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchFinanContasPagar() {
	return requestFinanApi("/contas-pagar");
}

export async function createFinanContaPagar(payload) {
	const data = await requestFinanApi("/contas-pagar", { method: "POST", body: JSON.stringify(payload) });
	return data?.conta;
}

export async function updateFinanContaPagar(id, payload) {
	const data = await requestFinanApi(`/contas-pagar/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data?.conta;
}

export async function pagarFinanContaPagar(id) {
	const data = await requestFinanApi(`/contas-pagar/${encodeURIComponent(id)}/pagar`, { method: "POST" });
	return data?.conta;
}

export async function deleteFinanContaPagar(id) {
	return requestFinanApi(`/contas-pagar/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchFinanContasReceber() {
	return requestFinanApi("/contas-receber");
}

export async function createFinanContaReceber(payload) {
	const data = await requestFinanApi("/contas-receber", { method: "POST", body: JSON.stringify(payload) });
	return data?.conta;
}

export async function updateFinanContaReceber(id, payload) {
	const data = await requestFinanApi(`/contas-receber/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
	return data?.conta;
}

export async function receberFinanContaReceber(id) {
	const data = await requestFinanApi(`/contas-receber/${encodeURIComponent(id)}/receber`, { method: "POST" });
	return data?.conta;
}

export async function deleteFinanContaReceber(id) {
	return requestFinanApi(`/contas-receber/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchFinanDocumentosEntrada() {
	const data = await requestFinanApi("/documentos");
	return data?.documentos || [];
}

// Conteúdo bruto (base64) do documento original — usado pra "ver a nota"
// antes de pagar (FinanNotasPage.jsx) e ao conferir na Caixa de Entrada.
export async function fetchFinanDocumentoConteudo(id) {
	const data = await requestFinanApi(`/documentos/${encodeURIComponent(id)}/conteudo`);
	return { tipoMime: data?.tipoMime, conteudoBase64: data?.conteudoBase64 };
}

export async function uploadFinanDocumentoEntrada(file) {
	const formData = new FormData();
	formData.append("arquivo", file);
	const response = await fetch("/api/finan/documentos", {
		method: "POST",
		cache: "no-store",
		credentials: "include",
		body: formData,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data?.documento;
}

export async function updateFinanDocumentoStatus(id, status) {
	const data = await requestFinanApi(`/documentos/${encodeURIComponent(id)}/status`, {
		method: "PATCH",
		body: JSON.stringify({ status }),
	});
	return data?.documento;
}

export async function gerarNotaDeDocumento(id, payload) {
	return requestFinanApi(`/documentos/${encodeURIComponent(id)}/gerar-nota`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

// Lançamento em lote (ex.: grupo de 50 notas de uma vez) — cada item vira
// sua própria nota, best-effort por item (ver documentos/routes.js).
export async function gerarNotasEmLote(itens) {
	return requestFinanApi("/documentos/gerar-notas-lote", {
		method: "POST",
		body: JSON.stringify({ itens }),
	});
}

export async function deleteFinanDocumentoEntrada(id) {
	return requestFinanApi(`/documentos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Roteiro Finan #30 (Fase 4A — Sistema de anexos centralizado).
export async function fetchFinanAnexos({ categoria, vinculoTipo, vinculoId, todasVersoes } = {}) {
	const params = new URLSearchParams();
	if (categoria) params.set("categoria", categoria);
	if (vinculoTipo) params.set("vinculoTipo", vinculoTipo);
	if (vinculoId) params.set("vinculoId", vinculoId);
	if (todasVersoes) params.set("todasVersoes", "true");
	const data = await requestFinanApi(`/anexos?${params.toString()}`);
	return data?.anexos || [];
}

export async function fetchFinanAnexoVersoes(id) {
	const data = await requestFinanApi(`/anexos/${encodeURIComponent(id)}/versoes`);
	return data?.versoes || [];
}

export async function fetchFinanAnexoConteudo(id) {
	const data = await requestFinanApi(`/anexos/${encodeURIComponent(id)}/conteudo`);
	return { tipoMime: data?.tipoMime, conteudoBase64: data?.conteudoBase64 };
}

export async function uploadFinanAnexo(file, { categoria, vinculoTipo, vinculoId, descricao, substituindoId } = {}) {
	const formData = new FormData();
	formData.append("arquivo", file);
	if (categoria) formData.append("categoria", categoria);
	if (vinculoTipo) formData.append("vinculoTipo", vinculoTipo);
	if (vinculoId) formData.append("vinculoId", vinculoId);
	if (descricao) formData.append("descricao", descricao);
	if (substituindoId) formData.append("substituindoId", substituindoId);
	const response = await fetch("/api/finan/anexos", {
		method: "POST",
		cache: "no-store",
		credentials: "include",
		body: formData,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		const error = new Error(data?.error || `Erro HTTP ${response.status}.`);
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return { anexo: data?.anexo, duplicadoDe: data?.duplicadoDe || null };
}

export async function deleteFinanAnexo(id) {
	return requestFinanApi(`/anexos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Inteligência — Fase 2 do roteiro (Comparador #3, Anomalias #2,
// Forecast #4, Finan Score #5, Simulador #20).
export async function fetchFinanComparador(params = {}) {
	const search = new URLSearchParams();
	["anoA", "mesA", "anoB", "mesB"].forEach((key) => {
		if (params[key]) search.set(key, params[key]);
	});
	return requestFinanApi(`/inteligencia/comparador?${search.toString()}`);
}

export async function fetchFinanAnomalias(ano, mes) {
	const search = new URLSearchParams();
	if (ano) search.set("ano", ano);
	if (mes) search.set("mes", mes);
	const data = await requestFinanApi(`/inteligencia/anomalias?${search.toString()}`);
	return data?.anomalias || [];
}

export async function fetchFinanForecast(meses) {
	const search = new URLSearchParams();
	if (meses) search.set("meses", meses);
	return requestFinanApi(`/inteligencia/forecast?${search.toString()}`);
}

export async function fetchFinanScore() {
	return requestFinanApi("/inteligencia/score");
}

export async function simularFinanCenario(payload) {
	return requestFinanApi("/inteligencia/simulador", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

// Finan Insights / Financeirinho (roteiro Finan #1, #23, #24).
export async function fetchFinanInsights() {
	const data = await requestFinanApi("/insights");
	return data?.insights || [];
}

export async function perguntarFinanceirinho(pergunta) {
	const params = new URLSearchParams({ q: pergunta || "" });
	const data = await requestFinanApi(`/insights/financeirinho?${params.toString()}`);
	return data?.resposta || "";
}

// Financeirinho v2 — assistente com IA real (Gemini, tool use restrito aos
// dados do Finan). Distinto do perguntarFinanceirinho acima (catalogo
// fechado de regex, #23 v1) — este fala com o backend novo em
// financeirinho/routes.js.
export async function enviarMensagemFinanceirinho(mensagem, conversaId) {
	return requestFinanApi("/financeirinho/chat", {
		method: "POST",
		body: JSON.stringify({ mensagem, conversaId: conversaId || undefined }),
	});
}

export async function fetchFinanceirinhoConversas() {
	const data = await requestFinanApi("/financeirinho/conversas");
	return data?.conversas || [];
}

export async function fetchFinanceirinhoConversa(conversaId) {
	const data = await requestFinanApi(`/financeirinho/conversas/${encodeURIComponent(conversaId)}`);
	return data?.mensagens || [];
}

// Metas financeiras (roteiro Finan #18).
export async function fetchFinanMetas() {
	const data = await requestFinanApi("/metas");
	return data?.metas || [];
}

export async function createFinanMeta(payload) {
	const data = await requestFinanApi("/metas", { method: "POST", body: JSON.stringify(payload) });
	return data?.meta;
}

export async function updateFinanMeta(id, payload) {
	const data = await requestFinanApi(`/metas/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data?.meta;
}

export async function deleteFinanMeta(id) {
	return requestFinanApi(`/metas/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Central de indicadores (roteiro Finan #25).
export async function fetchFinanIndicadoresCatalogo() {
	return requestFinanApi("/indicadores/catalogo");
}

export async function fetchFinanIndicadores() {
	const data = await requestFinanApi("/indicadores");
	return data?.indicadores || [];
}

export async function createFinanIndicador(payload) {
	return requestFinanApi("/indicadores", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteFinanIndicador(id) {
	return requestFinanApi(`/indicadores/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Contadores agregados do menu lateral (badges de Pendências/Caixa de
// Entrada/Notificações) — 1 request só, cada chave só vem se o usuário tem
// permissão de ver aquele contador (ver navegacao/routes.js no backend).
export async function fetchFinanContadoresNavegacao() {
	const data = await requestFinanApi("/navegacao/contadores");
	return data?.contadores || {};
}

// Favoritos / dashboard pessoal (roteiro Finan #21).
export async function fetchFinanFavoritos() {
	const data = await requestFinanApi("/preferencias/favoritos");
	return data?.favoritos || [];
}

export async function saveFinanFavoritos(favoritos) {
	const data = await requestFinanApi("/preferencias/favoritos", {
		method: "PUT",
		body: JSON.stringify({ favoritos }),
	});
	return data?.favoritos || [];
}

// Busca global (roteiro Finan #22).
export async function fetchFinanBusca(q) {
	const params = new URLSearchParams({ q: q || "" });
	const data = await requestFinanApi(`/busca?${params.toString()}`);
	return data?.items || [];
}

// Central de Fornecedores + dependência de fornecedor (roteiro Finan #8/#9).
export async function fetchFinanFornecedores(ano) {
	const params = new URLSearchParams();
	if (ano) params.set("ano", ano);
	return requestFinanApi(`/fornecedores?${params.toString()}`);
}

export async function fetchFinanFornecedorDetalhe(id, ano) {
	const params = new URLSearchParams();
	if (ano) params.set("ano", ano);
	return requestFinanApi(`/fornecedores/${encodeURIComponent(id)}?${params.toString()}`);
}

// Contratos recorrentes + controle de reajustes (roteiro Finan #6/#7).
export async function fetchFinanContratos(vencendoEm30Dias) {
	const params = new URLSearchParams();
	if (vencendoEm30Dias) params.set("vencendoEm30Dias", "true");
	const data = await requestFinanApi(`/contratos?${params.toString()}`);
	return data?.contratos || [];
}

export async function fetchFinanContrato(id) {
	return requestFinanApi(`/contratos/${encodeURIComponent(id)}`);
}

export async function createFinanContrato(payload) {
	const data = await requestFinanApi("/contratos", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data?.contrato;
}

export async function updateFinanContrato(id, payload) {
	const data = await requestFinanApi(`/contratos/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
	return data?.contrato;
}

export async function deleteFinanContrato(id) {
	return requestFinanApi(`/contratos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function registrarFinanReajuste(id, payload) {
	const data = await requestFinanApi(`/contratos/${encodeURIComponent(id)}/reajustes`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return data?.reajuste;
}

// Central de Pendências (roteiro Finan #13) — rota de orcamento/routes.js.
export async function fetchFinanDuplicidades(ano, mes) {
	const params = new URLSearchParams();
	if (ano) params.set("ano", ano);
	if (mes) params.set("mes", mes);
	const data = await requestFinanApi(`/orcamento/duplicidades?${params.toString()}`);
	return data?.duplicidades || [];
}

// Fechamento Mensal (roteiro Finan #12).
export async function fetchFinanFechamento(ano, mes) {
	const params = new URLSearchParams();
	if (ano) params.set("ano", ano);
	if (mes) params.set("mes", mes);
	return requestFinanApi(`/fechamento?${params.toString()}`);
}

export async function fecharFinanPeriodo(ano, mes) {
	const data = await requestFinanApi("/fechamento/fechar", {
		method: "POST",
		body: JSON.stringify({ ano, mes }),
	});
	return data?.fechamento;
}

export async function reabrirFinanPeriodo(ano, mes, motivo) {
	const data = await requestFinanApi("/fechamento/reabrir", {
		method: "POST",
		body: JSON.stringify({ ano, mes, motivo }),
	});
	return data?.fechamento;
}

export async function fetchFinanPendencias(ano, mes) {
	const params = new URLSearchParams();
	if (ano) params.set("ano", ano);
	if (mes) params.set("mes", mes);
	const data = await requestFinanApi(`/pendencias?${params.toString()}`);
	return data?.items || [];
}

// Roteiro Finan #35 (Fase 4B — Importador universal com templates,
// estende #17). preview/aplicar usam FormData — fetch cru, sem
// Content-Type forçado (mesmo motivo do fix em requestFinanFinanceiroApi:
// forçar json quebra o multipart/boundary do upload).
export async function fetchFinanImportadorCamposAlvo() {
	const data = await requestFinanApi("/importador/campos-alvo");
	return data?.entidades || [];
}

async function uploadFinanImportadorArquivo(path, file, { method = "POST" } = {}) {
	const formData = new FormData();
	formData.append("arquivo", file);
	const response = await fetch(`/api/finan${path}`, {
		method,
		cache: "no-store",
		credentials: "include",
		body: formData,
	});
	const data = await response.json().catch(() => null);
	if (!response.ok || data?.ok === false) {
		throw new Error(data?.error || `Erro HTTP ${response.status}.`);
	}
	return data;
}

export async function previewFinanImportadorArquivo(file) {
	return uploadFinanImportadorArquivo("/importador/preview", file);
}

export async function fetchFinanImportTemplates() {
	const data = await requestFinanApi("/importador/templates");
	return data?.templates || [];
}

export async function createFinanImportTemplate(payload) {
	const data = await requestFinanApi("/importador/templates", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	return data?.template;
}

export async function updateFinanImportTemplate(id, payload) {
	const data = await requestFinanApi(`/importador/templates/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	return data?.template;
}

export async function deleteFinanImportTemplate(id) {
	return requestFinanApi(`/importador/templates/${id}`, { method: "DELETE" });
}

export async function aplicarFinanImportTemplate(templateId, file) {
	const data = await uploadFinanImportadorArquivo(`/importador/templates/${templateId}/aplicar`, file);
	return data?.resultado;
}

// Roteiro Finan #40 (Fase 4D — Regras financeiras configuráveis, v1 restrito).
export async function fetchFinanRegrasTipos() {
	const data = await requestFinanApi("/regras-financeiras/tipos");
	return data?.tipos || [];
}

export async function fetchFinanRegras() {
	const data = await requestFinanApi("/regras-financeiras");
	return data?.regras || [];
}

export async function createFinanRegra(payload) {
	const data = await requestFinanApi("/regras-financeiras", { method: "POST", body: JSON.stringify(payload) });
	return data?.regra;
}

export async function updateFinanRegra(id, payload) {
	const data = await requestFinanApi(`/regras-financeiras/${id}`, { method: "PUT", body: JSON.stringify(payload) });
	return data?.regra;
}

export async function deleteFinanRegra(id) {
	return requestFinanApi(`/regras-financeiras/${id}`, { method: "DELETE" });
}

// Roteiro Finan #45 (Fase 4E — Briefing Executivo automático, reúne
// #44/#43/#18/#1).
export async function fetchFinanBriefing(periodo = "mensal") {
	const data = await requestFinanApi(`/briefing?periodo=${encodeURIComponent(periodo)}`);
	return data?.briefing;
}

// Roteiro Finan #46 (Fase 4E — Business Case dentro do Finan).
export async function calcularFinanBusinessCase(payload) {
	const data = await requestFinanApi("/business-case/calcular", { method: "POST", body: JSON.stringify(payload) });
	return data?.resultado;
}

export async function fetchFinanBusinessCases() {
	const data = await requestFinanApi("/business-case/casos");
	return data?.casos || [];
}

export async function salvarFinanBusinessCase(payload) {
	const data = await requestFinanApi("/business-case/casos", { method: "POST", body: JSON.stringify(payload) });
	return data?.caso;
}

export async function excluirFinanBusinessCase(id) {
	return requestFinanApi(`/business-case/casos/${id}`, { method: "DELETE" });
}

// Roteiro Finan #47 (Fase 4F — Webhooks).
export async function fetchFinanWebhookEventos() {
	const data = await requestFinanApi("/webhooks/eventos");
	return data?.eventos || [];
}
export async function fetchFinanWebhooks() {
	const data = await requestFinanApi("/webhooks");
	return data?.webhooks || [];
}
export async function createFinanWebhook(payload) {
	const data = await requestFinanApi("/webhooks", { method: "POST", body: JSON.stringify(payload) });
	return data?.webhook;
}
export async function updateFinanWebhook(id, payload) {
	const data = await requestFinanApi(`/webhooks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
	return data?.webhook;
}
export async function deleteFinanWebhook(id) {
	return requestFinanApi(`/webhooks/${id}`, { method: "DELETE" });
}

// Roteiro Finan #48 (Fase 4F — Conciliação inteligente).
export async function fetchFinanConciliacaoSugestoes() {
	const data = await requestFinanApi("/conciliacao/sugestoes");
	return data?.sugestoes || [];
}
export async function confirmarFinanConciliacao(extratoId, payload) {
	return requestFinanApi(`/conciliacao/${extratoId}/confirmar`, { method: "POST", body: JSON.stringify(payload) });
}

// Roteiro Finan #29 (Fase 4A — Qualidade de Dados).
export async function fetchFinanQualidadeDados() {
	const data = await requestFinanApi("/qualidade-dados");
	return { score: data?.score ?? 100, checks: data?.checks || [] };
}

// Roteiro Finan #28 (Fase 4A — Central de Jobs e Integrações).
export async function fetchFinanJobs() {
	const data = await requestFinanApi("/jobs");
	return data?.jobs || [];
}

export async function fetchFinanJobExecucoes(jobKey, { limit = 30 } = {}) {
	const params = new URLSearchParams({ limit: String(limit) });
	const data = await requestFinanApi(`/jobs/${jobKey}/execucoes?${params.toString()}`);
	return data?.execucoes || [];
}

export async function reprocessarFinanJob(jobKey) {
	return requestFinanApi(`/jobs/${jobKey}/reprocessar`, { method: "POST" });
}

// Roteiro Finan #26 (Fase 4A — API interna oficial /api/v1). O caminho da
// spec e "/v1/docs/openapi.json" (nao "/docs/..." dentro de /v1) porque
// requestFinanApi ja prefixa "/api/finan" — o backend monta /api/v1/docs
// e /api/v1 como mounts irmaos direto em app.js, nao um dentro do outro.
export async function fetchFinanApiV1Spec() {
	const response = await fetch("/api/v1/docs/openapi.json", {
		cache: "no-store",
		credentials: "include",
	});
	const data = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(data?.error?.message || data?.error || `Erro HTTP ${response.status}.`);
	}
	return data;
}

// Roteiro Finan #27 (Fase 4A — Observabilidade).
export async function fetchFinanObservabilidadeOverview() {
	return requestFinanApi("/observabilidade/overview");
}

export async function fetchFinanObservabilidadeMetricas({ hours = 24 } = {}) {
	const params = new URLSearchParams({ hours: String(hours) });
	const data = await requestFinanApi(`/observabilidade/metricas?${params.toString()}`);
	return data?.serie || [];
}

// Roteiro Finan (checklist de evolucao do produto) — rota de
// compat/routes.js; o catalogo de itens/fases fica no frontend
// (FinanRoadmapPage.jsx), aqui so persiste o status marcado por item.
export async function fetchFinanRoadmapStatus() {
	const data = await requestFinanCompatApi("/roteiro-status");
	return data?.status || {};
}

export async function saveFinanRoadmapStatus(status) {
	const data = await requestFinanCompatApi("/roteiro-status", {
		method: "PUT",
		body: JSON.stringify({ status }),
	});
	return data?.status || {};
}

// Logs de auditoria ricos (resumo humanizado, filtros, paginacao) — rotas de
// compat/routes.js, distintas de /configuracoes/audit-logs (mantida por
// compatibilidade, sem uso no frontend a partir desta tela).
export async function fetchFinanAuditLogsRich(filters = {}) {
	const params = new URLSearchParams();
	["userId", "setorId", "module", "entity", "action", "startDate", "endDate", "q", "minValue", "maxValue"].forEach((key) => {
		const value = String(filters[key] || "").trim();
		if (value) params.set(key, value);
	});
	params.set("limit", String(filters.limit || 50));
	params.set("offset", String(filters.offset || 0));
	return requestFinanCompatApi(`/admin/audit-logs?${params.toString()}`);
}

export async function fetchFinanAuditLogOptions() {
	return requestFinanCompatApi("/admin/audit-logs/options");
}

export async function fetchFinanAuditLogsByRecord(entity, recordId) {
	if (!entity || !recordId) return [];
	const params = new URLSearchParams({ entity, recordId });
	const data = await requestFinanCompatApi(`/admin/audit-logs/by-record?${params.toString()}`);
	return data?.items || [];
}

export async function fetchFinanAuditLogDetail(id) {
	const data = await requestFinanCompatApi(`/admin/audit-logs/${encodeURIComponent(String(id || ""))}`);
	return data?.item || null;
}

// Backups do PostgreSQL do Finan — rotas de compat/routes.js.
export async function fetchFinanDatabaseBackups() {
	return requestFinanCompatApi("/admin/database/backups");
}

export async function createFinanDatabaseBackup() {
	return requestFinanCompatApi("/admin/database/backups", { method: "POST" });
}

export async function restoreFinanDatabaseBackup(fileName, confirmation) {
	return requestFinanCompatApi(`/admin/database/backups/${encodeURIComponent(fileName)}/restore`, {
		method: "POST",
		body: JSON.stringify({ confirmation }),
	});
}

// E-mail do sistema (SMTP/identidade/MFA/templates) e logs de envio — rotas
// de compat/routes.js (email/service.js ja tem toda a logica pronta).
export async function fetchFinanEmailConfig() {
	const data = await requestFinanCompatApi("/admin/email/config");
	return data?.config || {};
}

export async function saveFinanEmailConfig(config) {
	const data = await requestFinanCompatApi("/admin/email/config", {
		method: "PUT",
		body: JSON.stringify(config),
	});
	return data?.config || {};
}

export async function testFinanEmail(to) {
	return requestFinanCompatApi("/admin/email/test", {
		method: "POST",
		body: JSON.stringify({ to }),
	});
}

export async function fetchFinanEmailLogs({ limit = 20, offset = 0, status = "", type = "", q = "" } = {}) {
	const params = new URLSearchParams();
	params.set("limit", String(limit));
	params.set("offset", String(offset));
	if (status) params.set("status", status);
	if (type) params.set("type", type);
	if (q) params.set("q", q);
	return requestFinanCompatApi(`/admin/email/logs?${params.toString()}`);
}

// Central de Notificações (histórico de eventos do sistema) — rotas de
// compat/routes.js, montadas em "/api" puro (ver requestFinanCompatApi).
export async function fetchFinanNotifications({
	limit = 100,
	offset = 0,
	type = "",
	severity = "",
	unread = false,
} = {}) {
	const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
	if (type) params.set("type", type);
	if (severity) params.set("severity", severity);
	if (unread) params.set("unread", "true");
	return requestFinanCompatApi(`/notifications?${params.toString()}`);
}

export async function fetchFinanNotificationStats() {
	return requestFinanCompatApi("/notifications/stats");
}

export async function fetchFinanNotificationCounters() {
	return requestFinanCompatApi("/notifications/counters");
}

export async function markFinanNotificationsRead({ ids = [], all = false } = {}) {
	return requestFinanCompatApi("/notifications/read", {
		method: "POST",
		body: JSON.stringify({ ids, all }),
	});
}

export async function checkFinanCriticalAlerts() {
	return requestFinanCompatApi("/notifications/check-critical", { method: "POST" });
}

export async function fetchFinanNotificationPreferences() {
	return requestFinanCompatApi("/notifications/personal-preferences");
}

export async function saveFinanNotificationPreferences(preferences = {}) {
	return requestFinanCompatApi("/notifications/personal-preferences", {
		method: "PUT",
		body: JSON.stringify(preferences),
	});
}

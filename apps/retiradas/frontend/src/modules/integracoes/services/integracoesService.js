import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	createVpsDocument,
	deleteVpsDocument,
	listVpsDocuments,
	requestVpsApi,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

const text = (value) => String(value || "").trim();

const cleanList = (items = []) =>
	(Array.isArray(items) ? items : [])
		.map((item) => String(item || "").trim())
		.filter(Boolean);

const cleanKeyValueList = (items = []) =>
	(Array.isArray(items) ? items : [])
		.map((item) => ({
			key: text(item?.key),
			value: text(item?.value),
		}))
		.filter((item) => item.key || item.value);

const cleanMappings = (items = []) =>
	(Array.isArray(items) ? items : [])
		.map((item) => ({
			localField: text(item?.localField),
			remotePath: text(item?.remotePath),
		}))
		.filter((item) => item.localField || item.remotePath);

export const AUTH_TYPES = [
	{ value: "none", label: "Sem autenticação" },
	{ value: "bearer", label: "Bearer token" },
	{ value: "api_key", label: "API key" },
	{ value: "basic", label: "Basic auth" },
	{ value: "oauth2", label: "OAuth 2.0" },
];

export const AUTH_LOCATIONS = [
	{ value: "header", label: "Header" },
	{ value: "query", label: "Query string" },
	{ value: "body", label: "Body" },
];

export const INTEGRATION_ENVIRONMENTS = [
	{ value: "production", label: "Produção" },
	{ value: "sandbox", label: "Homologação" },
	{ value: "development", label: "Desenvolvimento" },
];

export const SYNC_FREQUENCIES = [
	{ value: "manual", label: "Manual" },
	{ value: "hourly", label: "A cada hora" },
	{ value: "daily", label: "Diária" },
	{ value: "weekly", label: "Semanal" },
];

export const DEFAULT_INTEGRATION_FORM = Object.freeze({
	name: "",
	provider: "",
	baseUrl: "",
	environment: "production",
	active: true,
	authType: "bearer",
	authLocation: "header",
	credentialRef: "",
	secretValue: "",
	loginEmail: "",
	loginPassword: "",
	modules: [],
	syncFrequency: "manual",
	healthcheckPath: "",
	notes: "",
	headers: [],
	fieldMappings: [],
});

export const SYSTEM_INTEGRATIONS = Object.freeze([
	{
		id: "sempre-playground-api",
		name: "API Sempre Playground",
		provider: "Sempre / Playground",
		baseUrl: "https://playground.sempre.net.br/api",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "Bearer token cadastrado nesta integracao",
		modules: ["Estoque", "Equipamentos", "Mapa"],
		syncFrequency: "manual",
		healthcheckPath: "/auth/me",
		notes:
			"Usada para consultar equipamento por MAC, estoque local e historico de movimentacoes.",
		statusServiceId: "sempre-playground",
		headers: [],
		fieldMappings: [
			{ localField: "mac_addr", remotePath: "nota/consulta/serie.series[]" },
			{ localField: "phy_addr", remotePath: "nota/consulta/serie.series[]" },
			{
				localField: "historico",
				remotePath: "nota?filter.itens.serie=$eq:MAC",
			},
		],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-hubsoft-api",
		name: "API Hubsoft",
		provider: "Hubsoft",
		baseUrl: "Configuração > Hubsoft",
		environment: "production",
		active: true,
		authType: "oauth2",
		authLocation: "header",
		credentialRef: "OAuth /oauth/token",
		modules: ["Mapa", "Match", "O.S.", "Clientes"],
		syncFrequency: "manual",
		healthcheckPath: "/oauth/token",
		notes:
			"Usada para consultar clientes, atendimentos e ordens de serviço diretamente no Hubsoft.",
		statusServiceId: "hubsoft",
		headers: [],
		fieldMappings: [
			{
				localField: "codigo_cliente",
				remotePath: "cliente/ordem_servico?busca=codigo_cliente",
			},
			{
				localField: "num_os",
				remotePath: "cliente/ordem_servico?busca=numero_ordem_servico",
			},
			{ localField: "status_os", remotePath: "status" },
		],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-cvortex-api",
		name: "API Cvortex",
		provider: "Cvortex",
		baseUrl: "Configuração > Cvortex",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "Token cadastrado na configuração da Cvortex",
		modules: ["Mensageria", "WhatsApp", "Callbacks"],
		syncFrequency: "manual",
		healthcheckPath: "/status",
		notes:
			"Usada para envio e recebimento das mensagens da mensageria quando associada como provedora.",
		statusServiceId: "cvortex",
		headers: [],
		fieldMappings: [
			{ localField: "telefone", remotePath: "phone/to" },
			{ localField: "mensagem", remotePath: "message/text/body" },
			{ localField: "callback", remotePath: "/api/webhooks/cvortex" },
		],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-senior-sapiens-api",
		name: "Senior / Sapiens",
		provider: "Senior",
		baseUrl: "Configuração > Senior / Sapiens",
		environment: "production",
		active: false,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "Token/API key cadastrado na configuração do Senior/Sapiens",
		modules: ["Financeiro", "ERP", "Notas", "Contas"],
		syncFrequency: "manual",
		healthcheckPath: "/status",
		notes:
			"Pré-integração preparada para conectar o Sapiens quando a Brasil TecPar liberar os endpoints oficiais.",
		statusServiceId: "senior",
		headers: [],
		fieldMappings: [
			{ localField: "nota", remotePath: "notas" },
			{ localField: "contas_pagar", remotePath: "financeiro/contas-pagar" },
			{ localField: "contas_receber", remotePath: "financeiro/contas-receber" },
			{ localField: "faturamento", remotePath: "financeiro/faturamento" },
		],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-retiradas-vps-api",
		name: "API Principal da VPS",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "none",
		authLocation: "header",
		credentialRef: "systemd:retiradas-api",
		modules: ["Retiradas", "VPS"],
		syncFrequency: "manual",
		healthcheckPath: "/health",
		notes:
			"Healthcheck principal da API, validando Nginx/SSL, Node e conexao com PostgreSQL.",
		statusServiceId: "database",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-auth-api",
		name: "API de Login",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "APP_AUTH_SECRET",
		modules: ["Login", "Usuarios", "Sessao"],
		syncFrequency: "manual",
		healthcheckPath: "/admin/api-status",
		notes:
			"Valida usuarios locais, segredo de autenticacao e geracao de sessao.",
		statusServiceId: "auth",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-database-api",
		name: "API do Banco de Dados",
		provider: "PostgreSQL VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "PGHOST/PGUSER/PGDATABASE",
		modules: ["PostgreSQL", "Retiradas"],
		syncFrequency: "manual",
		healthcheckPath: "/health",
		notes: "Valida conexao, horario e tamanho atual do PostgreSQL.",
		statusServiceId: "database",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-documents-api",
		name: "API de Documentos",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "Bearer da sessao",
		modules: ["Usuarios", "Agenda", "Diario", "Operacional"],
		syncFrequency: "manual",
		healthcheckPath: "/admin/api-status",
		notes:
			"Valida leitura e contagem dos documentos persistidos no PostgreSQL.",
		statusServiceId: "documents",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-public-data-api",
		name: "API de Dados Públicos",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "none",
		authLocation: "header",
		credentialRef: "",
		modules: ["Painel", "Mapa", "Match", "Dashboard"],
		syncFrequency: "manual",
		healthcheckPath: "/public/dashboard",
		notes:
			"Valida snapshots usados pelas telas publicas e pelo acompanhamento.",
		statusServiceId: "public-data",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-imports-api",
		name: "API de Importações",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "Bearer da sessao",
		modules: ["Mapa", "Match", "Metas", "Diario"],
		syncFrequency: "manual",
		healthcheckPath: "/admin/api-status",
		notes:
			"Valida colecoes alimentadas por uploads e importacoes operacionais.",
		statusServiceId: "imports",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-backups-api",
		name: "API de Backups",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "bearer",
		authLocation: "header",
		credentialRef: "pg_dump/pg_restore",
		modules: ["Banco de Dados", "Seguranca"],
		syncFrequency: "daily",
		healthcheckPath: "/admin/database/backups",
		notes:
			"Valida pasta de backups, retencao, quota e ultimo backup disponivel.",
		statusServiceId: "backups",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
	{
		id: "system-realtime-api",
		name: "API de Tempo Real",
		provider: "Retiradas VPS",
		baseUrl: "https://retiradas.tech/api",
		environment: "production",
		active: true,
		authType: "none",
		authLocation: "header",
		credentialRef: "SSE /api/events",
		modules: ["Acompanhamento", "Diario", "Mapa", "Match"],
		syncFrequency: "manual",
		healthcheckPath: "/events",
		notes:
			"Valida canal Server-Sent Events usado para atualizacao em tempo real.",
		statusServiceId: "realtime",
		headers: [],
		fieldMappings: [],
		lastStatus: "not_tested",
		lastMessage: "",
		lastCheckedAt: null,
		lastSyncAt: null,
		createdAt: null,
		updatedAt: null,
		systemManaged: true,
	},
]);

export function normalizeIntegration(id, payload = {}) {
	return {
		id,
		name: text(payload.name),
		provider: text(payload.provider),
		baseUrl: text(payload.baseUrl),
		environment: text(payload.environment) || "production",
		active: payload.active !== false,
		authType: text(payload.authType) || "none",
		authLocation: text(payload.authLocation) || "header",
		credentialRef: text(payload.credentialRef),
		secretConfigured: Boolean(payload.secretValue),
		loginEmail: text(payload.loginEmail),
		loginConfigured: Boolean(payload.loginPassword),
		modules: cleanList(payload.modules),
		syncFrequency: text(payload.syncFrequency) || "manual",
		healthcheckPath: text(payload.healthcheckPath),
		notes: text(payload.notes),
		statusServiceId: text(payload.statusServiceId),
		headers: cleanKeyValueList(payload.headers),
		fieldMappings: cleanMappings(payload.fieldMappings),
		lastStatus: text(payload.lastStatus) || "not_tested",
		lastMessage: text(payload.lastMessage),
		lastCheckedAt: payload.lastCheckedAt || null,
		lastSyncAt: payload.lastSyncAt || null,
		tokenUpdatedAt: payload.tokenUpdatedAt || null,
		tokenExpiresAt: payload.tokenExpiresAt || null,
		createdAt: payload.createdAt || null,
		updatedAt: payload.updatedAt || null,
		systemManaged: payload.systemManaged === true,
	};
}

function mergeSystemIntegrations(integrations = []) {
	const registeredKeys = new Set(
		integrations.flatMap((item) => [
			item.id,
			`${item.name}|${item.provider}|${item.baseUrl}`.toLowerCase(),
		]),
	);

	const missingSystemItems = SYSTEM_INTEGRATIONS.filter(
		(item) =>
			!registeredKeys.has(item.id) &&
			!registeredKeys.has(
				`${item.name}|${item.provider}|${item.baseUrl}`.toLowerCase(),
			),
	).map((item) => normalizeIntegration(item.id, item));

	return [...missingSystemItems, ...integrations].sort((a, b) =>
		String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"),
	);
}

export function buildIntegrationPayload(form = {}) {
	const payload = {
		name: text(form.name),
		provider: text(form.provider),
		baseUrl: text(form.baseUrl).replace(/\/+$/, ""),
		environment: text(form.environment) || "production",
		active: form.active !== false,
		authType: text(form.authType) || "none",
		authLocation: text(form.authLocation) || "header",
		credentialRef: text(form.credentialRef),
		modules: cleanList(form.modules),
		syncFrequency: text(form.syncFrequency) || "manual",
		healthcheckPath: text(form.healthcheckPath),
		notes: text(form.notes),
		statusServiceId: text(form.statusServiceId),
		headers: cleanKeyValueList(form.headers),
		fieldMappings: cleanMappings(form.fieldMappings),
	};
	const secretValue = text(form.secretValue);
	if (secretValue) payload.secretValue = secretValue;
	const loginEmail = text(form.loginEmail);
	if (loginEmail) payload.loginEmail = loginEmail;
	const loginPassword = text(form.loginPassword);
	if (loginPassword) payload.loginPassword = loginPassword;
	return payload;
}

export async function buscarIntegracoes() {
	return mergeSystemIntegrations(
		(await listVpsDocuments(COLLECTIONS.INTEGRACOES_API, { limit: 300 })).map(
			(item) => normalizeIntegration(item.id, item),
		),
	);
}

function buildHealthcheckUrl(integration) {
	const baseUrl = text(integration?.baseUrl).replace(/\/+$/, "");
	const healthcheckPath = text(integration?.healthcheckPath);
	if (!baseUrl || !healthcheckPath) return "";
	return `${baseUrl}${healthcheckPath.startsWith("/") ? "" : "/"}${healthcheckPath}`;
}

export async function testarIntegracao(integration) {
	if (integration?.systemManaged && integration?.statusServiceId) {
		const startedAt = Date.now();
		try {
			const status = await requestVpsApi("/admin/api-status");
			const service = (status?.services || []).find(
				(item) => item.id === integration.statusServiceId,
			);
			if (!service) {
				throw new Error("Servico nao encontrado no monitoramento.");
			}
			const elapsedMs = Date.now() - startedAt;
			return {
				...integration,
				lastStatus: service.status === "online" ? "ok" : "error",
				lastMessage:
					service.status === "online"
						? `Online (${service.details?.responseMs ?? elapsedMs} ms)`
						: service.reason || "Offline",
				lastCheckedAt: service.checkedAt || new Date().toISOString(),
			};
		} catch (error) {
			return {
				...integration,
				lastStatus: "error",
				lastMessage: error?.message || "Falha no monitoramento.",
				lastCheckedAt: new Date().toISOString(),
			};
		}
	}

	const url = buildHealthcheckUrl(integration);
	if (!url) {
		return {
			...integration,
			lastStatus: "not_tested",
			lastMessage: "Healthcheck nao configurado.",
			lastCheckedAt: new Date().toISOString(),
		};
	}

	const startedAt = Date.now();
	try {
		const response = await fetch(url, {
			method: "GET",
			cache: "no-store",
		});
		const elapsedMs = Date.now() - startedAt;
		return {
			...integration,
			lastStatus: response.ok ? "ok" : "error",
			lastMessage: response.ok
				? `Online (${elapsedMs} ms)`
				: `HTTP ${response.status} (${elapsedMs} ms)`,
			lastCheckedAt: new Date().toISOString(),
		};
	} catch (error) {
		return {
			...integration,
			lastStatus: "error",
			lastMessage: error?.message || "Falha no healthcheck.",
			lastCheckedAt: new Date().toISOString(),
		};
	}
}

export async function criarIntegracao(form) {
	const payload = buildIntegrationPayload(form);
	const ref = await createVpsDocument(COLLECTIONS.INTEGRACOES_API, {
		...payload,
		lastStatus: "not_tested",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	return ref.id;
}

export async function atualizarIntegracao(id, form) {
	const payload = buildIntegrationPayload(form);
	await updateVpsDocument(`${COLLECTIONS.INTEGRACOES_API}/${id}`, {
		...payload,
		systemManaged: form.systemManaged === true,
		updatedAt: new Date().toISOString(),
	});
	return id;
}

export async function excluirIntegracao(id) {
	await deleteVpsDocument(`${COLLECTIONS.INTEGRACOES_API}/${id}`);
}

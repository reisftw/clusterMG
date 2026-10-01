const { getHubsoftAuthHeader } = require("../auth/hubsoftAuth");
const { HUBSOFT_ACTIVATION_ORDER_TYPES } = require("../constants");

const API_URL = "https://api.sempre.hubsoft.com.br/api/v1";
const TRANSIENT_STATUS = new Set([408, 429, 502, 503, 504]);

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

class HubsoftReadonlyClient {
	constructor(options = {}) {
		this.baseUrl = String(options.baseUrl || process.env.HUBSOFT_API_BASE_URL || API_URL).replace(/\/+$/, "");
		this.timeoutMs = Number(options.timeoutMs || process.env.HUBSOFT_TIMEOUT_MS || 30000);
		this.perPage = Number(options.perPage || process.env.HUBSOFT_SYNC_PAGE_SIZE || 50);
		this.maxPages = Number(options.maxPages || process.env.HUBSOFT_SYNC_MAX_PAGES || 20);
		this.authOptions = options.auth || {};
		this.orderTypeCatalog = null;
	}

	async request(path, { method = "GET", body = null, retry = 2 } = {}) {
		const authorization = await getHubsoftAuthHeader(this.authOptions);
		let attempt = 0;
		let lastError = null;
		while (attempt <= retry) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
			try {
				const response = await fetch(`${this.baseUrl}${path}`, {
					method,
					signal: controller.signal,
					headers: {
						accept: "application/json",
						authorization,
						...(body ? { "content-type": "application/json" } : {}),
					},
					body: body ? JSON.stringify(body) : null,
				});
				const text = await response.text();
				const data = text ? JSON.parse(text) : null;
				if (!response.ok) {
					const error = new Error(data?.message || data?.error || `HubSoft HTTP ${response.status}`);
					error.statusCode = response.status;
					if (TRANSIENT_STATUS.has(response.status) && attempt < retry) {
						lastError = error;
						await sleep(500 * (attempt + 1));
						attempt += 1;
						continue;
					}
					throw error;
				}
				return data;
			} catch (error) {
				if (error.name === "AbortError") {
					lastError = new Error("Tempo esgotado ao consultar HubSoft.");
					lastError.statusCode = 504;
				} else {
					lastError = error;
				}
				if (!TRANSIENT_STATUS.has(Number(lastError.statusCode)) || attempt >= retry) throw lastError;
				await sleep(500 * (attempt + 1));
				attempt += 1;
			} finally {
				clearTimeout(timeout);
			}
		}
		throw lastError;
	}

	async loadOrderTypeCatalog() {
		if (this.orderTypeCatalog) return this.orderTypeCatalog;
		const data = await this.request("/ordem_servico/create");
		const catalog = new Map();
		for (const item of data?.tipos_ordem_servico || []) {
			const id = Number(item.id_tipo_ordem_servico || item.id);
			if (Number.isFinite(id)) catalog.set(id, item);
		}
		this.orderTypeCatalog = catalog;
		return catalog;
	}

	async getCatalogOrderType(id) {
		const catalog = await this.loadOrderTypeCatalog();
		const type = catalog.get(Number(id));
		const fallback = HUBSOFT_ACTIVATION_ORDER_TYPES.find((item) => item.id === Number(id));
		return type || {
			id_tipo_ordem_servico: Number(id),
			descricao: fallback?.name || String(id),
			display: fallback?.name || String(id),
		};
	}

	buildOrderSearchPayload({ orderType, dateFrom, dateTo, status = "" }) {
		return {
			data_inicio: new Date(dateFrom).toISOString(),
			data_fim: new Date(dateTo).toISOString(),
			tipo_data: status === "finalizado" ? "data_termino_executado" : "data_cadastro",
			order_by: status === "finalizado" ? "data_termino_executado" : "data_cadastro",
			order_by_key: "DESC",
			status_ordem_servico: status ? [status] : ["pendente", "aguardando_agendamento", "aguardando_aprovacao", "finalizado"],
			prioridade: [],
			reservada: null,
			assinatura_cliente: null,
			motivo_fechamento: [],
			pop: [],
			periodos: [],
			tipo_ordem_servicos: [orderType],
			usuario_abertura: [],
			tecnicos: [],
			participantes: [],
			agendas: [],
			fluxo_aprovacao_configuracao: [],
			cidades: [],
			servico: [],
			servico_status: [],
			grupos_clientes: [],
			grupos_clientes_servicos: [],
			bairros: null,
			condominios: [],
		};
	}

	async listOrdersPage({ orderTypeId, dateFrom, dateTo, page = 1, limit = this.perPage, status = "" }) {
		const orderType = await this.getCatalogOrderType(orderTypeId);
		const payload = this.buildOrderSearchPayload({ orderType, dateFrom, dateTo, status });
		const data = await this.request(`/ordem_servico/consultar/paginado/${limit}?page=${page}`, {
			method: "POST",
			body: payload,
		});
		const envelope = data?.ordens_servico || {};
		return {
			rows: envelope.data || [],
			total: Number(envelope.total || 0),
			currentPage: Number(envelope.current_page || page),
			lastPage: Number(envelope.last_page || Math.ceil(Number(envelope.total || 0) / limit) || 1),
		};
	}

	async getConnectionStatus(clienteServicoIds = []) {
		const ids = [...new Set(clienteServicoIds.map(Number).filter(Number.isFinite))];
		if (!ids.length) return {};
		const data = await this.request("/cliente/servico/status_conexao", {
			method: "POST",
			body: { ids },
		});
		return data?.status_conexao || {};
	}
}

module.exports = { HubsoftReadonlyClient };

const { HubsoftReadonlyClient } = require("../clients/HubsoftReadonlyClient");
const { HUBSOFT_ACTIVATION_ORDER_TYPE_IDS } = require("../constants");
const { normalizeActivationOrder } = require("../normalizers/activationOrder");
const { normalizeConnectionSnapshot } = require("../normalizers/connection");
const {
	insertConnectionSnapshotIfNeeded,
	upsertClienteServicoSnapshot,
	upsertOrderSnapshot,
} = require("../repositories/activationSnapshotRepository");
const {
	createSyncRun,
	finishSyncRun,
	markSyncRunRunning,
	updateSyncRunMetrics,
} = require("../repositories/syncRunRepository");
const { isWithinActivationHealthWindow } = require("./healthWindow");

function pickHubsoftTechnician(order = {}) {
	const direct = Array.isArray(order.tecnicos) ? order.tecnicos[0] : null;
	const relation = Array.isArray(order.ordem_servico_tecnico) ? order.ordem_servico_tecnico[0] : null;
	return direct || relation?.usuario || relation?.tecnico || relation || null;
}

function isoDateOnly(value) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
}

function defaultDateFrom() {
	const date = new Date();
	date.setDate(date.getDate() - 1);
	return isoDateOnly(date);
}

function defaultDateTo() {
	return isoDateOnly(new Date());
}

function createMetrics() {
	return {
		pagesProcessed: 0,
		recordsFound: 0,
		recordsInserted: 0,
		recordsUpdated: 0,
		recordsUnchanged: 0,
		errorsCount: 0,
		techniciansMatched: 0,
		techniciansMatchedByName: 0,
		techniciansUnmatched: 0,
		techniciansAmbiguous: 0,
		connectionsRequested: 0,
		connectionsCaptured: 0,
		connectionsConnected: 0,
		connectionsWithoutSession: 0,
		byType: {},
	};
}

function applyPersistAction(metrics, action) {
	if (action === "inserted") {
		if ("recordsInserted" in metrics) metrics.recordsInserted += 1;
		else metrics.inserted += 1;
	} else if (action === "updated") {
		if ("recordsUpdated" in metrics) metrics.recordsUpdated += 1;
		else metrics.updated += 1;
	} else if (action === "unchanged") {
		if ("recordsUnchanged" in metrics) metrics.recordsUnchanged += 1;
		else metrics.unchanged += 1;
	}
}

function applyTechnicianMetric(metrics, status) {
	if (status === "matched") metrics.techniciansMatched += 1;
	else if (status === "matched_by_name") metrics.techniciansMatchedByName += 1;
	else if (status === "ambiguous") metrics.techniciansAmbiguous += 1;
	else metrics.techniciansUnmatched += 1;
}

class HubsoftActivationSyncService {
	constructor({ hubsoftClient = new HubsoftReadonlyClient(), database = null, logger = console } = {}) {
		this.hubsoftClient = hubsoftClient;
		this.db = database || require("../../db");
		this.logger = logger;
	}

	async syncActivations(options = {}) {
		const dateFrom = options.dateFrom || defaultDateFrom();
		const dateTo = options.dateTo || defaultDateTo();
		const orderTypeIds = (options.orderTypeIds?.length ? options.orderTypeIds : HUBSOFT_ACTIVATION_ORDER_TYPE_IDS)
			.map(Number)
			.filter((id) => HUBSOFT_ACTIVATION_ORDER_TYPE_IDS.includes(id));
		const perPage = Number(options.limit || this.hubsoftClient.perPage || 50);
		const maxPages = Number(options.maxPages || this.hubsoftClient.maxPages || 20);
		const triggerType = options.triggerType || "manual";
		const runClient = await this.db.connect();
		let syncRun = null;
		const metrics = createMetrics();
		try {
			syncRun = await createSyncRun(runClient, {
				triggerType,
				dateFrom,
				dateTo,
				metadata: { orderTypeIds, perPage, maxPages },
			});
			await markSyncRunRunning(runClient, syncRun.id, { stage: "authenticating" });
		} finally {
			runClient.release();
		}

		try {
			await this.hubsoftClient.loadOrderTypeCatalog();
			for (const orderTypeId of orderTypeIds) {
				metrics.byType[orderTypeId] = { found: 0, inserted: 0, updated: 0, unchanged: 0 };
				for (let page = 1; page <= maxPages; page += 1) {
					this.logger.log(`[hubsoft_activation_sync] buscando tipo=${orderTypeId} pagina=${page}`);
					const pageResult = await this.hubsoftClient.listOrdersPage({
						orderTypeId,
						dateFrom,
						dateTo,
						page,
						limit: perPage,
						status: options.status || "",
					});
					metrics.pagesProcessed += 1;
					metrics.recordsFound += pageResult.rows.length;
					metrics.byType[orderTypeId].found += pageResult.rows.length;
					await this.persistPage({ syncRunId: syncRun.id, rows: pageResult.rows, metrics });
					const statusClient = await this.db.connect();
					try {
						await updateSyncRunMetrics(statusClient, syncRun.id, {
							...metrics,
							metadata: { stage: "page_persisted", orderTypeId, page },
						});
					} finally {
						statusClient.release();
					}
					if (!pageResult.rows.length || page >= pageResult.lastPage) break;
				}
			}
			const finishClient = await this.db.connect();
			try {
				await finishSyncRun(finishClient, syncRun.id, {
					status: metrics.errorsCount ? "partial" : "success",
					metrics,
					metadata: { stage: "finished", ...metrics },
				});
			} finally {
				finishClient.release();
			}
			return { ok: true, syncRunId: syncRun.id, metrics };
		} catch (error) {
			const finishClient = await this.db.connect();
			try {
				await finishSyncRun(finishClient, syncRun.id, {
					status: "failed",
					errorMessage: error?.message || "Falha na sincronização HubSoft.",
					metrics,
					metadata: { stage: "failed" },
				});
			} finally {
				finishClient.release();
			}
			throw error;
		}
	}

	async persistPage({ syncRunId, rows, metrics }) {
		const normalizedOrders = rows.map((row) => normalizeActivationOrder(row, syncRunId)).filter(Boolean);
		const connectionEligible = normalizedOrders.filter((item) => (
			item.hubsoft_cliente_servico_id &&
			item.health_monitoring_mode !== "NONE" &&
			(isWithinActivationHealthWindow(item.executed_end_at) || !item.executed_end_at)
		));
		const connectionStatus = connectionEligible.length
			? await this.hubsoftClient.getConnectionStatus(connectionEligible.map((item) => item.hubsoft_cliente_servico_id))
			: {};
		metrics.connectionsRequested += connectionEligible.length;

		const client = await this.db.connect();
		try {
			await client.query("begin");
			for (const orderSnapshot of normalizedOrders) {
				if (orderSnapshot.cliente_servico_snapshot) {
					await upsertClienteServicoSnapshot(client, orderSnapshot.cliente_servico_snapshot);
				}
				const rawOrder = rows.find((row) => Number(row.id_ordem_servico) === Number(orderSnapshot.hubsoft_order_id)) || {};
				const persisted = await upsertOrderSnapshot(client, orderSnapshot, pickHubsoftTechnician(rawOrder));
				applyPersistAction(metrics, persisted.action);
				applyPersistAction(metrics.byType[orderSnapshot.order_type_id], persisted.action);
				applyTechnicianMetric(metrics, persisted.technicianMatch);
				const statusPayload = connectionStatus[String(orderSnapshot.hubsoft_cliente_servico_id)];
				if (statusPayload) {
					const connectionSnapshot = normalizeConnectionSnapshot(statusPayload, {
						clienteServicoId: orderSnapshot.hubsoft_cliente_servico_id,
						orderId: orderSnapshot.hubsoft_order_id,
						syncRunId,
					});
					const result = await insertConnectionSnapshotIfNeeded(client, connectionSnapshot);
					if (result.action === "inserted") metrics.connectionsCaptured += 1;
					if (connectionSnapshot.connected) metrics.connectionsConnected += 1;
					if (!connectionSnapshot.session_start_at) metrics.connectionsWithoutSession += 1;
				}
			}
			await client.query("commit");
		} catch (error) {
			await client.query("rollback").catch(() => {});
			metrics.errorsCount += 1;
			throw error;
		} finally {
			client.release();
		}
	}
}

module.exports = { HubsoftActivationSyncService };

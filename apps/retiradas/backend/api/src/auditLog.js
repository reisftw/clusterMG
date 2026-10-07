const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const db = require("./db");

const auditRequestContext = new AsyncLocalStorage();

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const SENSITIVE_KEY_PATTERN =
	/(password|senha|token|secret|authorization|cookie|credential|privatekey|api[_-]?key)/i;
const IGNORED_DOCUMENT_COLLECTIONS = new Set([
	"audit_logs",
	"app_sessions",
	"api_runtime_events",
	"email_logs",
	"email_mfa_challenges",
	"integracoes_api",
	"metrics_queries",
	"metrics_requests",
	"operational_import_jobs",
	"ordens_abertas",
	"ordens_legadas",
	"os_acumuladas",
	"password_reset_tokens",
	"public_dashboard",
	"static_snapshots",
	"usuarios",
	"mapa_meta",
	"match_os_abertas",
	"match_os_meta",
]);
const IGNORED_DOCUMENT_COLLECTION_PREFIXES = [
	"audit_logs/",
	"system_",
	"tecnicos_bolsa_auditoria_",
];
const SYSTEM_FIELD_NAMES = new Set([
	"atualizado_em",
	"atualizadoem",
	"updated_at",
	"updatedat",
	"criado_em",
	"criadoem",
	"created_at",
	"createdat",
	"last_read_at",
	"lastreadat",
	"ultima_leitura",
	"ultimaleitura",
	"ultima_atualizacao",
	"ultimaatualizacao",
]);
const FIELD_LABELS = {
	accounts: "contas financeiras",
	active: "status",
	ano: "ano",
	bairro: "bairro",
	budgetMatrix: "matriz orçamentária",
	cidade: "cidade",
	codigo: "código",
	codigo_cliente: "código do cliente",
	codigoCliente: "código do cliente",
	centers: "centros de custo",
	costCenters: "centros de custo",
	data: "data",
	data_agendamento: "data do agendamento",
	dataAgendamento: "data do agendamento",
	description: "descrição",
	displayName: "nome",
	display_name: "nome",
	email: "e-mail",
	endereco: "endereço",
	empresaId: "empresa",
	empresa_id: "empresa",
	fonte: "base de dados",
	id_cliente: "cliente HubSoft",
	lancamentos: "lançamentos",
	mes: "mês",
	name: "nome",
	nome: "nome",
	observacao: "observação",
	observacoes: "observações",
	permissions: "permissões",
	regional: "regional",
	role: "cargo",
	setorId: "setor",
	status: "status",
	telefone: "telefone",
	tecnico: "técnico",
	tecnico_nome: "técnico",
	tecnicoNome: "técnico",
	tipo: "tipo",
	titulo: "título",
	turno: "turno",
	valor: "valor",
};
const COLLECTION_LABELS = {
	agendamentos: "agendamento",
	app_roles: "cargo",
	app_users: "usuário",
	atendimento_casos: "caso de atendimento",
	atendimento_tecnicos: "técnico de atendimento",
	database_backups: "backup do banco",
	document_client_folders: "pasta de documentos",
	document_files: "documento",
	document_required_fields: "campo obrigatório",
	document_submissions: "envio mensal",
	financeiro_config: "configuração financeira",
	financeiro_reports: "relatório financeiro",
	metas_lancamento_manual: "lançamento manual de metas",
	tentativas: "tentativa de contato",
	usuarios: "usuário",
};
const MODULE_LABELS = {
	agendamentos: "Agendamentos",
	atendimento: "Atendimento",
	backups: "Backups",
	configuracoes: "Configurações",
	documentos: "Documentos",
	financeiro: "Financeiro",
	metas: "Metas",
	mensageria: "Mensageria",
	tentativas: "Tentativas de contato",
};
const ACTION_LABELS = {
	create: "Criação",
	delete: "Exclusão",
	update: "Atualização",
};
const PROTECTED_VALUE_LABEL = "informação protegida";
const INTERNAL_VALUE_LABEL = "identificador interno";
const TECHNICAL_VALUE_PATTERN =
	/(^\$2[aby]\$)|(^\$argon2)|(^eyJ[A-Za-z0-9_-]+\.)|(^[a-f0-9]{32,}$)|(^[A-Za-z0-9+/]{64,}={0,2}$)/;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value) {
	return String(value || "").trim();
}

function normalizeLimit(value) {
	const parsed = Number(value || DEFAULT_LIMIT);
	if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
	return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function normalizeOffset(value) {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(Math.trunc(parsed), 0);
}

function normalizeEndDate(value) {
	const text = normalizeText(value);
	if (!text) return "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59:59.999`;
	return text;
}

function sanitizeAuditValue(value) {
	if (Array.isArray(value)) return value.map(sanitizeAuditValue);
	if (!value || typeof value !== "object") return value;

	return Object.entries(value).reduce((sanitized, [key, entryValue]) => {
		sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
			? "[REDACTED]"
			: sanitizeAuditValue(entryValue);
		return sanitized;
	}, {});
}

function isSystemField(field) {
	return SYSTEM_FIELD_NAMES.has(
		String(field || "")
			.replace(/[-\s]/g, "_")
			.toLowerCase(),
	);
}

function removeSystemFields(value) {
	if (Array.isArray(value)) return value.map(removeSystemFields);
	if (!value || typeof value !== "object") return value;
	return Object.entries(value).reduce((clean, [key, entryValue]) => {
		if (!isSystemField(key)) clean[key] = removeSystemFields(entryValue);
		return clean;
	}, {});
}

function normalizeComparableValue(value) {
	return removeSystemFields(sanitizeAuditValue(value));
}

function stableSerialize(value) {
	return JSON.stringify(value ?? null);
}

function calculateChangedFields(beforeValue, afterValue) {
	const before = normalizeComparableValue(beforeValue || {});
	const after = normalizeComparableValue(afterValue || {});
	const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
	return [...fields]
		.filter((field) => !isSystemField(field))
		.filter((field) => stableSerialize(before[field]) !== stableSerialize(after[field]))
		.sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function getClientIpFromRequest(req = {}) {
	const forwardedFor = normalizeText(req.get?.("x-forwarded-for"));
	if (forwardedFor) return forwardedFor.split(",")[0].trim();
	return (
		normalizeText(req.get?.("cf-connecting-ip")) ||
		normalizeText(req.get?.("x-real-ip")) ||
		normalizeText(req.ip) ||
		normalizeText(req.socket?.remoteAddress)
	);
}

function captureAuditRequestContext(req, _res, next) {
	auditRequestContext.run(
		{
			ipAddress: getClientIpFromRequest(req),
			userAgent: normalizeText(req.get?.("user-agent")),
		},
		next,
	);
}

function getAuditRequestContext() {
	return auditRequestContext.getStore() || {};
}

function getCurrentUser() {
	return db.getRequestContext?.() || {};
}

function pickFirstText(...values) {
	for (const value of values) {
		const normalized = normalizeText(value);
		if (normalized) return normalized;
	}
	return "";
}

function isSensitiveField(field) {
	return SENSITIVE_KEY_PATTERN.test(String(field || ""));
}

function isProtectedValue(value) {
	return normalizeText(value) === "[REDACTED]";
}

function isTechnicalValue(value) {
	const text = normalizeText(value);
	if (!text) return false;
	return UUID_PATTERN.test(text) || TECHNICAL_VALUE_PATTERN.test(text);
}

function normalizeDisplayField(field) {
	return String(field || "")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[._-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractSetorId(user = {}, beforeData = {}, afterData = {}) {
	return pickFirstText(
		afterData.setor_id,
		afterData.setorId,
		afterData.departamento_id,
		afterData.departmentId,
		afterData.regional,
		beforeData.setor_id,
		beforeData.setorId,
		beforeData.departamento_id,
		beforeData.departmentId,
		beforeData.regional,
		user.setor_id,
		user.setorId,
		user.department_id,
		user.departmentId,
		user.regional,
	);
}

function shouldAuditDocument(collectionPath) {
	const collection = normalizeText(collectionPath);
	return Boolean(collection && !shouldIgnoreAuditEntity(collection));
}

function shouldIgnoreAuditEntity(entity) {
	const normalized = normalizeText(entity);
	if (!normalized) return false;
	if (IGNORED_DOCUMENT_COLLECTIONS.has(normalized)) return true;
	if (normalized.endsWith("_logs") || normalized.endsWith("_log")) return true;
	if (normalized.includes("mfa")) return true;
	return IGNORED_DOCUMENT_COLLECTION_PREFIXES.some((prefix) =>
		normalized.startsWith(prefix),
	);
}

function getAuditModule(collectionPath) {
	return normalizeText(collectionPath).split("/").filter(Boolean)[0] || "documentos";
}

function buildDocumentAuditPayload({ action, beforeRecord, afterRecord, record }) {
	const source = afterRecord || beforeRecord || record || {};
	const beforeData = sanitizeAuditValue(beforeRecord?.data || null);
	const afterData = sanitizeAuditValue(afterRecord?.data || record?.data || null);
	const user = getCurrentUser();

	return {
		action,
		module: getAuditModule(source.collectionPath),
		entity: source.collectionPath,
		recordId: source.documentId || source.path,
		setorId: extractSetorId(user, beforeRecord?.data || {}, afterRecord?.data || record?.data || {}),
		departmentId: extractSetorId(user, beforeRecord?.data || {}, afterRecord?.data || record?.data || {}),
		beforeData,
		afterData,
		changedFields: calculateChangedFields(beforeRecord?.data, afterRecord?.data || record?.data),
	};
}

async function writeAuditLog(entry = {}) {
	const user = getCurrentUser();
	const request = getAuditRequestContext();
	const id = crypto.randomUUID();
	await db.query(
		`insert into audit_logs (
       id, user_id, user_name, user_email, setor_id, department_id, module,
       entity, action, record_id, ip_address, user_agent, before_data,
       after_data, changed_fields
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb
     )`,
		[
			id,
			pickFirstText(user.uid, entry.userId),
			pickFirstText(user.nome, user.name, user.displayName, entry.userName),
			pickFirstText(user.email, entry.userEmail),
			normalizeText(entry.setorId),
			normalizeText(entry.departmentId),
			normalizeText(entry.module),
			normalizeText(entry.entity),
			normalizeText(entry.action),
			normalizeText(entry.recordId),
			pickFirstText(request.ipAddress, entry.ipAddress),
			pickFirstText(request.userAgent, entry.userAgent),
			JSON.stringify(entry.beforeData ?? null),
			JSON.stringify(entry.afterData ?? null),
			JSON.stringify(entry.changedFields || []),
		],
	);
	return id;
}

function recordAuditLog(entry = {}) {
	if (shouldIgnoreAuditEntity(entry.entity)) return Promise.resolve();
	return writeAuditLog(entry).catch((error) => {
		console.error("[audit-log] Falha ao gravar auditoria:", error?.message || error);
	});
}

function recordDocumentAuditLog(payload) {
	const source = payload?.afterRecord || payload?.beforeRecord || payload?.record || {};
	if (!shouldAuditDocument(source.collectionPath)) return Promise.resolve();
	const entry = buildDocumentAuditPayload(payload);
	if (entry.action === "update" && !entry.changedFields.length) {
		return Promise.resolve();
	}
	return recordAuditLog(entry);
}

function formatShortValue(value, field = "") {
	if (isSensitiveField(field) || isProtectedValue(value)) return PROTECTED_VALUE_LABEL;
	if (value === null || value === undefined || value === "") return "vazio";
	if (typeof value === "boolean") return value ? "ativo" : "inativo";
	if (Array.isArray(value)) return `${value.length} item(ns)`;
	if (typeof value === "object") {
		const label = pickFirstText(
			value.nome,
			value.name,
			value.label,
			value.titulo,
			value.title,
			value.codigo,
			value.email,
		);
		return label || "registro";
	}
	const text = String(value);
	if (isTechnicalValue(text)) return INTERNAL_VALUE_LABEL;
	return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function getFieldLabel(field) {
	return FIELD_LABELS[field] || normalizeDisplayField(field) || "campo";
}

function getEntityLabel(row = {}) {
	const entity = normalizeText(row.entity);
	return COLLECTION_LABELS[entity] || entity || row.module || "registro";
}

function getModuleLabel(row = {}) {
	const moduleName = normalizeText(row.module);
	return MODULE_LABELS[moduleName] || normalizeDisplayField(moduleName) || "Sistema";
}

function getActionLabel(action) {
	return ACTION_LABELS[normalizeText(action)] || normalizeDisplayField(action) || "Registro";
}

function getActor(row = {}) {
	const name = pickFirstText(row.userName, row.userEmail, row.userId) || "Usuário não identificado";
	return {
		email: normalizeText(row.userEmail),
		id: normalizeText(row.userId),
		name,
	};
}

function getRecordLabel(data = {}) {
	return pickFirstText(
		data.nome,
		data.name,
		data.label,
		data.titulo,
		data.title,
		data.cliente,
		data.cliente_nome,
		data.codigo_cliente,
		data.codigoCliente,
		data.codigo && data.nome ? `${data.codigo} ${data.nome}` : "",
		data.codigo,
	);
}

function getTargetLabel(row = {}) {
	return (
		getRecordLabel(row.afterData || {}) ||
		getRecordLabel(row.beforeData || {}) ||
		(isTechnicalValue(row.recordId) ? "" : normalizeText(row.recordId)) ||
		"registro"
	);
}

function getArrayItemKey(item = {}) {
	return pickFirstText(item.id, item.codigo, item.code, item.nome, item.name);
}

function getFinanceiroReportLabel(row = {}) {
	const recordId = normalizeText(row.recordId).toLowerCase();
	const beforeData = row.beforeData || {};
	const afterData = row.afterData || {};
	const sheetName = pickFirstText(
		afterData.importInfo?.sheetName,
		beforeData.importInfo?.sheetName,
	);
	if (recordId === "serasa" || /serasa/i.test(sheetName)) return "Serasa";
	if (recordId === "tarifas" || /tarifa/i.test(sheetName)) return "Tarifas";
	if (recordId === "budget" || recordId === "orcamento") return "orçamento";
	return "relatório financeiro";
}

function isFinanceiroReportClear(row = {}) {
	return (
		normalizeText(row.entity) === "financeiro_reports" &&
		row.action === "update" &&
		row.afterData?.importInfo?.cleared === true
	);
}

function getChangedFieldSet(row = {}) {
	const changedFields = Array.isArray(row.changedFields) ? row.changedFields : [];
	return new Set(
		changedFields.map((field) =>
			normalizeText(field)
				.replace(/[_\-\s]/g, "")
				.toLowerCase(),
		),
	);
}

function hasChangedField(changed, ...fields) {
	return fields.some((field) =>
		changed.has(
			normalizeText(field)
				.replace(/[_\-\s]/g, "")
				.toLowerCase(),
		),
	);
}

function getUserTargetLabel(row = {}) {
	return (
		getRecordLabel(row.afterData || {}) ||
		getRecordLabel(row.beforeData || {}) ||
		(isTechnicalValue(row.recordId) ? "" : pickFirstText(row.recordId)) ||
		"usuário"
	);
}

function buildUserChangeDescriptions(row = {}) {
	if (normalizeText(row.entity) !== "app_users" || row.action !== "update") return [];
	const changed = getChangedFieldSet(row);
	const target = getUserTargetLabel(row);
	const descriptions = [];
	const beforeRole = formatShortValue(row.beforeData?.role);
	const afterRole = formatShortValue(row.afterData?.role);

	if (hasChangedField(changed, "role") && beforeRole !== afterRole) {
		descriptions.push(`alterou cargo de ${target} de ${beforeRole} para ${afterRole}`);
	} else if (
		hasChangedField(changed, "role", "empresaId", "empresa_id")
	) {
		descriptions.push(`alterou cargo de ${target}`);
	}

	if (hasChangedField(changed, "nome", "name", "displayName", "display_name")) {
		descriptions.push(
			`alterou nome do usuário de ${formatShortValue(row.beforeData?.nome || row.beforeData?.name || row.beforeData?.displayName)} para ${formatShortValue(row.afterData?.nome || row.afterData?.name || row.afterData?.displayName)}`,
		);
	}
	if (hasChangedField(changed, "email")) {
		descriptions.push(
			`alterou e-mail de ${target} de ${formatShortValue(row.beforeData?.email)} para ${formatShortValue(row.afterData?.email)}`,
		);
	}
	if (hasChangedField(changed, "regional")) {
		descriptions.push(
			`alterou regional de ${target} de ${formatShortValue(row.beforeData?.regional)} para ${formatShortValue(row.afterData?.regional)}`,
		);
	}
	if (hasChangedField(changed, "disabled")) {
		descriptions.push(
			row.afterData?.disabled
				? `bloqueou acesso de ${target}`
				: `liberou acesso de ${target}`,
		);
	}
	return descriptions;
}

function buildRoleChangeDescriptions(row = {}) {
	if (normalizeText(row.entity) !== "app_roles" || row.action !== "update") return [];
	const changed = getChangedFieldSet(row);
	const target = getRecordLabel(row.afterData || {}) || getRecordLabel(row.beforeData || {}) || pickFirstText(row.recordId);
	const descriptions = [];

	if (hasChangedField(changed, "permissions")) {
		descriptions.push(`alterou permissões do cargo ${target}`);
	}
	if (hasChangedField(changed, "active")) {
		descriptions.push(
			row.afterData?.active === false
				? `desativou o cargo ${target}`
				: `ativou o cargo ${target}`,
		);
	}
	if (hasChangedField(changed, "name", "nome")) {
		descriptions.push(
			`renomeou cargo de ${formatShortValue(row.beforeData?.name || row.beforeData?.nome)} para ${formatShortValue(row.afterData?.name || row.afterData?.nome)}`,
		);
	}
	if (hasChangedField(changed, "description")) {
		descriptions.push(`alterou descrição do cargo ${target}`);
	}
	return descriptions;
}

function buildArrayChangeDescriptions(field, beforeValue, afterValue) {
	if (!Array.isArray(beforeValue) || !Array.isArray(afterValue)) return [];
	const beforeMap = new Map(beforeValue.map((item) => [getArrayItemKey(item), item]).filter(([key]) => key));
	const afterMap = new Map(afterValue.map((item) => [getArrayItemKey(item), item]).filter(([key]) => key));
	const label = getFieldLabel(field);
	const descriptions = [];

	for (const [key, item] of afterMap.entries()) {
		if (!beforeMap.has(key)) {
			descriptions.push(`adicionou ${label}: ${getRecordLabel(item) || key}`);
		}
	}
	for (const [key, item] of beforeMap.entries()) {
		if (!afterMap.has(key)) {
			descriptions.push(`removeu ${label}: ${getRecordLabel(item) || key}`);
		}
	}
	for (const [key, afterItem] of afterMap.entries()) {
		const beforeItem = beforeMap.get(key);
		if (!beforeItem) continue;
		const fields = calculateChangedFields(beforeItem, afterItem);
		fields.slice(0, 3).forEach((changedField) => {
			descriptions.push(
				`alterou ${getRecordLabel(afterItem) || key}: ${getFieldLabel(changedField)} de ${formatShortValue(beforeItem[changedField])} para ${formatShortValue(afterItem[changedField])}`,
			);
		});
		if (fields.length > 3) {
			descriptions.push(`alterou ${getRecordLabel(afterItem) || key}: mais ${fields.length - 3} campo(s)`);
		}
	}
	return descriptions;
}

function buildManualLaunchChangeItems(row = {}) {
	if (normalizeText(row.entity) !== "metas_lancamento_manual") return [];
	const beforeItems = Array.isArray(row.beforeData?.lancamentos)
		? row.beforeData.lancamentos
		: [];
	const afterItems = Array.isArray(row.afterData?.lancamentos)
		? row.afterData.lancamentos
		: [];
	const beforeMap = new Map(
		beforeItems.map((item) => [
			`${item.fonte || ""}|${item.secao || ""}|${item.nome || ""}|${item.dia || ""}`,
			item,
		]),
	);
	return afterItems.slice(0, 30).map((afterItem, index) => {
		const key = `${afterItem.fonte || ""}|${afterItem.secao || ""}|${afterItem.nome || ""}|${afterItem.dia || ""}`;
		const beforeItem = beforeMap.get(key) || {};
		const labelParts = [
			formatShortValue(afterItem.nome || beforeItem.nome),
			afterItem.dia ? `dia ${afterItem.dia}` : "",
			afterItem.fonte ? `base ${String(afterItem.fonte).toUpperCase()}` : "",
		].filter(Boolean);
		const label = labelParts.join(" · ") || `lançamento ${index + 1}`;
		const before = formatShortValue(beforeItem.valor, "valor");
		const after = formatShortValue(afterItem.valor, "valor");
		return {
			after,
			before,
			description: `alterou ${label} de ${before} para ${after}`,
			field: `lancamentos.${index}.valor`,
			label,
			protected: false,
		};
	});
}

function buildGenericChangeItems(row = {}) {
	const beforeData = normalizeComparableValue(row.beforeData || {});
	const afterData = normalizeComparableValue(row.afterData || {});
	const changedFields = Array.isArray(row.changedFields)
		? row.changedFields.filter((field) => !isSystemField(field))
		: calculateChangedFields(beforeData, afterData);

	return changedFields.flatMap((field) => {
		const beforeValue = beforeData?.[field];
		const afterValue = afterData?.[field];
		const arrayDescriptions = buildArrayChangeDescriptions(field, beforeValue, afterValue);
		if (arrayDescriptions.length) {
			return arrayDescriptions.map((description, index) => ({
				after: formatShortValue(afterValue, field),
				before: formatShortValue(beforeValue, field),
				description,
				field: `${field}.${index}`,
				label: getFieldLabel(field),
				protected: isSensitiveField(field),
			}));
		}
		const before = formatShortValue(beforeValue, field);
		const after = formatShortValue(afterValue, field);
		return [
			{
				after,
				before,
				description: `alterou ${getFieldLabel(field)} de ${before} para ${after}`,
				field,
				label: getFieldLabel(field),
				protected: isSensitiveField(field),
			},
		];
	});
}

function buildChangeItems(row = {}) {
	if (isFinanceiroReportClear(row)) {
		return [
			{
				after: "dados apagados",
				before: "dados importados",
				description: `apagou dados do ${getFinanceiroReportLabel(row)}`,
				field: "importInfo",
				label: getFinanceiroReportLabel(row),
				protected: false,
			},
		];
	}
	const manualLaunchItems = buildManualLaunchChangeItems(row);
	if (manualLaunchItems.length) return manualLaunchItems;
	return buildGenericChangeItems(row).slice(0, 30);
}

function buildChangeDescriptions(row = {}) {
	if (isFinanceiroReportClear(row)) {
		return [`apagou dados do ${getFinanceiroReportLabel(row)}`];
	}
	const roleChanges = buildRoleChangeDescriptions(row);
	if (roleChanges.length) return roleChanges.slice(0, 10);
	const userChanges = buildUserChangeDescriptions(row);
	if (userChanges.length) return userChanges.slice(0, 10);

	const descriptions = buildChangeItems(row).map((item) => item.description);

	return descriptions.slice(0, 10);
}

function buildAuditSummary(row = {}) {
	const actor = getActor(row).name;
	if (isFinanceiroReportClear(row)) {
		return `${actor} apagou dados do ${getFinanceiroReportLabel(row)}.`;
	}
	const entityLabel = getEntityLabel(row);
	const target = getTargetLabel(row);
	if (row.action === "create") return `${actor} criou ${entityLabel}${target ? ` ${target}` : ""}.`;
	if (row.action === "delete") return `${actor} removeu ${entityLabel}${target ? ` ${target}` : ""}.`;
	const changes = buildChangeDescriptions(row);
	if (changes.length) return `${actor} ${changes[0]}.`;
	return `${actor} atualizou ${entityLabel}${target ? ` ${target}` : ""}.`;
}

function decorateAuditLog(row = {}) {
	const changeItems = buildChangeItems(row);
	const changeDescriptions = buildChangeDescriptions(row);
	const actor = getActor(row);
	return {
		...row,
		actionLabel: getActionLabel(row.action),
		actor,
		changeDescriptions,
		changeItems,
		changedFields: Array.isArray(row.changedFields)
			? row.changedFields.filter((field) => !isSystemField(field))
			: [],
		entityLabel: getEntityLabel(row),
		moduleLabel: getModuleLabel(row),
		recordLabel: getTargetLabel(row),
		summary: buildAuditSummary({ ...row, changeDescriptions }),
	};
}

function buildWhereClauses(filters = {}) {
	const clauses = [];
	const params = [];
	const addClause = (sql, ...values) => {
		let clause = sql;
		values.forEach((value) => {
			params.push(value);
			clause = clause.replace("?", `$${params.length}`);
		});
		clauses.push(clause);
	};

	[...IGNORED_DOCUMENT_COLLECTIONS].forEach((collection) => {
		addClause("coalesce(entity, '') <> ?", collection);
	});
	IGNORED_DOCUMENT_COLLECTION_PREFIXES.forEach((prefix) => {
		addClause("coalesce(entity, '') not ilike ?", `${prefix}%`);
	});
	addClause("coalesce(entity, '') not ilike ?", "%mfa%");
	addClause("coalesce(entity, '') not ilike ? escape '\\'", "%\\_logs");
	addClause("coalesce(entity, '') not ilike ? escape '\\'", "%\\_log");

	if (filters.userId) {
		const userSearch = `%${filters.userId}%`;
		addClause(
			"(user_id ilike ? or user_name ilike ? or user_email ilike ?)",
			userSearch,
			userSearch,
			userSearch,
		);
	}
	if (filters.setorId)
		addClause(
			"(setor_id ilike ? or department_id ilike ?)",
			`%${filters.setorId}%`,
			`%${filters.setorId}%`,
		);
	if (filters.module) addClause("module ilike ?", `%${filters.module}%`);
	if (filters.entity) addClause("entity ilike ?", `%${filters.entity}%`);
	if (filters.action) addClause("action = ?", filters.action);
	if (filters.startDate) addClause("created_at >= ?", filters.startDate);
	if (filters.endDate) addClause("created_at <= ?", filters.endDate);

	return {
		params,
		whereSql: clauses.length ? `where ${clauses.join(" and ")}` : "",
	};
}

async function listAuditLogs(query = {}) {
	const filters = {
		userId: normalizeText(query.userId || query.user_id),
		setorId: normalizeText(query.setorId || query.setor_id || query.departmentId || query.department_id),
		module: normalizeText(query.module),
		entity: normalizeText(query.entity),
		action: normalizeText(query.action),
		startDate: normalizeText(query.startDate || query.start_date),
		endDate: normalizeEndDate(query.endDate || query.end_date),
	};
	const limit = normalizeLimit(query.limit);
	const offset = normalizeOffset(query.offset);
	const { whereSql, params } = buildWhereClauses(filters);
	const result = await db.query(
		`select id, user_id as "userId", user_name as "userName",
            user_email as "userEmail", setor_id as "setorId",
            department_id as "departmentId", module, entity, action,
            record_id as "recordId", ip_address as "ipAddress",
            user_agent as "userAgent", changed_fields as "changedFields",
            before_data as "beforeData", after_data as "afterData",
            created_at as "createdAt", count(*) over()::int as "totalCount"
       from audit_logs
       ${whereSql}
      order by created_at desc
      limit $${params.length + 1} offset $${params.length + 2}`,
		[...params, limit, offset],
	);

	return {
		items: result.rows.map(({ totalCount: _totalCount, beforeData: _beforeData, afterData: _afterData, ...row }) => {
			const decorated = decorateAuditLog({
				...row,
				beforeData: _beforeData,
				afterData: _afterData,
			});
			const { beforeData: _listBeforeData, afterData: _listAfterData, ...summaryRow } = decorated;
			return summaryRow;
		}),
		limit,
		offset,
		total: result.rows[0]?.totalCount || 0,
	};
}

async function listAuditLogOptions() {
	const result = await db.query(
		`select distinct nullif(coalesce(setor_id, department_id, ''), '') as setor,
		        nullif(module, '') as module
		   from audit_logs
		  where (
		          nullif(coalesce(setor_id, department_id, ''), '') is not null
		       or nullif(module, '') is not null
		        )
		    and coalesce(entity, '') <> all($1::text[])
		    and not exists (
		      select 1
		        from unnest($2::text[]) ignored_prefix(prefix)
		       where coalesce(entity, '') ilike ignored_prefix.prefix || '%'
		    )
		    and coalesce(entity, '') not ilike '%mfa%'
		    and right(coalesce(entity, ''), 5) <> '_logs'
		    and right(coalesce(entity, ''), 4) <> '_log'
		  order by setor nulls last, module nulls last`,
		[[...IGNORED_DOCUMENT_COLLECTIONS], IGNORED_DOCUMENT_COLLECTION_PREFIXES],
	);
	const setores = new Set();
	const modules = new Set();
	result.rows.forEach((row) => {
		if (row.setor) setores.add(row.setor);
		if (row.module) modules.add(row.module);
	});
	return {
		modules: [...modules].sort((left, right) => left.localeCompare(right, "pt-BR")),
		setores: [...setores].sort((left, right) => left.localeCompare(right, "pt-BR")),
	};
}

async function getAuditLog(id) {
	const result = await db.query(
		`select id, user_id as "userId", user_name as "userName",
            user_email as "userEmail", setor_id as "setorId",
            department_id as "departmentId", module, entity, action,
            record_id as "recordId", ip_address as "ipAddress",
            user_agent as "userAgent", before_data as "beforeData",
            after_data as "afterData", changed_fields as "changedFields",
            created_at as "createdAt"
       from audit_logs
      where id = $1`,
		[normalizeText(id)],
	);
	return result.rows[0] ? decorateAuditLog(result.rows[0]) : null;
}

module.exports = {
	__testables: {
		calculateChangedFields,
		buildAuditSummary,
		buildChangeDescriptions,
		getClientIpFromRequest,
		sanitizeAuditValue,
		shouldIgnoreAuditEntity,
		shouldAuditDocument,
	},
	calculateChangedFields,
	captureAuditRequestContext,
	getAuditLog,
	listAuditLogOptions,
	listAuditLogs,
	recordAuditLog,
	recordDocumentAuditLog,
};

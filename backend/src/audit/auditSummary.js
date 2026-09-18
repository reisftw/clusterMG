// Resumo humanizado dos logs de auditoria do Finan — porta simplificada de
// vps/api/src/auditLog.js (buildAuditSummary/buildChangeDescriptions/
// decorateAuditLog), adaptada as entidades do Finan (finan_users,
// finan_roles, finan_integration_configs, database_backup, etc.) e ao
// shape de linha vindo de finan_audit_logs (colunas em snake_case).
const SENSITIVE_KEY_PATTERN =
	/(password|senha|token|secret|authorization|cookie|credential|privatekey|api[_-]?key)/i;
const SYSTEM_FIELD_NAMES = new Set([
	"updated_at",
	"updatedat",
	"created_at",
	"createdat",
	"last_login_at",
	"lastloginat",
]);

const FIELD_LABELS = {
	active: "status",
	baseUrl: "URL base",
	clientId: "Client ID",
	clientSecret: "Client secret",
	description: "descrição",
	email: "e-mail",
	is_admin: "acesso total",
	mfa_enabled: "MFA",
	name: "nome",
	permissions: "permissões",
	role_id: "cargo",
	status: "status",
};

const ENTITY_LABELS = {
	database_backup: "backup do banco de dados",
	finan_integration_configs: "integração",
	finan_roles: "cargo/perfil",
	finan_settings: "configuração",
	finan_users: "usuário",
	// Roteiro Finan #33 (Fase 4B — estende #10): entidades do path
	// genérico (ver resolveAuditEntity em app.js) — o path de uma
	// sub-ação como POST /finan/contas-pagar/:id/pagar vira entity
	// "finan/contas-pagar/<id>" (o id entra nos 3 segmentos), por isso
	// getEntityLabel casa por PREFIXO, não só igualdade exata.
	"finan/anexos": "anexo",
	"finan/contas-pagar": "conta a pagar",
	"finan/contas-receber": "conta a receber",
	"finan/fechamento": "fechamento do período",
};

function normalizeText(value) {
	return String(value || "").trim();
}

function pickFirstText(...values) {
	for (const value of values) {
		const normalized = normalizeText(value);
		if (normalized) return normalized;
	}
	return "";
}

function isSystemField(field) {
	return SYSTEM_FIELD_NAMES.has(String(field || "").toLowerCase());
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
	const before = normalizeComparableValue(beforeValue || {}) || {};
	const after = normalizeComparableValue(afterValue || {}) || {};
	const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
	return [...fields]
		.filter((field) => !isSystemField(field))
		.filter((field) => stableSerialize(before[field]) !== stableSerialize(after[field]))
		.sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function formatShortValue(value) {
	if (value === null || value === undefined || value === "") return "vazio";
	if (typeof value === "boolean") return value ? "ativo" : "inativo";
	if (Array.isArray(value)) return `${value.length} item(ns)`;
	if (typeof value === "object") {
		return pickFirstText(value.name, value.label, value.id) || "objeto";
	}
	const text = String(value);
	return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function getFieldLabel(field) {
	return FIELD_LABELS[field] || String(field || "").replace(/_/g, " ");
}

function getEntityLabel(row = {}) {
	const entity = normalizeText(row.entity);
	if (ENTITY_LABELS[entity]) return ENTITY_LABELS[entity];
	const prefixMatch = Object.keys(ENTITY_LABELS).find((key) => entity.startsWith(`${key}/`));
	if (prefixMatch) return ENTITY_LABELS[prefixMatch];
	return entity || row.module || "registro";
}

function getRecordLabel(data = {}) {
	return pickFirstText(data.name, data.label, data.title, data.id);
}

function getChangedFieldSet(row = {}) {
	const changedFields = Array.isArray(row.changed_fields) ? row.changed_fields : [];
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

function buildUserChangeDescriptions(row = {}) {
	if (normalizeText(row.entity) !== "finan_users" || row.action !== "update") return [];
	const changed = getChangedFieldSet(row);
	const target =
		getRecordLabel(row.after_data || {}) || getRecordLabel(row.before_data || {}) || pickFirstText(row.record_id);
	const descriptions = [];

	if (hasChangedField(changed, "role_id")) {
		descriptions.push(
			`alterou cargo de ${target} de ${formatShortValue(row.before_data?.role_id)} para ${formatShortValue(row.after_data?.role_id)}`,
		);
	}
	if (hasChangedField(changed, "status")) {
		descriptions.push(
			`alterou status de ${target} para ${formatShortValue(row.after_data?.status)}`,
		);
	}
	if (hasChangedField(changed, "mfa_enabled")) {
		descriptions.push(
			row.after_data?.mfa_enabled
				? `ativou MFA de ${target}`
				: `desativou MFA de ${target}`,
		);
	}
	return descriptions;
}

function buildRoleChangeDescriptions(row = {}) {
	if (normalizeText(row.entity) !== "finan_roles" || row.action !== "update") return [];
	const changed = getChangedFieldSet(row);
	const target =
		getRecordLabel(row.after_data || {}) || getRecordLabel(row.before_data || {}) || pickFirstText(row.record_id);
	const descriptions = [];

	if (hasChangedField(changed, "permissions")) {
		descriptions.push(`alterou permissões do cargo ${target}`);
	}
	if (hasChangedField(changed, "active")) {
		descriptions.push(
			row.after_data?.active === false ? `desativou o cargo ${target}` : `ativou o cargo ${target}`,
		);
	}
	if (hasChangedField(changed, "is_admin")) {
		descriptions.push(
			row.after_data?.is_admin ? `concedeu acesso total ao cargo ${target}` : `removeu acesso total do cargo ${target}`,
		);
	}
	if (hasChangedField(changed, "name")) {
		descriptions.push(
			`renomeou cargo de ${formatShortValue(row.before_data?.name)} para ${formatShortValue(row.after_data?.name)}`,
		);
	}
	return descriptions;
}

function buildIntegrationChangeDescriptions(row = {}) {
	if (normalizeText(row.entity) !== "finan_integration_configs") return [];
	if (row.action === "integration.test") {
		return [`testou a conexão da integração ${row.record_id || ""}`.trim()];
	}
	const changed = getChangedFieldSet(row);
	const target = row.record_id || "integração";
	const descriptions = [];
	if (hasChangedField(changed, "status")) {
		descriptions.push(
			`alterou status da integração ${target} para ${formatShortValue(row.after_data?.status)}`,
		);
	}
	if (hasChangedField(changed, "config")) {
		descriptions.push(`atualizou credenciais/configuração da integração ${target}`);
	}
	return descriptions;
}

function buildChangeDescriptions(row = {}) {
	const roleChanges = buildRoleChangeDescriptions(row);
	if (roleChanges.length) return roleChanges.slice(0, 10);
	const userChanges = buildUserChangeDescriptions(row);
	if (userChanges.length) return userChanges.slice(0, 10);
	const integrationChanges = buildIntegrationChangeDescriptions(row);
	if (integrationChanges.length) return integrationChanges.slice(0, 10);

	const beforeData = normalizeComparableValue(row.before_data || {});
	const afterData = normalizeComparableValue(row.after_data || {});
	const changedFields = Array.isArray(row.changed_fields) && row.changed_fields.length
		? row.changed_fields.filter((field) => !isSystemField(field))
		: calculateChangedFields(beforeData, afterData);

	const descriptions = changedFields.map((field) => {
		const beforeValue = beforeData?.[field];
		const afterValue = afterData?.[field];
		return `alterou ${getFieldLabel(field)} de ${formatShortValue(beforeValue)} para ${formatShortValue(afterValue)}`;
	});

	return descriptions.slice(0, 10);
}

function buildAuditSummary(row = {}) {
	const actor = pickFirstText(row.user_name, row.user_email, row.user_id) || "Usuário";
	const entityLabel = getEntityLabel(row);
	const afterLabel = getRecordLabel(row.after_data || {});
	const beforeLabel = getRecordLabel(row.before_data || {});
	const target = afterLabel || beforeLabel || row.record_id;
	// Roteiro Finan #33 (Fase 4B — estende #10): estados de documento que
	// não são um create/update genérico — "baixado" (conta a pagar/
	// receber marcada como paga/recebida) e "fechado"/"reaberto" (período
	// do Fechamento Mensal, roteiro #12).
	if (row.action === "baixar") return `${actor} baixou ${entityLabel}${target ? ` ${target}` : ""}.`;
	if (row.action === "fechar") return `${actor} fechou o período (${entityLabel}).`;
	if (row.action === "reabrir") return `${actor} reabriu o período (${entityLabel}).`;
	if (row.action === "create" && normalizeText(row.entity).startsWith("finan/anexos")) {
		return `${actor} anexou um documento${target ? ` (${target})` : ""}.`;
	}
	if (row.action === "create") return `${actor} criou ${entityLabel}${target ? ` ${target}` : ""}.`;
	if (row.action === "delete") return `${actor} removeu ${entityLabel}${target ? ` ${target}` : ""}.`;
	if (String(row.action || "").endsWith(".test")) {
		return `${actor} testou a conexão de ${entityLabel}${target ? ` ${target}` : ""}.`;
	}
	const changes = buildChangeDescriptions(row);
	if (changes.length) return `${actor} ${changes[0]}.`;
	return `${actor} atualizou ${entityLabel}${target ? ` ${target}` : ""}.`;
}

function decorateFinanAuditLog(row = {}) {
	const changeDescriptions = buildChangeDescriptions(row);
	return {
		...row,
		changeDescriptions,
		summary: buildAuditSummary({ ...row, changeDescriptions }),
	};
}

module.exports = {
	__testables: {
		buildAuditSummary,
		buildChangeDescriptions,
		calculateChangedFields,
	},
	calculateChangedFields,
	decorateFinanAuditLog,
};

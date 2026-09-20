// Helper reutilizavel de escopo regional por registro — defesa contra IDOR
// (docs/TECHNICAL-AUDIT.md, achado #3): ter a permissao de "gerenciar"
// (ex.: manage_agendamentos, atendimento.casos.manage) nao deveria
// significar poder agir sobre QUALQUER registro do sistema, independente
// da regional do usuario.
//
// Mesmo criterio ja usado (e testado) em app.js#canAccessRegionalRecord
// para o modulo de acerto de estoque — generalizado aqui pra outros
// dominios (agendamentos, atendimento) sem duplicar a logica rota a rota.
// So os papeis listados em `scopedRoles` (por padrao, so "supervisor" —
// mesmo criterio de app.js#REGIONAL_SCOPED_ACERTO_ROLES) sao restritos;
// "admin" e papeis de gestao global (ex.: backoffice_retirada) continuam
// com acesso irrestrito por design ja estabelecido neste projeto.
const DEFAULT_SCOPED_ROLES = ["supervisor"];

function normalizeComparableText(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
}

function normalizeUserRole(role) {
	return String(role || "").trim().toLowerCase();
}

function hasRole(user, roles = []) {
	const role = normalizeUserRole(user?.role || user?.profile?.role);
	return roles.map((item) => normalizeUserRole(item)).includes(role);
}

function getUserRegional(user) {
	return String(user?.regional || user?.profile?.regional || "").trim();
}

function getRecordRegional(data = {}) {
	return String(
		data.regional ||
			data.regionalNome ||
			data.regional_nome ||
			data.filial_id ||
			data.filial ||
			"",
	).trim();
}

/**
 * `true` se `user` pode acessar/alterar um registro cujo escopo regional é
 * `getRecordRegional(data)`. Admin sempre pode. Um usuário com papel fora
 * de `scopedRoles` também sempre pode (mesmo comportamento de hoje — a
 * restrição é adicional, não substitui a permissão funcional já checada
 * pelo middleware de rota). Um usuário escopado sem regional própria
 * configurada, ou tentando acessar um registro sem regional que bata com a
 * dele, é bloqueado — mesmo critério já usado/testado em
 * app.js#canAccessRegionalRecord.
 *
 * `allowUnknownRegional` (default false, mantendo o critério acima): quando
 * `true`, um registro cujo `getRecordRegional` não retorna nada (regional
 * ainda não determinada/atribuída) não é bloqueado — usado em domínios
 * onde o registro pode legitimamente não ter regional definida ainda (ex.:
 * caso de atendimento antes de um técnico ser identificado) e bloquear
 * nesse caso seria uma regressão operacional sem ganho real de segurança
 * (não há regional concreta sendo protegida).
 */
function canAccessRegionalRecord(
	user,
	data = {},
	{ scopedRoles = DEFAULT_SCOPED_ROLES, allowUnknownRegional = false } = {},
) {
	if (normalizeUserRole(user?.role || user?.profile?.role) === "admin") return true;
	if (!hasRole(user, scopedRoles)) return true;
	const userRegional = normalizeComparableText(getUserRegional(user));
	if (!userRegional) return false;
	const recordRegional = normalizeComparableText(getRecordRegional(data));
	if (!recordRegional) return allowUnknownRegional;
	return recordRegional === userRegional;
}

/** Lança erro 403 (mesmo formato de erro já usado no restante do backend,
 * `error.statusCode`, consumido pelo handler global de `app.js`) se o
 * usuário não puder acessar o registro. */
function assertRegionalRecordAccess(user, data, options) {
	if (!canAccessRegionalRecord(user, data, options)) {
		const error = new Error(
			"Você não tem acesso a este registro (regional diferente da sua).",
		);
		error.statusCode = 403;
		throw error;
	}
}

/**
 * Para escrita (create/update): quando o ator é um papel escopado, força o
 * campo `regional` do payload a ser o da PRÓPRIA regional do usuário — em
 * vez de confiar no valor enviado pelo cliente, que poderia tentar criar/
 * mover um registro para outra regional. Mesmo padrão já usado em
 * app.js#applyRegionalScopeToData. Usuários não escopados (admin,
 * backoffice_retirada, etc.) mantêm o valor enviado sem alteração.
 */
function scopeWritePayload(user, data = {}, { scopedRoles = DEFAULT_SCOPED_ROLES } = {}) {
	if (normalizeUserRole(user?.role || user?.profile?.role) === "admin") return data;
	if (!hasRole(user, scopedRoles)) return data;
	const userRegional = getUserRegional(user);
	if (!userRegional) return data;
	return { ...data, regional: userRegional };
}

module.exports = {
	normalizeComparableText,
	getUserRegional,
	getRecordRegional,
	canAccessRegionalRecord,
	assertRegionalRecordAccess,
	scopeWritePayload,
};

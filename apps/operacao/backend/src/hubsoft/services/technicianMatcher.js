const { normalizeText, text, toNumberOrNull } = require("../utils/text");

async function resolveHubsoftTechnician(client, hubsoftTechnician = {}) {
	const hubsoftUserId = toNumberOrNull(hubsoftTechnician.id || hubsoftTechnician.id_usuario || hubsoftTechnician.id_tecnico);
	const email = text(hubsoftTechnician.email).toLowerCase();
	const name = text(hubsoftTechnician.nome || hubsoftTechnician.name || hubsoftTechnician.display || hubsoftTechnician.descricao);
	if (hubsoftUserId) {
		const { rows } = await client.query(
			`select id, empresa_id, nome, 'matched' as status, 'hubsoft_user_id' as reason
			   from operacao_tecnicos
			  where hubsoft_user_id = $1
			  limit 1`,
			[hubsoftUserId],
		);
		if (rows[0]) return rows[0];
	}
	if (email) {
		const { rows } = await client.query(
			`select id, empresa_id, nome, 'matched' as status, 'email' as reason
			   from operacao_tecnicos
			  where lower(coalesce(email, '')) = $1 and status = 'Ativo'
			  limit 2`,
			[email],
		);
		if (rows.length === 1) return rows[0];
		if (rows.length > 1) return { status: "ambiguous", reason: "email", id: null, empresa_id: null };
	}
	if (name) {
		const normalized = normalizeText(name);
		const { rows } = await client.query(
			`select id, empresa_id, nome
			   from operacao_tecnicos
			  where status = 'Ativo'`,
		);
		const matches = rows.filter((row) => normalizeText(row.nome) === normalized).slice(0, 2);
		if (matches.length === 1) return { ...matches[0], status: "matched_by_name", reason: "name" };
		if (matches.length > 1) return { status: "ambiguous", reason: "name", id: null, empresa_id: null };
	}
	return { status: "not_found", reason: hubsoftUserId ? "hubsoft_user_id_missing" : "missing_identifier", id: null, empresa_id: null };
}

module.exports = { resolveHubsoftTechnician };

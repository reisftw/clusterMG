const { normalizeText, text, toNumberOrNull } = require("../utils/text");

function parseCompanyNameFromTechnicianName(name = "") {
	const parts = text(name).split("|").map((part) => text(part)).filter(Boolean);
	return parts.length >= 2 ? parts.at(-1) : "";
}

async function findCompanyByName(client, companyName) {
	const normalized = normalizeText(companyName);
	if (!normalized) return null;
	const { rows } = await client.query(
		`select id, nome
		   from operacao_empresas
		  where status = 'Ativa'`,
	);
	return rows.find((row) => normalizeText(row.nome) === normalized) || null;
}

async function ensureCompanyFromTechnicianName(client, technicianName) {
	const companyName = parseCompanyNameFromTechnicianName(technicianName);
	if (!companyName) return null;
	const existing = await findCompanyByName(client, companyName);
	if (existing) return existing;
	const { rows } = await client.query(
		`insert into operacao_empresas (nome, status, atuacao, observacoes, source_payload)
		 values ($1, 'Ativa', 'Ativacao', $2, $3::jsonb)
		 on conflict do nothing
		 returning id, nome`,
		[
			companyName,
			"Cadastro automático criado pela sincronização HubSoft de ativações. Complete os demais dados no cadastro de empresas.",
			JSON.stringify({ source: "hubsoft_activation_sync", inferredFromTechnicianName: technicianName }),
		],
	);
	if (rows[0]) return rows[0];
	return findCompanyByName(client, companyName);
}

async function ensureTechnicianFromHubsoft(client, { hubsoftUserId, email, name, companyId }) {
	if (!hubsoftUserId && !email && !name) return null;
	const { rows } = await client.query(
		`insert into operacao_tecnicos (
			empresa_id, nome, email, hubsoft_user_id, area_operacional, status, observacoes, source_payload
		)
		values ($1::uuid, $2, nullif($3, ''), $4, 'delivery', 'Ativo', $5, $6::jsonb)
		on conflict do nothing
		returning id, empresa_id, nome`,
		[
			companyId || null,
			name,
			email || "",
			hubsoftUserId || null,
			"Cadastro automático criado pela sincronização HubSoft de ativações.",
			JSON.stringify({ source: "hubsoft_activation_sync", hubsoftUserId, hubsoftName: name }),
		],
	);
	if (rows[0]) return rows[0];
	return null;
}

async function updateTechnicianCompanyIfNeeded(client, technician, companyId, hubsoftUserId) {
	if (!technician?.id || !companyId || technician.empresa_id) return technician;
	const { rows } = await client.query(
		`update operacao_tecnicos
		    set empresa_id = $2::uuid,
		        hubsoft_user_id = coalesce(hubsoft_user_id, $3),
		        source_payload = coalesce(source_payload, '{}'::jsonb) || $4::jsonb,
		        updated_at = now()
		  where id = $1::uuid
		  returning id, empresa_id, nome`,
		[
			technician.id,
			companyId,
			hubsoftUserId || null,
			JSON.stringify({ hubsoftCompanyInferredAt: new Date().toISOString() }),
		],
	);
	return rows[0] || technician;
}

async function resolveHubsoftTechnician(client, hubsoftTechnician = {}) {
	const hubsoftUserId = toNumberOrNull(hubsoftTechnician.id || hubsoftTechnician.id_usuario || hubsoftTechnician.id_tecnico);
	const email = text(hubsoftTechnician.email).toLowerCase();
	const name = text(hubsoftTechnician.nome || hubsoftTechnician.name || hubsoftTechnician.display || hubsoftTechnician.descricao);
	const inferredCompany = await ensureCompanyFromTechnicianName(client, name);
	if (!hubsoftUserId && !email && (!name || normalizeText(name) === "fila")) {
		return { status: "not_found", reason: "unassigned", id: null, empresa_id: null };
	}
	if (hubsoftUserId) {
		const { rows } = await client.query(
			`select id, empresa_id, nome, 'matched' as status, 'hubsoft_user_id' as reason
			   from operacao_tecnicos
			  where hubsoft_user_id = $1
			  limit 1`,
			[hubsoftUserId],
		);
		if (rows[0]) {
			const updated = await updateTechnicianCompanyIfNeeded(client, rows[0], inferredCompany?.id, hubsoftUserId);
			return { ...rows[0], ...updated };
		}
	}
	if (email) {
		const { rows } = await client.query(
			`select id, empresa_id, nome, 'matched' as status, 'email' as reason
			   from operacao_tecnicos
			  where lower(coalesce(email, '')) = $1 and status = 'Ativo'
			  limit 2`,
			[email],
		);
		if (rows.length === 1) {
			const updated = await updateTechnicianCompanyIfNeeded(client, rows[0], inferredCompany?.id, hubsoftUserId);
			return { ...rows[0], ...updated };
		}
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
		if (matches.length === 1) {
			const updated = await updateTechnicianCompanyIfNeeded(client, matches[0], inferredCompany?.id, hubsoftUserId);
			return { ...matches[0], ...updated, status: "matched_by_name", reason: "name" };
		}
		if (matches.length > 1) return { status: "ambiguous", reason: "name", id: null, empresa_id: null };
	}
	if (name && inferredCompany?.id) {
		const created = await ensureTechnicianFromHubsoft(client, {
			hubsoftUserId,
			email,
			name,
			companyId: inferredCompany.id,
		});
		if (created) return { ...created, status: "matched", reason: "auto_created_from_hubsoft_name" };
	}
	return { status: "not_found", reason: hubsoftUserId ? "hubsoft_user_id_missing" : "missing_identifier", id: null, empresa_id: null };
}

module.exports = { parseCompanyNameFromTechnicianName, resolveHubsoftTechnician };

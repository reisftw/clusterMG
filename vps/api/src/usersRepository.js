const db = require("./db");

const COLLECTION_PATH = "usuarios";

function normalizeRole(role) {
	return String(role || "")
		.trim()
		.toLowerCase();
}

function normalizeEmail(email) {
	return String(email || "")
		.trim()
		.toLowerCase();
}

function text(value) {
	return String(value || "").trim();
}

function nullableText(value) {
	const normalized = text(value);
	return normalized || null;
}

function bool(value, fallback = false) {
	if (value === undefined || value === null || value === "") return fallback;
	if (typeof value === "boolean") return value;
	return ["1", "true", "yes", "sim", "on"].includes(
		String(value).trim().toLowerCase(),
	);
}

function userPath(uid) {
	return `${COLLECTION_PATH}/${uid}`;
}

function documentIdFromPath(documentPathOrUid) {
	const parts = String(documentPathOrUid || "")
		.split("/")
		.filter(Boolean);
	return parts.at(-1) || "";
}

function mapAppUserRowToProfile(row = {}) {
	const profile = row.imported_profile || {};
	const uid = row.uid || profile.uid || profile.id || "";
	const email = row.email || profile.email || "";
	const nome =
		row.display_name ||
		profile.nome ||
		profile.displayName ||
		profile.display_name ||
		email ||
		"";
	const role = normalizeRole(row.role || profile.role);
	const regional = row.regional || profile.regional || "";
	const empresaId = row.empresa_id || profile.empresaId || profile.empresa_id || "";
	const empresaNome =
		row.empresa_nome || profile.empresaNome || profile.empresa_nome || "";
	const insumosBaseId =
		row.insumos_base_id ||
		profile.insumosBaseId ||
		profile.insumos_base_id ||
		profile.baseInsumosId ||
		"";
	const insumosBaseNome =
		row.insumos_base_nome ||
		profile.insumosBaseNome ||
		profile.insumos_base_nome ||
		profile.baseInsumosNome ||
		"";

	return {
		id: uid,
		uid,
		email,
		nome,
		displayName: profile.displayName || nome,
		display_name: profile.display_name || nome,
		role,
		regional,
		disabled: Boolean(row.disabled),
		inativo: Boolean(row.disabled),
		trocar_senha: Boolean(row.must_change_password),
		must_change_password: Boolean(row.must_change_password),
		ultimo_login: row.last_login_at || profile.ultimo_login || null,
		last_login_at: row.last_login_at || profile.last_login_at || null,
		ultimo_login_ip: row.last_login_ip || profile.ultimo_login_ip || "",
		last_login_ip: row.last_login_ip || profile.last_login_ip || "",
		ultimo_login_navegador:
			row.last_login_user_agent || profile.ultimo_login_navegador || "",
		last_login_user_agent:
			row.last_login_user_agent || profile.last_login_user_agent || "",
		login_provider: profile.login_provider || "local",
		criado_por_oauth: Boolean(profile.criado_por_oauth),
		status_oauth: profile.status_oauth || "",
		empresaId,
		empresa_id: empresaId,
		empresaNome,
		empresa_nome: empresaNome,
		insumosBaseId,
		insumos_base_id: insumosBaseId,
		baseInsumosId: insumosBaseId,
		insumosBaseNome,
		insumos_base_nome: insumosBaseNome,
		baseInsumosNome: insumosBaseNome,
		insumosCategoriasVer: Array.isArray(profile.insumosCategoriasVer)
			? profile.insumosCategoriasVer
			: [],
		insumosCategoriasSolicitar: Array.isArray(
			profile.insumosCategoriasSolicitar,
		)
			? profile.insumosCategoriasSolicitar
			: [],
		avatarUrl: profile.avatarUrl || profile.avatar_url || "",
		avatar_url: profile.avatar_url || profile.avatarUrl || "",
		avatarDataUrl: profile.avatarDataUrl || profile.avatar_data_url || "",
		avatar_data_url: profile.avatar_data_url || profile.avatarDataUrl || "",
		criado_em: profile.criado_em || row.created_at || null,
		atualizado_em: profile.atualizado_em || row.updated_at || null,
	};
}

function mapAppUserRowToDocument(row = {}) {
	return {
		path: userPath(row.uid),
		collectionPath: COLLECTION_PATH,
		documentId: row.uid,
		parentPath: null,
		data: mapAppUserRowToProfile(row),
		exportedAt: null,
		importedAt: null,
		updatedAt: row.updated_at || null,
	};
}

const USER_COLUMNS = `
	uid, email, display_name, role, regional, imported_profile,
	disabled, must_change_password, last_login_at, last_login_ip,
	last_login_user_agent, empresa_id, empresa_nome, insumos_base_id,
	insumos_base_nome, created_at, updated_at
`;

async function listUserDocuments({ limit, offset } = {}) {
	const normalizedLimit = Math.min(Math.max(Math.trunc(Number(limit || 50)), 1), 1000);
	const normalizedOffset = Math.max(Math.trunc(Number(offset || 0)), 0);
	const result = await db.query(
		`select ${USER_COLUMNS}
		   from app_users
		  order by coalesce(display_name, email) asc
		  limit $1 offset $2`,
		[normalizedLimit, normalizedOffset],
	);
	return result.rows.map(mapAppUserRowToDocument);
}

async function listAllUserDocuments() {
	const result = await db.query(
		`select ${USER_COLUMNS}
		   from app_users
		  order by coalesce(display_name, email) asc`,
	);
	return result.rows.map(mapAppUserRowToDocument);
}

async function getUserDocument(documentPathOrUid) {
	const uid = documentIdFromPath(documentPathOrUid);
	if (!uid) return null;
	const result = await db.query(
		`select ${USER_COLUMNS}
		   from app_users
		  where uid = $1
		  limit 1`,
		[uid],
	);
	const row = result.rows[0];
	return row ? mapAppUserRowToDocument(row) : null;
}

async function getUserProfile(uid) {
	const item = await getUserDocument(uid);
	return item?.data || null;
}

async function upsertUserDocument({ documentId, data = {} }) {
	const uid = text(documentId || data.uid || data.id);
	const email = normalizeEmail(data.email);
	if (!uid || !email) {
		const error = new Error("Usuario precisa de uid e e-mail.");
		error.statusCode = 400;
		throw error;
	}
	const current = await getUserDocument(uid);
	const currentProfile = current?.data || {};
	const profile = {
		...currentProfile,
		...data,
		id: uid,
		uid,
		email,
		nome: text(data.nome || data.displayName || data.display_name || currentProfile.nome),
		role: normalizeRole(data.role || currentProfile.role),
		regional:
			data.regional !== undefined
				? text(data.regional)
				: text(currentProfile.regional),
		trocar_senha: bool(
			data.trocar_senha ?? data.must_change_password,
			Boolean(currentProfile.trocar_senha),
		),
		atualizado_em: new Date().toISOString(),
	};
	if (!profile.criado_em) profile.criado_em = new Date().toISOString();

	const disabled = bool(
		data.disabled ?? data.inativo,
		Boolean(currentProfile.disabled),
	);
	const mustChangePassword = bool(
		data.trocar_senha ?? data.must_change_password,
		Boolean(currentProfile.must_change_password ?? currentProfile.trocar_senha),
	);
	const empresaId = nullableText(data.empresaId || data.empresa_id);
	const empresaNome = nullableText(data.empresaNome || data.empresa_nome);
	const insumosBaseId = nullableText(
		data.insumosBaseId || data.insumos_base_id || data.baseInsumosId,
	);
	const insumosBaseNome = nullableText(
		data.insumosBaseNome || data.insumos_base_nome || data.baseInsumosNome,
	);

	await db.query(
		`insert into app_users (
		   uid, email, display_name, role, regional, imported_profile, disabled,
		   must_change_password, empresa_id, empresa_nome, insumos_base_id,
		   insumos_base_nome
		 )
		 values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
		 on conflict (uid) do update set
		   email = excluded.email,
		   display_name = excluded.display_name,
		   role = excluded.role,
		   regional = excluded.regional,
		   imported_profile = excluded.imported_profile,
		   disabled = excluded.disabled,
		   must_change_password = excluded.must_change_password,
		   empresa_id = excluded.empresa_id,
		   empresa_nome = excluded.empresa_nome,
		   insumos_base_id = excluded.insumos_base_id,
		   insumos_base_nome = excluded.insumos_base_nome`,
		[
			uid,
			email,
			profile.nome,
			profile.role,
			profile.regional,
			JSON.stringify(profile),
			disabled,
			mustChangePassword,
			empresaId,
			empresaNome,
			insumosBaseId,
			insumosBaseNome,
		],
	);

	return getUserDocument(uid);
}

async function updateUserProfileExtras(uid, extras = {}) {
	const current = await getUserDocument(uid);
	if (!current) {
		const error = new Error("Usuario nao encontrado.");
		error.statusCode = 404;
		throw error;
	}
	return upsertUserDocument({
		documentId: uid,
		data: {
			...current.data,
			...extras,
		},
	});
}

async function deleteUserDocument(documentPathOrUid) {
	const uid = documentIdFromPath(documentPathOrUid);
	if (!uid) return false;
	const result = await db.query("delete from app_users where uid = $1", [uid]);
	return (result.rowCount || 0) > 0;
}

module.exports = {
	COLLECTION_PATH,
	deleteUserDocument,
	getUserDocument,
	getUserProfile,
	listAllUserDocuments,
	listUserDocuments,
	mapAppUserRowToDocument,
	mapAppUserRowToProfile,
	updateUserProfileExtras,
	upsertUserDocument,
};

const db = require("../../db");

function mapFolder(row) {
	if (!row) return null;
	return {
		empresaId: row.empresa_id,
		empresaNome: row.empresa_nome,
		supervisorId: row.supervisor_id,
		supervisorNome: row.supervisor_nome,
		regional: row.regional,
		driveFolderId: row.drive_folder_id,
		rootDriveFolderId: row.root_drive_folder_id,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapFile(row) {
	if (!row) return null;
	return {
		id: row.id,
		empresaId: row.empresa_id,
		empresaNome: row.empresa_nome,
		supervisorId: row.supervisor_id,
		supervisorNome: row.supervisor_nome,
		regional: row.regional,
		driveFileId: row.drive_file_id,
		driveFolderId: row.drive_folder_id,
		parentDriveFolderId: row.parent_drive_folder_id,
		nome: row.nome,
		mimeType: row.mime_type,
		tipo: row.tipo,
		categoria: row.categoria || "documento",
		valor:
			row.valor === null || row.valor === undefined ? null : Number(row.valor),
		tamanho: Number(row.tamanho || 0),
		status: row.status,
		submissionId: row.submission_id,
		fieldId: row.field_id,
		fieldNome: row.field_nome,
		mesReferencia: row.mes_referencia,
		motivoReprovacao: row.motivo_reprovacao,
		adminStatus: row.admin_status || "pendente",
		adminMotivoReprovacao: row.admin_motivo_reprovacao,
		adminReviewedBy: row.admin_reviewed_by,
		adminReviewedByName: row.admin_reviewed_by_name,
		adminReviewedAt: row.admin_reviewed_at,
		uploadedBy: row.uploaded_by,
		uploadedByName: row.uploaded_by_name,
		approvedBy: row.approved_by,
		approvedByName: row.approved_by_name,
		approvedAt: row.approved_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapRequiredField(row) {
	if (!row) return null;
	return {
		id: row.id,
		nome: row.nome,
		obrigatorio: Boolean(row.obrigatorio),
		ordem: Number(row.ordem || 0),
		publicoAlvo: row.publico_alvo || "ambos",
		ativo: Boolean(row.ativo),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapSubmission(row) {
	if (!row) return null;
	return {
		id: row.id,
		empresaId: row.empresa_id,
		empresaNome: row.empresa_nome,
		supervisorId: row.supervisor_id,
		supervisorNome: row.supervisor_nome,
		supervisorEmail: row.supervisor_email,
		regional: row.regional,
		mesReferencia: row.mes_referencia,
		status: row.status,
		motivoReprovacao: row.motivo_reprovacao,
		submittedBy: row.submitted_by,
		submittedByName: row.submitted_by_name,
		submittedByEmail: row.submitted_by_email,
		submittedAt: row.submitted_at,
		reviewedBy: row.reviewed_by,
		reviewedByName: row.reviewed_by_name,
		reviewedAt: row.reviewed_at,
		adminReviewedBy: row.admin_reviewed_by,
		adminReviewedByName: row.admin_reviewed_by_name,
		adminReviewedAt: row.admin_reviewed_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function getClientFolder(empresaId) {
	const result = await db.query(
		`select * from document_client_folders where empresa_id = $1`,
		[empresaId],
	);
	return mapFolder(result.rows[0]);
}

async function upsertClientFolder(folder) {
	const result = await db.query(
		`insert into document_client_folders (
       empresa_id, empresa_nome, supervisor_id, supervisor_nome, regional,
       drive_folder_id, root_drive_folder_id, created_by
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (empresa_id) do update set
       empresa_nome = excluded.empresa_nome,
       supervisor_id = excluded.supervisor_id,
       supervisor_nome = excluded.supervisor_nome,
       regional = excluded.regional,
       drive_folder_id = excluded.drive_folder_id,
       root_drive_folder_id = excluded.root_drive_folder_id,
       updated_at = now()
     returning *`,
		[
			folder.empresaId,
			folder.empresaNome,
			folder.supervisorId || null,
			folder.supervisorNome || null,
			folder.regional || null,
			folder.driveFolderId,
			folder.rootDriveFolderId || null,
			folder.createdBy || null,
		],
	);
	return mapFolder(result.rows[0]);
}

async function createFile(record) {
	const result = await db.query(
		`insert into document_files (
       empresa_id, empresa_nome, supervisor_id, supervisor_nome, regional,
       drive_file_id, drive_folder_id, parent_drive_folder_id, nome, mime_type,
       tipo, categoria, valor, tamanho, status, uploaded_by, uploaded_by_name, submission_id,
       field_id, field_nome, mes_referencia
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     returning *`,
		[
			record.empresaId,
			record.empresaNome,
			record.supervisorId || null,
			record.supervisorNome || null,
			record.regional || null,
			record.driveFileId,
			record.driveFolderId,
			record.parentDriveFolderId || null,
			record.nome,
			record.mimeType || null,
			record.tipo || null,
			record.categoria || "documento",
			record.valor === null || record.valor === undefined
				? null
				: Number(record.valor || 0),
			record.tamanho || 0,
			record.status || "pendente",
			record.uploadedBy || null,
			record.uploadedByName || null,
			record.submissionId || null,
			record.fieldId || null,
			record.fieldNome || null,
			record.mesReferencia || null,
		],
	);
	return mapFile(result.rows[0]);
}

async function listRequiredFields({ includeInactive = false } = {}) {
	const result = await db.query(
		`select * from document_required_fields
      ${includeInactive ? "" : "where ativo = true"}
      order by ordem asc, nome asc`,
	);
	return result.rows.map(mapRequiredField);
}

async function createRequiredField(field = {}) {
	const result = await db.query(
		`insert into document_required_fields (nome, obrigatorio, ordem, publico_alvo, ativo)
     values ($1, $2, $3, $4, $5)
     returning *`,
		[
			field.nome,
			Boolean(field.obrigatorio),
			Number(field.ordem || 0),
			field.publicoAlvo || "ambos",
			field.ativo !== false,
		],
	);
	return mapRequiredField(result.rows[0]);
}

async function updateRequiredField(id, field = {}) {
	const current = await db.query(
		`select * from document_required_fields where id = $1`,
		[id],
	);
	if (!current.rows[0]) return null;
	const next = { ...mapRequiredField(current.rows[0]), ...field };
	const result = await db.query(
		`update document_required_fields set
       nome = $2,
       obrigatorio = $3,
       ordem = $4,
       publico_alvo = $5,
       ativo = $6,
       updated_at = now()
     where id = $1
     returning *`,
		[
			id,
			next.nome,
			Boolean(next.obrigatorio),
			Number(next.ordem || 0),
			next.publicoAlvo || "ambos",
			next.ativo !== false,
		],
	);
	return mapRequiredField(result.rows[0]);
}

async function createSubmission(record = {}) {
	const result = await db.query(
		`insert into document_submissions (
       empresa_id, empresa_nome, supervisor_id, supervisor_nome, supervisor_email,
       regional, mes_referencia, status, submitted_by, submitted_by_name, submitted_by_email
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning *`,
		[
			record.empresaId,
			record.empresaNome,
			record.supervisorId || null,
			record.supervisorNome || null,
			record.supervisorEmail || null,
			record.regional || null,
			record.mesReferencia,
			record.status || "pendente",
			record.submittedBy || null,
			record.submittedByName || null,
			record.submittedByEmail || null,
		],
	);
	return mapSubmission(result.rows[0]);
}

async function listSubmissions({
	status,
	statuses,
	empresaId,
	regional,
	submittedBy,
	limit = 20,
	offset = 0,
} = {}) {
	const filters = [];
	const params = [];
	const push = (sql, value) => {
		params.push(value);
		filters.push(sql.replace("?", `$${params.length}`));
	};
	if (status) push("status = ?", status);
	if (Array.isArray(statuses) && statuses.length) {
		const placeholders = statuses.map((value) => {
			params.push(value);
			return `$${params.length}`;
		});
		filters.push(`status in (${placeholders.join(",")})`);
	}
	if (empresaId) push("empresa_id = ?", empresaId);
	if (regional) push("lower(regional) = lower(?)", regional);
	if (submittedBy) push("submitted_by = ?", submittedBy);
	params.push(Math.max(Math.min(Number(limit || 20), 100), 1));
	const limitIndex = params.length;
	params.push(Math.max(Number(offset || 0), 0));
	const offsetIndex = params.length;
	const result = await db.query(
		`select * from document_submissions
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by submitted_at desc, created_at desc
      limit $${limitIndex} offset $${offsetIndex}`,
		params,
	);
	return result.rows.map(mapSubmission);
}

async function getSubmission(id) {
	const result = await db.query(
		`select * from document_submissions where id = $1`,
		[id],
	);
	return mapSubmission(result.rows[0]);
}

async function getLatestSubmissionByEmpresaMes(empresaId, mesReferencia) {
	const result = await db.query(
		`select * from document_submissions
      where empresa_id = $1 and mes_referencia = $2
      order by submitted_at desc, created_at desc
      limit 1`,
		[empresaId, mesReferencia],
	);
	return mapSubmission(result.rows[0]);
}

async function listSubmissionFiles(submissionId) {
	const result = await db.query(
		`select * from document_files where submission_id = $1 order by field_nome asc, created_at asc`,
		[submissionId],
	);
	return result.rows.map(mapFile);
}

async function listSubmissionFilesBySubmissionIds(submissionIds = []) {
	const ids = [
		...new Set(
			(Array.isArray(submissionIds) ? submissionIds : [])
				.map((id) => String(id || "").trim())
				.filter(Boolean),
		),
	];
	if (!ids.length) return new Map();

	const result = await db.query(
		`select * from document_files
      where submission_id = any($1::uuid[])
      order by submission_id asc, field_nome asc, created_at asc`,
		[ids],
	);

	return result.rows.reduce((map, row) => {
		const key = String(row.submission_id || "");
		const list = map.get(key) || [];
		list.push(mapFile(row));
		map.set(key, list);
		return map;
	}, new Map());
}

async function updateSubmissionStatus(id, changes = {}) {
	const current = await getSubmission(id);
	if (!current) return null;
	const next = { ...current, ...changes };
	const result = await db.query(
		`update document_submissions set
       status = $2,
       motivo_reprovacao = $3,
       reviewed_by = $4,
       reviewed_by_name = $5,
       reviewed_at = $6,
       admin_reviewed_by = $7,
       admin_reviewed_by_name = $8,
       admin_reviewed_at = $9,
       updated_at = now()
     where id = $1
     returning *`,
		[
			id,
			next.status,
			next.motivoReprovacao || null,
			next.reviewedBy || null,
			next.reviewedByName || null,
			next.reviewedAt || null,
			next.adminReviewedBy || null,
			next.adminReviewedByName || null,
			next.adminReviewedAt || null,
		],
	);
	return mapSubmission(result.rows[0]);
}

async function updateSubmissionOnly(id, changes = {}) {
	const current = await getSubmission(id);
	if (!current) return null;
	const next = { ...current, ...changes };
	const result = await db.query(
		`update document_submissions set
       status = $2,
       motivo_reprovacao = $3,
       reviewed_by = $4,
       reviewed_by_name = $5,
       reviewed_at = $6,
       admin_reviewed_by = $7,
       admin_reviewed_by_name = $8,
       admin_reviewed_at = $9,
       updated_at = now()
     where id = $1
     returning *`,
		[
			id,
			next.status,
			next.motivoReprovacao || null,
			next.reviewedBy || null,
			next.reviewedByName || null,
			next.reviewedAt || null,
			next.adminReviewedBy || null,
			next.adminReviewedByName || null,
			next.adminReviewedAt || null,
		],
	);
	return mapSubmission(result.rows[0]);
}

async function markSubmissionPending(id, changes = {}) {
	const current = await getSubmission(id);
	if (!current) return null;
	const next = { ...current, ...changes };
	const result = await db.query(
		`update document_submissions set
       status = 'pendente',
       motivo_reprovacao = null,
       submitted_by = $2,
       submitted_by_name = $3,
       submitted_by_email = $4,
       submitted_at = now(),
       reviewed_by = null,
       reviewed_by_name = null,
       reviewed_at = null,
       admin_reviewed_by = null,
       admin_reviewed_by_name = null,
       admin_reviewed_at = null,
       updated_at = now()
     where id = $1
     returning *`,
		[
			id,
			next.submittedBy || null,
			next.submittedByName || null,
			next.submittedByEmail || null,
		],
	);
	return mapSubmission(result.rows[0]);
}

async function listFiles({
	status,
	empresaId,
	supervisorId,
	regional,
	categoria,
	limit = 20,
	offset = 0,
}) {
	const filters = [];
	const params = [];
	const push = (sql, value) => {
		params.push(value);
		filters.push(sql.replace("?", `$${params.length}`));
	};
	if (status) push("status = ?", status);
	if (empresaId) push("empresa_id = ?", empresaId);
	if (supervisorId) push("supervisor_id = ?", supervisorId);
	if (regional) push("lower(regional) = lower(?)", regional);
	if (categoria) push("categoria = ?", categoria);

	params.push(Math.max(Math.min(Number(limit || 20), 100), 1));
	const limitIndex = params.length;
	params.push(Math.max(Number(offset || 0), 0));
	const offsetIndex = params.length;

	const result = await db.query(
		`select * from document_files
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by created_at desc
      limit $${limitIndex} offset $${offsetIndex}`,
		params,
	);
	return result.rows.map(mapFile);
}

async function listAllFilesForPurge() {
	const result = await db.query(
		`select * from document_files order by created_at asc`,
	);
	return result.rows.map(mapFile);
}

async function getFile(id) {
	const result = await db.query(`select * from document_files where id = $1`, [
		id,
	]);
	return mapFile(result.rows[0]);
}

async function updateFile(id, changes = {}) {
	const current = await getFile(id);
	if (!current) return null;
	const next = { ...current, ...changes };
	const result = await db.query(
		`update document_files set
       nome = $2,
       status = $3,
       motivo_reprovacao = $4,
       valor = $13,
       admin_status = $5,
       admin_motivo_reprovacao = $6,
       admin_reviewed_by = $7,
       admin_reviewed_by_name = $8,
       admin_reviewed_at = $9,
       approved_by = $10,
       approved_by_name = $11,
       approved_at = $12,
       updated_at = now()
     where id = $1
     returning *`,
		[
			id,
			next.nome,
			next.status,
			next.motivoReprovacao || null,
			next.adminStatus || "pendente",
			next.adminMotivoReprovacao || null,
			next.adminReviewedBy || null,
			next.adminReviewedByName || null,
			next.adminReviewedAt || null,
			next.approvedBy || null,
			next.approvedByName || null,
			next.approvedAt || null,
			next.valor === null || next.valor === undefined
				? null
				: Number(next.valor || 0),
		],
	);
	return mapFile(result.rows[0]);
}

async function deleteFile(id) {
	const result = await db.query(
		`delete from document_files where id = $1 returning *`,
		[id],
	);
	return mapFile(result.rows[0]);
}

async function purgeDocumentHistory({ resetFolders = false } = {}) {
	const result = await db.query(
		`with deleted_files as (
       delete from document_files returning id
     ),
     deleted_submissions as (
       delete from document_submissions returning id
     ),
     deleted_folders as (
       delete from document_client_folders
       where $1::boolean = true
       returning empresa_id
     )
     select
       (select count(*) from deleted_files)::int as files_deleted,
       (select count(*) from deleted_submissions)::int as submissions_deleted,
       (select count(*) from deleted_folders)::int as folders_deleted`,
		[Boolean(resetFolders)],
	);
	const row = result.rows[0] || {};
	return {
		filesDeleted: Number(row.files_deleted || 0),
		submissionsDeleted: Number(row.submissions_deleted || 0),
		foldersDeleted: Number(row.folders_deleted || 0),
	};
}

module.exports = {
	createRequiredField,
	createFile,
	createSubmission,
	deleteFile,
	getClientFolder,
	getFile,
	getLatestSubmissionByEmpresaMes,
	getSubmission,
	listAllFilesForPurge,
	listFiles,
	listRequiredFields,
	listSubmissionFiles,
	listSubmissionFilesBySubmissionIds,
	listSubmissions,
	markSubmissionPending,
	purgeDocumentHistory,
	upsertClientFolder,
	updateFile,
	updateRequiredField,
	updateSubmissionOnly,
	updateSubmissionStatus,
};

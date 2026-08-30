const documents = require("../../documents");
const regionaisRepository = require("../../regionaisRepository");
const emailService = require("../../emailService");
const notificationsService = require("../../notificationsService");
const repository = require("../repositories/documentosRepository");
const drive = require("./googleDriveService");
const archiverModule = require("archiver");

const INVOICE_FIELDS_COLLECTION = "documentos_notas_fiscais_campos";
const DOCUMENTOS_LIST_CACHE_TTL_MS = Math.max(
	Number(process.env.DOCUMENTOS_LIST_CACHE_TTL_MS || 5000),
	0,
);
const documentosListCache = new Map();

const createArchiver =
	typeof archiverModule === "function"
		? archiverModule
		: archiverModule.default;

function createZipArchive(options = {}) {
	if (typeof createArchiver === "function")
		return createArchiver("zip", options);
	if (typeof archiverModule.ZipArchive === "function")
		return new archiverModule.ZipArchive(options);
	const error = new Error(
		"Dependencia archiver carregada em formato invalido. Rode npm install --omit=dev na VPS.",
	);
	error.statusCode = 503;
	throw error;
}

function text(value) {
	return String(value || "").trim();
}

function getCacheKey(prefix, payload = {}) {
	return `${prefix}:${JSON.stringify(
		payload,
		Object.keys(payload).sort((left, right) => left.localeCompare(right)),
	)}`;
}

function getCachedList(key) {
	if (!DOCUMENTOS_LIST_CACHE_TTL_MS || !key) return null;
	const cached = documentosListCache.get(key);
	if (!cached) return null;
	if (Date.now() - cached.createdAt > DOCUMENTOS_LIST_CACHE_TTL_MS) {
		documentosListCache.delete(key);
		return null;
	}
	return cached.value;
}

async function getOrSetListCache(key, loader) {
	const cached = getCachedList(key);
	if (cached) return cached;

	const pendingKey = `${key}:pending`;
	const pending = getCachedList(pendingKey);
	if (pending) return pending;

	const promise = loader();
	if (DOCUMENTOS_LIST_CACHE_TTL_MS) {
		documentosListCache.set(pendingKey, {
			createdAt: Date.now(),
			value: promise,
		});
	}

	try {
		const value = await promise;
		if (DOCUMENTOS_LIST_CACHE_TTL_MS) {
			documentosListCache.set(key, { createdAt: Date.now(), value });
		}
		return value;
	} finally {
		documentosListCache.delete(pendingKey);
		if (documentosListCache.size > 200) {
			const firstKey = documentosListCache.keys().next().value;
			if (firstKey) documentosListCache.delete(firstKey);
		}
	}
}

function clearDocumentosListCache() {
	documentosListCache.clear();
}

function normalize(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function userName(user) {
	return text(user?.profile?.nome || user?.nome || user?.email || user?.uid);
}

function userId(user) {
	return text(user?.uid || user?.id || user?.email);
}

function safeSlug(value) {
	return (
		normalize(value)
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || `campo_${Date.now()}`
	);
}

function parseCurrency(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = text(value)
		.replace(/\s/g, "")
		.replace(/\./g, "")
		.replace(",", ".");
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

async function getEmpresa(empresaId) {
	const doc = await documents.getDocument(`empresas_tecnicos/${empresaId}`);
	if (!doc?.data) {
		const error = new Error("Empresa não encontrada.");
		error.statusCode = 404;
		throw error;
	}
	const data = doc.data || {};
	return {
		id: doc.documentId,
		nome: text(data.nome || data.empresa || doc.documentId),
		cnpj: text(data.cnpj || data.documento || data.cpfCnpj || data.cpf_cnpj),
		regional: text(data.regional),
		supervisorId: text(data.supervisor?.uid || data.supervisorUid),
		supervisorNome: text(data.supervisor?.nome || data.supervisorNome),
		supervisorEmail: text(data.supervisor?.email || data.supervisorEmail),
		responsavelNome: text(
			data.responsavel?.nome || data.responsavel_nome || data.nomeResponsavel,
		),
		responsavelEmail: text(
			data.responsavel?.email || data.email || data.emailResponsavel,
		),
	};
}

async function getRegionalByName(regionalName) {
	const target = normalize(regionalName);
	if (!target) return null;
	return regionaisRepository.getRegionalByName(target).catch(() => null);
}

async function enrichSubmission(submission, { files = null } = {}) {
	const [empresa, regional] = await Promise.all([
		getEmpresa(submission.empresaId).catch(() => null),
		getRegionalByName(submission.regional).catch(() => null),
	]);
	const regionalSupervisor = regional?.supervisor || {};
	const supervisorNome = text(
		submission.supervisorNome ||
			empresa?.supervisorNome ||
			regionalSupervisor.nome,
	);
	const supervisorEmail = text(
		submission.supervisorEmail ||
			empresa?.supervisorEmail ||
			regionalSupervisor.email,
	);
	const supervisorTelefone = text(
		regionalSupervisor.telefone ||
			regionalSupervisor.whatsapp ||
			regionalSupervisor.celular,
	);
	const submittedAt = submission.submittedAt
		? new Date(submission.submittedAt)
		: null;
	const tempoSupervisorMs =
		submittedAt && !Number.isNaN(submittedAt.getTime())
			? Math.max(0, Date.now() - submittedAt.getTime())
			: 0;

	return {
		...submission,
		empresaCnpj: empresa?.cnpj || "",
		supervisorNome,
		supervisorEmail,
		supervisorTelefone,
		tempoSupervisorMs,
		files: files || (await repository.listSubmissionFiles(submission.id)),
	};
}

async function enrichSubmissions(submissions = []) {
	const filesBySubmission = await repository.listSubmissionFilesBySubmissionIds(
		submissions.map((submission) => submission.id),
	);
	return Promise.all(
		submissions.map((submission) =>
			enrichSubmission(submission, {
				files: filesBySubmission.get(String(submission.id)) || [],
			}),
		),
	);
}

function canAccessEmpresa(user, empresa) {
	const role = normalize(user?.role);
	if (
		[
			"admin",
			"backoffice_retirada",
			"supervisor_administrativo",
			"analista_administrativo",
		].includes(role)
	)
		return true;
	if (role === "supervisor")
		return (
			normalize(user?.regional || user?.profile?.regional) ===
			normalize(empresa.regional)
		);
	if (["lider_empresa", "agente_autorizado"].includes(role)) {
		const empresaId = text(
			user?.empresaId ||
				user?.empresa_id ||
				user?.profile?.empresaId ||
				user?.profile?.empresa_id,
		);
		const empresaNome = normalize(
			user?.empresaNome ||
				user?.empresa_nome ||
				user?.profile?.empresaNome ||
				user?.profile?.empresa_nome,
		);
		return (
			empresaId === empresa.id ||
			(empresaNome && empresaNome === normalize(empresa.nome))
		);
	}
	return false;
}

function canApprove(user, file) {
	const role = normalize(user?.role);
	if (role === "admin" || role === "backoffice_retirada") return true;
	if (role !== "supervisor") return false;
	return (
		normalize(user?.regional || user?.profile?.regional) ===
		normalize(file.regional)
	);
}

function canAdministrativeReview(user) {
	return [
		"admin",
		"supervisor_administrativo",
		"analista_administrativo",
	].includes(normalize(user?.role));
}

function canViewSupervisorTreatments(user) {
	return [
		"admin",
		"supervisor",
		"supervisor_administrativo",
		"analista_administrativo",
	].includes(normalize(user?.role));
}

function requireAdminUser(user) {
	if (["admin", "supervisor_administrativo"].includes(normalize(user?.role)))
		return;
	const error = new Error("Apenas administradores podem executar esta ação.");
	error.statusCode = 403;
	throw error;
}

async function requireEmpresaAccess(user, empresaId) {
	const empresa = await getEmpresa(empresaId);
	if (!canAccessEmpresa(user, empresa)) {
		const error = new Error(
			"Sem permissão para acessar documentos desta empresa.",
		);
		error.statusCode = 403;
		throw error;
	}
	return empresa;
}

async function ensureClientFolder(empresa, user) {
	const rootDriveFolderId = await drive.getRootFolderId();
	const existing = await repository.getClientFolder(empresa.id);
	if (
		existing?.driveFolderId &&
		existing.rootDriveFolderId === rootDriveFolderId
	)
		return existing;
	const folder = await drive.createFolder(
		`${empresa.nome} - ${empresa.id}`,
		rootDriveFolderId,
	);
	return repository.upsertClientFolder({
		empresaId: empresa.id,
		empresaNome: empresa.nome,
		supervisorId: empresa.supervisorId,
		supervisorNome: empresa.supervisorNome,
		regional: empresa.regional,
		driveFolderId: folder.id,
		rootDriveFolderId,
		createdBy: userId(user),
	});
}

async function ensureMonthFolder(empresa, mesReferencia, user) {
	const folder = await ensureClientFolder(empresa, user);
	const monthFolder = await drive.createFolder(
		mesReferencia,
		folder.driveFolderId,
	);
	return { clientFolder: folder, monthFolder };
}

async function createClientFolder({ empresaId, user }) {
	const empresa = await requireEmpresaAccess(user, empresaId);
	return ensureClientFolder(empresa, user);
}

async function createSubfolder({ empresaId, name, user }) {
	const empresa = await requireEmpresaAccess(user, empresaId);
	const folder = await ensureClientFolder(empresa, user);
	return drive.createFolder(text(name), folder.driveFolderId);
}

async function isFolderInsideClientFolder({ folderId, clientFolderId }) {
	const targetFolderId = text(folderId);
	const rootFolderId = text(clientFolderId);
	if (!targetFolderId || !rootFolderId) return false;
	if (targetFolderId === rootFolderId) return true;

	const visited = new Set();
	let currentIds = [targetFolderId];
	for (let depth = 0; depth < 20 && currentIds.length; depth += 1) {
		const nextIds = [];
		for (const currentId of currentIds) {
			if (!currentId || visited.has(currentId)) continue;
			visited.add(currentId);
			let metadata = null;
			try {
				metadata = await drive.getFileMetadata(currentId, "id,parents");
			} catch {
				continue;
			}
			const parents = Array.isArray(metadata?.parents) ? metadata.parents : [];
			if (parents.includes(rootFolderId)) return true;
			nextIds.push(...parents.filter((parentId) => !visited.has(parentId)));
		}
		currentIds = nextIds;
	}

	return false;
}

async function resolveCompanyBrowserFolder({ empresaId, folderId, user }) {
	const empresa = await requireEmpresaAccess(user, empresaId);
	const clientFolder = await ensureClientFolder(empresa, user);
	const targetFolderId = text(folderId) || clientFolder.driveFolderId;
	const allowed = await isFolderInsideClientFolder({
		folderId: targetFolderId,
		clientFolderId: clientFolder.driveFolderId,
	});
	if (!allowed) {
		const error = new Error("Pasta fora da area da empresa.");
		error.statusCode = 403;
		throw error;
	}
	return { clientFolder, targetFolderId };
}

async function listCompanyDriveFolder({ empresaId, folderId, user }) {
	const { clientFolder, targetFolderId } = await resolveCompanyBrowserFolder({
		empresaId,
		folderId,
		user,
	});
	const folderMeta = await drive.getFileMetadata(
		targetFolderId,
		"id,name,mimeType,parents,createdTime,modifiedTime",
	);
	const items = await drive.listFolder(targetFolderId);
	return {
		rootFolderId: clientFolder.driveFolderId,
		folder: {
			id: folderMeta.id,
			name: folderMeta.name,
			isRoot: folderMeta.id === clientFolder.driveFolderId,
			parentId: (folderMeta.parents || [])[0] || null,
		},
		items: items.map((item) => ({
			id: item.id,
			name: item.name,
			mimeType: item.mimeType,
			size: Number(item.size || 0),
			createdTime: item.createdTime || null,
			modifiedTime: item.modifiedTime || null,
			isFolder: item.mimeType === "application/vnd.google-apps.folder",
		})),
	};
}

async function downloadCompanyDriveFile({ empresaId, fileId, folderId, user }) {
	const { targetFolderId } = await resolveCompanyBrowserFolder({
		empresaId,
		folderId,
		user,
	});
	const metadata = await drive.getFileMetadata(
		fileId,
		"id,name,mimeType,size,parents",
	);
	if (
		!Array.isArray(metadata.parents) ||
		!metadata.parents.includes(targetFolderId)
	) {
		const error = new Error("Arquivo nao pertence a pasta informada.");
		error.statusCode = 403;
		throw error;
	}
	if (metadata.mimeType === "application/vnd.google-apps.folder") {
		const error = new Error("Pastas nao podem ser baixadas por aqui.");
		error.statusCode = 400;
		throw error;
	}
	const response = await drive.downloadFile(fileId);
	return {
		file: {
			id: metadata.id,
			nome: metadata.name,
			mimeType: metadata.mimeType,
			tamanho: Number(metadata.size || 0),
		},
		stream: response.data,
	};
}

function normalizeMesReferencia(value) {
	const textValue = text(value);
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(textValue)) {
		const error = new Error(
			"Mês de referência inválido. Use o formato AAAA-MM.",
		);
		error.statusCode = 400;
		throw error;
	}
	return textValue;
}

function currentMesReferencia(date = new Date()) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value, separator = "/") {
	const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
	if (!match) return text(value) || "-";
	const months = [
		"Janeiro",
		"Fevereiro",
		"Março",
		"Abril",
		"Maio",
		"Junho",
		"Julho",
		"Agosto",
		"Setembro",
		"Outubro",
		"Novembro",
		"Dezembro",
	];
	return `${months[Number(match[2]) - 1] || match[2]}${separator}${match[1]}`;
}

function sanitizeFileName(value) {
	return (
		text(value)
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[\\/:*?"<>|]+/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 160) || "documentos"
	);
}

async function streamToBuffer(stream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function dateStamp(date = new Date()) {
	return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function timeStamp(date = new Date()) {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function ensureAllowedMonthlyDocument(file) {
	const name = text(file?.originalname).toLowerCase();
	const mime = text(file?.mimetype).toLowerCase();
	const allowed =
		(mime === "application/pdf" && name.endsWith(".pdf")) ||
		(["image/png", "image/jpeg"].includes(mime) && /\.(png|jpe?g)$/.test(name));
	if (!file?.buffer?.length || !allowed) {
		const error = new Error("Apenas arquivos PDF, PNG ou JPG são aceitos.");
		error.statusCode = 400;
		throw error;
	}
}

function fileExtension(file) {
	const name = text(file?.originalname);
	const match = name.match(/\.([a-z0-9]+)$/i);
	if (match?.[1])
		return `.${match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase()}`;
	const mime = text(file?.mimetype).toLowerCase();
	if (mime === "application/pdf") return ".pdf";
	if (mime === "image/png") return ".png";
	if (mime === "image/jpeg") return ".jpg";
	return "";
}

function invoiceFileName(field, mesReferencia, file) {
	const ext = fileExtension(file);
	const label = monthLabel(mesReferencia).replace("/", " ");
	return `${field.nome} - ${label}${ext}`;
}

function monthlyDocumentFileName(field, mesReferencia, file) {
	const month = monthLabel(mesReferencia, " ");
	return `${sanitizeFileName(field?.nome || "Documento")} - ${sanitizeFileName(month)}${fileExtension(file)}`;
}

function userEmail(user) {
	return text(user?.email || user?.profile?.email);
}

function latestFilesByField(files = []) {
	const latest = new Map();
	files.forEach((file) => {
		const key = file.fieldId || file.fieldNome || file.id;
		const current = latest.get(key);
		if (
			!current ||
			new Date(file.createdAt || 0).getTime() >=
				new Date(current.createdAt || 0).getTime()
		) {
			latest.set(key, file);
		}
	});
	return [...latest.values()];
}

function documentFilesOnly(files = []) {
	return files.filter(
		(file) => normalize(file.categoria || "documento") !== "nota_fiscal",
	);
}

function computeSubmissionStatus(files = []) {
	const latestFiles = latestFilesByField(documentFilesOnly(files));
	if (!latestFiles.length) return "pendente";
	const statuses = latestFiles.map((item) =>
		normalize(item.status || "pendente"),
	);
	if (statuses.some((status) => status !== "aprovado")) return "pendente";
	const adminStatuses = latestFiles.map((item) =>
		normalize(item.adminStatus || "pendente"),
	);
	if (adminStatuses.every((status) => status === "aprovado")) return "aprovado";
	if (adminStatuses.some((status) => status === "reprovado")) return "pendente";
	return "aguardando_administrativo";
}

function summarizeRejectedFiles(files = []) {
	return (
		latestFilesByField(documentFilesOnly(files))
			.filter(
				(item) =>
					["reprovado"].includes(normalize(item.status)) ||
					normalize(item.adminStatus) === "reprovado",
			)
			.map(
				(item) =>
					`${item.fieldNome || item.nome}: ${item.adminMotivoReprovacao || item.motivoReprovacao || "-"}`,
			)
			.join("\n") || null
	);
}

function getPrimaryReviewFields(nextStatus, user, mode = "operacional") {
	const now = new Date().toISOString();
	if (nextStatus === "pendente") {
		if (mode === "administrativo") {
			return {
				adminReviewedBy: userId(user),
				adminReviewedByName: userName(user),
				adminReviewedAt: now,
			};
		}
		return {
			reviewedBy: null,
			reviewedByName: null,
			reviewedAt: null,
			adminReviewedBy: null,
			adminReviewedByName: null,
			adminReviewedAt: null,
		};
	}
	if (nextStatus === "aguardando_administrativo") {
		return {
			reviewedBy: userId(user),
			reviewedByName: userName(user),
			reviewedAt: now,
			adminReviewedBy: null,
			adminReviewedByName: null,
			adminReviewedAt: null,
		};
	}
	if (nextStatus === "aprovado" && mode === "administrativo") {
		return {
			adminReviewedBy: userId(user),
			adminReviewedByName: userName(user),
			adminReviewedAt: now,
		};
	}
	return {};
}

async function deleteDriveFileQuietly(file) {
	if (!file?.driveFileId) return;
	await drive.deleteFile(file.driveFileId).catch(() => null);
}

function isDriveNotFoundError(error) {
	const message = String(error?.message || error || "");
	return (
		error?.code === 404 ||
		error?.response?.status === 404 ||
		message.includes('"code": 404') ||
		message.toLowerCase().includes("file not found")
	);
}

async function markMissingDriveFileForResubmission(submission, file) {
	const motivo =
		"Arquivo aprovado não foi encontrado no Google Drive. Reenvie este documento.";
	await repository.updateFile(file.id, {
		status: "reprovado",
		motivoReprovacao: motivo,
		approvedBy: "system",
		approvedByName: "Sistema",
		approvedAt: new Date().toISOString(),
	});
	const files = await repository.listSubmissionFiles(submission.id);
	const latestFiles = latestFilesByField(documentFilesOnly(files));
	const nextStatus = computeSubmissionStatus(files);
	await repository.updateSubmissionOnly(submission.id, {
		status: nextStatus,
		motivoReprovacao:
			latestFiles
				.filter((item) => normalize(item.status) === "reprovado")
				.map(
					(item) =>
						`${item.fieldNome || item.nome}: ${item.motivoReprovacao || "-"}`,
				)
				.join("\n") || null,
		reviewedBy: nextStatus === "pendente" ? null : "system",
		reviewedByName: nextStatus === "pendente" ? null : "Sistema",
		reviewedAt: nextStatus === "pendente" ? null : new Date().toISOString(),
	});
}

async function sendDocumentEmail({
	to,
	subject,
	title,
	lines,
	actionPath = "/documentos/pendentes",
	meta = {},
}) {
	const target = text(to);
	if (!target) return null;
	const config = await emailService.getConfig().catch(() => null);
	const appUrl = String(
		config?.appUrl || process.env.PUBLIC_APP_URL || "https://retiradas.tech",
	).replace(/\/+$/, "");
	const message = lines.join("\n\n");
	const actionUrl = `${appUrl}${actionPath}`;
	return emailService
		.sendMail({
			to: target,
			subject,
			text: `${message}\n\nAcessar documentos: ${actionUrl}`,
			html: emailService.createEmailTemplate({
				eyebrow: "DOCUMENTOS",
				title,
				preheader: subject,
				greeting: "Olá.",
				message,
				buttonText: "Acessar documentos",
				buttonUrl: actionUrl,
				infoBox:
					meta?.event === "file_rejected"
						? "Reenvie apenas o documento solicitado. Os demais documentos aprovados permanecem válidos."
						: "",
				showSecurityIllustration: true,
				appUrl,
			}),
			meta: { type: "documentos", ...meta },
		})
		.catch(() => null);
}

async function notifySubmissionCreated(submission) {
	return sendDocumentEmail({
		to: submission.supervisorEmail,
		subject: `Documentos enviados - ${submission.empresaNome} - ${submission.mesReferencia}`,
		title: "Documentos enviados para aprovação",
		lines: [
			`Empresa: ${submission.empresaNome}`,
			`Mês de referência: ${submission.mesReferencia}`,
			`Enviado por: ${submission.submittedByName || "-"}`,
			"Os arquivos estão pendentes de aprovação.",
		],
		actionPath: "/documentos/pendentes",
		meta: { submissionId: submission.id, event: "created" },
	});
}

async function notifyInternalSubmissionCreated(submission, user) {
	return notificationsService.createNotification({
		type: "documentos_pendentes",
		title: "Novo envio de documentos",
		message: `${submission.empresaNome || "Empresa"} enviou documentos de ${monthLabel(submission.mesReferencia)} para aprovação.`,
		targetPath: "/documentos/pendentes",
		severity: "warning",
		user,
		targets: {
			roles: ["admin", "supervisor"],
			regionais: submission.regional ? [submission.regional] : [],
		},
		meta: {
			submissionId: submission.id,
			empresaId: submission.empresaId,
			empresaNome: submission.empresaNome,
			mesReferencia: submission.mesReferencia,
		},
	});
}

async function notifySubmissionReviewed(submission) {
	return sendDocumentEmail({
		to: submission.submittedByEmail,
		subject: `Documentos ${submission.status} - ${submission.mesReferencia}`,
		title:
			submission.status === "aprovado"
				? "Documentos aprovados"
				: "Documentos reprovados",
		lines: [
			`Empresa: ${submission.empresaNome}`,
			`Mês de referência: ${submission.mesReferencia}`,
			`Status: ${submission.status}`,
			submission.status === "reprovado"
				? `Motivo: ${submission.motivoReprovacao || "-"}`
				: "Tudo certo com os documentos enviados.",
		],
		actionPath: "/terceirizados",
		meta: { submissionId: submission.id, event: "reviewed" },
	});
}

async function notifyAdministrativeQueue(submission) {
	await notificationsService.createNotification({
		type: "documentos_administrativo_pendente",
		title: "Documentos aguardando administrativo",
		message: `${submission.empresaNome || "Empresa"} foi aprovado pelo supervisor e aguarda aprovação administrativa.`,
		targetPath: "/documentos/pendentes",
		severity: "info",
		targets: {
			roles: ["admin", "supervisor_administrativo", "analista_administrativo"],
		},
		meta: {
			submissionId: submission.id,
			empresaId: submission.empresaId,
			empresaNome: submission.empresaNome,
			mesReferencia: submission.mesReferencia,
		},
	});
}

async function notifyAdministrativeRejected(submission, file) {
	await notificationsService.createNotification({
		type: "documentos_administrativo_reprovado",
		title: "Documento reprovado pelo administrativo",
		message: `${submission.empresaNome || "Empresa"} teve "${file.fieldNome || file.nome || "documento"}" reprovado pelo administrativo e precisa de reenvio.`,
		targetPath: "/documentos/pendentes",
		severity: "danger",
		targets: {
			roles: ["admin", "supervisor"],
			regionais: submission.regional ? [submission.regional] : [],
		},
		meta: {
			submissionId: submission.id,
			fileId: file.id,
			empresaId: submission.empresaId,
			empresaNome: submission.empresaNome,
			mesReferencia: submission.mesReferencia,
		},
	});
}

async function notifyDocumentRejected(submission, file) {
	return sendDocumentEmail({
		to: submission.submittedByEmail,
		subject: `Documento reprovado - ${file.fieldNome || file.nome}`,
		title: "Documento precisa de correcao",
		lines: [
			`Empresa: ${submission.empresaNome}`,
			`Mês de referência: ${submission.mesReferencia}`,
			`Documento: ${file.fieldNome || file.nome}`,
			`Motivo da reprovação: ${file.adminMotivoReprovacao || file.motivoReprovacao || "-"}`,
			"Acesse o portal de terceirizados e reenvie apenas o documento solicitado. Os demais documentos aprovados permanecem validos.",
		],
		actionPath: "/terceirizados/login",
		meta: {
			submissionId: submission.id,
			fileId: file.id,
			event: "file_rejected",
		},
	});
}

function notifyInBackground(promiseFactory) {
	Promise.resolve()
		.then(promiseFactory)
		.catch((error) => {
			console.warn(
				"[documentos] Falha ao enviar notificacao:",
				error?.message || error,
			);
		});
}

async function listRequiredFields({ includeInactive = false } = {}) {
	return repository.listRequiredFields({ includeInactive });
}

function normalizePublicoAlvo(value) {
	const key = normalize(value);
	if (key === "agente" || key === "agentes") return "agente";
	if (key === "tecnico" || key === "tecnicos") return "tecnico";
	return "ambos";
}

function userDocumentAudience(user) {
	const role = normalize(user?.role);
	if (role === "agente_autorizado") return "agente";
	return "tecnico";
}

function fieldAppliesToAudience(field, audience) {
	const target = normalizePublicoAlvo(
		field?.publicoAlvo || field?.publico_alvo || "ambos",
	);
	return target === "ambos" || target === audience;
}

async function saveRequiredField({
	id,
	nome,
	obrigatorio = true,
	ordem = 0,
	publicoAlvo = "ambos",
	ativo = true,
}) {
	const cleanName = text(nome);
	if (!cleanName) {
		const error = new Error("Nome do campo obrigatorio.");
		error.statusCode = 400;
		throw error;
	}
	const target = normalizePublicoAlvo(publicoAlvo);
	if (id)
		return repository.updateRequiredField(id, {
			nome: cleanName,
			obrigatorio,
			ordem,
			publicoAlvo: target,
			ativo,
		});
	return repository.createRequiredField({
		nome: cleanName,
		obrigatorio,
		ordem,
		publicoAlvo: target,
		ativo,
	});
}

const DEFAULT_BILLING_CONFIG = {
	enabled: true,
	firstReminderDay: 25,
	repeatDailyAfterFirst: true,
	repeatUntilDay: 31,
	windowStart: "08:00",
	windowEnd: "18:00",
	emailSubject: "Documentacao mensal pendente",
	financeEmailTemplate: `Prezados,

Encaminho para conferência e providências a documentação mensal aprovada da empresa {empresa_nome}, referente ao mês de {mes_referencia}.

Dados da empresa:
- Empresa: {empresa_nome}
- CNPJ: {empresa_cnpj}
- Regional: {regional}
- Supervisor responsável: {supervisor_nome}

Documentações enviadas e aprovadas:
{documentos_lista}

O pacote compactado (.zip) acompanha este envio e contém os documentos aprovados para conferência do financeiro.

Permaneço à disposição para qualquer ajuste ou esclarecimento.

Atenciosamente,`,
};

function normalizeBillingConfig(input = {}) {
	const firstReminderDay = Math.min(
		Math.max(Number(input.firstReminderDay || 25), 1),
		31,
	);
	const repeatUntilDay = Math.min(
		Math.max(Number(input.repeatUntilDay || 31), firstReminderDay),
		31,
	);
	const windowPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
	return {
		enabled: input.enabled !== false,
		firstReminderDay,
		repeatDailyAfterFirst: input.repeatDailyAfterFirst !== false,
		repeatUntilDay,
		windowStart: windowPattern.test(text(input.windowStart))
			? text(input.windowStart)
			: "08:00",
		windowEnd: windowPattern.test(text(input.windowEnd))
			? text(input.windowEnd)
			: "18:00",
		emailSubject:
			text(input.emailSubject) || DEFAULT_BILLING_CONFIG.emailSubject,
		financeEmailTemplate:
			text(input.financeEmailTemplate) ||
			DEFAULT_BILLING_CONFIG.financeEmailTemplate,
		updatedAt: new Date().toISOString(),
	};
}

async function getBillingConfig() {
	const doc = await documents.getDocument("documentos_config/cobranca");
	return { ...DEFAULT_BILLING_CONFIG, ...(doc?.data || {}) };
}

async function saveBillingConfig(config = {}, user) {
	const next = {
		...normalizeBillingConfig(config),
		updatedBy: userId(user),
		updatedByName: userName(user),
	};
	await documents.upsertDocument({
		path: "documentos_config/cobranca",
		collectionPath: "documentos_config",
		documentId: "cobranca",
		data: next,
	});
	return next;
}

function shouldRunBilling(config, now = new Date(), force = false) {
	if (force) return true;
	if (!config.enabled) return false;
	const currentDay = now.getDate();
	const inDay =
		currentDay === Number(config.firstReminderDay) ||
		(config.repeatDailyAfterFirst &&
			currentDay > Number(config.firstReminderDay) &&
			currentDay <= Number(config.repeatUntilDay));
	if (!inDay) return false;
	const currentTime = timeStamp(now);
	return currentTime >= config.windowStart && currentTime <= config.windowEnd;
}

async function runBillingNotifications({
	force = false,
	now = new Date(),
} = {}) {
	const config = await getBillingConfig();
	if (!shouldRunBilling(config, now, force)) {
		return { ok: true, skipped: true, reason: "fora_da_janela", sent: 0 };
	}

	const month = currentMesReferencia(now);
	const stamp = dateStamp(now);
	const fields = (await repository.listRequiredFields()).filter(
		(field) => field.obrigatorio,
	);
	if (!fields.length)
		return {
			ok: true,
			skipped: true,
			reason: "sem_campos_obrigatorios",
			sent: 0,
		};

	const empresas = await documents.listAllDocuments("empresas_tecnicos");
	let sent = 0;
	const errors = [];

	for (const empresaDoc of empresas) {
		const data = empresaDoc.data || {};
		const empresa = {
			id: empresaDoc.documentId,
			nome: text(data.nome || data.empresa || empresaDoc.documentId),
			responsavelEmail: text(
				data.responsavel?.email || data.email || data.emailResponsavel,
			),
			responsavelNome: text(
				data.responsavel?.nome || data.responsavel_nome || data.nomeResponsavel,
			),
			agenteAutorizado: Boolean(
				data.agenteAutorizado ||
					data.agente_autorizado ||
					data.isAgente ||
					data.is_agente,
			),
		};
		if (!empresa.responsavelEmail) continue;

		const logPath = `documentos_cobranca_logs/${empresa.id}_${month}_${stamp}`;
		const existingLog = await documents.getDocument(logPath).catch(() => null);
		if (existingLog && !force) continue;

		const submission = await repository.getLatestSubmissionByEmpresaMes(
			empresa.id,
			month,
		);
		const files = submission
			? await repository.listSubmissionFiles(submission.id)
			: [];
		const latestByField = new Map(
			latestFilesByField(documentFilesOnly(files)).map((file) => [
				file.fieldId,
				file,
			]),
		);
		const audience = empresa.agenteAutorizado ? "agente" : "tecnico";
		const companyFields = fields.filter((field) =>
			fieldAppliesToAudience(field, audience),
		);
		const pendingFields = companyFields.filter(
			(field) => normalize(latestByField.get(field.id)?.status) !== "aprovado",
		);
		if (!pendingFields.length) continue;

		try {
			await sendDocumentEmail({
				to: empresa.responsavelEmail,
				subject: config.emailSubject || DEFAULT_BILLING_CONFIG.emailSubject,
				title: "Documentacao mensal pendente",
				lines: [
					`Empresa: ${empresa.nome}`,
					`Mês de referência: ${month}`,
					`Pendencias: ${pendingFields.map((item) => item.nome).join(", ")}`,
					"Acesse o portal de terceirizados para enviar ou corrigir os documentos pendentes.",
				],
				actionPath: "/terceirizados/login",
				meta: {
					event: "billing_reminder",
					empresaId: empresa.id,
					mesReferencia: month,
				},
			});
			await documents.upsertDocument({
				path: logPath,
				collectionPath: "documentos_cobranca_logs",
				documentId: `${empresa.id}_${month}_${stamp}`,
				data: {
					empresaId: empresa.id,
					empresaNome: empresa.nome,
					email: empresa.responsavelEmail,
					mesReferencia: month,
					pendencias: pendingFields.map((item) => item.nome),
					sentAt: new Date().toISOString(),
				},
			});
			sent += 1;
		} catch (error) {
			errors.push({
				empresaId: empresa.id,
				error: error?.message || String(error),
			});
		}
	}

	return { ok: true, sent, errors };
}

async function createMonthlySubmission({
	mesReferencia,
	files = [],
	fieldIds = [],
	user,
}) {
	clearDocumentosListCache();
	const role = normalize(user?.role);
	if (!["lider_empresa", "agente_autorizado", "admin"].includes(role)) {
		const error = new Error(
			"Apenas líderes de empresa ou agentes autorizados podem enviar documentos por aqui.",
		);
		error.statusCode = 403;
		throw error;
	}
	const empresaId = text(
		user?.empresaId ||
			user?.empresa_id ||
			user?.profile?.empresaId ||
			user?.profile?.empresa_id,
	);
	if (!empresaId) {
		const error = new Error("Usuário não está associado a uma empresa.");
		error.statusCode = 400;
		throw error;
	}
	const month = normalizeMesReferencia(mesReferencia);
	const empresa = await requireEmpresaAccess(user, empresaId);
	const audience = userDocumentAudience(user);
	const activeFields = (await repository.listRequiredFields()).filter((field) =>
		fieldAppliesToAudience(field, audience),
	);
	const fieldMap = new Map(activeFields.map((field) => [field.id, field]));
	let submission = await repository.getLatestSubmissionByEmpresaMes(
		empresa.id,
		month,
	);
	const existingFiles = submission
		? await repository.listSubmissionFiles(submission.id)
		: [];
	if (submission && computeSubmissionStatus(existingFiles) === "aprovado") {
		const error = new Error(
			"Os documentos deste mês já foram aprovados. Não é possível enviar novos documentos para este mês.",
		);
		error.statusCode = 400;
		throw error;
	}
	if (
		submission &&
		computeSubmissionStatus(existingFiles) === "aguardando_administrativo"
	) {
		const error = new Error(
			"Os documentos deste mês já foram aprovados pelo supervisor e aguardam aprovação administrativa.",
		);
		error.statusCode = 409;
		throw error;
	}
	const latestByField = new Map(
		latestFilesByField(documentFilesOnly(existingFiles)).map((file) => [
			file.fieldId,
			file,
		]),
	);
	const pendingFields = [...latestByField.values()].filter(
		(file) => normalize(file.status) === "pendente",
	);
	if (pendingFields.length) {
		const error = new Error(
			"Existem documentos aguardando avaliação neste mês. Aguarde o supervisor avaliar antes de enviar novamente.",
		);
		error.statusCode = 409;
		throw error;
	}
	const receivedFields = new Set(fieldIds.filter(Boolean));
	const missing = activeFields.filter((field) => {
		if (!field.obrigatorio || receivedFields.has(field.id)) return false;
		const current = latestByField.get(field.id);
		const currentStatus = normalize(current?.status);
		return currentStatus !== "aprovado" && currentStatus !== "pendente";
	});
	if (missing.length) {
		const error = new Error(
			`Documentos obrigatorios ausentes: ${missing.map((item) => item.nome).join(", ")}.`,
		);
		error.statusCode = 400;
		throw error;
	}
	if (!files.length) {
		const error = new Error("Envie ao menos um arquivo.");
		error.statusCode = 400;
		throw error;
	}
	files.forEach(ensureAllowedMonthlyDocument);

	const { monthFolder } = await ensureMonthFolder(empresa, month, user);
	if (!submission) {
		submission = await repository.createSubmission({
			empresaId: empresa.id,
			empresaNome: empresa.nome,
			supervisorId: empresa.supervisorId,
			supervisorNome: empresa.supervisorNome,
			supervisorEmail: empresa.supervisorEmail,
			regional: empresa.regional,
			mesReferencia: month,
			submittedBy: userId(user),
			submittedByName: userName(user),
			submittedByEmail: userEmail(user) || empresa.responsavelEmail,
		});
	} else {
		submission = await repository.markSubmissionPending(submission.id, {
			submittedBy: userId(user),
			submittedByName: userName(user),
			submittedByEmail: userEmail(user) || empresa.responsavelEmail,
		});
	}

	const uploadedFiles = [];
	for (let index = 0; index < files.length; index += 1) {
		const file = files[index];
		const field = fieldMap.get(fieldIds[index]) || null;
		if (field?.id) {
			const repeatedFiles = documentFilesOnly(existingFiles).filter(
				(item) =>
					item.fieldId === field.id && normalize(item.status) !== "aprovado",
			);
			for (const repeatedFile of repeatedFiles) {
				await deleteDriveFileQuietly(repeatedFile);
			}
		}
		let uploaded = null;
		try {
			uploaded = await drive.uploadFile({
				file,
				folderId: monthFolder.id,
				name: field?.nome
					? monthlyDocumentFileName(field, month, file)
					: file.originalname,
			});
		} catch (error) {
			const uploadError = new Error(
				`Falha ao enviar arquivo para o Google Drive: ${error?.message || "erro desconhecido"}`,
			);
			uploadError.statusCode = error?.statusCode || 502;
			throw uploadError;
		}
		uploadedFiles.push(
			await repository.createFile({
				empresaId: empresa.id,
				empresaNome: empresa.nome,
				supervisorId: empresa.supervisorId,
				supervisorNome: empresa.supervisorNome,
				regional: empresa.regional,
				driveFileId: uploaded.id,
				driveFolderId: monthFolder.id,
				parentDriveFolderId: monthFolder.id,
				nome: uploaded.name || file.originalname,
				mimeType: uploaded.mimeType || file.mimetype,
				tipo: field?.nome || "Documento",
				tamanho: Number(uploaded.size || file.size || 0),
				status: "pendente",
				uploadedBy: userId(user),
				uploadedByName: userName(user),
				submissionId: submission.id,
				fieldId: field?.id || null,
				fieldNome: field?.nome || null,
				mesReferencia: month,
			}),
		);
	}
	const allFiles = await repository.listSubmissionFiles(submission.id);
	const nextStatus = computeSubmissionStatus(allFiles);
	const updatedSubmission = await repository.updateSubmissionOnly(
		submission.id,
		{
			status: nextStatus,
			motivoReprovacao:
				nextStatus === "reprovado"
					? latestFilesByField(allFiles)
							.filter((item) => normalize(item.status) === "reprovado")
							.map(
								(item) =>
									`${item.fieldNome || item.nome}: ${item.motivoReprovacao || "-"}`,
							)
							.join("\n")
					: null,
			reviewedBy: nextStatus === "pendente" ? null : submission.reviewedBy,
			reviewedByName:
				nextStatus === "pendente" ? null : submission.reviewedByName,
			reviewedAt: nextStatus === "pendente" ? null : submission.reviewedAt,
		},
	);
	notifyInBackground(() =>
		notifySubmissionCreated(updatedSubmission || submission),
	);
	notifyInBackground(() =>
		notifyInternalSubmissionCreated(updatedSubmission || submission, user),
	);
	clearDocumentosListCache();
	return { ...(updatedSubmission || submission), files: uploadedFiles };
}

function mapInvoiceFieldDocument(doc) {
	if (!doc?.data) return null;
	const data = doc.data || {};
	return {
		id: doc.documentId,
		nome: text(data.nome),
		ordem: Number(data.ordem || 0),
		ativo: data.ativo !== false,
		createdAt: data.createdAt || doc.importedAt,
		updatedAt: data.updatedAt || doc.updatedAt,
	};
}

async function listInvoiceFields({ includeInactive = false } = {}) {
	const docs = await documents.listAllDocuments(INVOICE_FIELDS_COLLECTION);
	return docs
		.map(mapInvoiceFieldDocument)
		.filter(Boolean)
		.filter((field) => includeInactive || field.ativo)
		.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}

async function saveInvoiceField(field = {}, user) {
	requireAdminUser(user);
	const nome = text(field.nome);
	if (!nome) {
		const error = new Error("Informe o nome da nota fiscal.");
		error.statusCode = 400;
		throw error;
	}
	const id = text(field.id) || safeSlug(nome);
	const now = new Date().toISOString();
	const current = await documents
		.getDocument(`${INVOICE_FIELDS_COLLECTION}/${id}`)
		.catch(() => null);
	const data = {
		...(current?.data || {}),
		nome,
		ordem: Number(field.ordem || 0),
		ativo: field.ativo !== false,
		updatedAt: now,
		updatedBy: userId(user),
		updatedByName: userName(user),
	};
	if (!data.createdAt) data.createdAt = now;
	await documents.upsertDocument({
		path: `${INVOICE_FIELDS_COLLECTION}/${id}`,
		collectionPath: INVOICE_FIELDS_COLLECTION,
		documentId: id,
		data,
	});
	return mapInvoiceFieldDocument({ documentId: id, data });
}

function canUploadInvoices(user, submission) {
	const role = normalize(user?.role);
	if (
		["admin", "supervisor_administrativo", "analista_administrativo"].includes(
			role,
		)
	)
		return true;
	if (role === "supervisor")
		return (
			normalize(user?.regional || user?.profile?.regional) ===
			normalize(submission.regional)
		);
	if (["lider_empresa", "agente_autorizado"].includes(role)) {
		const empresaId = text(
			user?.empresaId ||
				user?.empresa_id ||
				user?.profile?.empresaId ||
				user?.profile?.empresa_id,
		);
		return empresaId && empresaId === submission.empresaId;
	}
	return false;
}

async function uploadSubmissionInvoices({
	id,
	files = [],
	fieldIds = [],
	valores = [],
	user,
}) {
	clearDocumentosListCache();
	const submission = await getSubmissionWithFiles({ id, user });
	if (!canUploadInvoices(user, submission)) {
		const error = new Error(
			"Sem permissão para enviar notas fiscais deste envio.",
		);
		error.statusCode = 403;
		throw error;
	}
	if (normalize(submission.status) !== "aprovado") {
		const error = new Error(
			"As notas fiscais só podem ser enviadas após todos os documentos serem aprovados.",
		);
		error.statusCode = 409;
		throw error;
	}
	if (!files.length) {
		const error = new Error("Envie ao menos uma nota fiscal.");
		error.statusCode = 400;
		throw error;
	}
	files.forEach(ensureAllowedMonthlyDocument);
	const fields = await listInvoiceFields();
	const fieldMap = new Map(fields.map((field) => [field.id, field]));
	const empresa = await requireEmpresaAccess(user, submission.empresaId);
	const { monthFolder } = await ensureMonthFolder(
		empresa,
		submission.mesReferencia,
		user,
	);
	const invoiceFolder = await drive.createFolder(
		"Notas fiscais",
		monthFolder.id,
	);
	const uploadedFiles = [];

	for (let index = 0; index < files.length; index += 1) {
		const file = files[index];
		const field = fieldMap.get(fieldIds[index]) || {
			id: null,
			nome: text(file.originalname || "Nota fiscal"),
		};
		const valor = parseCurrency(valores[index]);
		if (valor <= 0) {
			const error = new Error(
				`Informe o valor da nota fiscal "${field.nome}".`,
			);
			error.statusCode = 400;
			throw error;
		}
		let uploaded = null;
		try {
			uploaded = await drive.uploadFile({
				file,
				folderId: invoiceFolder.id,
				name: invoiceFileName(field, submission.mesReferencia, file),
			});
		} catch (error) {
			const uploadError = new Error(
				`Falha ao enviar nota fiscal para o Google Drive: ${error?.message || "erro desconhecido"}`,
			);
			uploadError.statusCode = error?.statusCode || 502;
			throw uploadError;
		}
		uploadedFiles.push(
			await repository.createFile({
				empresaId: submission.empresaId,
				empresaNome: submission.empresaNome,
				supervisorId: submission.supervisorId,
				supervisorNome: submission.supervisorNome,
				regional: submission.regional,
				driveFileId: uploaded.id,
				driveFolderId: invoiceFolder.id,
				parentDriveFolderId: monthFolder.id,
				nome: uploaded.name || file.originalname,
				mimeType: uploaded.mimeType || file.mimetype,
				tipo: field.nome || "Nota fiscal",
				categoria: "nota_fiscal",
				valor,
				tamanho: Number(uploaded.size || file.size || 0),
				status: "aprovado",
				uploadedBy: userId(user),
				uploadedByName: userName(user),
				submissionId: submission.id,
				fieldId: field.id || null,
				fieldNome: field.nome || null,
				mesReferencia: submission.mesReferencia,
			}),
		);
	}

	return {
		...submission,
		files: await repository.listSubmissionFiles(submission.id),
		invoices: uploadedFiles,
	};
}

async function listSubmissions({
	status,
	mine = false,
	empresaId,
	limit,
	offset,
	user,
}) {
	const role = normalize(user?.role);
	const filters = { status, limit, offset };
	if (normalize(status) === "pendente") {
		delete filters.status;
		if (
			["supervisor_administrativo", "analista_administrativo"].includes(role)
		) {
			filters.statuses = ["aguardando_administrativo"];
		} else if (role === "supervisor") {
			filters.statuses = ["pendente"];
		} else {
			filters.statuses = ["pendente", "aguardando_administrativo"];
		}
	}
	if (empresaId) {
		const empresa = await requireEmpresaAccess(user, empresaId);
		filters.empresaId = empresa.id;
	} else if (role === "supervisor") {
		filters.regional = text(user?.regional || user?.profile?.regional);
	}
	if (["lider_empresa", "agente_autorizado"].includes(role) || mine) {
		filters.empresaId = text(
			user?.empresaId ||
				user?.empresa_id ||
				user?.profile?.empresaId ||
				user?.profile?.empresa_id,
		);
	}
	const cacheKey = getCacheKey("submissions", {
		filters,
		role,
		uid: userId(user),
		regional: text(user?.regional || user?.profile?.regional),
	});
	return getOrSetListCache(cacheKey, async () => {
		const submissions = await repository.listSubmissions(filters);
		return enrichSubmissions(submissions);
	});
}

async function listSupervisorTreatments({ limit, offset, user }) {
	if (!canViewSupervisorTreatments(user)) {
		const error = new Error(
			"Sem permissão para visualizar tratativas de documentos.",
		);
		error.statusCode = 403;
		throw error;
	}
	const filters = { statuses: ["pendente"], limit, offset };
	if (normalize(user?.role) === "supervisor") {
		filters.regional = text(user?.regional || user?.profile?.regional);
	}
	const cacheKey = getCacheKey("supervisorTreatments", {
		filters,
		role: normalize(user?.role),
		uid: userId(user),
		regional: text(user?.regional || user?.profile?.regional),
	});
	return getOrSetListCache(cacheKey, async () => {
		const submissions = await repository.listSubmissions(filters);
		return enrichSubmissions(submissions);
	});
}

async function getSubmissionWithFiles({ id, user }) {
	const submission = await repository.getSubmission(id);
	if (!submission) {
		const error = new Error("Envio não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	await requireEmpresaAccess(user, submission.empresaId);
	return {
		...submission,
		files: await repository.listSubmissionFiles(submission.id),
	};
}

async function reviewSubmission({ id, status, motivo, user }) {
	clearDocumentosListCache();
	const submission = await getSubmissionWithFiles({ id, user });
	if (
		!canApprove(user, {
			regional: submission.regional,
			empresaId: submission.empresaId,
		})
	) {
		const error = new Error(
			"Sem permissão para aprovar documentos desta empresa.",
		);
		error.statusCode = 403;
		throw error;
	}
	const normalizedStatus = normalize(status);
	if (!["aprovado", "reprovado"].includes(normalizedStatus)) {
		const error = new Error("Status invalido.");
		error.statusCode = 400;
		throw error;
	}
	if (normalizedStatus === "reprovado" && !text(motivo)) {
		const error = new Error("Informe o motivo da reprovação.");
		error.statusCode = 400;
		throw error;
	}
	const updated = await repository.updateSubmissionStatus(id, {
		status: normalizedStatus,
		motivoReprovacao: normalizedStatus === "reprovado" ? text(motivo) : null,
		reviewedBy: userId(user),
		reviewedByName: userName(user),
		reviewedAt: new Date().toISOString(),
	});
	notifyInBackground(() => notifySubmissionReviewed(updated));
	return {
		...updated,
		files: await repository.listSubmissionFiles(id),
	};
}

async function uploadDocument({ empresaId, file, tipo, user }) {
	if (!file?.buffer?.length) {
		const error = new Error("Arquivo obrigatorio.");
		error.statusCode = 400;
		throw error;
	}
	const empresa = await requireEmpresaAccess(user, empresaId);
	const folder = await ensureClientFolder(empresa, user);
	let uploaded = null;

	try {
		uploaded = await drive.uploadFile({
			file,
			folderId: folder.driveFolderId,
			name: file.originalname,
		});
	} catch (error) {
		const uploadError = new Error(
			`Falha ao enviar arquivo para o Google Drive: ${error.message}`,
		);
		uploadError.statusCode = 502;
		throw uploadError;
	}

	if (!uploaded?.id) {
		const error = new Error(
			"Google Drive não retornou o ID do arquivo enviado.",
		);
		error.statusCode = 502;
		throw error;
	}

	try {
		return await repository.createFile({
			empresaId: empresa.id,
			empresaNome: empresa.nome,
			supervisorId: empresa.supervisorId,
			supervisorNome: empresa.supervisorNome,
			regional: empresa.regional,
			driveFileId: uploaded.id,
			driveFolderId: folder.driveFolderId,
			nome: uploaded.name || file.originalname,
			mimeType: uploaded.mimeType || file.mimetype,
			tipo,
			tamanho: Number(uploaded.size || file.size || 0),
			status: "pendente",
			uploadedBy: userId(user),
			uploadedByName: userName(user),
		});
	} catch (error) {
		await drive.deleteFile(uploaded.id).catch(() => null);
		const metadataError = new Error(
			`Arquivo enviado ao Drive, mas falhou ao salvar metadados no banco: ${error.message}`,
		);
		metadataError.statusCode = 500;
		throw metadataError;
	}
}

async function listDocuments({ status, empresaId, limit, offset, user }) {
	const role = normalize(user?.role);
	const filters = { status, empresaId, limit, offset };
	if (role === "supervisor")
		filters.regional = text(user?.regional || user?.profile?.regional);
	if (role === "lider_empresa") {
		filters.empresaId = text(
			user?.empresaId ||
				user?.empresa_id ||
				user?.profile?.empresaId ||
				user?.profile?.empresa_id ||
				empresaId,
		);
	}
	return repository.listFiles(filters);
}

async function getAccessibleFile(id, user) {
	const file = await repository.getFile(id);
	if (!file) {
		const error = new Error("Documento não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	await requireEmpresaAccess(user, file.empresaId);
	return file;
}

async function downloadDocument({ id, user }) {
	const file = await getAccessibleFile(id, user);
	const response = await drive.downloadFile(file.driveFileId);
	return { file, stream: response.data };
}

async function downloadSubmissionZip({ id, user }) {
	const submission = await getSubmissionWithFiles({ id, user });
	const latestFiles = latestFilesByField(
		documentFilesOnly(submission.files || []),
	);
	const approvedFiles = latestFiles.filter(
		(file) => normalize(file.status) === "aprovado",
	);
	if (
		computeSubmissionStatus(submission.files || []) !== "aprovado" ||
		!approvedFiles.length
	) {
		const error = new Error(
			"O ZIP so fica disponivel quando todos os documentos estiverem aprovados.",
		);
		error.statusCode = 400;
		throw error;
	}

	const zip = createZipArchive({ zlib: { level: 9 } });
	const fileName = `${sanitizeFileName(submission.empresaNome)} - ${monthLabel(submission.mesReferencia, " ")}.zip`;
	const usedNames = new Map();

	for (const file of approvedFiles) {
		const label = file.fieldNome || file.tipo || file.nome || "documento";
		if (!file.driveFileId) {
			const error = new Error(
				`Documento aprovado sem arquivo no Google Drive: ${label}.`,
			);
			error.statusCode = 502;
			throw error;
		}

		let buffer;
		try {
			const response = await drive.downloadFile(file.driveFileId);
			buffer = await streamToBuffer(response.data);
		} catch (error) {
			if (isDriveNotFoundError(error)) {
				await markMissingDriveFileForResubmission(submission, file);
				const missingError = new Error(
					`O documento "${label}" estava aprovado, mas não existe mais no Google Drive. Ele foi marcado para reenvio e o mês voltou para pendente.`,
				);
				missingError.statusCode = 409;
				throw missingError;
			}
			const downloadError = new Error(
				`Não foi possível baixar o documento "${label}" do Google Drive: ${error.message}`,
			);
			downloadError.statusCode = 502;
			throw downloadError;
		}

		const baseName = sanitizeFileName(label);
		const count = usedNames.get(baseName) || 0;
		usedNames.set(baseName, count + 1);
		zip.append(buffer, {
			name: `${baseName}${count ? ` (${count + 1})` : ""}.pdf`,
		});
	}

	queueMicrotask(() => {
		try {
			const finalizeResult = zip.finalize();
			if (finalizeResult && typeof finalizeResult.catch === "function") {
				finalizeResult.catch((error) => zip.emit("error", error));
			}
		} catch (error) {
			zip.emit("error", error);
		}
	});

	return { submission, fileName, stream: zip };
}

async function renameDocument({ id, name, user }) {
	const file = await getAccessibleFile(id, user);
	const newName = text(name);
	if (!newName) {
		const error = new Error("Nome obrigatorio.");
		error.statusCode = 400;
		throw error;
	}
	await drive.renameFile(file.driveFileId, newName);
	return repository.updateFile(id, { nome: newName });
}

async function deleteDocument({ id, user }) {
	const file = await getAccessibleFile(id, user);
	await drive.deleteFile(file.driveFileId);
	return repository.deleteFile(id);
}

function assertApprovalStatus(status, motivo) {
	if (!["aprovado", "reprovado", "pendente"].includes(status)) {
		const error = new Error("Status invalido.");
		error.statusCode = 400;
		throw error;
	}
	if (status === "reprovado" && !text(motivo)) {
		const error = new Error("Informe o motivo da reprovação.");
		error.statusCode = 400;
		throw error;
	}
}

function getReviewMode(file) {
	const isAdministrativeStep =
		normalize(file.status) === "aprovado" &&
		normalize(file.adminStatus) !== "aprovado";
	return isAdministrativeStep ? "administrativo" : "operacional";
}

function assertReviewPermission({ user, file, reviewMode }) {
	if (reviewMode === "administrativo" && !canAdministrativeReview(user)) {
		const error = new Error(
			"Apenas o administrativo pode finalizar documentos já aprovados pelo supervisor.",
		);
		error.statusCode = 403;
		throw error;
	}
	if (reviewMode !== "administrativo" && !canApprove(user, file)) {
		const error = new Error(
			"Sem permissão para aprovar documentos desta empresa.",
		);
		error.statusCode = 403;
		throw error;
	}
}

function buildAdministrativeApprovalChanges({ status, motivo, user, now }) {
	if (status === "reprovado") {
		return {
			status: "reprovado",
			motivoReprovacao: text(motivo),
			adminStatus: "reprovado",
			adminMotivoReprovacao: text(motivo),
			adminReviewedBy: userId(user),
			adminReviewedByName: userName(user),
			adminReviewedAt: now,
		};
	}
	const pending = status === "pendente";
	return {
		status: "aprovado",
		motivoReprovacao: null,
		adminStatus: status,
		adminMotivoReprovacao: null,
		adminReviewedBy: pending ? null : userId(user),
		adminReviewedByName: pending ? null : userName(user),
		adminReviewedAt: pending ? null : now,
	};
}

function buildOperationalApprovalChanges({ status, motivo, user, now }) {
	const pending = status === "pendente";
	return {
		status,
		motivoReprovacao: status === "reprovado" ? text(motivo) : null,
		adminStatus: "pendente",
		adminMotivoReprovacao: null,
		adminReviewedBy: null,
		adminReviewedByName: null,
		adminReviewedAt: null,
		approvedBy: pending ? null : userId(user),
		approvedByName: pending ? null : userName(user),
		approvedAt: pending ? null : now,
	};
}

function buildApprovalChanges({ reviewMode, status, motivo, user, now }) {
	if (reviewMode === "administrativo") {
		return buildAdministrativeApprovalChanges({ status, motivo, user, now });
	}
	return buildOperationalApprovalChanges({ status, motivo, user, now });
}

async function notifyApprovalSideEffects({
	file,
	updatedFile,
	normalizedStatus,
	nextStatus,
	updatedSubmission,
	reviewMode,
}) {
	if (normalizedStatus === "reprovado") {
		const submission = await repository.getSubmission(file.submissionId);
		if (submission) {
			notifyInBackground(() => notifyDocumentRejected(submission, updatedFile));
			if (reviewMode === "administrativo") {
				notifyInBackground(() =>
					notifyAdministrativeRejected(submission, updatedFile),
				);
			}
		}
	}
	if (nextStatus === "aguardando_administrativo" && updatedSubmission) {
		notifyInBackground(() => notifyAdministrativeQueue(updatedSubmission));
	}
	if (nextStatus === "aprovado" && updatedSubmission) {
		notifyInBackground(() => notifySubmissionReviewed(updatedSubmission));
	}
}

async function updateApproval({ id, status, motivo, user }) {
	const file = await getAccessibleFile(id, user);
	const normalizedStatus = normalize(status);
	assertApprovalStatus(normalizedStatus, motivo);
	const reviewMode = getReviewMode(file);
	assertReviewPermission({ user, file, reviewMode });
	const now = new Date().toISOString();
	const changes = buildApprovalChanges({
		reviewMode,
		status: normalizedStatus,
		motivo,
		user,
		now,
	});

	const updatedFile = await repository.updateFile(id, changes);
	if (normalizedStatus === "reprovado") await deleteDriveFileQuietly(file);

	if (file.submissionId) {
		const files = await repository.listSubmissionFiles(file.submissionId);
		const latestFiles = latestFilesByField(files);
		const nextStatus = computeSubmissionStatus(files);
		const updatedSubmission = await repository.updateSubmissionOnly(
			file.submissionId,
			{
				status: nextStatus,
				motivoReprovacao: summarizeRejectedFiles(latestFiles),
				...getPrimaryReviewFields(nextStatus, user, reviewMode),
			},
		);
		await notifyApprovalSideEffects({
			file,
			updatedFile,
			normalizedStatus,
			nextStatus,
			updatedSubmission,
			reviewMode,
		});
	}
	return updatedFile;
}

async function purgeDocumentHistory({
	deleteDriveFiles = false,
	resetFolders = false,
	confirmation = "",
	user,
}) {
	requireAdminUser(user);
	if (text(confirmation).toUpperCase() !== "ZERAR DOCUMENTOS") {
		const error = new Error(
			"Digite ZERAR DOCUMENTOS para confirmar a limpeza.",
		);
		error.statusCode = 400;
		throw error;
	}

	const files = await repository.listAllFilesForPurge();
	const driveErrors = [];

	if (deleteDriveFiles) {
		for (const file of files) {
			if (!file.driveFileId) continue;
			try {
				await drive.deleteFile(file.driveFileId);
			} catch (error) {
				if (!isDriveNotFoundError(error)) {
					driveErrors.push({
						id: file.id,
						nome: file.nome,
						driveFileId: file.driveFileId,
						error: error?.message || String(error),
					});
				}
			}
		}
	}

	const result = await repository.purgeDocumentHistory({ resetFolders });
	return {
		ok: true,
		...result,
		driveFilesRequested: Boolean(deleteDriveFiles),
		driveErrors,
	};
}

module.exports = {
	createClientFolder,
	createMonthlySubmission,
	createSubfolder,
	deleteDocument,
	downloadCompanyDriveFile,
	downloadDocument,
	downloadSubmissionZip,
	getSubmissionWithFiles,
	getBillingConfig,
	listInvoiceFields,
	listCompanyDriveFolder,
	listDocuments,
	listRequiredFields,
	listSubmissions,
	listSupervisorTreatments,
	renameDocument,
	reviewSubmission,
	runBillingNotifications,
	purgeDocumentHistory,
	saveBillingConfig,
	saveInvoiceField,
	saveRequiredField,
	updateApproval,
	uploadDocument,
	uploadSubmissionInvoices,
};

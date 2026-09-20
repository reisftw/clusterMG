const express = require("express");
const multer = require("multer");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const archiver = require("archiver");
const drive = require("./documentos/services/googleDriveService");
const imoveisRepository = require("./imoveisRepository");

const COLLECTIONS = Object.freeze({
	imoveis: "imoveis_administrativos",
	reajustes: "imoveis_administrativos_reajustes",
	iptu: "imoveis_administrativos_iptu",
	alugueis: "imoveis_administrativos_alugueis",
	contratos: "imoveis_administrativos_contratos",
	anexos: "imoveis_administrativos_anexos",
	aditivos: "imoveis_administrativos_aditivos",
	config: "imoveis_administrativos_config",
});

const ADMINISTRATIVO_ROLES = [
	"admin",
	"supervisor_administrativo",
	"analista_administrativo",
];
const LOCAL_CONTRACTS_LIMIT_BYTES = Number(process.env.IMOVEIS_LOCAL_CONTRACTS_LIMIT_BYTES || 2 * 1024 * 1024 * 1024);
const LOCAL_CONTRACTS_DIR = path.resolve(process.env.IMOVEIS_LOCAL_CONTRACTS_DIR || path.join(process.cwd(), "uploads", "imoveis-contratos"));

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: Number(
			process.env.IMOVEIS_CONTRATO_UPLOAD_LIMIT_BYTES || 8 * 1024 * 1024,
		),
	},
	fileFilter: (_req, file, cb) => {
		const mime = String(file?.mimetype || "").toLowerCase();
		const name = String(file?.originalname || "").toLowerCase();
		const allowedMime = [
			"application/pdf",
			"image/png",
			"image/jpeg",
			"video/mp4",
			"video/quicktime",
			"video/webm",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-excel",
		].includes(mime);
		const allowed =
			allowedMime && /\.(pdf|png|jpe?g|mp4|mov|webm|xlsx|xls)$/i.test(name);
		if (!allowed) {
			cb(new Error("Envie apenas PDF, PNG, JPG, vídeo ou planilha Excel."));
			return;
		}
		cb(null, true);
	},
});

// Fase H (docs/TECHNICAL-AUDIT.md, achado #19): MIME/extensao sao so o que
// o cliente diz que o arquivo e (spoofavel) — avatar e documentos ja
// validam magic bytes (assinatura real do conteudo), imoveis nao validava
// pra nenhum dos tipos aceitos. Cobertura por assinatura real:
// PDF/PNG/JPEG (mesmas assinaturas de documentosRoutes.js), MP4/MOV (caixa
// ISO base media, "ftyp" nos bytes 4-7 — cobre os dois formatos, que
// compartilham o mesmo container), WEBM (cabecalho EBML), XLSX (zip:
// PK\x03\x04 — Office Open XML e um zip) e XLS legado (assinatura OLE2).
function isAllowedImovelFileBuffer(file) {
	if (!file?.buffer?.length) return false;
	const buffer = file.buffer;
	const header3 = buffer.subarray(0, 3);
	const header4 = buffer.subarray(0, 4);
	const header5 = buffer.subarray(0, 5).toString("utf8");
	const header8 = buffer.subarray(4, 8).toString("ascii");
	const isPdf = header5 === "%PDF-";
	const isPng = header4.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const isJpeg = header3.equals(Buffer.from([0xff, 0xd8, 0xff]));
	const isMp4OrMov = header8 === "ftyp";
	const isWebm = header4.equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
	const isXlsx = header4.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
	const isXlsLegacy = buffer
		.subarray(0, 8)
		.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
	return isPdf || isPng || isJpeg || isMp4OrMov || isWebm || isXlsx || isXlsLegacy;
}

function isPdfBuffer(file) {
	return Boolean(file?.buffer?.subarray(0, 5).toString("utf8") === "%PDF-");
}

function safeFilename(value, fallback = "documento.pdf") {
	const raw = text(value || fallback) || fallback;
	const base = raw.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "documento";
	return `${base}.pdf`;
}

async function walkLocalContracts(dir = LOCAL_CONTRACTS_DIR) {
	const files = [];
	async function walk(current) {
		let entries = [];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch (error) {
			if (error?.code === "ENOENT") return;
			throw error;
		}
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.isFile()) {
				const stat = await fs.stat(fullPath);
				files.push({ path: fullPath, size: stat.size, mtime: stat.mtime });
			}
		}
	}
	await walk(dir);
	return files;
}

async function getLocalContractsStorageStatus() {
	const files = await walkLocalContracts();
	const usedBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
	return {
		rootDir: LOCAL_CONTRACTS_DIR,
		limitBytes: LOCAL_CONTRACTS_LIMIT_BYTES,
		usedBytes,
		freeBytes: Math.max(LOCAL_CONTRACTS_LIMIT_BYTES - usedBytes, 0),
		percentUsed: LOCAL_CONTRACTS_LIMIT_BYTES > 0 ? Math.round((usedBytes / LOCAL_CONTRACTS_LIMIT_BYTES) * 1000) / 10 : 0,
		filesCount: files.length,
		updatedAt: nowIso(),
	};
}

async function saveLocalContractPdf({ imovel, file, metadata = {}, user }) {
	if (!file) {
		const error = new Error("Arquivo obrigatorio.");
		error.statusCode = 400;
		throw error;
	}
	if (!isPdfBuffer(file)) {
		const error = new Error("Envie apenas contrato em PDF.");
		error.statusCode = 400;
		throw error;
	}
	const status = await getLocalContractsStorageStatus();
	if (status.usedBytes + Number(file.size || file.buffer.length || 0) > LOCAL_CONTRACTS_LIMIT_BYTES) {
		const error = new Error("Limite de 2GB da pasta de contratos atingido.");
		error.statusCode = 413;
		throw error;
	}
	const imovelId = normalizeId(imovel.id || imovel.seniorId);
	const folder = path.join(LOCAL_CONTRACTS_DIR, imovelId);
	await fs.mkdir(folder, { recursive: true });
	const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeFilename(metadata.nome || file.originalname)}`;
	const fullPath = path.join(folder, filename);
	await fs.writeFile(fullPath, file.buffer);
	const relativeUrl = `/api/uploads/imoveis-contratos/${encodeURIComponent(imovelId)}/${encodeURIComponent(filename)}`;
	const documentId = `${imovelId}_${path.parse(filename).name}`;
	const data = {
		imovelId: imovel.id,
		tipo: "local_pdf",
		categoria: "contrato",
		nome: text(metadata.nome) || file.originalname,
		url: relativeUrl,
		driveFileId: "",
		driveFolderId: "",
		mimeType: "application/pdf",
		tamanho: Number(file.size || file.buffer.length || 0),
		observacao: text(metadata.observacao),
		data: dateText(metadata.data) || nowIso().slice(0, 10),
		createdAt: nowIso(),
		createdByName: userName(user),
	};
	return imoveisRepository.upsertContrato(imovel.id, { id: documentId, ...data });
}

async function streamLocalContractsZip(res) {
	await fs.mkdir(LOCAL_CONTRACTS_DIR, { recursive: true });
	res.setHeader("Content-Type", "application/zip");
	res.setHeader("Content-Disposition", `attachment; filename="contratos-imoveis-${new Date().toISOString().slice(0, 10)}.zip"`);
	const archive = archiver("zip", { zlib: { level: 9 } });
	archive.on("error", (error) => res.destroy(error));
	archive.pipe(res);
	archive.directory(LOCAL_CONTRACTS_DIR, false);
	await archive.finalize();
}

async function clearLocalContractsFolder() {
	await fs.rm(LOCAL_CONTRACTS_DIR, { recursive: true, force: true });
	await fs.mkdir(LOCAL_CONTRACTS_DIR, { recursive: true });
	await imoveisRepository.removeLocalPdfContratos();
	return getLocalContractsStorageStatus();
}

function rejectInvalidImovelFile(req, res, next) {
	if (req.file && !isAllowedImovelFileBuffer(req.file)) {
		res.status(400).json({
			error: "Arquivo invalido ou corrompido. Envie PDF, PNG, JPG, vídeo ou planilha Excel.",
		});
		return;
	}
	next();
}

const DEFAULT_CONFIG = Object.freeze({
	empresas: ["SEMPRE", "ONNET"],
	classificacoes: [
		"ADMINISTRATIVO",
		"SITE/POP",
		"TORRE",
		"LOJA",
		"ESTACIONAMENTO",
	],
	diretorias: ["DSO", "ADMINISTRATIVO", "COMERCIAL", "FINANCEIRO", "OPERAÇÕES"],
	imoveisRootFolderId: "",
});

function text(value) {
	return String(value || "").trim();
}

function numberValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	let normalized = text(value).replace(/[R$\s]/g, "");
	if (!normalized) return 0;
	if (normalized.includes(",")) {
		normalized = normalized.replace(/\./g, "").replace(",", ".");
	} else if (normalized.includes(".")) {
		const parts = normalized.split(".");
		const last = parts.at(-1) || "";
		if (last.length === 3 && parts.length > 1) normalized = normalized.replace(/\./g, "");
	}
	const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
}

function isLikelyUtilityCustomerCode(value) {
	const raw = text(value);
	if (!raw) return false;
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 4) return false;
	const normalized = raw.replace(/\s/g, "");
	return /^\d+$/.test(normalized) && Number(digits) >= 1000;
}

function resolveUtilityAccountFields(body = {}, existing = {}) {
	const energiaValorSource =
		body.energiaValorMedio ??
		body.contaEnergiaValorMedio ??
		existing.energiaValorMedio;
	const energiaCodigoSource =
		body.energiaCodigoCliente ??
		body.codigoClienteEnergia ??
		existing.energiaCodigoCliente;
	const aguaValorSource =
		body.aguaValorMedio ?? body.contaAguaValorMedio ?? existing.aguaValorMedio;
	const aguaCodigoSource =
		body.aguaCodigoCliente ?? body.codigoClienteAgua ?? existing.aguaCodigoCliente;
	const energiaCodigoFromValor =
		!text(energiaCodigoSource) && isLikelyUtilityCustomerCode(energiaValorSource);
	const aguaCodigoFromValor =
		!text(aguaCodigoSource) && isLikelyUtilityCustomerCode(aguaValorSource);
	return {
		energiaValorMedio: energiaCodigoFromValor
			? 0
			: numberValue(energiaValorSource),
		energiaCodigoCliente: text(
			energiaCodigoFromValor ? energiaValorSource : energiaCodigoSource,
		),
		aguaValorMedio: aguaCodigoFromValor ? 0 : numberValue(aguaValorSource),
		aguaCodigoCliente: text(aguaCodigoFromValor ? aguaValorSource : aguaCodigoSource),
	};
}

function boolValue(value) {
	if (typeof value === "boolean") return value;
	return ["true", "1", "sim", "s", "ativo", "possui"].includes(
		String(value || "")
			.trim()
			.toLowerCase(),
	);
}

function dateText(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime()))
		return value.toISOString().slice(0, 10);
	if (typeof value === "number" && Number.isFinite(value)) {
		const excelEpoch = new Date(Date.UTC(1899, 11, 30));
		excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.trunc(value));
		return excelEpoch.toISOString().slice(0, 10);
	}
	return text(value);
}

function normalizeDriveFolderId(value) {
	const source = text(value);
	if (!source) return "";
	const folderMatch = source.match(/\/folders\/([a-zA-Z0-9_-]+)/);
	if (folderMatch?.[1]) return folderMatch[1];
	const idQueryMatch = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
	if (idQueryMatch?.[1]) return idQueryMatch[1];
	return source;
}

function composeEndereco(body = {}, existing = {}) {
	const cep = text(body.cep ?? existing.cep);
	const estado = text(body.estado ?? existing.estado);
	const cidade = text(body.cidade ?? existing.cidade);
	const bairro = text(body.bairro ?? existing.bairro);
	const rua = text(body.rua ?? existing.rua);
	const numero = text(body.numero ?? existing.numero);
	const ruaNumero = [rua, numero].filter(Boolean).join(", ");
	return [ruaNumero, bairro, cidade, estado, cep ? `CEP: ${cep}` : ""]
		.filter(Boolean)
		.join(" - ");
}

function normalizeId(value) {
	return text(value)
		.replace(/[^\w.-]/g, "_")
		.slice(0, 120);
}

function nowIso() {
	return new Date().toISOString();
}

function titleCase(value) {
	return text(value)
		.toLowerCase()
		.replace(/(^|[\s/-])([\p{L}])/gu, (match, separator, letter) =>
			`${separator}${letter.toUpperCase()}`,
		);
}

function normalizeUf(value) {
	return text(value).replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
}

function stripAddressNoise(value, { cidade = "", estado = "" } = {}) {
	let result = text(value);
	if (!result) return "";
	result = result.replace(/\bCEP\s*:?\s*\d{2}\.?\d{3}-?\d{3}\b/gi, "");
	const city = text(cidade).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const uf = normalizeUf(estado);
	if (city && uf) {
		result = result.replace(
			new RegExp(`\\s*[-,|/]?\\s*${city}\\s*/?\\s*${uf}\\b`, "gi"),
			"",
		);
		result = result.replace(
			new RegExp(`\\s*-\\s*${city}\\s*-\\s*${uf}\\b`, "gi"),
			"",
		);
	}
	if (city)
		result = result.replace(
			new RegExp(`\\s*[-,|/]?\\s*${city}\\b`, "gi"),
			"",
		);
	if (uf)
		result = result.replace(new RegExp(`\\s*[-,|/]?\\s*${uf}\\b`, "gi"), "");
	return result
		.replace(/\s+-\s+$/g, "")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,.-])/g, "$1")
		.replace(/[-,\s]+$/g, "")
		.trim();
}

function buildEnderecoTitulo(body = {}, existing = {}) {
	const rua = text(body.rua ?? existing.rua);
	const numero = text(body.numero ?? existing.numero);
	if (rua && numero) return `${rua} Nº ${numero}`;
	if (rua) return rua;
	return stripAddressNoise(text(body.endereco ?? existing.endereco), {
		cidade: body.cidade ?? existing.cidade,
		estado: body.estado ?? existing.estado,
	});
}

function buildImovelNome(body = {}, existing = {}) {
	const classificacao =
		titleCase(body.classificacao ?? body.ocupacao ?? existing.classificacao) ||
		titleCase(body.nomeSite ?? existing.nomeSite) ||
		"Imóvel";
	const cidade = titleCase(body.cidade ?? existing.cidade);
	const estado = normalizeUf(body.estado ?? existing.estado);
	const endereco = buildEnderecoTitulo(body, existing);
	const local = [cidade, estado ? `/${estado}` : ""].filter(Boolean).join(" ");
	return [classificacao, local, endereco].filter(Boolean).join(" - ");
}

function userName(user = {}) {
	return (
		user?.profile?.nome || user?.nome || user?.email || user?.uid || "Sistema"
	);
}

function buildImovelPayload(body = {}, user = {}, existing = {}) {
	const seniorId = normalizeId(
		body.seniorId || body.idSenior || body.id || existing.seniorId,
	);
	if (!seniorId) {
		const error = new Error("Informe o ID do imovel no Senior.");
		error.statusCode = 400;
		throw error;
	}

	const tipoContrato =
		text(
			body.tipoContrato || existing.tipoContrato || "proprio",
		).toLowerCase() === "alugado"
			? "alugado"
			: "proprio";
	const estacionamento = boolValue(
		body.estacionamento ??
			body.temEstacionamento ??
			existing.estacionamento ??
			existing.temEstacionamento,
	);
	const ativo =
		body.ativo === undefined
			? !["inativo", "cancelado", "encerrado"].includes(
					text(body.situacao || existing.situacao).toLowerCase(),
				) && existing.ativo !== false
			: boolValue(body.ativo);
	const dadosAluguel =
		tipoContrato === "alugado"
			? {
					valorOriginal: numberValue(
						body.valorOriginal ?? existing.valorOriginal,
					),
					valorAluguel: numberValue(body.valorAluguel ?? existing.valorAluguel),
					valorM2: numberValue(body.valorM2 ?? existing.valorM2),
					vencimentoAluguelDia: Math.min(
						Math.max(
							Math.trunc(
								Number(
									body.vencimentoAluguelDia ??
										existing.vencimentoAluguelDia ??
										10,
								),
							),
							1,
						),
						31,
					),
					proprietarioNome: text(
						body.proprietarioNome ?? existing.proprietarioNome,
					),
					proprietarioTelefone: text(
						body.proprietarioTelefone ?? existing.proprietarioTelefone,
					),
					proprietarioEmail: text(
						body.proprietarioEmail ?? existing.proprietarioEmail,
					),
					proprietarioContatos: text(
						body.proprietarioContatos ?? existing.proprietarioContatos,
					),
					contratoInicio: dateText(
						body.contratoInicio ?? existing.contratoInicio,
					),
					contratoFim: dateText(
						body.contratoFim ?? body.finalVigencia ?? existing.contratoFim,
					),
					dataUltimoReajuste: dateText(
						body.dataUltimoReajuste ??
							body.mesUltimoReajuste ??
							existing.dataUltimoReajuste,
					),
					mesReajuste: text(body.mesReajuste ?? existing.mesReajuste),
					indiceReajuste: text(body.indiceReajuste ?? existing.indiceReajuste),
				}
			: {
					valorOriginal: 0,
					valorAluguel: 0,
					valorM2: 0,
					vencimentoAluguelDia: "",
					proprietarioNome: "",
					proprietarioTelefone: "",
					proprietarioEmail: "",
					proprietarioContatos: "",
					contratoInicio: "",
					contratoFim: "",
					dataUltimoReajuste: "",
					mesReajuste: "",
					indiceReajuste: "",
				};
	const utilityFields = resolveUtilityAccountFields(body, existing);
	return {
		...existing,
		seniorId,
		nome: buildImovelNome(body, existing),
		base: text(
			body.base ?? body.codigoEmpresa ?? existing.base ?? "SEMPRE",
		).toUpperCase(),
		cnpjCpf: text(body.cnpjCpf ?? body.cnpj ?? body.cnpjImovel ?? body.cnpjEmpresa ?? existing.cnpjCpf),
		classificacao: text(
			body.classificacao ?? body.ocupacao ?? existing.classificacao,
		),
		diretoria: text(body.diretoria ?? existing.diretoria),
		nomeSite: text(body.nomeSite ?? existing.nomeSite),
		siteDso: text(body.siteDso ?? existing.siteDso),
		pessoaReferencia: text(body.pessoaReferencia ?? existing.pessoaReferencia),
		contatoPessoaReferencia: text(
			body.contatoPessoaReferencia ?? existing.contatoPessoaReferencia,
		),
		...utilityFields,
		posicoesTrabalho: numberValue(
			body.posicoesTrabalho ?? existing.posicoesTrabalho,
		),
		quantidadeColaboradores: numberValue(
			body.quantidadeColaboradores ?? existing.quantidadeColaboradores,
		),
		situacao: text(body.situacao ?? existing.situacao),
		encerramento: dateText(body.encerramento ?? existing.encerramento),
		dataInativacao: ativo
			? ""
			: dateText(
					body.dataInativacao ??
						existing.dataInativacao ??
						nowIso().slice(0, 10),
				),
		motivoInativacao: ativo
			? ""
			: text(body.motivoInativacao ?? existing.motivoInativacao),
		ativo,
		tipoContrato,
		...dadosAluguel,
		proprietarioNome: text(body.proprietarioNome ?? existing.proprietarioNome),
		proprietarioDocumento: text(
			body.proprietarioDocumento ?? existing.proprietarioDocumento,
		),
		proprietarioTelefone: text(body.proprietarioTelefone ?? existing.proprietarioTelefone),
		proprietarioEmail: text(body.proprietarioEmail ?? existing.proprietarioEmail),
		proprietarioContatos: text(body.proprietarioContatos ?? existing.proprietarioContatos),
		formaPagamento: text(body.formaPagamento ?? existing.formaPagamento),
		alvaraFuncionamentoLink: text(body.alvaraFuncionamentoLink ?? existing.alvaraFuncionamentoLink),
		alvaraFuncionamentoVencimento: dateText(body.alvaraFuncionamentoVencimento ?? existing.alvaraFuncionamentoVencimento),
		iptuResponsavel: text(body.iptuResponsavel ?? existing.iptuResponsavel),
		iptuLink: text(body.iptuLink ?? existing.iptuLink),
		iptuValorPago2025: numberValue(body.iptuValorPago2025 ?? existing.iptuValorPago2025),
		iptuValorPago2026: numberValue(body.iptuValorPago2026 ?? existing.iptuValorPago2026),
		origemPlanilha: text(body.origemPlanilha ?? existing.origemPlanilha),
		cep: text(body.cep ?? existing.cep),
		estado: text(body.estado ?? existing.estado),
		cidade: text(body.cidade ?? existing.cidade),
		bairro: text(body.bairro ?? existing.bairro),
		rua: text(body.rua ?? existing.rua),
		numero: text(body.numero ?? existing.numero),
		endereco:
			text(body.endereco ?? existing.endereco) ||
			composeEndereco(body, existing),
		mapsUrl: text(body.mapsUrl ?? existing.mapsUrl),
		streetViewUrl: text(body.streetViewUrl ?? existing.streetViewUrl),
		estacionamento,
		temEstacionamento: estacionamento,
		vagas: estacionamento
			? Math.max(Math.trunc(Number(body.vagas ?? existing.vagas ?? 0)), 0)
			: 0,
		placas: estacionamento
			? Array.isArray(body.placas)
				? body.placas.map(text).filter(Boolean)
				: text(body.placas ?? existing.placas)
						.split(/[,;\n]/)
						.map(text)
						.filter(Boolean)
			: [],
		metrosQuadrados: numberValue(
			body.metrosQuadrados ?? body.m2 ?? existing.metrosQuadrados,
		),
		seguroTipo: text(body.seguroTipo ?? body.seguro ?? existing.seguroTipo),
		seguroValorMensal: numberValue(
			body.seguroValorMensal ?? existing.seguroValorMensal,
		),
		seguroVencimento: dateText(
			body.seguroVencimento ?? existing.seguroVencimento,
		),
		linkApolice: text(body.linkApolice ?? existing.linkApolice),
		vigilanciaContratoLink: text(
			body.vigilanciaContratoLink ?? existing.vigilanciaContratoLink,
		),
		vigilanciaValorMensal: numberValue(
			body.vigilanciaValorMensal ?? existing.vigilanciaValorMensal,
		),
		limpezaContrato: text(body.limpezaContrato ?? existing.limpezaContrato),
		limpezaValorMedio: numberValue(
			body.limpezaValorMedio ?? existing.limpezaValorMedio,
		),
		ppciLink: text(body.ppciLink ?? existing.ppciLink),
		ppciVencimento: dateText(body.ppciVencimento ?? existing.ppciVencimento),
		avcbLink: text(body.avcbLink ?? existing.avcbLink),
		avcbVencimento: dateText(body.avcbVencimento ?? existing.avcbVencimento),
		linkContratoOriginal: text(
			body.linkContratoOriginal ?? existing.linkContratoOriginal,
		),
		observacao: text(body.observacao ?? existing.observacao),
		updatedAt: nowIso(),
		updatedBy: user?.uid || user?.email || null,
		updatedByName: userName(user),
		createdAt: existing.createdAt || nowIso(),
		createdBy: existing.createdBy || user?.uid || user?.email || null,
		createdByName: existing.createdByName || userName(user),
	};
}

async function getImovelOrThrow(id) {
	const documentId = normalizeId(id);
	const imovel = await imoveisRepository.getImovel(documentId);
	if (!imovel) {
		const error = new Error("Imovel nao encontrado.");
		error.statusCode = 404;
		throw error;
	}
	return imovel;
}

async function getContratoOrThrow(imovelId, contratoId) {
	const documentId = normalizeId(contratoId);
	const contrato = await imoveisRepository.getContrato(documentId);
	if (!contrato || contrato.imovelId !== normalizeId(imovelId)) {
		const error = new Error("Contrato nao encontrado.");
		error.statusCode = 404;
		throw error;
	}
	return contrato;
}

async function getImoveisConfig() {
	const row = await imoveisRepository.getConfig().catch(() => null);
	return {
		...DEFAULT_CONFIG,
		...(row || {}),
	};
}

async function saveImoveisConfig(data = {}, user = {}) {
	const current = await getImoveisConfig();
	const normalizeList = (value, fallback) => {
		const source = Array.isArray(value) ? value : fallback;
		return [...new Set(source.map(text).filter(Boolean))];
	};
	const next = {
		...current,
		empresas: normalizeList(data.empresas, current.empresas),
		classificacoes: normalizeList(data.classificacoes, current.classificacoes),
		diretorias: normalizeList(data.diretorias, current.diretorias),
		imoveisRootFolderId: Object.hasOwn(data, "imoveisRootFolderId")
			? normalizeDriveFolderId(data.imoveisRootFolderId)
			: normalizeDriveFolderId(current.imoveisRootFolderId),
		updatedAt: nowIso(),
		updatedByName: userName(user),
	};
	await imoveisRepository.saveConfig(next);
	return next;
}

async function ensureImovelFolder(imovel) {
	const config = await getImoveisConfig();
	const parentFolderId = normalizeDriveFolderId(config.imoveisRootFolderId);
	const root = await drive.createFolder("imoveis", parentFolderId || null);
	const folder = await drive.createFolder(
		imovel.seniorId || imovel.id,
		root.id,
	);
	const next = {
		...imovel,
		driveRootFolderId: root.id,
		driveFolderId: folder.id,
		driveFolderName: folder.name,
		updatedAt: nowIso(),
	};
	await imoveisRepository.saveImovel(next);
	return { root, folder, imovel: next };
}

async function uploadImovelAttachment({
	imovel,
	file,
	collectionPath,
	metadata = {},
}) {
	if (!file) {
		const error = new Error("Arquivo obrigatorio.");
		error.statusCode = 400;
		throw error;
	}
	const { folder } = await ensureImovelFolder(imovel);
	const uploaded = await drive.uploadFile({
		file,
		folderId: folder.id,
		name: text(metadata.nome) || file.originalname,
	});
	const documentId = `${imovel.id}_${uploaded.id}`;
	const data = {
		imovelId: imovel.id,
		categoria: text(metadata.categoria),
		tipo: text(metadata.tipo) || "drive",
		nome: uploaded.name || file.originalname,
		driveFileId: uploaded.id,
		driveFolderId: folder.id,
		mimeType: uploaded.mimeType || file.mimetype,
		tamanho: Number(uploaded.size || file.size || 0),
		observacao: text(metadata.observacao),
		data: dateText(metadata.data) || nowIso().slice(0, 10),
		createdAt: nowIso(),
		createdByName: userName(metadata.user),
	};
	if (collectionPath === COLLECTIONS.contratos) {
		return imoveisRepository.upsertContrato(imovel.id, { id: documentId, ...data });
	}
	return imoveisRepository.addAnexo(imovel.id, { id: documentId, ...data });
}

async function deleteDriveFileIfExists(fileId) {
	if (!fileId) return;
	await drive.deleteFile(fileId).catch((error) => {
		if (error?.code !== 404 && error?.status !== 404) throw error;
	});
}

async function deleteImovelCascade(id) {
	const imovel = await getImovelOrThrow(id);
	const relatedLoaders = [
		{ list: imoveisRepository.listContratos, remove: imoveisRepository.removeContrato },
		{ list: imoveisRepository.listReajustes, remove: imoveisRepository.removeReajuste },
		{ list: imoveisRepository.listIptu, remove: imoveisRepository.removeIptu },
		{ list: imoveisRepository.listAlugueis, remove: imoveisRepository.removeAluguel },
		{ list: imoveisRepository.listAnexos, remove: imoveisRepository.removeAnexo },
		{ list: imoveisRepository.listAditivos, remove: imoveisRepository.removeAditivo },
	];
	let deletedRelated = 0;
	for (const relatedLoader of relatedLoaders) {
		const related = await relatedLoader.list(imovel.id);
		for (const item of related) {
			await deleteDriveFileIfExists(item.driveFileId);
			await relatedLoader.remove(item.id);
			deletedRelated += 1;
		}
	}
	await deleteDriveFileIfExists(imovel.driveFolderId);
	await imoveisRepository.deleteImovel(imovel.id);
	return { id: imovel.id, deletedRelated };
}

function createPeriodFilter(query = {}) {
	const mes = text(query.mes);
	const ano = text(query.ano);
	return (item = {}, dateKeys = ["data", "vencimento", "createdAt"]) => {
		const source = dateKeys.map((key) => item[key]).find(Boolean);
		if (!source) return !mes && !ano;
		const date = new Date(source);
		if (Number.isNaN(date.getTime())) return !mes && !ano;
		if (ano && String(date.getFullYear()) !== String(ano)) return false;
		if (
			mes &&
			String(date.getMonth() + 1).padStart(2, "0") !==
				String(mes).padStart(2, "0")
		)
			return false;
		return true;
	};
}

function isDateWithinDays(value, days = 30) {
	if (!value) return false;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const limit = new Date(today);
	limit.setDate(limit.getDate() + days);
	return date >= today && date <= limit;
}

function buildMonthlyDueDate(day, baseDate = new Date()) {
	const date = new Date(
		baseDate.getFullYear(),
		baseDate.getMonth(),
		Math.min(Math.max(Number(day || 1), 1), 28),
	);
	return date.toISOString().slice(0, 10);
}

function buildReports({ imoveis, iptus, alugueis, reajustes, query }) {
	const inPeriod = createPeriodFilter(query);
	const periodIptus = iptus.filter((item) =>
		inPeriod(item, ["vencimento", "dataPagamento", "createdAt"]),
	);
	const periodAlugueis = alugueis.filter((item) =>
		inPeriod(item, ["vencimento", "dataPagamento", "createdAt"]),
	);
	const imoveisAlugadosAtivos = imoveis.filter(
		(item) => item.ativo !== false && item.tipoContrato === "alugado",
	);
	const gastosIptu = periodIptus.reduce(
		(sum, item) => sum + numberValue(item.valor),
		0,
	);
	const gastosAluguel = periodAlugueis.length
		? periodAlugueis.reduce((sum, item) => sum + numberValue(item.valor), 0)
		: imoveisAlugadosAtivos.reduce(
				(sum, item) => sum + numberValue(item.valorAluguel),
				0,
			);
	const contratosProximos = imoveis.filter(
		(item) => item.ativo !== false && isDateWithinDays(item.contratoFim, 60),
	);
	const contratosFinalizados = imoveis.filter(
		(item) =>
			inPeriod({ data: item.contratoFim }, ["data"]) || item.ativo === false,
	);
	const iptuProximo = iptus.filter(
		(item) => !item.pago && isDateWithinDays(item.vencimento, 30),
	);
	const aluguelProximo = imoveis
		.filter((item) => item.ativo !== false && item.tipoContrato === "alugado")
		.map((item) => ({
			...item,
			vencimentoAluguel: buildMonthlyDueDate(item.vencimentoAluguelDia),
		}))
		.filter((item) => isDateWithinDays(item.vencimentoAluguel, 30));

	return {
		resumo: {
			totalImoveis: imoveis.length,
			ativos: imoveis.filter((item) => item.ativo !== false).length,
			alugados: imoveis.filter((item) => item.tipoContrato === "alugado")
				.length,
			proprios: imoveis.filter((item) => item.tipoContrato !== "alugado")
				.length,
			gastosIptu,
			gastosAluguel,
		},
		gastosIptu: periodIptus,
		gastosAluguel: periodAlugueis,
		contratosProximos,
		contratosFinalizados,
		iptuProximo,
		aluguelProximo,
		reajustes: reajustes.filter((item) =>
			inPeriod(item, ["data", "createdAt"]),
		),
	};
}

function createImoveisRouter({
	requireAuthenticated,
	requireCsrfToken,
	requireRoles,
}) {
	const router = express.Router();
	router.use(requireAuthenticated);
	router.use(requireRoles(ADMINISTRATIVO_ROLES));

	router.get("/config", async (_req, res, next) => {
		try {
			res.json({ config: await getImoveisConfig() });
		} catch (error) {
			next(error);
		}
	});

	router.get("/storage/contracts/status", async (_req, res, next) => {
		try {
			res.json({ storage: await getLocalContractsStorageStatus() });
		} catch (error) {
			next(error);
		}
	});

	router.get("/storage/contracts/download", async (_req, res, next) => {
		try {
			await streamLocalContractsZip(res);
		} catch (error) {
			next(error);
		}
	});

	router.delete("/storage/contracts", requireCsrfToken, async (_req, res, next) => {
		try {
			res.json({ ok: true, storage: await clearLocalContractsFolder() });
		} catch (error) {
			next(error);
		}
	});

	router.put("/config", requireCsrfToken, async (req, res, next) => {
		try {
			res.json({
				ok: true,
				config: await saveImoveisConfig(req.body || {}, req.user),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/importar", requireCsrfToken, async (req, res, next) => {
		try {
			const items = Array.isArray(req.body?.items) ? req.body.items : [];
			const limparAntes = Boolean(req.body?.limparAntes);
			if (!items.length) {
				const error = new Error("Nenhum imovel informado para importacao.");
				error.statusCode = 400;
				throw error;
			}
			let apagados = 0;
			if (limparAntes) {
				const atuais = await imoveisRepository.listImoveis();
				for (const imovel of atuais) {
					await deleteImovelCascade(imovel.id);
					apagados += 1;
				}
			}
			let criados = 0;
			let atualizados = 0;
			const erros = [];
			for (const [index, item] of items.entries()) {
				try {
					const id = normalizeId(
						item.seniorId ||
							item.idSenior ||
							item.id ||
							item.endereco ||
							`${Date.now()}_${index}`,
					);
					const existing = (await imoveisRepository.getImovel(id).catch(() => null)) || {};
					const payload = buildImovelPayload(
						{ ...item, seniorId: id },
						req.user,
						existing,
					);
					await imoveisRepository.saveImovel(payload);
					if (existing.id) atualizados += 1;
					else criados += 1;
				} catch (error) {
					erros.push({ linha: index + 2, erro: error.message });
				}
			}
			res.json({ ok: true, total: items.length, apagados, criados, atualizados, erros });
		} catch (error) {
			next(error);
		}
	});

	router.post("/excluir-massa", requireCsrfToken, async (req, res, next) => {
		try {
			const ids = Array.isArray(req.body?.ids)
				? [...new Set(req.body.ids.map(normalizeId).filter(Boolean))]
				: [];
			if (!ids.length) {
				const error = new Error("Selecione ao menos um imovel para excluir.");
				error.statusCode = 400;
				throw error;
			}
			const deleted = [];
			const errors = [];
			for (const id of ids) {
				try {
					deleted.push(await deleteImovelCascade(id));
				} catch (error) {
					errors.push({ id, error: error.message });
				}
			}
			res.json({ ok: true, deleted, errors });
		} catch (error) {
			next(error);
		}
	});

	router.get("/", async (req, res, next) => {
		try {
			res.json({
				items: await imoveisRepository.listImoveis({
					status: text(req.query.status),
				}),
			});
		} catch (error) {
			next(error);
		}
	});

	router.get("/dashboard", async (_req, res, next) => {
		try {
			res.json(await imoveisRepository.getDashboardImoveis());
		} catch (error) {
			next(error);
		}
	});

	router.post("/", requireCsrfToken, async (req, res, next) => {
		try {
			const payload = buildImovelPayload(req.body || {}, req.user);
			const imovel = await imoveisRepository.saveImovel(payload);
			const folder = await ensureImovelFolder(imovel).catch(() => null);
			res.json({
				ok: true,
				imovel: folder?.imovel || imovel,
				folder: folder?.folder || null,
			});
		} catch (error) {
			next(error);
		}
	});

	router.put("/:id", requireCsrfToken, async (req, res, next) => {
		try {
			const current = await getImovelOrThrow(req.params.id);
			const payload = buildImovelPayload(req.body || {}, req.user, current);
			const imovel = await imoveisRepository.saveImovel({
				...payload,
				id: current.id,
			});
			res.json({ ok: true, imovel });
		} catch (error) {
			next(error);
		}
	});

	router.delete("/:id", requireCsrfToken, async (req, res, next) => {
		try {
			res.json({ ok: true, deleted: await deleteImovelCascade(req.params.id) });
		} catch (error) {
			next(error);
		}
	});

	router.post("/:id/pasta", requireCsrfToken, async (req, res, next) => {
		try {
			const imovel = await getImovelOrThrow(req.params.id);
			const folder = await ensureImovelFolder(imovel);
			res.json({ ok: true, folder: folder.folder, imovel: folder.imovel });
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/:id/reajustes",
		requireCsrfToken,
		upload.single("file"),
		rejectInvalidImovelFile,
		async (req, res, next) => {
			try {
				const imovel = await getImovelOrThrow(req.params.id);
				const documentId = `${imovel.id}_${Date.now()}`;
				const anexo = req.file
					? await uploadImovelAttachment({
							imovel,
							file: req.file,
							collectionPath: COLLECTIONS.anexos,
							metadata: {
								...req.body,
								categoria: "reajuste",
								tipo: "planilha_reajuste",
								user: req.user,
							},
						})
					: null;
				const data = {
					imovelId: imovel.id,
					valorAnterior: numberValue(
						req.body?.valorAnterior ?? imovel.valorAluguel,
					),
					valorNovo: numberValue(req.body?.valorNovo),
					data: text(req.body?.data) || nowIso().slice(0, 10),
					observacao: text(req.body?.observacao),
					anexoId: anexo?.id || null,
					driveFileId: anexo?.driveFileId || null,
					createdAt: nowIso(),
					createdByName: userName(req.user),
				};
				await imoveisRepository.addReajuste(imovel.id, {
					id: documentId,
					...data,
				});
				const updated = {
					...imovel,
					valorAluguel: data.valorNovo,
					dataUltimoReajuste: data.data,
					updatedAt: nowIso(),
					updatedByName: userName(req.user),
				};
				await imoveisRepository.saveImovel(updated);
				res.json({
					ok: true,
					item: { id: documentId, ...data },
					imovel: updated,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/iptu",
		requireCsrfToken,
		upload.single("file"),
		rejectInvalidImovelFile,
		async (req, res, next) => {
			try {
				const imovel = await getImovelOrThrow(req.params.id);
				const documentId = `${imovel.id}_${Date.now()}`;
				const anexo = req.file
					? await uploadImovelAttachment({
							imovel,
							file: req.file,
							collectionPath: COLLECTIONS.anexos,
							metadata: {
								...req.body,
								categoria: "iptu",
								tipo: "guia_iptu",
								user: req.user,
							},
						})
					: null;
				const data = {
					imovelId: imovel.id,
					ano: text(req.body?.ano) || String(new Date().getFullYear()),
					mes: text(req.body?.mes),
					valor: numberValue(req.body?.valor),
					vencimento: text(req.body?.vencimento),
					pago: boolValue(req.body?.pago),
					observacao: text(req.body?.observacao),
					anexoId: anexo?.id || null,
					driveFileId: anexo?.driveFileId || null,
					createdAt: nowIso(),
					createdByName: userName(req.user),
				};
				res.json({
					ok: true,
					item: await imoveisRepository.upsertIptu(imovel.id, {
						id: documentId,
						...data,
					}),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.post("/:id/alugueis", requireCsrfToken, async (req, res, next) => {
		try {
			const imovel = await getImovelOrThrow(req.params.id);
			const documentId = `${imovel.id}_${Date.now()}`;
			const data = {
				imovelId: imovel.id,
				mes: text(req.body?.mes),
				ano: text(req.body?.ano) || String(new Date().getFullYear()),
				valor: numberValue(req.body?.valor ?? imovel.valorAluguel),
				vencimento: text(req.body?.vencimento),
				pago: boolValue(req.body?.pago),
				observacao: text(req.body?.observacao),
				createdAt: nowIso(),
				createdByName: userName(req.user),
			};
			res.json({
				ok: true,
				item: await imoveisRepository.registerAluguel(imovel.id, {
					id: documentId,
					...data,
				}),
			});
		} catch (error) {
			next(error);
		}
	});

	router.get("/:id/registros", async (req, res, next) => {
		try {
			const historico = await imoveisRepository.getImovelHistorico(req.params.id);
			if (!historico) {
				const error = new Error("Imovel nao encontrado.");
				error.statusCode = 404;
				throw error;
			}
			res.json(historico);
		} catch (error) {
			next(error);
		}
	});

	router.post(
		"/:id/anexos/upload",
		requireCsrfToken,
		upload.single("file"),
		rejectInvalidImovelFile,
		async (req, res, next) => {
			try {
				const imovel = await getImovelOrThrow(req.params.id);
				const item = await uploadImovelAttachment({
					imovel,
					file: req.file,
					collectionPath: COLLECTIONS.anexos,
					metadata: { ...req.body, user: req.user },
				});
				res.json({ ok: true, item });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/aditivos",
		requireCsrfToken,
		upload.single("file"),
		rejectInvalidImovelFile,
		async (req, res, next) => {
			try {
				const imovel = await getImovelOrThrow(req.params.id);
				const anexo = req.file
					? await uploadImovelAttachment({
							imovel,
							file: req.file,
							collectionPath: COLLECTIONS.anexos,
							metadata: {
								...req.body,
								categoria: "aditivo",
								tipo: "aditivo",
								user: req.user,
							},
						})
					: null;
				const documentId = `${imovel.id}_${Date.now()}`;
				const data = {
					imovelId: imovel.id,
					data: dateText(req.body?.data) || nowIso().slice(0, 10),
					observacao: text(req.body?.observacao),
					anexoId: anexo?.id || null,
					driveFileId: anexo?.driveFileId || null,
					nome: text(req.body?.nome) || anexo?.nome || "Aditivo",
					createdAt: nowIso(),
					createdByName: userName(req.user),
				};
				res.json({
					ok: true,
					item: await imoveisRepository.addAditivo(imovel.id, {
						id: documentId,
						...data,
					}),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/contratos/link",
		requireCsrfToken,
		async (req, res, next) => {
			try {
				const imovel = await getImovelOrThrow(req.params.id);
				const documentId = `${imovel.id}_${crypto.randomUUID()}`;
				const data = {
					imovelId: imovel.id,
					tipo: "link",
					nome: text(req.body?.nome) || "Contrato",
					url: text(req.body?.url),
					observacao: text(req.body?.observacao),
					createdAt: nowIso(),
					createdByName: userName(req.user),
				};
				if (!data.url) {
					const error = new Error("Informe o link do contrato.");
					error.statusCode = 400;
					throw error;
				}
				res.json({
					ok: true,
					item: await imoveisRepository.upsertContrato(imovel.id, {
						id: documentId,
						...data,
					}),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/contratos/upload",
		requireCsrfToken,
		upload.single("file"),
		async (req, res, next) => {
			try {
				const imovel = await getImovelOrThrow(req.params.id);
				const item = await saveLocalContractPdf({
					imovel,
					file: req.file,
					metadata: req.body || {},
					user: req.user,
				});
				res.json({ ok: true, item });
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/:id/contratos/:contratoId",
		requireCsrfToken,
		async (req, res, next) => {
			try {
				await getImovelOrThrow(req.params.id);
				const contrato = await getContratoOrThrow(
					req.params.id,
					req.params.contratoId,
				);
				const nome = text(req.body?.nome);
				if (!nome) {
					const error = new Error("Informe o nome do contrato.");
					error.statusCode = 400;
					throw error;
				}
				let driveFile = null;
				if (contrato.driveFileId) {
					driveFile = await drive.renameFile(contrato.driveFileId, nome);
				}
				const updated = {
					...contrato,
					nome: driveFile?.name || nome,
					observacao: text(req.body?.observacao ?? contrato.observacao),
					updatedAt: nowIso(),
					updatedByName: userName(req.user),
				};
				res.json({
					ok: true,
					item: await imoveisRepository.upsertContrato(req.params.id, updated),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/:id/contratos/:contratoId",
		requireCsrfToken,
		async (req, res, next) => {
			try {
				await getImovelOrThrow(req.params.id);
				const contrato = await getContratoOrThrow(
					req.params.id,
					req.params.contratoId,
				);
				if (contrato.driveFileId) {
					await drive.deleteFile(contrato.driveFileId).catch((error) => {
						if (error?.code !== 404 && error?.status !== 404) throw error;
					});
				}
				await imoveisRepository.removeContrato(contrato.id);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get("/relatorios/dados", async (req, res, next) => {
		try {
			res.json(await imoveisRepository.getRelatorioFinanceiroImoveis(req.query || {}));
		} catch (error) {
			next(error);
		}
	});

	return router;
}

module.exports = {
	ADMINISTRATIVO_ROLES,
	COLLECTIONS,
	buildImovelNome,
	buildReports,
	createImoveisRouter,
	isAllowedImovelFileBuffer,
	resolveUtilityAccountFields,
};

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const { lookupCep } = require("./cep");
const { requireMercadoAuth } = require("./auth");

const MAX_BYTES = Number(process.env.MERCADO_DOCUMENT_UPLOAD_LIMIT_BYTES || 10 * 1024 * 1024);
const DOC_TYPES = new Set(["DOCUMENTO_FRENTE", "DOCUMENTO_VERSO", "COMPROVANTE_CNPJ", "CONTRATO_SOCIAL", "CCMEI", "PROCURACAO"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 }, fileFilter: (_req, file, callback) => callback(null, ["application/pdf", "image/jpeg", "image/png"].includes(String(file.mimetype).toLowerCase())) });

function apiError(message, statusCode) { const error = new Error(message); error.statusCode = statusCode; return error; }
function assertMagic(file) {
	if (!file?.buffer?.length) throw apiError("Envie um arquivo PDF, PNG ou JPEG válido.", 400);
	const buffer = file.buffer;
	const pdf = buffer.subarray(0, 5).toString("utf8") === "%PDF-";
	const png = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const jpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
	if (!pdf && !png && !jpeg) throw apiError("O conteúdo do arquivo não corresponde a PDF, PNG ou JPEG.", 400);
	return pdf ? "application/pdf" : png ? "image/png" : "image/jpeg";
}
function documentRoot() { return path.resolve(process.env.MERCADO_DOCUMENTS_DIR || path.join(process.cwd(), "private", "mercado-documentos")); }
function encryptionKey() {
	const raw = String(process.env.MERCADO_DOCUMENTS_ENCRYPTION_KEY || "");
	if (!raw) throw apiError("Armazenamento documental ainda não está configurado.", 503);
	return crypto.createHash("sha256").update(raw).digest();
}
async function writeEncrypted(key, input) {
	const fileKey = crypto.randomBytes(32); const iv = crypto.randomBytes(12);
	const wrapper = crypto.createCipheriv("aes-256-gcm", key, iv); const wrappedKey = Buffer.concat([wrapper.update(fileKey), wrapper.final()]); const wrapTag = wrapper.getAuthTag();
	const cipher = crypto.createCipheriv("aes-256-gcm", fileKey, iv); const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]); const tag = cipher.getAuthTag();
	const payload = Buffer.concat([Buffer.from("MKT1"), iv, tag, wrappedKey, wrapTag, ciphertext]);
	const storageKey = crypto.randomUUID(); await fs.mkdir(documentRoot(), { recursive: true, mode: 0o700 }); await fs.writeFile(path.join(documentRoot(), storageKey), payload, { mode: 0o600 }); return storageKey;
}
async function readEncrypted(storageKey) {
	const payload = await fs.readFile(path.join(documentRoot(), storageKey));
	if (payload.subarray(0, 4).toString("utf8") !== "MKT1") throw apiError("Documento privado inválido.", 500);
	const iv = payload.subarray(4, 16), tag = payload.subarray(16, 32), wrappedKey = payload.subarray(32, 64), wrapTag = payload.subarray(64, 80), ciphertext = payload.subarray(80);
	const wrapper = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv); wrapper.setAuthTag(wrapTag); const fileKey = Buffer.concat([wrapper.update(wrappedKey), wrapper.final()]);
	const decipher = crypto.createDecipheriv("aes-256-gcm", fileKey, iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function safeDocument(row) { return { id: row.id, tipo: row.tipo, nomeOriginal: row.nome_original, mimeType: row.mime_type, tamanhoBytes: row.tamanho_bytes, status: row.status, enviadoEm: row.enviado_em, observacaoAnalise: row.observacao_analise || null }; }
function uploadOne(req, res, next) { upload.single("file")(req, res, (error) => { if (!error) return next(); if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Arquivo acima do limite permitido." : "Falha no envio do arquivo." }); return res.status(400).json({ error: "Apenas PDF, PNG e JPEG são aceitos." }); }); }

function createMercadoOnboardingRouter({ requireInternalAdmin } = {}) {
	const router = express.Router();
	router.get("/cep/:cep", async (req, res, next) => { try { res.json(await lookupCep(req.params.cep)); } catch (error) { next(error); } });
	router.get("/profile", requireMercadoAuth, async (req, res, next) => { try {
		const result = await db.query(`select p.id,p.tipo_pessoa,p.nome_exibicao,p.razao_social,p.nome_fantasia,p.responsavel_nome,p.email,p.telefone,p.status_cadastro,p.status_documental,p.status_habilitacao,p.email_verified_at,e.cep,e.logradouro,e.numero,e.complemento,e.bairro,e.cidade,e.uf,e.codigo_ibge,e.origem_consulta from mercado_prestadores p left join mercado_enderecos e on e.prestador_id=p.id and e.tipo_endereco='CADASTRAL' where p.id=$1`, [req.mercadoUser.prestadorId]);
		const documents = await db.query("select * from mercado_documentos where prestador_id=$1 and removido_em is null order by enviado_em desc", [req.mercadoUser.prestadorId]);
		res.json({ profile: result.rows[0] || null, documents: documents.rows.map(safeDocument) });
	} catch (error) { next(error); } });
	router.post("/documents", requireMercadoAuth, uploadOne, async (req, res, next) => { try {
		const type = String(req.body?.tipo || ""); if (!DOC_TYPES.has(type)) throw apiError("Tipo de documento inválido.", 400); const mimeType = assertMagic(req.file); const storageKey = await writeEncrypted(encryptionKey(), req.file.buffer); const digest = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
		const inserted = await db.query("insert into mercado_documentos(prestador_id,tipo,armazenamento_chave,nome_original,mime_type,tamanho_bytes,sha256) values($1,$2,$3,$4,$5,$6,$7) returning *", [req.mercadoUser.prestadorId, type, storageKey, path.basename(String(req.file.originalname || "documento")), mimeType, req.file.size, digest]);
		await db.query("update mercado_prestadores set status_documental='PENDENTE_ANALISE', status_cadastro='EM_ANALISE', updated_at=now() where id=$1", [req.mercadoUser.prestadorId]); res.status(201).json({ document: safeDocument(inserted.rows[0]) });
	} catch (error) { next(error); } });
	router.get("/documents/:id/content", requireMercadoAuth, async (req, res, next) => { try { const found = await db.query("select * from mercado_documentos where id=$1 and prestador_id=$2 and removido_em is null", [req.params.id, req.mercadoUser.prestadorId]); if (!found.rows[0]) throw apiError("Documento não encontrado.", 404); const content = await readEncrypted(found.rows[0].armazenamento_chave); res.setHeader("Content-Type", found.rows[0].mime_type); res.setHeader("Content-Disposition", "inline; filename=verificacao-documento"); res.setHeader("Cache-Control", "no-store"); res.send(content); } catch (error) { next(error); } });
	if (requireInternalAdmin) {
		router.get("/admin/prestadores", requireInternalAdmin, async (req, res, next) => { try { const result = await db.query(`select p.id,p.tipo_pessoa,p.nome_exibicao,p.cpf_cnpj,p.email,p.status_documental,p.status_habilitacao,p.email_verified_at,p.created_at,e.cidade,e.uf from mercado_prestadores p left join mercado_enderecos e on e.prestador_id=p.id and e.tipo_endereco='CADASTRAL' order by p.created_at desc limit 500`); res.json({ items: result.rows.map((row) => ({ ...row, cpfCnpjMascarado: row.cpf_cnpj.replace(/.(?=.{4})/g, "*") })) }); } catch (error) { next(error); } });
		router.post("/admin/prestadores/:id/decision", requireInternalAdmin, async (req, res, next) => { try { const action = String(req.body?.action || ""); const justification = String(req.body?.justificativa || "").trim(); if (!["APROVADO", "REPROVADO", "CORRECAO_SOLICITADA", "HABILITADO", "SUSPENSO"].includes(action)) throw apiError("Ação inválida.", 400); if (["REPROVADO", "CORRECAO_SOLICITADA"].includes(action) && !justification) throw apiError("Informe a justificativa.", 400); const documental = action === "APROVADO" ? "APROVADO" : action === "REPROVADO" ? "REPROVADO" : action === "CORRECAO_SOLICITADA" ? "CORRECAO_SOLICITADA" : null; const habilitacao = action === "HABILITADO" ? "HABILITADO" : action === "SUSPENSO" ? "SUSPENSO" : null; await db.query("update mercado_prestadores set status_documental=coalesce($2,status_documental),status_habilitacao=coalesce($3,status_habilitacao),updated_at=now() where id=$1", [req.params.id, documental, habilitacao]); await db.query("insert into mercado_prestador_analises(prestador_id,acao,justificativa,criado_por) values($1,$2,$3,$4)", [req.params.id, action, justification || null, req.user?.email || req.user?.uid || "administrador"]); res.json({ ok: true }); } catch (error) { next(error); } });
	}
	return router;
}
module.exports = createMercadoOnboardingRouter;

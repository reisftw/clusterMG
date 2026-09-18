// Roteiro Finan #30 (Fase 4A — Sistema de anexos centralizado): biblioteca
// de documentos com hash (deteccao de duplicado), versionamento simples e
// vinculo opcional com fornecedor/contrato/nota fiscal. Mesmo padrao de
// armazenamento ja usado em documentos/routes.js (base64 direto na linha,
// sem storage externo) — ver 028_finan_anexos.sql pro desenho da tabela.
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { id, enumField, object, string } = require("../dtos/schema");

const router = express.Router();
const MAX_BYTES = 15 * 1024 * 1024;
const CATEGORIAS = ["contrato", "nota_fiscal", "comprovante", "outro"];
const VINCULO_TIPOS = ["fornecedor", "contrato", "nota_fiscal"];

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_BYTES },
});

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });
const ListQueryDTO = object(
	{
		categoria: enumField(CATEGORIAS, { required: false }),
		vinculoTipo: enumField(VINCULO_TIPOS, { required: false }),
		vinculoId: string({ required: false, maxLength: 120 }),
		todasVersoes: string({ required: false, maxLength: 10 }),
	},
	{ unknownKeys: "strip" },
);

function publicAnexo(row, { comConteudo = false } = {}) {
	const base = {
		id: row.id,
		grupoId: row.grupo_id,
		versao: row.versao,
		nomeArquivo: row.nome_arquivo,
		tipoMime: row.tipo_mime,
		tamanhoBytes: row.tamanho_bytes,
		hashSha256: row.hash_sha256,
		categoria: row.categoria,
		descricao: row.descricao || "",
		vinculoTipo: row.vinculo_tipo,
		vinculoId: row.vinculo_id,
		uploadedByNome: row.uploaded_by_nome,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
	if (comConteudo) base.conteudoBase64 = row.conteudo_base64;
	return base;
}

router.use(requireFinanPermission("finan.anexos.view"));
router.use(noStore);

router.get("/", validate({ query: ListQueryDTO }), async (req, res, next) => {
	try {
		const { categoria, vinculoTipo, vinculoId, todasVersoes } = req.validated.query;
		const conditions = [];
		const params = [];
		if (categoria) {
			params.push(categoria);
			conditions.push(`categoria = $${params.length}`);
		}
		if (vinculoTipo) {
			params.push(vinculoTipo);
			conditions.push(`vinculo_tipo = $${params.length}`);
		}
		if (vinculoId) {
			params.push(vinculoId);
			conditions.push(`vinculo_id = $${params.length}`);
		}
		// Por padrao so mostra a versao mais recente de cada grupo — quem
		// quer o historico completo pede explicitamente com
		// ?todasVersoes=true (ou usa GET /:id/versoes pra um documento so).
		const somenteUltimaVersao = String(todasVersoes || "").toLowerCase() !== "true";
		if (somenteUltimaVersao) {
			conditions.push(
				`versao = (select max(versao) from finan_anexos b where b.grupo_id = finan_anexos.grupo_id)`,
			);
		}
		const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
		const { rows } = await db.query(
			`select id, grupo_id, versao, nome_arquivo, tipo_mime, tamanho_bytes, hash_sha256, categoria, descricao, vinculo_tipo, vinculo_id, uploaded_by_nome, created_at, updated_at
			from finan_anexos
			${where}
			order by created_at desc
			limit 300`,
			params,
		);
		res.json({ ok: true, anexos: rows.map((row) => publicAnexo(row)) });
	} catch (error) {
		next(error);
	}
});

router.get("/:id/versoes", validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, grupo_id, versao, nome_arquivo, tipo_mime, tamanho_bytes, hash_sha256, categoria, descricao, vinculo_tipo, vinculo_id, uploaded_by_nome, created_at, updated_at
			from finan_anexos where grupo_id = (select grupo_id from finan_anexos where id = $1)
			order by versao desc`,
			[req.validated.params.id],
		);
		if (!rows.length) {
			res.status(404).json({ ok: false, error: "Anexo não encontrado." });
			return;
		}
		res.json({ ok: true, versoes: rows.map((row) => publicAnexo(row)) });
	} catch (error) {
		next(error);
	}
});

// JSON com base64 (nao bytes crus) de proposito — mesmo padrao ja usado em
// documentos/routes.js:/:id/conteudo. A rota exige Bearer token
// (requireFinanAuth), entao um <a href> direto pro endpoint nunca
// funcionaria (o navegador nao manda o header); o frontend busca aqui via
// requestFinanApi (autenticado) e abre como Blob — ver FinanNotasPage.jsx.
router.get("/:id/conteudo", validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select tipo_mime, conteudo_base64 from finan_anexos where id = $1`,
			[req.validated.params.id],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Anexo não encontrado." });
			return;
		}
		res.json({ ok: true, tipoMime: rows[0].tipo_mime, conteudoBase64: rows[0].conteudo_base64 });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireFinanPermission("finan.anexos.manage"), upload.single("arquivo"), async (req, res, next) => {
	try {
		if (!req.file) {
			res.status(400).json({ ok: false, error: "Envie um arquivo." });
			return;
		}
		const categoria = CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : "outro";
		const vinculoTipo = VINCULO_TIPOS.includes(req.body?.vinculoTipo) ? req.body.vinculoTipo : null;
		const vinculoId = vinculoTipo ? String(req.body?.vinculoId || "").trim() || null : null;
		const descricao = String(req.body?.descricao || "").trim().slice(0, 500) || null;
		const substituindoId = String(req.body?.substituindoId || "").trim() || null;

		const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
		const conteudo = req.file.buffer.toString("base64");

		// Nova versao de um anexo existente: herda grupo_id e incrementa a
		// versao. Sem substituindoId, e um documento novo (grupo_id = id
		// proprio, versao 1).
		let grupoId = null;
		let versao = 1;
		if (substituindoId) {
			const { rows: anteriorRows } = await db.query(
				`select grupo_id, (select max(versao) from finan_anexos b where b.grupo_id = a.grupo_id) as max_versao
				from finan_anexos a where a.id = $1`,
				[substituindoId],
			);
			if (!anteriorRows[0]) {
				res.status(404).json({ ok: false, error: "Anexo a substituir não encontrado." });
				return;
			}
			grupoId = anteriorRows[0].grupo_id;
			versao = Number(anteriorRows[0].max_versao || 0) + 1;
		}

		// Deteccao de duplicado (mesmo hash ja cadastrado) — so avisa, nunca
		// bloqueia o upload: o usuario decide se quer mesmo assim (pode ser
		// intencional, ex.: mesmo comprovante vinculado a duas notas).
		const { rows: duplicadoRows } = await db.query(
			`select id, nome_arquivo, created_at from finan_anexos where hash_sha256 = $1 order by created_at asc limit 1`,
			[hash],
		);

		const anexoId = randomId("anexo");
		if (!grupoId) grupoId = anexoId;

		const { rows } = await db.query(
			`insert into finan_anexos
				(id, grupo_id, versao, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, hash_sha256, categoria, descricao, vinculo_tipo, vinculo_id, uploaded_by_id, uploaded_by_nome)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
			returning id, grupo_id, versao, nome_arquivo, tipo_mime, tamanho_bytes, hash_sha256, categoria, descricao, vinculo_tipo, vinculo_id, uploaded_by_nome, created_at, updated_at`,
			[
				anexoId,
				grupoId,
				versao,
				req.file.originalname,
				req.file.mimetype,
				req.file.size,
				conteudo,
				hash,
				categoria,
				descricao,
				vinculoTipo,
				vinculoId,
				req.finanUser?.id || null,
				req.finanUser?.name || req.finanUser?.email || null,
			],
		);

		res.json({
			ok: true,
			anexo: publicAnexo(rows[0]),
			duplicadoDe: duplicadoRows[0]
				? { id: duplicadoRows[0].id, nomeArquivo: duplicadoRows[0].nome_arquivo, createdAt: duplicadoRows[0].created_at }
				: null,
		});
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireFinanPermission("finan.anexos.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const { rowCount } = await db.query(`delete from finan_anexos where id = $1`, [req.validated.params.id]);
		if (!rowCount) {
			res.status(404).json({ ok: false, error: "Anexo não encontrado." });
			return;
		}
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;

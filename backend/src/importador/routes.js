// Roteiro Finan #35 (Fase 4B — Importador universal com templates,
// estende #17): Central de Importações.
const express = require("express");
const multer = require("multer");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { id, enumField, jsonObject, object, string } = require("../dtos/schema");
const { getTargetFields, parseWorkbookBuffer, applyTemplateToRows, TARGET_FIELDS } = require("./service");

const router = express.Router();
const MAX_BYTES = 8_000_000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });
const ENTIDADES = Object.keys(TARGET_FIELDS);

const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });
const TemplateDTO = object(
	{
		nome: string({ required: true, minLength: 1, maxLength: 120 }),
		descricao: string({ required: false, maxLength: 500 }),
		entidadeAlvo: enumField(ENTIDADES, { required: true }),
		mapeamento: jsonObject({ required: true }),
	},
	{ unknownKeys: "strip" },
);

router.use(requireFinanPermission("finan.configuracoes.view"));
router.use(noStore);

function publicTemplate(row) {
	return {
		id: row.id,
		nome: row.nome,
		descricao: row.descricao || "",
		entidadeAlvo: row.entidade_alvo,
		mapeamento: row.mapeamento || {},
		createdByNome: row.created_by_nome,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

router.get("/campos-alvo", (_req, res) => {
	res.json({ ok: true, entidades: ENTIDADES.map((entidade) => ({ entidade, campos: getTargetFields(entidade) })) });
});

router.post(
	"/preview",
	requireFinanPermission("finan.configuracoes.manage"),
	upload.single("arquivo"),
	async (req, res, next) => {
		try {
			if (!req.file) {
				const error = new Error("Envie um arquivo XLSX ou CSV.");
				error.statusCode = 400;
				throw error;
			}
			const parsed = parseWorkbookBuffer(req.file.buffer, { sheetName: req.query?.aba });
			res.json({
				ok: true,
				sheetName: parsed.sheetName,
				sheetNames: parsed.sheetNames,
				columns: parsed.columns,
				totalRows: parsed.totalRows,
				sampleRows: parsed.sampleRows,
			});
		} catch (error) {
			next(error);
		}
	},
);

router.get("/templates", async (_req, res, next) => {
	try {
		const { rows } = await db.query(`select * from finan_import_templates order by nome`);
		res.json({ ok: true, templates: rows.map(publicTemplate) });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/templates",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ body: TemplateDTO }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const templateId = randomId("importtpl");
			const { rows } = await db.query(
				`insert into finan_import_templates (id, nome, descricao, entidade_alvo, mapeamento, created_by_id, created_by_nome)
				values ($1, $2, $3, $4, $5::jsonb, $6, $7)
				returning *`,
				[
					templateId,
					dto.nome,
					dto.descricao || "",
					dto.entidadeAlvo,
					JSON.stringify(dto.mapeamento || {}),
					req.finanUser?.uid || null,
					req.finanUser?.profile?.name || req.finanUser?.email || null,
				],
			);
			res.status(201).json({ ok: true, template: publicTemplate(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.put(
	"/templates/:id",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: IdParamDTO, body: { schema: TemplateDTO, partial: true } }),
	async (req, res, next) => {
		try {
			const dto = req.validated.body;
			const { rows } = await db.query(
				`update finan_import_templates set
					nome = coalesce($2, nome),
					descricao = coalesce($3, descricao),
					entidade_alvo = coalesce($4, entidade_alvo),
					mapeamento = coalesce($5::jsonb, mapeamento),
					updated_at = now()
				where id = $1
				returning *`,
				[
					req.validated.params.id,
					dto.nome ?? null,
					dto.descricao ?? null,
					dto.entidadeAlvo ?? null,
					dto.mapeamento ? JSON.stringify(dto.mapeamento) : null,
				],
			);
			if (!rows[0]) {
				const error = new Error("Template não encontrado.");
				error.statusCode = 404;
				throw error;
			}
			res.json({ ok: true, template: publicTemplate(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

router.delete(
	"/templates/:id",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			await db.query(`delete from finan_import_templates where id = $1`, [req.validated.params.id]);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

router.post(
	"/templates/:id/aplicar",
	requireFinanPermission("finan.configuracoes.manage"),
	validate({ params: IdParamDTO }),
	upload.single("arquivo"),
	async (req, res, next) => {
		try {
			if (!req.file) {
				const error = new Error("Envie o arquivo XLSX ou CSV pra aplicar o template.");
				error.statusCode = 400;
				throw error;
			}
			const { rows: templateRows } = await db.query(`select * from finan_import_templates where id = $1`, [
				req.validated.params.id,
			]);
			if (!templateRows[0]) {
				const error = new Error("Template não encontrado.");
				error.statusCode = 404;
				throw error;
			}
			const template = publicTemplate(templateRows[0]);
			const parsed = parseWorkbookBuffer(req.file.buffer, { sheetName: req.query?.aba });
			const result = await applyTemplateToRows(parsed.rows, template, {
				createdBy: { id: req.finanUser?.uid, name: req.finanUser?.profile?.name || req.finanUser?.email },
			});
			res.json({ ok: true, resultado: result });
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;

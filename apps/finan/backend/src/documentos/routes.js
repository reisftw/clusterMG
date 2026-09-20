// Roteiro Finan #16 (Caixa de Entrada financeira) + #15 (OCR
// inteligente): upload de PDF/imagem com pipeline recebido ->
// processando -> conferir -> importado. O OCR (Tesseract + Poppler,
// 100% nativo na VPS — ver ocrExtraction.js) roda na hora do upload e
// sugere CNPJ/valor/número/datas; o usuário sempre confere e confirma
// (ou corrige) antes de virar Nota Fiscal em /:id/gerar-nota — nunca
// grava nada sozinho.
const express = require("express");
const multer = require("multer");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { randomId } = require("../secureRandom");
const { id, enumField, object } = require("../dtos/schema");
const { extrairDadosDocumento } = require("./ocrExtraction");
const { findDuplicateNotas } = require("./duplicidadeService");
const { dispatchEvent } = require("../webhooks/dispatchService");

const router = express.Router();
const MAX_BYTES = 8_000_000;
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_BYTES },
	fileFilter: (_req, file, callback) => {
		if (/^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(file.mimetype || "")) {
			callback(null, true);
			return;
		}
		const error = new Error("Envie apenas PDF, PNG, JPEG ou WEBP.");
		error.statusCode = 400;
		callback(error);
	},
});

router.use(requireFinanPermission("finan.notas.view"));
router.use(noStore);

const STATUS_VALUES = ["recebido", "processando", "conferir", "importado"];
const IdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });
const StatusDTO = object({ status: enumField(STATUS_VALUES, { required: true }) }, { unknownKeys: "reject" });

function publicDocumento(row) {
	return {
		id: row.id,
		nomeArquivo: row.nome_arquivo,
		tipoMime: row.tipo_mime,
		tamanhoBytes: row.tamanho_bytes,
		status: row.status,
		notaId: row.nota_id,
		uploadedByNome: row.uploaded_by_nome,
		createdAt: row.created_at,
		ocrStatus: row.ocr_status,
		ocrErro: row.ocr_erro,
		camposExtraidos: row.campos_extraidos || {},
		// conteudo_base64/texto_extraido nunca vao na listagem — so no GET
		// de um item so, pra nao pesar a listagem inteira.
	};
}

router.get("/", async (_req, res, next) => {
	try {
		const { rows } = await db.query(
			`select id, nome_arquivo, tipo_mime, tamanho_bytes, status, nota_id, uploaded_by_nome, created_at,
				ocr_status, ocr_erro, campos_extraidos
			from finan_documentos_entrada order by created_at desc limit 200`,
		);
		res.json({ ok: true, documentos: rows.map(publicDocumento) });
	} catch (error) {
		next(error);
	}
});

router.get("/:id/extracao", validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`select ocr_status, ocr_erro, texto_extraido, campos_extraidos from finan_documentos_entrada where id = $1`,
			[req.validated.params.id],
		);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Documento não encontrado." });
			return;
		}
		res.json({
			ok: true,
			ocrStatus: rows[0].ocr_status,
			ocrErro: rows[0].ocr_erro,
			textoExtraido: rows[0].texto_extraido,
			camposExtraidos: rows[0].campos_extraidos || {},
		});
	} catch (error) {
		next(error);
	}
});

router.get("/:id/conteudo", validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		const { rows } = await db.query(`select tipo_mime, conteudo_base64 from finan_documentos_entrada where id = $1`, [req.validated.params.id]);
		if (!rows[0]) {
			res.status(404).json({ ok: false, error: "Documento não encontrado." });
			return;
		}
		res.json({ ok: true, tipoMime: rows[0].tipo_mime, conteudoBase64: rows[0].conteudo_base64 });
	} catch (error) {
		next(error);
	}
});

router.post("/", requireFinanPermission("finan.notas.manage"), upload.single("arquivo"), async (req, res, next) => {
	try {
		if (!req.file) {
			res.status(400).json({ ok: false, error: "Envie um arquivo." });
			return;
		}
		const docId = randomId("doc");
		const conteudo = req.file.buffer.toString("base64");
		await db.query(
			`insert into finan_documentos_entrada (id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, uploaded_by_id, uploaded_by_nome)
			values ($1, $2, $3, $4, $5, $6, $7)`,
			[docId, req.file.originalname, req.file.mimetype, req.file.size, conteudo, req.finanUser?.id || null, req.finanUser?.name || req.finanUser?.email || null],
		);

		// OCR roda na hora (Tesseract numa pagina costuma levar poucos
		// segundos) — best-effort, nunca falha o upload. Sucesso ja avanca
		// o documento pra "conferir" com os campos sugeridos; falha deixa
		// em "recebido" pro usuario mover manualmente / preencher na mao.
		const extracao = await extrairDadosDocumento(req.file.buffer, req.file.mimetype);
		const { rows } = await db.query(
			`update finan_documentos_entrada set
				status = $2,
				ocr_status = $3,
				ocr_erro = $4,
				texto_extraido = $5,
				campos_extraidos = $6::jsonb,
				updated_at = now()
			where id = $1
			returning id, nome_arquivo, tipo_mime, tamanho_bytes, status, nota_id, uploaded_by_nome, created_at, ocr_status, ocr_erro, campos_extraidos`,
			[
				docId,
				extracao.ok ? "conferir" : "recebido",
				extracao.ok ? "ok" : "erro",
				extracao.ok ? null : extracao.erro,
				extracao.ok ? extracao.textoBruto : null,
				JSON.stringify(extracao.ok ? extracao.campos : {}),
			],
		);
		res.json({ ok: true, documento: publicDocumento(rows[0]) });
	} catch (error) {
		next(error);
	}
});

router.patch(
	"/:id/status",
	requireFinanPermission("finan.notas.manage"),
	validate({ params: IdParamDTO, body: StatusDTO }),
	async (req, res, next) => {
		try {
			const { rows } = await db.query(
				`update finan_documentos_entrada set status = $2, updated_at = now() where id = $1
				returning id, nome_arquivo, tipo_mime, tamanho_bytes, status, nota_id, uploaded_by_nome, created_at,
					ocr_status, ocr_erro, campos_extraidos`,
				[req.validated.params.id, req.validated.body.status],
			);
			if (!rows[0]) {
				res.status(404).json({ ok: false, error: "Documento não encontrado." });
				return;
			}
			res.json({ ok: true, documento: publicDocumento(rows[0]) });
		} catch (error) {
			next(error);
		}
	},
);

// Gera 1 Nota Fiscal a partir dos campos que o usuário confirmou (pode ter
// editado o que o OCR sugeriu) e vincula o documento a ela. Compartilhada
// pela rota individual (/:id/gerar-nota) e pela rota em lote
// (/gerar-notas-lote, pra lançar dezenas de documentos de uma vez sem abrir
// um modal por vez) — sempre exige valor > 0, nunca cria nota só a partir
// do que o OCR achou sem o usuário confirmar conscientemente.
async function gerarNotaDeDocumento(documentoId, dados, user) {
	const valor = Number(dados?.valor);
	if (!Number.isFinite(valor) || valor <= 0) {
		const error = new Error("Informe um valor válido para a nota.");
		error.statusCode = 400;
		throw error;
	}
	const documento = await db.query(`select id, status from finan_documentos_entrada where id = $1`, [documentoId]);
	if (!documento.rows[0]) {
		const error = new Error("Documento não encontrado.");
		error.statusCode = 404;
		throw error;
	}
	if (documento.rows[0].status === "importado") {
		const error = new Error("Este documento já virou nota.");
		error.statusCode = 400;
		throw error;
	}

	const notaId = randomId("nota");
	await db.query(
		`insert into finan_notas_fiscais (
			id, numero, cnpj_emissor, fornecedor_nome, descricao, valor, data_emissao, data_vencimento, status,
			created_by_id, created_by_nome
		) values ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente', $9, $10)`,
		[
			notaId,
			dados?.numero || null,
			dados?.cnpjEmissor || null,
			dados?.fornecedorNome || null,
			dados?.descricao || `Nota gerada da Caixa de Entrada (${dados?.nomeArquivo || "documento"})`,
			valor,
			dados?.dataEmissao || null,
			dados?.dataVencimento || null,
			user?.id || null,
			user?.name || user?.email || null,
		],
	);
	const { rows } = await db.query(
		`update finan_documentos_entrada set status = 'importado', nota_id = $2, updated_at = now() where id = $1
		returning id, nome_arquivo, tipo_mime, tamanho_bytes, status, nota_id, uploaded_by_nome, created_at,
			ocr_status, ocr_erro, campos_extraidos`,
		[documentoId, notaId],
	);
	// Roteiro Finan #47 (Webhooks): invoice.created. Melhor esforco — so
	// disparado depois que a nota ja foi gravada de verdade.
	dispatchEvent("invoice.created", { notaId, valor, fornecedorNome: dados?.fornecedorNome || "", numero: dados?.numero || "" }).catch(() => {});
	return { documento: publicDocumento(rows[0]), notaId };
}

router.post(
	"/:id/gerar-nota",
	requireFinanPermission("finan.notas.manage"),
	validate({ params: IdParamDTO }),
	async (req, res, next) => {
		try {
			const resultado = await gerarNotaDeDocumento(req.validated.params.id, req.body, req.finanUser);
			res.json({ ok: true, ...resultado });
		} catch (error) {
			if (error.statusCode) {
				res.status(error.statusCode).json({ ok: false, error: error.message });
				return;
			}
			next(error);
		}
	},
);

// Lançamento em lote (roteiro: "grupo de 50 notas de uma vez") — recebe
// varios itens, cada um vira sua PRÓPRIA nota, best-effort (um item com
// erro não derruba os outros; o resultado item a item volta pro cliente
// decidir o que mostrar). Máximo de 100 por chamada, mesma trava de
// tamanho de payload que já existe em outros lotes do projeto.
router.post(
	"/gerar-notas-lote",
	requireFinanPermission("finan.notas.manage"),
	async (req, res, next) => {
		try {
			const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
			if (!itens.length) {
				res.status(400).json({ ok: false, error: "Envie ao menos 1 item." });
				return;
			}
			if (itens.length > 100) {
				res.status(400).json({ ok: false, error: "Máximo de 100 notas por lote." });
				return;
			}
			const resultados = [];
			for (const item of itens) {
				const documentoId = String(item?.documentoId || "").trim();
				if (!documentoId) {
					resultados.push({ documentoId: null, ok: false, erro: "documentoId ausente." });
					continue; // eslint-disable-line no-continue
				}
				try {
					// eslint-disable-next-line no-await-in-loop
					const resultado = await gerarNotaDeDocumento(documentoId, item, req.finanUser);
					resultados.push({ documentoId, ok: true, notaId: resultado.notaId });
				} catch (error) {
					resultados.push({ documentoId, ok: false, erro: error.message || "Falha ao gerar a nota." });
				}
			}
			const sucesso = resultados.filter((r) => r.ok).length;
			res.json({ ok: true, total: itens.length, sucesso, resultados });
		} catch (error) {
			next(error);
		}
	},
);

// Roteiro Finan #34 (Fase 4B — Detecção avançada de duplicidade, estende
// #14): CNPJ + valor + número + emissão + vencimento + similaridade
// textual, com % de confiança — ver duplicidadeService.js.
router.get("/duplicidades", async (req, res, next) => {
	try {
		const duplicidades = await findDuplicateNotas({ meses: req.query?.meses });
		res.json({ ok: true, duplicidades });
	} catch (error) {
		next(error);
	}
});

router.delete("/:id", requireFinanPermission("finan.notas.manage"), validate({ params: IdParamDTO }), async (req, res, next) => {
	try {
		await db.query(`delete from finan_documentos_entrada where id = $1`, [req.validated.params.id]);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

module.exports = router;

// Roteiro Finan #12 (Fechamento Mensal): status de fechamento por
// ano/mes, checklist (reaproveita os mesmos sinais da Central de
// Pendências) e trava — reabrir um periodo fechado exige justificativa
// registrada, e fica auditado. A trava de escrita em si (rejeitar
// import/edição de um período fechado) esta em
// financeiroBudgetImportJobs.js:processBudgetImportJob, não aqui.
const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { validate } = require("../dtos/middleware");
const { PeriodoDTO, ReabrirDTO } = require("../dtos/fechamentoDto");
const { getResumoOrcamento } = require("../orcamento/service");
const { dispatchEvent } = require("../webhooks/dispatchService");

const router = express.Router();

router.use(requireFinanPermission(["finan.gestao_orcamentaria.view", "finan.dashboard.view"]));
router.use(noStore);

async function buildChecklist(ano, mes) {
	const [semCategoria, matriz, duplicidades] = await Promise.all([
		db.query(
			`select count(*)::int as total
			from finan_orcamento_lancamentos
			where ano = $1 and mes = $2 and (conta_id is null or centro_custo_id is null)`,
			[ano, mes],
		),
		db.query(`select count(*)::int as total from finan_orcamento_matriz where ano = $1 and mes = $2`, [ano, mes]),
		db.query(
			`select count(*)::int as total
			from finan_orcamento_lancamentos a
			join finan_orcamento_lancamentos b
				on a.fornecedor_id = b.fornecedor_id and a.realizado = b.realizado and a.id < b.id
				and a.data is not null and b.data is not null and abs(a.data - b.data) <= 5
			where a.ano = $1 and a.mes = $2 and b.ano = $1 and b.mes = $2
				and a.fornecedor_id is not null and a.realizado <> 0`,
			[ano, mes],
		),
	]);
	return [
		{
			id: "orcamento_atualizado",
			label: "Matriz orçamentária carregada para o período",
			ok: (matriz.rows[0]?.total || 0) > 0,
		},
		{
			id: "lancamentos_categorizados",
			label: "Lançamentos sem categoria ou centro de custo resolvidos",
			ok: (semCategoria.rows[0]?.total || 0) === 0,
			pendentes: semCategoria.rows[0]?.total || 0,
		},
		{
			id: "sem_duplicidades",
			label: "Nenhuma possível duplicidade em aberto",
			ok: (duplicidades.rows[0]?.total || 0) === 0,
			pendentes: duplicidades.rows[0]?.total || 0,
		},
	];
}

// Roteiro Finan #42 (Fase 4D — Motor de Fechamento Financeiro
// Inteligente, estende #12, usa #40): Score de Fechamento a partir do
// mesmo checklist que já existia (boa parte dos critérios já era dado
// da Central de Pendências, como o próprio roteiro previa) — mesma
// lógica de "só entra na média quem tem algo pra medir" já usada em
// Qualidade de Dados (#29), pra não punir um checklist com item
// inaplicável.
function buildScoreFechamento(checklist) {
	if (!checklist.length) return 100;
	const okCount = checklist.filter((item) => item.ok).length;
	return Number(((okCount / checklist.length) * 100).toFixed(1));
}

router.get("/", async (req, res, next) => {
	try {
		const now = new Date();
		const ano = Number(req.query?.ano || now.getFullYear());
		const mes = Number(req.query?.mes || now.getMonth() + 1);
		const [{ rows }, checklist] = await Promise.all([
			db.query(`select * from finan_fechamentos_mensais where ano = $1 and mes = $2`, [ano, mes]),
			buildChecklist(ano, mes),
		]);
		const fechamento = rows[0] || { ano, mes, status: "aberto" };
		res.json({
			ok: true,
			periodo: { ano, mes },
			fechamento,
			checklist,
			scoreFechamento: buildScoreFechamento(checklist),
		});
	} catch (error) {
		next(error);
	}
});

router.post(
	"/fechar",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ body: PeriodoDTO }),
	async (req, res, next) => {
		try {
			const { ano, mes } = req.validated.body;
			// Roteiro Finan #36 (Fase 4C — Snapshots financeiros de
			// fechamento): fotografia congelada do resumo no exato momento do
			// fechamento — mudanças em lançamentos depois disso (correção,
			// reimportação) não alteram silenciosamente o que já foi fechado.
			// GET /orcamento/resumo passa a devolver esse snapshot em vez de
			// recalcular ao vivo quando o período está fechado.
			const snapshot = { resumo: await getResumoOrcamento(ano, mes), geradoEm: new Date().toISOString() };
			const { rows } = await db.query(
				`insert into finan_fechamentos_mensais (ano, mes, status, fechado_por_id, fechado_por_nome, fechado_em, snapshot, updated_at)
				values ($1, $2, 'fechado', $3, $4, now(), $5::jsonb, now())
				on conflict (ano, mes) do update set
					status = 'fechado',
					fechado_por_id = excluded.fechado_por_id,
					fechado_por_nome = excluded.fechado_por_nome,
					fechado_em = now(),
					snapshot = excluded.snapshot,
					reaberto_por_id = null,
					reaberto_por_nome = null,
					reaberto_em = null,
					motivo_reabertura = null,
					updated_at = now()
				returning *`,
				[ano, mes, req.finanUser?.id || null, req.finanUser?.name || req.finanUser?.email || null, JSON.stringify(snapshot)],
			);
			await logFechamentoAudit(req, "close", ano, mes, {});
			// Roteiro Finan #47 (Webhooks): month.closed. Melhor esforco —
			// nunca lanca, so loga (ver dispatchService.js).
			dispatchEvent("month.closed", { ano, mes, snapshot: snapshot.resumo }).catch(() => {});
			res.json({ ok: true, fechamento: rows[0] });
		} catch (error) {
			next(error);
		}
	},
);

router.post(
	"/reabrir",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ body: ReabrirDTO }),
	async (req, res, next) => {
		try {
			const { ano, mes, motivo } = req.validated.body;
			const { rows } = await db.query(
				`insert into finan_fechamentos_mensais (ano, mes, status, reaberto_por_id, reaberto_por_nome, reaberto_em, motivo_reabertura, updated_at)
				values ($1, $2, 'aberto', $3, $4, now(), $5, now())
				on conflict (ano, mes) do update set
					status = 'aberto',
					reaberto_por_id = excluded.reaberto_por_id,
					reaberto_por_nome = excluded.reaberto_por_nome,
					reaberto_em = now(),
					motivo_reabertura = excluded.motivo_reabertura,
					updated_at = now()
				returning *`,
				[ano, mes, req.finanUser?.id || null, req.finanUser?.name || req.finanUser?.email || null, motivo],
			);
			await logFechamentoAudit(req, "reopen", ano, mes, { motivo });
			res.json({ ok: true, fechamento: rows[0] });
		} catch (error) {
			next(error);
		}
	},
);

async function logFechamentoAudit(req, action, ano, mes, metadata) {
	await db.query(
		`insert into finan_audit_logs (
			user_id, user_name, user_email, action, module, entity, entity_id,
			record_id, ip_address, user_agent, after_data, changed_fields
		)
		values ($1, $2, $3, $4, 'orcamento', 'finan_fechamentos_mensais', $5, $5, $6, $7, $8::jsonb, '[]'::jsonb)`,
		[
			req.finanUser?.id || null,
			req.finanUser?.name || req.finanUser?.email || null,
			req.finanUser?.email || null,
			action === "close" ? "fechamento.fechar" : "fechamento.reabrir",
			`${ano}-${String(mes).padStart(2, "0")}`,
			req.ip || "",
			req.get("user-agent") || "",
			JSON.stringify({ ano, mes, ...metadata }),
		],
	);
}

module.exports = router;

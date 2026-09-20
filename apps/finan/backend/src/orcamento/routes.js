const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");
const { resolveAccessCompanyGroup } = require("../financeiroBudgetAccessRules");
const { getResumoOrcamento } = require("./service");
const { validate } = require("../dtos/middleware");
const { id, object, string } = require("../dtos/schema");
const versoesService = require("./versoesService");

const router = express.Router();

router.use(requireFinanPermission(["finan.gestao_orcamentaria.view", "finan.dashboard.view"]));

function normalizeCompanyGroup(value = "") {
	const group = resolveAccessCompanyGroup(value);
	return group || String(value || "Sem grupo").trim() || "Sem grupo";
}

function aggregateCompanyGroups(rows = []) {
	const groups = new Map();
	rows.forEach((row) => {
		const label = normalizeCompanyGroup(row.grupo || row.codigo || row.id);
		const current = groups.get(label) || {
			id: label,
			codigo: label,
			nome: label,
			orcado: 0,
			realizado: 0,
		};
		current.orcado += Number(row.orcado || 0);
		current.realizado += Number(row.realizado || 0);
		groups.set(label, current);
	});
	return Array.from(groups.values()).sort(
		(left, right) => Math.abs(right.realizado) - Math.abs(left.realizado),
	);
}

router.get("/resumo", async (req, res, next) => {
	try {
		const now = new Date();
		const year = Number(req.query?.ano || now.getFullYear());
		const month = Number(req.query?.mes || now.getMonth() + 1);
		// Roteiro Finan #37 (Versionamento): so filtra por versao explicita
		// quando o cliente pedir uma diferente da padrao — o congelamento do
		// #36 abaixo so vale pra versao padrao (a que de fato foi fechada).
		const versaoId = String(req.query?.versaoId || versoesService.BUDGET_VERSION_ID);

		// Roteiro Finan #36 (Fase 4C — Snapshots de fechamento): periodo
		// fechado com fotografia salva devolve o resumo CONGELADO (o que foi
		// verdade no momento do fechamento), nao o recalculo ao vivo — uma
		// correcao de lancamento importada depois nao pode alterar
		// silenciosamente um relatorio ja fechado. So se aplica a versao
		// padrao (versoes alternativas, tipo Forecast, nunca sao "fechadas").
		if (versaoId === versoesService.BUDGET_VERSION_ID) {
			const { rows: fechamentoRows } = await db.query(
				`select status, snapshot, fechado_em from finan_fechamentos_mensais where ano = $1 and mes = $2`,
				[year, month],
			);
			const fechamento = fechamentoRows[0];
			if (fechamento?.status === "fechado" && fechamento.snapshot?.resumo) {
				res.json({
					ok: true,
					periodo: { ano: year, mes: month },
					resumo: fechamento.snapshot.resumo,
					congelado: true,
					fechadoEm: fechamento.fechado_em,
				});
				return;
			}
		}

		res.json({
			ok: true,
			periodo: { ano: year, mes: month },
			versaoId,
			resumo: await getResumoOrcamento(year, month, versaoId),
			congelado: false,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/detalhes", async (req, res, next) => {
	try {
		const now = new Date();
		const year = Number(req.query?.ano || now.getFullYear());
		const month = Number(req.query?.mes || now.getMonth() + 1);
		const [classes, contas, centros, diretorias, empresas, fornecedores] = await Promise.all([
			db.query(
				`with matriz as (
					select conta_id, coalesce(sum(orcado), 0)::numeric as orcado
					from finan_orcamento_matriz
					where ano = $1 and mes = $2
					group by conta_id
				),
				lancamentos as (
					select conta_id, coalesce(sum(realizado), 0)::numeric as realizado
					from finan_orcamento_lancamentos
					where ano = $1 and mes = $2
					group by conta_id
				),
				base as (
					select conta_id, sum(orcado)::numeric as orcado, sum(realizado)::numeric as realizado
					from (
						select conta_id, orcado, 0::numeric as realizado from matriz
						union all
						select conta_id, 0::numeric as orcado, realizado from lancamentos
					) x
					group by conta_id
				)
				select
					coalesce(c.categoria_classe, 'sem_classe') as classe,
					coalesce(sum(base.orcado), 0)::numeric as orcado,
					coalesce(sum(base.realizado), 0)::numeric as realizado
				from base
				left join finan_contas c on c.id = base.conta_id
				group by coalesce(c.categoria_classe, 'sem_classe')
				order by classe`,
				[year, month],
			),
			db.query(
				`with matriz as (
					select conta_id, coalesce(sum(orcado), 0)::numeric as orcado
					from finan_orcamento_matriz
					where ano = $1 and mes = $2
					group by conta_id
				),
				lancamentos as (
					select conta_id, coalesce(sum(realizado), 0)::numeric as realizado
					from finan_orcamento_lancamentos
					where ano = $1 and mes = $2
					group by conta_id
				),
				base as (
					select conta_id, sum(orcado)::numeric as orcado, sum(realizado)::numeric as realizado
					from (
						select conta_id, orcado, 0::numeric as realizado from matriz
						union all
						select conta_id, 0::numeric as orcado, realizado from lancamentos
					) x
					group by conta_id
				)
				select
					coalesce(c.id, base.conta_id, 'sem-conta') as id,
					c.codigo,
					coalesce(c.nome, 'Conta não informada') as nome,
					coalesce(c.categoria_mae, 'Sem categoria') as categoria,
					coalesce(c.categoria_classe, 'sem_classe') as classe,
					coalesce(base.orcado, 0)::numeric as orcado,
					coalesce(base.realizado, 0)::numeric as realizado
				from base
				left join finan_contas c on c.id = base.conta_id
				where coalesce(base.orcado, 0) <> 0 or coalesce(base.realizado, 0) <> 0
				order by abs(coalesce(base.realizado, 0)) desc, nome
				limit 200`,
				[year, month],
			),
			db.query(
				`with matriz as (
					select centro_custo_id, coalesce(sum(orcado), 0)::numeric as orcado
					from finan_orcamento_matriz
					where ano = $1 and mes = $2
					group by centro_custo_id
				),
				lancamentos as (
					select centro_custo_id, coalesce(sum(realizado), 0)::numeric as realizado
					from finan_orcamento_lancamentos
					where ano = $1 and mes = $2
					group by centro_custo_id
				),
				base as (
					select
						centro_custo_id,
						sum(orcado)::numeric as orcado,
						sum(realizado)::numeric as realizado
					from (
						select centro_custo_id, orcado, 0::numeric as realizado from matriz
						union all
						select centro_custo_id, 0::numeric as orcado, realizado from lancamentos
					) x
					group by centro_custo_id
				)
				select
					coalesce(cc.id, base.centro_custo_id, 'sem-centro') as id,
					cc.codigo,
					coalesce(cc.nome, 'Centro não informado') as nome,
					cc.tipo_despesa,
					d.nome as diretoria,
					coalesce(base.orcado, 0)::numeric as orcado,
					coalesce(base.realizado, 0)::numeric as realizado
				from base
				left join finan_centros_custo cc on cc.id = base.centro_custo_id
				left join finan_diretorias d on d.id = cc.diretoria_id
				where coalesce(base.orcado, 0) <> 0 or coalesce(base.realizado, 0) <> 0
				order by abs(coalesce(base.realizado, 0)) desc, nome
				limit 200`,
				[year, month],
			),
			db.query(
				`with matriz as (
					select cc.diretoria_id, coalesce(sum(om.orcado), 0)::numeric as orcado
					from finan_orcamento_matriz om
					left join finan_centros_custo cc on cc.id = om.centro_custo_id
					where om.ano = $1 and om.mes = $2
					group by cc.diretoria_id
				),
				lancamentos as (
					select cc.diretoria_id, coalesce(sum(ol.realizado), 0)::numeric as realizado
					from finan_orcamento_lancamentos ol
					left join finan_centros_custo cc on cc.id = ol.centro_custo_id
					where ol.ano = $1 and ol.mes = $2
					group by cc.diretoria_id
				),
				base as (
					select
						diretoria_id,
						sum(orcado)::numeric as orcado,
						sum(realizado)::numeric as realizado
					from (
						select diretoria_id, orcado, 0::numeric as realizado from matriz
						union all
						select diretoria_id, 0::numeric as orcado, realizado from lancamentos
					) x
					group by diretoria_id
				)
				select
					coalesce(d.id, 'sem-diretoria') as id,
					coalesce(d.nome, 'Diretoria não informada') as nome,
					d.diretor_nome,
					coalesce(base.orcado, 0)::numeric as orcado,
					coalesce(base.realizado, 0)::numeric as realizado
				from base
				left join finan_diretorias d on d.id = base.diretoria_id
				order by abs(coalesce(base.realizado, 0)) desc, nome`,
				[year, month],
			),
			// Grupo empresarial: NEM o orcado (finan_orcamento_matriz) NEM o
			// realizado (finan_orcamento_lancamentos) tem uma chave de empresa
			// direta e confiavel — o source_payload do orcado so tem
			// accountId/costCenterId (nunca teve matrizId/empresaId/companyId,
			// entao o coalesce antigo sempre caia em NULL e todo orcado virava
			// "sem-empresa"); o empresa_id bruto do realizado mistura formatos
			// (codigo legado numerico, nome livre) que nao batem com
			// finan_matrizes.id. A chave que EXISTE e e confiavel nos dois
			// lados e o centro de custo (centro_custo_id) — o cadastro de
			// centro de custo ja tem o grupo empresarial certo em
			// source_payload->>'grupo' (ex.: "Sempre", "On"), preenchido na
			// importacao da planilha orcamentaria.
			db.query(
				`with matriz as (
					select cc.source_payload->>'grupo' as grupo, coalesce(sum(om.orcado), 0)::numeric as orcado
					from finan_orcamento_matriz om
					left join finan_centros_custo cc on cc.id = om.centro_custo_id
					where om.ano = $1 and om.mes = $2
					group by cc.source_payload->>'grupo'
				),
				lancamentos as (
					select cc.source_payload->>'grupo' as grupo, coalesce(sum(ol.realizado), 0)::numeric as realizado
					from finan_orcamento_lancamentos ol
					left join finan_centros_custo cc on cc.id = ol.centro_custo_id
					where ol.ano = $1 and ol.mes = $2
					group by cc.source_payload->>'grupo'
				),
				base as (
					select
						grupo,
						sum(orcado)::numeric as orcado,
						sum(realizado)::numeric as realizado
					from (
						select grupo, orcado, 0::numeric as realizado from matriz
						union all
						select grupo, 0::numeric as orcado, realizado from lancamentos
					) x
					group by grupo
				)
				select
					coalesce(nullif(grupo, ''), 'sem-grupo') as id,
					coalesce(nullif(grupo, ''), '') as codigo,
					coalesce(nullif(grupo, ''), 'Sem grupo definido') as nome,
					coalesce(nullif(grupo, ''), '') as grupo,
					coalesce(base.orcado, 0)::numeric as orcado,
					coalesce(base.realizado, 0)::numeric as realizado
				from base
				where coalesce(base.orcado, 0) <> 0 or coalesce(base.realizado, 0) <> 0
				order by abs(coalesce(base.realizado, 0)) desc, nome`,
				[year, month],
			),
			db.query(
				`select
					f.id,
					f.codigo,
					f.nome,
					coalesce(sum(ol.realizado), 0)::numeric as realizado,
					count(*)::integer as linhas
				from finan_orcamento_lancamentos ol
				left join finan_fornecedores f on f.id = ol.fornecedor_id
				where ol.ano = $1 and ol.mes = $2
				group by f.id, f.codigo, f.nome
				order by abs(coalesce(sum(ol.realizado), 0)) desc
				limit 100`,
				[year, month],
			),
		]);

		res.json({
			ok: true,
			periodo: { ano: year, mes: month },
			detalhes: {
				classes: classes.rows,
				contas: contas.rows,
				centros: centros.rows,
				diretorias: diretorias.rows,
				empresas: aggregateCompanyGroups(empresas.rows),
				fornecedores: fornecedores.rows,
			},
		});
	} catch (error) {
		next(error);
	}
});

// Roteiro Finan #14 (Detecção de duplicidade): compara lançamentos do
// mesmo fornecedor e mesmo valor realizado dentro de uma janela curta de
// dias — deliberadamente NAO compara contra o historico inteiro, pra nao
// confundir recorrencia legitima (aluguel, softwares, links, que repetem
// fornecedor+valor todo mes) com duplicata real de digitação/importação.
router.get("/duplicidades", async (req, res, next) => {
	try {
		const now = new Date();
		const year = Number(req.query?.ano || now.getFullYear());
		const month = Number(req.query?.mes || now.getMonth() + 1);
		const windowDays = Math.min(Math.max(Number(req.query?.janelaDias || 5), 1), 30);
		const { rows } = await db.query(
			`select
				a.id as id_a, b.id as id_b,
				a.data as data_a, b.data as data_b,
				a.realizado,
				f.id as fornecedor_id, f.codigo as fornecedor_codigo, f.nome as fornecedor_nome,
				ca.nome as conta_a, cb.nome as conta_b
			from finan_orcamento_lancamentos a
			join finan_orcamento_lancamentos b
				on a.fornecedor_id = b.fornecedor_id
				and a.realizado = b.realizado
				and a.id < b.id
				and a.data is not null and b.data is not null
				and abs(a.data - b.data) <= $3
			left join finan_fornecedores f on f.id = a.fornecedor_id
			left join finan_contas ca on ca.id = a.conta_id
			left join finan_contas cb on cb.id = b.conta_id
			where a.ano = $1 and a.mes = $2 and b.ano = $1 and b.mes = $2
				and a.fornecedor_id is not null and a.realizado <> 0
			order by a.data desc
			limit 200`,
			[year, month, windowDays],
		);
		res.json({
			ok: true,
			periodo: { ano: year, mes: month, janelaDias: windowDays },
			duplicidades: rows,
		});
	} catch (error) {
		next(error);
	}
});

// Roteiro Finan #37 (Fase 4C — Versionamento de orçamento, usa #36):
// Original -> Revisão 1 -> Forecast Q3 -> Revisão Diretoria, sem nunca
// sobrescrever a versão anterior.
const VersaoBodyDTO = object(
	{
		ano: string({ required: true, pattern: /^\d{4}$/ }),
		mes: string({ required: true, pattern: /^\d{1,2}$/ }),
		nome: string({ required: true, minLength: 1, maxLength: 120 }),
		versaoBaseId: string({ required: false, maxLength: 60 }),
	},
	{ unknownKeys: "strip" },
);
const VersaoIdParamDTO = object({ id: id({ required: true }) }, { unknownKeys: "strip" });

router.get("/versoes", async (req, res, next) => {
	try {
		const now = new Date();
		const ano = Number(req.query?.ano || now.getFullYear());
		const mes = Number(req.query?.mes || now.getMonth() + 1);
		res.json({ ok: true, versoes: await versoesService.listVersoes(ano, mes) });
	} catch (error) {
		next(error);
	}
});

router.post(
	"/versoes",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ body: VersaoBodyDTO }),
	async (req, res, next) => {
		try {
			const { ano, mes, nome, versaoBaseId } = req.validated.body;
			const result = await versoesService.createVersao({
				ano: Number(ano),
				mes: Number(mes),
				nome,
				versaoBaseId: versaoBaseId || versoesService.BUDGET_VERSION_ID,
				createdBy: { id: req.finanUser?.id, name: req.finanUser?.name || req.finanUser?.email },
			});
			res.status(201).json({ ok: true, ...result });
		} catch (error) {
			next(error);
		}
	},
);

router.delete(
	"/versoes/:id",
	requireFinanPermission("finan.gestao_orcamentaria.manage"),
	validate({ params: VersaoIdParamDTO }),
	async (req, res, next) => {
		try {
			await versoesService.deleteVersao(req.validated.params.id);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

module.exports = router;


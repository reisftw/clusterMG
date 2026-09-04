const express = require("express");
const db = require("../db");
const { requireFinanPermission } = require("../auth/middleware");

const router = express.Router();

router.use(requireFinanPermission("finan.gestao_orcamentaria.view"));

router.get("/resumo", async (_req, res) => {
	const now = new Date();
	const year = Number(_req.query?.ano || now.getFullYear());
	const month = Number(_req.query?.mes || now.getMonth() + 1);
	const { rows } = await db.query(
		`with matriz as (
			select coalesce(sum(orcado), 0)::numeric as orcado
			from finan_orcamento_matriz
			where ano = $1 and mes = $2
		),
		lancamentos as (
			select
				coalesce(sum(realizado), 0)::numeric as realizado,
				count(*)::integer as linhas
			from finan_orcamento_lancamentos
			where ano = $1 and mes = $2
		)
		select matriz.orcado, lancamentos.realizado, lancamentos.linhas
		from matriz cross join lancamentos`,
		[year, month],
	);
	res.json({
		ok: true,
		periodo: { ano: year, mes: month },
		resumo: rows[0] || { orcado: 0, realizado: 0, linhas: 0 },
	});
});

router.get("/detalhes", async (req, res) => {
	const now = new Date();
	const year = Number(req.query?.ano || now.getFullYear());
	const month = Number(req.query?.mes || now.getMonth() + 1);
	const [classes, contas, centros, diretorias, fornecedores] = await Promise.all([
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
				select coalesce(m.conta_id, l.conta_id) as conta_id, m.orcado, l.realizado
				from matriz m
				full join lancamentos l on l.conta_id is not distinct from m.conta_id
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
				select coalesce(m.conta_id, l.conta_id) as conta_id, m.orcado, l.realizado
				from matriz m
				full join lancamentos l on l.conta_id is not distinct from m.conta_id
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
					coalesce(m.centro_custo_id, l.centro_custo_id) as centro_custo_id,
					m.orcado,
					l.realizado
				from matriz m
				full join lancamentos l on l.centro_custo_id is not distinct from m.centro_custo_id
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
			)
			select
				coalesce(d.id, 'sem-diretoria') as id,
				coalesce(d.nome, 'Diretoria não informada') as nome,
				d.diretor_nome,
				coalesce(m.orcado, 0)::numeric as orcado,
				coalesce(l.realizado, 0)::numeric as realizado
			from matriz m
			full join lancamentos l on l.diretoria_id is not distinct from m.diretoria_id
			left join finan_diretorias d on d.id = coalesce(m.diretoria_id, l.diretoria_id)
			order by abs(coalesce(l.realizado, 0)) desc, nome`,
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
			fornecedores: fornecedores.rows,
		},
	});
});

module.exports = router;

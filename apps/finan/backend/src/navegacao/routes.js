// Contadores agregados do menu lateral (badges de Central de Pendências,
// Caixa de Entrada e Central de Notificações). Um único endpoint em vez de
// 3 chamadas separadas no carregamento do app — cada contador só entra na
// resposta se o usuário tiver a permissão de visualização correspondente
// (mesmo critério das próprias páginas), e cada contagem usa COUNT(*) em
// vez de trazer as linhas inteiras, pra não pesar o carregamento do menu.
const express = require("express");
const db = require("../db");
const { noStore } = require("../security/noStore");
const { userHasFinanPermission } = require("../auth/middleware");
const notificationsService = require("../notifications/notificationsService");

const router = express.Router();

router.use(noStore);

// Mesmos sinais de finan.pendencias.view (pendencias/routes.js), mas só a
// contagem — sem trazer descrição/link de cada item. Deliberadamente NÃO
// inclui a checagem de CNPJ inativo (que existe em pendencias/routes.js)
// — essa rota é chamada a cada 30s pelo polling do badge do menu, e
// checagem de CNPJ bate na BrasilAPI (rede externa); mesmo com cache de
// 1h, não vale pagar esse custo a cada poll só pra um número no badge.
async function countPendencias() {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;

	const [semCategoria, integracoesErro, importsErro, duplicidades, contasPagarVencidas, contasReceberVencidas] = await Promise.all([
		db.query(
			`select count(*)::int as total from finan_orcamento_lancamentos ol
			where ol.ano = $1 and ol.mes = $2 and (ol.conta_id is null or ol.centro_custo_id is null)`,
			[year, month],
		),
		db.query(`select count(*)::int as total from finan_integration_configs where status = 'erro'`),
		db.query(`select count(*)::int as total from finan_import_logs where status = 'erro'`),
		db.query(
			`select count(*)::int as total
			from finan_orcamento_lancamentos a
			join finan_orcamento_lancamentos b
				on a.fornecedor_id = b.fornecedor_id
				and a.realizado = b.realizado
				and a.id < b.id
				and a.data is not null and b.data is not null
				and abs(a.data - b.data) <= 5
			where a.ano = $1 and a.mes = $2 and b.ano = $1 and b.mes = $2
				and a.fornecedor_id is not null and a.realizado <> 0`,
			[year, month],
		),
		db.query(`select count(*)::int as total from finan_contas_pagar where status = 'pendente' and data_vencimento < current_date`),
		db.query(`select count(*)::int as total from finan_contas_receber where status = 'pendente' and data_vencimento < current_date`),
	]);

	const duplicidadeCount = duplicidades.rows[0]?.total > 0 ? 1 : 0;
	return (
		(semCategoria.rows[0]?.total || 0) +
		(integracoesErro.rows[0]?.total || 0) +
		(importsErro.rows[0]?.total || 0) +
		duplicidadeCount +
		(contasPagarVencidas.rows[0]?.total || 0) +
		(contasReceberVencidas.rows[0]?.total || 0)
	);
}

// Documentos que ainda exigem alguma ação do usuário na Caixa de Entrada
// (recebido/processando/conferir) — "importado" já virou nota, não conta.
async function countCaixaEntrada() {
	const { rows } = await db.query(
		`select count(*)::int as total from finan_documentos_entrada where status in ('recebido', 'processando', 'conferir')`,
	);
	return rows[0]?.total || 0;
}

router.get("/contadores", async (req, res, next) => {
	try {
		const user = req.finanUser;
		const tasks = [];
		const keys = [];

		if (userHasFinanPermission(user, "finan.pendencias.view")) {
			keys.push("pendencias");
			tasks.push(countPendencias());
		}
		if (userHasFinanPermission(user, "finan.notas.view")) {
			keys.push("caixaEntrada");
			tasks.push(countCaixaEntrada());
		}
		keys.push("notificacoes");
		tasks.push(notificationsService.getCounters({ user }).then((counters) => counters.notificacoesNaoLidas || 0));

		const results = await Promise.all(tasks);
		const contadores = {};
		keys.forEach((key, index) => {
			contadores[key] = results[index];
		});

		res.json({ ok: true, contadores });
	} catch (error) {
		next(error);
	}
});

module.exports = router;

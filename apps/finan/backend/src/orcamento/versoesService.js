// Roteiro Finan #37 (Fase 4C — Versionamento de orçamento, usa #36):
// catálogo de versões por período — o modelo de dado pra guardar valores
// de cada versão já existia (finan_orcamento_matriz.versao_id, ver
// migration 002); esta tabela só registra nome/origem/quem criou cada
// versão.
const db = require("../db");
const { randomId } = require("../secureRandom");

const BUDGET_VERSION_ID = "budget";

// "budget" e implicita — sempre existiu (e a unica usada por toda
// importacao ate hoje), nunca teve uma linha propria no catalogo. Toda
// listagem inclui ela sintetizada na frente, marcada como padrao.
function syntheticBudgetVersion(ano, mes) {
	return {
		id: BUDGET_VERSION_ID,
		ano,
		mes,
		nome: "Original",
		versaoBaseId: null,
		isPadrao: true,
		createdByNome: null,
		createdAt: null,
	};
}

function publicVersao(row) {
	return {
		id: row.id,
		ano: row.ano,
		mes: row.mes,
		nome: row.nome,
		versaoBaseId: row.versao_base_id,
		isPadrao: row.is_padrao,
		createdByNome: row.created_by_nome,
		createdAt: row.created_at,
	};
}

async function listVersoes(ano, mes) {
	const { rows } = await db.query(
		`select * from finan_orcamento_versoes where ano = $1 and mes = $2 order by created_at asc`,
		[ano, mes],
	);
	return [syntheticBudgetVersion(ano, mes), ...rows.map(publicVersao)];
}

// Cria uma versao nova duplicando os valores ORÇADOS da versao-base pra
// dentro da versao nova (nunca sobrescreve a versao-base — INSERT puro,
// versao_id diferente, mesma chave (ano,mes,conta_id,centro_custo_id) em
// versao_id diferente e permitida pelo unique constraint que ja existe).
// So a MATRIZ (orçado) e versionada — o realizado (finan_orcamento_
// lancamentos) nao muda por versao, e o mesmo dado real independente de
// qual revisao de orçamento esta sendo comparada com ele.
async function createVersao({ ano, mes, nome, versaoBaseId = BUDGET_VERSION_ID, createdBy }) {
	const id = randomId("orcver");
	const client = await db.connect();
	try {
		await client.query("begin");
		const { rows } = await client.query(
			`insert into finan_orcamento_versoes (id, ano, mes, nome, versao_base_id, created_by_id, created_by_nome)
			values ($1, $2, $3, $4, $5, $6, $7)
			returning *`,
			[id, ano, mes, nome, versaoBaseId, createdBy?.id || null, createdBy?.name || null],
		);
		const { rowCount } = await client.query(
			`insert into finan_orcamento_matriz (
				id, ano, mes, conta_id, centro_custo_id, versao_id, orcado, comprometido,
				created_at, updated_at, created_by, updated_by, source_payload
			)
			select
				gen_random_uuid()::text, ano, mes, conta_id, centro_custo_id, $3, orcado, comprometido,
				now(), now(), $4, $4, source_payload
			from finan_orcamento_matriz
			where ano = $1 and mes = $2 and versao_id = $5`,
			[ano, mes, id, createdBy?.id || null, versaoBaseId],
		);
		await client.query("commit");
		return { versao: publicVersao(rows[0]), linhasCopiadas: rowCount };
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

async function deleteVersao(id) {
	if (id === BUDGET_VERSION_ID) {
		const error = new Error("A versão Original não pode ser excluída.");
		error.statusCode = 400;
		throw error;
	}
	await db.query(`delete from finan_orcamento_matriz where versao_id = $1`, [id]);
	await db.query(`delete from finan_orcamento_versoes where id = $1`, [id]);
}

module.exports = { BUDGET_VERSION_ID, listVersoes, createVersao, deleteVersao };

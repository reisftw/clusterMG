// Roteiro Finan #48 (Fase 4F — Conciliação inteligente): sugestão
// automática de correspondência entre extrato bancário importado
// (Roteiro #35/#48) e títulos em aberto (contas a pagar/receber), com
// % de confiança — mesmo espírito de pontuação do #34 (detecção de
// duplicidade): sinais estruturados (valor, data) somam confiança,
// nunca decide sozinho, sempre precisa de confirmação manual.
const db = require("../db");

const DATE_PROXIMITY_DAYS = 5;

function daysBetween(a, b) {
	const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
	return diffMs / (1000 * 60 * 60 * 24);
}

// Valor: extrato de contas a PAGAR sai negativo do banco (saída) e de
// contas a RECEBER entra positivo — compara pelo valor absoluto.
function scoreCandidato(extrato, titulo) {
	const valorExtrato = Math.abs(Number(extrato.valor));
	const valorTitulo = Math.abs(Number(titulo.valor));
	const diffValor = Math.abs(valorExtrato - valorTitulo);
	const valorMatch = diffValor < 0.01;
	if (!valorMatch) return null; // sem match de valor, nem candidato

	const dias = daysBetween(extrato.data, titulo.data_vencimento || titulo.data);
	if (dias > DATE_PROXIMITY_DAYS) return null;

	// 70 de piso por valor batendo exato + ate 30 por proximidade de data.
	const confianca = Math.round(70 + 30 * (1 - dias / DATE_PROXIMITY_DAYS));
	return { confianca: Math.min(100, confianca), diasDiferenca: Math.round(dias) };
}

async function sugerirConciliacoes({ limit = 50 } = {}) {
	const [extratoRows, contasPagarRows, contasReceberRows] = await Promise.all([
		db.query(`select id, data, descricao, valor from finan_extrato_bancario where conciliado = false order by data desc limit $1`, [limit]),
		db.query(`select id, descricao, valor, data_vencimento, fornecedor_id from finan_contas_pagar where status = 'pendente'`),
		db.query(`select id, descricao, valor, data_vencimento, cliente_nome from finan_contas_receber where status = 'pendente'`),
	]);

	const sugestoes = [];
	for (const extrato of extratoRows.rows) {
		const candidatosPagar = contasPagarRows.rows
			.map((titulo) => {
				const score = scoreCandidato(extrato, titulo);
				return score ? { tipo: "contas_pagar", id: titulo.id, titulo: titulo.descricao, ...score } : null;
			})
			.filter(Boolean);
		const candidatosReceber = contasReceberRows.rows
			.map((titulo) => {
				const score = scoreCandidato(extrato, titulo);
				return score ? { tipo: "contas_receber", id: titulo.id, titulo: titulo.descricao, ...score } : null;
			})
			.filter(Boolean);
		const candidatos = [...candidatosPagar, ...candidatosReceber].sort((a, b) => b.confianca - a.confianca).slice(0, 3);
		if (candidatos.length) {
			sugestoes.push({
				extratoId: extrato.id,
				data: extrato.data,
				descricao: extrato.descricao,
				valor: Number(extrato.valor),
				candidatos,
			});
		}
	}
	return sugestoes;
}

async function confirmarConciliacao(extratoId, { tipo, id }, confirmedBy) {
	if (!["contas_pagar", "contas_receber"].includes(tipo)) {
		const error = new Error("Tipo de título inválido.");
		error.statusCode = 400;
		throw error;
	}
	const tabela = tipo === "contas_pagar" ? "finan_contas_pagar" : "finan_contas_receber";
	const campoStatus = tipo === "contas_pagar" ? "pago" : "recebido";
	const campoData = tipo === "contas_pagar" ? "data_pagamento" : "data_recebimento";

	const client = await db.connect();
	try {
		await client.query("begin");
		const tituloResult = await client.query(
			`update ${tabela} set status = $2, ${campoData} = now(), updated_at = now() where id = $1 and status = 'pendente' returning id`,
			[id, campoStatus],
		);
		if (!tituloResult.rows[0]) {
			await client.query("rollback");
			const error = new Error("Título não encontrado ou já não está pendente.");
			error.statusCode = 404;
			throw error;
		}
		await client.query(
			`update finan_extrato_bancario set
				conciliado = true, conciliado_tipo = $2, conciliado_id = $3, conciliado_em = now(),
				conciliado_por_id = $4, conciliado_por_nome = $5
			where id = $1`,
			[extratoId, tipo, id, confirmedBy?.id || null, confirmedBy?.name || null],
		);
		await client.query("commit");
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}

module.exports = { sugerirConciliacoes, confirmarConciliacao };

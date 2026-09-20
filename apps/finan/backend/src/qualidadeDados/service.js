// Roteiro Finan #29 (Fase 4A — Qualidade de Dados): logica pura, extraida
// de routes.js (Roteiro #26 — API /api/v1) pra ser reaproveitada tanto
// pela rota legada (/api/finan/qualidade-dados) quanto pela nova
// (/api/v1/qualidade-dados), sem duplicar as queries em dois lugares.
const db = require("../db");
const { findDuplicateNotas } = require("../documentos/duplicidadeService");

// Validador de digito verificador de CPF/CNPJ (algoritmo padrao, sem
// dependencia externa e sem chamada de rede — so formato, nao confirma
// que o numero existe de verdade na Receita; isso ja e feito, quando
// aplicavel, pela BrasilAPI em brasilapi/service.js).
function isValidCpf(value) {
	const cpf = String(value || "").replace(/\D/g, "");
	if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
	const digits = cpf.split("").map(Number);
	const calc = (len) => {
		let sum = 0;
		for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
		const rest = (sum * 10) % 11;
		return rest === 10 ? 0 : rest;
	};
	return calc(9) === digits[9] && calc(10) === digits[10];
}

function isValidCnpj(value) {
	const cnpj = String(value || "").replace(/\D/g, "");
	if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
	const digits = cnpj.split("").map(Number);
	const calc = (len) => {
		const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
		let sum = 0;
		for (let i = 0; i < len; i++) sum += digits[i] * weights[i];
		const rest = sum % 11;
		return rest < 2 ? 0 : 11 - rest;
	};
	return calc(12) === digits[12] && calc(13) === digits[13];
}

// CPF (11 digitos) ou CNPJ (14) — o mesmo campo cnpj em finan_fornecedores
// as vezes guarda CPF de fornecedor pessoa fisica (autonomo), entao
// valida pelos dois formatos possiveis.
function isValidCpfCnpj(value) {
	const digits = String(value || "").replace(/\D/g, "");
	if (digits.length === 11) return isValidCpf(digits);
	if (digits.length === 14) return isValidCnpj(digits);
	return false;
}

function buildCheck({ id, titulo, descricao, severidade, total, comProblema, link, amostra = [] }) {
	const safeTotal = Number(total || 0);
	const safeProblema = Math.min(Number(comProblema || 0), safeTotal);
	const percentualOk = safeTotal > 0 ? Number((((safeTotal - safeProblema) / safeTotal) * 100).toFixed(1)) : 100;
	return {
		id,
		titulo,
		descricao,
		severidade,
		total: safeTotal,
		comProblema: safeProblema,
		percentualOk,
		link,
		amostra,
	};
}

async function checkFornecedoresSemCnpj() {
	const { rows } = await db.query(
		`select count(*)::int as total, count(*) filter (where cnpj is null or cnpj = '')::int as sem_cnpj
		from finan_fornecedores`,
	);
	const row = rows[0] || { total: 0, sem_cnpj: 0 };
	const { rows: amostraRows } = await db.query(
		`select nome from finan_fornecedores where cnpj is null or cnpj = '' order by nome limit 5`,
	);
	return buildCheck({
		id: "fornecedores_sem_cnpj",
		titulo: "Fornecedores sem CNPJ cadastrado",
		descricao: "Sem CNPJ, o fornecedor não pode ser verificado na Receita nem cruzado automaticamente com notas fiscais recebidas.",
		severidade: "atencao",
		total: row.total,
		comProblema: row.sem_cnpj,
		link: "/fornecedores",
		amostra: amostraRows.map((r) => r.nome),
	});
}

async function checkFornecedoresCnpjInvalido() {
	const { rows } = await db.query(
		`select id, nome, cnpj from finan_fornecedores where cnpj is not null and cnpj <> ''`,
	);
	const invalidos = rows.filter((row) => !isValidCpfCnpj(row.cnpj));
	return buildCheck({
		id: "fornecedores_cnpj_invalido",
		titulo: "CNPJ/CPF com dígito verificador inválido",
		descricao: "Formato preenchido, mas o número não passa na validação de dígito verificador — provável erro de digitação no cadastro.",
		severidade: "critico",
		total: rows.length,
		comProblema: invalidos.length,
		link: "/fornecedores",
		amostra: invalidos.slice(0, 5).map((r) => `${r.nome} (${r.cnpj})`),
	});
}

async function checkLancamentosSemClasse() {
	const { rows } = await db.query(
		`select count(*)::int as total, count(*) filter (where conta_id is null or centro_custo_id is null)::int as sem_classe
		from finan_orcamento_lancamentos`,
	);
	const row = rows[0] || { total: 0, sem_classe: 0 };
	return buildCheck({
		id: "lancamentos_sem_classe",
		titulo: "Lançamentos sem conta ou centro de custo",
		descricao: "Sem classificação completa, o lançamento não entra corretamente no Orçado x Realizado por categoria.",
		severidade: "critico",
		total: row.total,
		comProblema: row.sem_classe,
		link: "/gestao-orcamentaria/dados",
	});
}

async function checkLancamentosDuplicados() {
	const { rows: totalRows } = await db.query(`select count(*)::int as total from finan_orcamento_lancamentos`);
	const { rows: duplicadosRows } = await db.query(
		`select count(*)::int as total
		from finan_orcamento_lancamentos a
		join finan_orcamento_lancamentos b
			on a.fornecedor_id = b.fornecedor_id
			and a.realizado = b.realizado
			and a.id < b.id
			and a.data is not null and b.data is not null
			and abs(a.data - b.data) <= 5
		where a.fornecedor_id is not null and a.realizado <> 0`,
	);
	return buildCheck({
		id: "lancamentos_duplicados",
		titulo: "Possíveis lançamentos duplicados",
		descricao: "Mesmo fornecedor e valor em poucos dias de diferença, em qualquer período — mesmo critério usado no aviso da Dashboard, aqui contado sem filtro de mês.",
		severidade: "atencao",
		total: totalRows[0]?.total || 0,
		comProblema: duplicadosRows[0]?.total || 0,
		link: "/gestao-orcamentaria/dados",
	});
}

async function checkNotasSemFornecedor() {
	const { rows } = await db.query(
		`select count(*)::int as total, count(*) filter (where fornecedor_nome is null or fornecedor_nome = '')::int as sem_fornecedor
		from finan_notas_fiscais`,
	);
	const row = rows[0] || { total: 0, sem_fornecedor: 0 };
	return buildCheck({
		id: "notas_sem_fornecedor",
		titulo: "Notas fiscais sem fornecedor identificado",
		descricao: "Nota lançada sem nome de fornecedor — dificulta achar depois na Central de Fornecedores ou em Contas a Pagar.",
		severidade: "atencao",
		total: row.total,
		comProblema: row.sem_fornecedor,
		link: "/notas",
	});
}

// Roteiro Finan #34 (Fase 4B — Detecção avançada de duplicidade, estende
// #14): mesmo formato de check das demais, mas o "total" aqui e o total
// de notas fiscais com CNPJ cadastrado (universo que a detecção
// consegue avaliar) e "comProblema" e quantos pares únicos de nota
// entraram como provável duplicata (confiança >= 55%, ver
// duplicidadeService.js).
async function checkNotasFiscaisDuplicadas() {
	const [{ rows: totalRows }, duplicidades] = await Promise.all([
		db.query(`select count(*)::int as total from finan_notas_fiscais where cnpj_emissor is not null and cnpj_emissor <> ''`),
		findDuplicateNotas(),
	]);
	const idsEnvolvidos = new Set();
	duplicidades.forEach((item) => {
		idsEnvolvidos.add(item.idA);
		idsEnvolvidos.add(item.idB);
	});
	return buildCheck({
		id: "notas_fiscais_duplicadas",
		titulo: "Possíveis notas fiscais duplicadas",
		descricao: "Mesmo CNPJ do emissor e mesmo valor, comparando também número, data de emissão/vencimento e texto da descrição — com % de confiança.",
		severidade: "critico",
		total: totalRows[0]?.total || 0,
		comProblema: idsEnvolvidos.size,
		link: "/notas",
		amostra: duplicidades
			.slice(0, 5)
			.map((item) => `${item.fornecedorNomeA || item.cnpjEmissor} · R$ ${item.valor.toFixed(2)} · ${item.confidence}% de confiança`),
	});
}

async function getQualidadeDados() {
	const checks = await Promise.all([
		checkFornecedoresSemCnpj(),
		checkFornecedoresCnpjInvalido(),
		checkLancamentosSemClasse(),
		checkLancamentosDuplicados(),
		checkNotasSemFornecedor(),
		checkNotasFiscaisDuplicadas(),
	]);
	// So entram na media as checagens com pelo menos 1 registro — uma
	// tabela ainda vazia (ex.: nenhuma nota lancada ainda) nao deve contar
	// como "100% saudavel" nem derrubar a nota por falta de dado.
	const comDado = checks.filter((check) => check.total > 0);
	const score = comDado.length
		? Number((comDado.reduce((sum, check) => sum + check.percentualOk, 0) / comDado.length).toFixed(1))
		: 100;
	return { score, checks };
}

module.exports = { getQualidadeDados, isValidCpfCnpj };

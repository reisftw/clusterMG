// Roteiro Finan #46 (Fase 4E — Business Case dentro do Finan): ROI,
// payback, VPL e TIR a partir de investimento inicial + economia
// mensal esperada + prazo. Puro (sem banco), fácil de testar isolado —
// a mesma matemática de qualquer calculadora financeira padrão.

// ROI simples: quanto sobra (economia total no prazo - investimento)
// em relação ao investimento, em %.
function calcularRoi({ investimentoInicial, economiaMensal, prazoMeses }) {
	if (investimentoInicial <= 0) return 0;
	const economiaTotal = economiaMensal * prazoMeses;
	return ((economiaTotal - investimentoInicial) / investimentoInicial) * 100;
}

// Payback simples: em quantos meses a economia acumulada cobre o
// investimento inicial (economia mensal constante). Infinito
// (null) se a economia mensal nunca cobre.
function calcularPaybackMeses({ investimentoInicial, economiaMensal }) {
	if (economiaMensal <= 0) return null;
	return investimentoInicial / economiaMensal;
}

// VPL (NPV): fluxo de caixa descontado — -investimento no mes 0, +
// economia mensal em cada mes do prazo, trazidos a valor presente pela
// taxa de desconto mensal.
function calcularVpl({ investimentoInicial, economiaMensal, prazoMeses, taxaDescontoMensal }) {
	let vpl = -investimentoInicial;
	for (let t = 1; t <= prazoMeses; t++) {
		vpl += economiaMensal / (1 + taxaDescontoMensal) ** t;
	}
	return vpl;
}

// TIR (IRR): taxa que zera o VPL. Sem solução fechada — busca por
// bissecção (robusta, não precisa de derivada, converge sempre que
// existe raiz no intervalo testado). Devolve null quando não há troca
// de sinal no intervalo (ex.: economia mensal insuficiente pra nunca
// pagar o investimento, mesmo a taxa 0%).
// Busca so em taxas nao-negativas (0% a 1000% ao mes) — taxas negativas
// extremas (perto de -100%) inflam o fator de desconto ate o infinito e
// fariam quase qualquer fluxo cruzar zero ali, o que nao tem
// interpretacao financeira util pra uma TIR de negocio real.
function calcularTir({ investimentoInicial, economiaMensal, prazoMeses }, { min = 0, max = 10, precisao = 1e-6, maxIteracoes = 200 } = {}) {
	const vplNaTaxa = (taxa) => calcularVpl({ investimentoInicial, economiaMensal, prazoMeses, taxaDescontoMensal: taxa });
	let low = min;
	let high = max;
	let vplLow = vplNaTaxa(low);
	let vplHigh = vplNaTaxa(high);
	if (vplLow === 0) return low;
	if (vplHigh === 0) return high;
	if (Math.sign(vplLow) === Math.sign(vplHigh)) return null; // sem raiz no intervalo
	for (let i = 0; i < maxIteracoes; i++) {
		const mid = (low + high) / 2;
		const vplMid = vplNaTaxa(mid);
		if (Math.abs(vplMid) < precisao) return mid;
		if (Math.sign(vplMid) === Math.sign(vplLow)) {
			low = mid;
			vplLow = vplMid;
		} else {
			high = mid;
		}
	}
	return (low + high) / 2;
}

function calcularBusinessCase(input) {
	const investimentoInicial = Number(input.investimentoInicial) || 0;
	const economiaMensal = Number(input.economiaMensal) || 0;
	const prazoMeses = Math.max(1, Math.trunc(Number(input.prazoMeses)) || 12);
	const taxaDescontoMensal = Number(input.taxaDescontoMensal) || 0;
	const params = { investimentoInicial, economiaMensal, prazoMeses, taxaDescontoMensal };

	const roi = calcularRoi(params);
	const paybackMeses = calcularPaybackMeses(params);
	const vpl = calcularVpl(params);
	const tir = calcularTir(params);

	const viavel = vpl > 0 && (paybackMeses === null || paybackMeses <= prazoMeses);
	const resumoExecutivo = viavel
		? `Investimento de R$ ${investimentoInicial.toLocaleString("pt-BR")} se paga em ${paybackMeses ? paybackMeses.toFixed(1) : "—"} mês(es), com VPL positivo de R$ ${vpl.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} no prazo de ${prazoMeses} meses. Recomendação: viável.`
		: `Investimento de R$ ${investimentoInicial.toLocaleString("pt-BR")} não se paga dentro do prazo de ${prazoMeses} meses (VPL ${vpl >= 0 ? "positivo" : "negativo"} de R$ ${vpl.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}). Recomendação: revisar premissas antes de aprovar.`;

	return {
		roi: Number(roi.toFixed(2)),
		paybackMeses: paybackMeses === null ? null : Number(paybackMeses.toFixed(2)),
		vpl: Number(vpl.toFixed(2)),
		tir: tir === null ? null : Number((tir * 100).toFixed(2)),
		viavel,
		resumoExecutivo,
	};
}

module.exports = { calcularRoi, calcularPaybackMeses, calcularVpl, calcularTir, calcularBusinessCase };

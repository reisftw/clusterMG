export const NOMES_MESES = [
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

export const NOMES_MESES_CURTOS = [
	"Jan",
	"Fev",
	"Mar",
	"Abr",
	"Mai",
	"Jun",
	"Jul",
	"Ago",
	"Set",
	"Out",
	"Nov",
	"Dez",
];

export function normalizarNomeMes(mes) {
	return String(mes || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase();
}

export function obterIndiceMes(mes) {
	if (typeof mes === "number") {
		return mes >= 1 && mes <= 12 ? mes - 1 : mes;
	}

	const normalizado = normalizarNomeMes(mes);
	return NOMES_MESES.findIndex(
		(nome) => normalizarNomeMes(nome) === normalizado,
	);
}

export function obterNomeMes(indice, options = {}) {
	const nomes = options.curto ? NOMES_MESES_CURTOS : NOMES_MESES;
	return nomes[indice] ?? "";
}

export function obterMesAtual(options = {}) {
	const data = options.data ?? new Date();
	return obterNomeMes(data.getMonth(), options);
}

export function obterMesesAnteriores(mes, quantidade) {
	const indice = obterIndiceMes(mes);
	if (indice < 0 || quantidade <= 0) return [];

	return Array.from({ length: quantidade }, (_, posicao) => {
		const alvo = indice - quantidade + posicao;
		return alvo >= 0 ? NOMES_MESES[alvo] : null;
	}).filter(Boolean);
}

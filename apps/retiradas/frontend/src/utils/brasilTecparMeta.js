export const BRASIL_TECPAR_META_PERCENT = 65;

export function calcularMetaBrasilTecpar({
	cancelamentos = 0,
	totalOS = 0,
} = {}) {
	const totalCancelamentos = Number(cancelamentos || 0);
	const realizado = Number(totalOS || 0);
	const meta =
		totalCancelamentos > 0
			? Math.round(totalCancelamentos * (BRASIL_TECPAR_META_PERCENT / 100))
			: 0;
	const percentAchieved =
		meta > 0 ? Number(((realizado / meta) * 100).toFixed(1)) : 0;

	return {
		percent: BRASIL_TECPAR_META_PERCENT,
		meta,
		realizado,
		falta: Math.max(0, meta - realizado),
		percentAchieved,
		atingiu: meta > 0 && realizado >= meta,
	};
}

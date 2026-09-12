import { NOMES_MESES } from "../../../utils/mes";
import { buildMetaDiariaSchedule } from "../../../utils/metasProjection";
import { isDiaUtil } from "./diasUteis";
import { buscarFeriadosNacionais } from "./feriados";

export async function calcRitmo(d, month, feriadosInput = null) {
	const year = Number(d?.ano || d?.year) || new Date().getFullYear();
	// Extraido pra achado javascript:S3358 (ternario aninhado).
	let feriadosSet;
	if (feriadosInput instanceof Set) feriadosSet = feriadosInput;
	else if (Array.isArray(feriadosInput)) feriadosSet = new Set(feriadosInput);
	else feriadosSet = await buscarFeriadosNacionais(year);
	const { metaDiariaMedia } = buildMetaDiariaSchedule({
		month,
		meta: d.meta,
		feriadosSet,
		year,
	});
	const metaDiaria = Math.ceil(metaDiariaMedia);

	const raw = d.rawDays || [];
	let lastActive = 0;
	raw.forEach((r, i) => {
		if (r.totalDia > 0) lastActive = i;
	});

	const diasComDados = raw
		.slice(0, lastActive + 1)
		.filter((r) => isDiaUtil(month, r.dia, feriadosSet, year));
	if (diasComDados.length === 0) return null;

	const totalFeito = diasComDados.reduce((s, r) => s + r.totalDia, 0);
	const media = totalFeito / diasComDados.length;
	const necessario = metaDiaria;
	const ratio = necessario > 0 ? media / necessario : 1;

	const monthIdx = NOMES_MESES.indexOf(month);
	const hoje = new Date();
	const mesAtual = hoje.getMonth() === monthIdx && hoje.getFullYear() === year;

	let status = "ok",
		badge = "No Ritmo ✅";
	if (ratio < 0.75) {
		status = "danger";
		badge = "Ritmo Critico 🚨";
	} else if (ratio < 0.9) {
		status = "warn";
		badge = "Atencao ⚠️";
	}

	return {
		media: Math.round(media * 10) / 10,
		necessario: metaDiaria,
		ratio: Math.round(ratio * 100),
		status,
		badge,
		diasAnalisados: diasComDados.length,
		mesAtual,
	};
}

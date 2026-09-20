// hooks/useAgentes.js
import { useMemo } from "react";
import { useDashboardData } from "./useDashboardData";

function normalizeDaily(totalDaily) {
	if (Array.isArray(totalDaily))
		return totalDaily.map((v) => Math.round(Number(v) || 0));
	if (totalDaily && typeof totalDaily === "object") {
		return Object.entries(totalDaily)
			.sort((a, b) => Number(a[0]) - Number(b[0]))
			.map(([, v]) => Math.round(Number(v) || 0));
	}
	return [];
}

function recalcPcts(data) {
	const out = { ...data };
	for (const month of Object.keys(out)) {
		const d = out[month];
		if (!d) continue;
		d.cidades = Array.isArray(d.cidades) ? d.cidades : [];
		d.totalDaily = normalizeDaily(d.totalDaily);

		d.cidades.forEach((cidade) => {
			const realizado = Math.round(Number(cidade.realizado) || 0);
			const cancelamentos = Math.round(Number(cidade.cancelamentos) || 0);
			const meta80 = Math.round(Number(cidade.meta80) || 0);
			cidade.realizado = realizado;
			cidade.cancelamentos = cancelamentos;
			cidade.meta80 = meta80;
			cidade.falta = Math.max(0, meta80 - realizado);
			cidade.pct =
				cancelamentos > 0
					? Number(((realizado / cancelamentos) * 100).toFixed(1))
					: 0;
		});

		d.cidadesRanking = [...d.cidades].sort((a, b) => b.realizado - a.realizado);
		const dailySum = d.totalDaily.reduce((acc, v) => acc + (Number(v) || 0), 0);
		d.totalRealizado =
			dailySum > 0 ? dailySum : Math.round(Number(d.totalRealizado) || 0);
		d.totalMeta = Math.round(Number(d.totalMeta) || 0);
		d.totalCancelamentos = Math.round(Number(d.totalCancelamentos) || 0);
		d.totalFalta = Math.max(0, d.totalMeta - d.totalRealizado);
		d.percentAchieved =
			d.totalCancelamentos > 0
				? Number(((d.totalRealizado / d.totalCancelamentos) * 100).toFixed(1))
				: 0;
		d.status =
			d.percentAchieved >= 80
				? "Meta atingida!"
				: `Faltam ${Math.max(0, d.totalFalta)} retiradas`;
	}
	return out;
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveFbStatus(error, loading) {
	if (error) return "Erro ao carregar dados";
	return loading ? "Carregando..." : "Sincronizado";
}

export function useAgentes(enabled = true) {
	const { data, loading, error } = useDashboardData();

	const allData = useMemo(() => {
		if (!enabled || !data?.painel?.agentes?.result) return {};
		return recalcPcts(data.painel.agentes.result);
	}, [data, enabled]);

	const lastUpdate = useMemo(
		() => data?.painel?.agentes?.meta?.lastUpdate || "",
		[data],
	);

	return {
		allData,
		loading: enabled ? loading : false,
		fbStatus: resolveFbStatus(error, loading),
		lastUpdate,
	};
}

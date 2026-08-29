import { useCallback, useEffect, useState } from "react";
import {
	buscarAgentes,
	buscarAuditoriaMes,
	buscarHistoricoCidade,
} from "../services/metasAuditoriaService";

function normalizaTexto(valor) {
	return String(valor ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ")
		.toUpperCase();
}

const MESES = [
	"Janeiro",
	"Fevereiro",
	"Marco",
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

export function getCriticidade(pct, total) {
	if (total === 0) return { label: "Sem retirada", cor: "red", nivel: 0 };
	if (pct >= 80) return { label: "Na meta", cor: "green", nivel: 3 };
	if (pct >= 60) return { label: "Em melhora", cor: "yellow", nivel: 2 };
	if (pct >= 30) return { label: "Critica", cor: "orange", nivel: 1 };
	return { label: "Extremamente critica", cor: "red", nivel: 0 };
}

export const useMetasAuditoria = (mesSelecionado) => {
	const [cidades, setCidades] = useState([]);
	const [agentes, setAgentes] = useState({});
	const [loading, setLoading] = useState(true);

	const carregar = useCallback(async () => {
		setLoading(true);
		try {
			const [dadosMes, mapa] = await Promise.all([
				buscarAuditoriaMes(mesSelecionado),
				buscarAgentes(),
			]);

			const enriquecidas = dadosMes.map((c) => {
				const key = normalizaTexto(c.cidade);
				const agente = mapa[key] ?? null;
				const pct = c.meta > 0 ? (c.total / c.meta) * 100 : 0;
				return {
					...c,
					pct: Number.parseFloat(pct.toFixed(1)),
					critica: getCriticidade(pct, c.total),
					agente,
				};
			});

			enriquecidas.sort((a, b) => a.pct - b.pct);
			setCidades(enriquecidas);
			setAgentes(mapa);
		} catch (e) {
			console.error("useMetasAuditoria:", e);
		} finally {
			setLoading(false);
		}
	}, [mesSelecionado]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const buscarHistorico = useCallback(async (cidade) => {
		const key = normalizaTexto(cidade).replace(/\s+/g, "_");
		return buscarHistoricoCidade(key);
	}, []);

	return { cidades, agentes, loading, carregar, buscarHistorico };
};

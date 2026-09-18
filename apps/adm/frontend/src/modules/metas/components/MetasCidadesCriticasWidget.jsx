import { AlertTriangle, Skull, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getInternalSnapshotSlice,
	INTERNAL_STATIC_DATA_UPDATED_EVENT,
	SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import {
	buscarAuditoriaAgentes,
	deduplicarCidadesAuditoria,
} from "../services/metasAuditoriaService";

const MONTHORDER = [
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

function getEficiencia(total, cancelamentos) {
	const totalNum = Number(total || 0);
	const cancelNum = Number(cancelamentos || 0);
	const base = totalNum + cancelNum;

	if (base <= 0) return 0;
	return Number.parseFloat(((totalNum / base) * 100).toFixed(1));
}

const MetasCidadesCriticasWidget = () => {
	const [cidades, setCidades] = useState([]);
	const [loading, setLoading] = useState(true);
	const [mes, setMes] = useState("");

	useEffect(() => {
		let active = true;
		const VERSION_KEY = "internal-static-data-version";

		const carregar = async (force = false) => {
			setLoading(true);
			try {
				const mesAtual = MONTHORDER[new Date().getMonth()];
				if (!active) return;
				setMes(mesAtual);

				const snapshot = await getInternalSnapshotSlice(
					SNAPSHOT_DOMAINS.DASHBOARD,
					(payload) => payload?.metas?.auditoriaAgentes ?? null,
					{ force },
				);
				let data =
					snapshot?.mes === mesAtual && Array.isArray(snapshot?.cidades)
						? snapshot.cidades
						: [];

				if (data.length === 0) {
					data = await buscarAuditoriaAgentes(mesAtual, force);
				}

				if (data.length === 0) {
					if (!active) return;
					setCidades([]);
					return;
				}

				const extremas = deduplicarCidadesAuditoria(data)
					.map((cidade) => ({
						...cidade,
						eficiencia: getEficiencia(cidade.total, cidade.cancelamentos),
					}))
					.filter((cidade) => Number(cidade.eficiencia) < 30)
					.sort((a, b) => a.eficiencia - b.eficiencia);

				if (!active) return;
				setCidades(extremas);
			} catch (error) {
				console.error(error);
			} finally {
				if (active) setLoading(false);
			}
		};

		carregar();

		const handleStaticDataUpdated = () => {
			carregar(true);
		};

		const handleStorageChange = (event) => {
			if (event.key !== VERSION_KEY) return;
			carregar(true);
		};

		window.addEventListener(
			INTERNAL_STATIC_DATA_UPDATED_EVENT,
			handleStaticDataUpdated,
		);
		window.addEventListener("storage", handleStorageChange);

		return () => {
			active = false;
			window.removeEventListener(
				INTERNAL_STATIC_DATA_UPDATED_EVENT,
				handleStaticDataUpdated,
			);
			window.removeEventListener("storage", handleStorageChange);
		};
	}, []);

	if (loading || cidades.length === 0) return null;

	return (
		<div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
			<div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border-b border-red-200">
				<Skull size={16} className="text-red-500" />
				<span className="text-sm font-bold text-red-700">
					Cidades Extremamente Criticas (Agente Autorizado)
				</span>
				<span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
					{cidades.length}
				</span>
				<span className="text-xs text-red-400 font-medium">{mes}</span>
			</div>

			<div className="flex items-center gap-2 px-3 py-2 bg-red-100 border-b border-red-200">
				<AlertTriangle size={13} className="text-red-600 shrink-0" />
				<p className="text-xs text-red-600 font-semibold">
					Eficiencia abaixo de 30% - acionar o juridico
				</p>
			</div>

			<ul className="divide-y divide-gray-50">
				{cidades.map((cidade, index) => (
					<li
						key={cidade.cidade}
						className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-red-50/40 transition-colors"
					>
						<span className="text-xs font-bold text-red-300 w-5 shrink-0 text-center">
							{index + 1}
						</span>

						<div className="flex-1 min-w-0">
							<p className="text-[13px] font-semibold text-gray-800 truncate leading-4">
								{cidade.cidade}
							</p>
							<p className="text-[11px] text-gray-400 leading-4">
								{cidade.total} O.S feitas · {cidade.cancelamentos} cancelamentos
							</p>
						</div>

						<div className="text-right shrink-0">
							<span className="text-[13px] font-bold text-red-600">
								{cidade.eficiencia}%
							</span>
							<div className="w-16 h-1.5 bg-red-100 rounded-full mt-1 overflow-hidden">
								<div
									className="h-full bg-red-500 rounded-full transition-all"
									style={{ width: `${Math.min(cidade.eficiencia, 100)}%` }}
								/>
							</div>
						</div>

						<TrendingDown size={14} className="text-red-400 shrink-0" />
					</li>
				))}
			</ul>
		</div>
	);
};

export default MetasCidadesCriticasWidget;

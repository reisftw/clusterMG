import { ChevronDown, ChevronUp, History } from "lucide-react";
import React, { useState } from "react";
import Spinner from "../../components/ui/Spinner";
import { resolveVpsDate } from "../../services/vpsDate";
import { useMapaHistorico } from "./hooks/useMapaHistorico";

function formatarData(ts) {
	if (!ts) return "—";
	const d = resolveVpsDate(ts);
	if (!d) return "--";
	return d.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatarPeriodo(inicio, fim) {
	if (!inicio || !fim) return "Período não informado";
	const fmt = (str) => new Date(str + "T12:00:00").toLocaleDateString("pt-BR");
	return `${fmt(inicio)} até ${fmt(fim)}`;
}

function HistoricoCard({ item }) {
	const [aberto, setAberto] = useState(false);

	const regionais = Object.entries(item.totaisPorRegional || {}).sort(
		(a, b) => b[1] - a[1],
	);

	const max = regionais[0]?.[1] || 1;

	const CORES = [
		"#3b82f6",
		"#6366f1",
		"#8b5cf6",
		"#a855f7",
		"#ec4899",
		"#f97316",
		"#eab308",
		"#10b981",
	];

	return (
		<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
			<div
				className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-all"
				onClick={() => setAberto(!aberto)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setAberto(!aberto);
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div className="flex items-center gap-4">
					<div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
						<History size={18} className="text-blue-500" />
					</div>
					<div>
						<p className="text-sm font-bold text-gray-900">
							{formatarData(item.data)}
						</p>
						<p className="text-xs text-blue-500 font-medium mt-0.5">
							📅 {formatarPeriodo(item.periodoInicio, item.periodoFim)}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className="text-right">
						<p className="text-2xl font-extrabold text-blue-600">
							{item.totalOS?.toLocaleString("pt-BR")}
						</p>
						<p className="text-xs text-gray-400">O.S em aberto</p>
					</div>
					{aberto ? (
						<ChevronUp size={16} className="text-gray-400" />
					) : (
						<ChevronDown size={16} className="text-gray-400" />
					)}
				</div>
			</div>

			{aberto && (
				<div className="border-t border-gray-100 px-5 py-4">
					<p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
						Distribuição por Regional
					</p>
					<div className="flex flex-col gap-2.5">
						{regionais.map(([regional, total], idx) => (
							<div key={regional} className="flex items-center gap-3">
								<span className="text-xs font-medium text-gray-600 w-36 truncate shrink-0">
									{regional}
								</span>
								<div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
									<div
										className="h-full rounded-full transition-all duration-500"
										style={{
											width: `${(total / max) * 100}%`,
											background: CORES[idx % CORES.length],
										}}
									/>
								</div>
								<span className="text-xs font-bold text-gray-900 w-8 text-right shrink-0">
									{total}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export default function MapaHistoricoPage() {
	const { historico, loading } = useMapaHistorico();

	return (
		<div className="p-6 max-w-[900px] mx-auto">
			<div className="mb-6">
				<h2 className="text-xl font-bold text-gray-900">
					Histórico de Uploads
				</h2>
				<p className="text-xs text-gray-400 mt-1">
					Cada entrada representa um upload de planilha com o snapshot das O.S
					abertas naquele momento.
				</p>
			</div>

			{loading ? (
				<div className="flex justify-center py-20">
					<Spinner />
				</div>
			) : historico.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<span className="text-5xl mb-4">📭</span>
					<p className="text-gray-600 font-semibold">Nenhum histórico ainda</p>
					<p className="text-gray-400 text-sm mt-1">
						Importe uma planilha na página do Mapa para começar
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{historico.map((item) => (
						<HistoricoCard key={item.id} item={item} />
					))}
				</div>
			)}
		</div>
	);
}

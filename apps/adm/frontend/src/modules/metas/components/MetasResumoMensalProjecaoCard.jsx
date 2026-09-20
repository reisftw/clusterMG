import { AlertTriangle, CheckCircle } from "lucide-react";

const MetasResumoMensalProjecaoCard = ({ mes, projecao }) => {
	if (!projecao) return null;

	const {
		ritmoAtual,
		diasRestantes,
		projecaoFinal,
		pctProjetado,
		bateAMeta,
		faltaOuSobra,
		diasAmostra,
		ultimoDiaComDados,
	} = projecao;

	return (
		<div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center gap-2">
				<div
					className={`flex h-8 w-8 items-center justify-center rounded-lg ${bateAMeta ? "bg-green-50" : "bg-amber-50"}`}
				>
					{bateAMeta ? (
						<CheckCircle size={16} className="text-green-600" />
					) : (
						<AlertTriangle size={16} className="text-amber-500" />
					)}
				</div>
				<div>
					<p className="text-xs font-semibold uppercase text-gray-400">
						Projecao de Fechamento
					</p>
					<p className="text-sm font-bold text-gray-900">{mes} 2026</p>
				</div>
			</div>

			<div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
					<p className="mb-1 text-[11px] font-semibold uppercase text-gray-400">
						Ritmo atual
					</p>
					<p className="text-lg font-extrabold text-gray-800">
						{ritmoAtual}{" "}
						<span className="text-xs font-normal text-gray-400">O.S/dia</span>
					</p>
					<p className="mt-0.5 text-[10px] text-gray-400">
						ultimos {diasAmostra} dias uteis
					</p>
				</div>
				<div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
					<p className="mb-1 text-[11px] font-semibold uppercase text-gray-400">
						Dias uteis restantes
					</p>
					<p className="text-lg font-extrabold text-gray-800">
						{diasRestantes}{" "}
						<span className="text-xs font-normal text-gray-400">dias</span>
					</p>
					<p className="mt-0.5 text-[10px] text-gray-400">
						apos o dia {ultimoDiaComDados || 0}
					</p>
				</div>
				<div
					className={`rounded-xl border p-3 ${bateAMeta ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}
				>
					<p
						className={`mb-1 text-[11px] font-semibold uppercase ${bateAMeta ? "text-green-600" : "text-red-500"}`}
					>
						Projecao final
					</p>
					<p
						className={`text-lg font-extrabold ${bateAMeta ? "text-green-700" : "text-red-600"}`}
					>
						{projecaoFinal.toLocaleString("pt-BR")}{" "}
						<span className="text-xs font-normal opacity-70">O.S</span>
					</p>
				</div>
				<div
					className={`rounded-xl border p-3 ${bateAMeta ? "border-green-100 bg-green-50" : "border-amber-100 bg-amber-50"}`}
				>
					<p
						className={`mb-1 text-[11px] font-semibold uppercase ${bateAMeta ? "text-green-600" : "text-amber-600"}`}
					>
						% Projetado
					</p>
					<p
						className={`text-lg font-extrabold ${bateAMeta ? "text-green-700" : "text-amber-600"}`}
					>
						{pctProjetado}%
					</p>
				</div>
			</div>

			<div
				className={`rounded-lg px-3 py-2 text-xs font-semibold ${bateAMeta ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
			>
				{bateAMeta
					? `✅ No ritmo atual, o mes deve fechar com +${faltaOuSobra.toLocaleString("pt-BR")} O.S acima da meta.`
					: `⚠️ No ritmo atual, o mes deve fechar ${Math.abs(faltaOuSobra).toLocaleString("pt-BR")} O.S abaixo da meta. E necessario acelerar.`}
			</div>
		</div>
	);
};

export default MetasResumoMensalProjecaoCard;

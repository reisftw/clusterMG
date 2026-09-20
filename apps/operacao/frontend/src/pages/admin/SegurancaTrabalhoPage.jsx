import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, HardHat, ShieldAlert } from "lucide-react";
import { fetchSstDashboard } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";

// Fase B do dominio Seguranca do Trabalho: so o cockpit inicial, sem
// dados fabricados. A central de protocolos (Fase C) e as demais telas
// do menu (Protocolos, APRs, Quase Acidentes...) entram nas proximas
// fases — o menu so ganha o item quando a pagina de fato existir.
export default function SegurancaTrabalhoPage() {
	const [summary, setSummary] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		fetchSstDashboard()
			.then((data) => active && setSummary(data))
			.catch((err) => active && setError(err?.message || "Não foi possível carregar o painel de Segurança do Trabalho."))
			.finally(() => active && setLoading(false));
		return () => {
			active = false;
		};
	}, []);

	if (loading) return <Spinner fullScreen />;

	const cards = [
		{ key: "open", label: "Protocolos abertos", value: summary?.openProtocols ?? 0, icon: ClipboardList, color: "blue" },
		{ key: "critical", label: "Críticos", value: summary?.criticalProtocols ?? 0, icon: ShieldAlert, color: "red" },
		{ key: "overdueActions", label: "Ações vencidas", value: summary?.overdueActions ?? 0, icon: AlertTriangle, color: "amber" },
		{ key: "nearMisses", label: "Quase acidentes no período", value: summary?.nearMissesInPeriod ?? 0, icon: HardHat, color: "purple" },
	];

	const hasAttention = cards.some((card) => card.key !== "nearMisses" && card.value > 0);

	return (
		<div className="space-y-6">
			<header className="flex items-center gap-3">
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
					<HardHat size={24} />
				</span>
				<div>
					<h1 className="text-2xl font-black text-slate-950">Segurança do Trabalho</h1>
					<p className="text-sm font-semibold text-slate-500">Controle de riscos, protocolos, inspeções e tratativas.</p>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{cards.map((card) => {
					const Icon = card.icon;
					const colorMap = {
						blue: "bg-blue-50 text-blue-600",
						red: "bg-red-50 text-red-600",
						amber: "bg-amber-50 text-amber-600",
						purple: "bg-purple-50 text-purple-600",
					};
					return (
						<div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
							<span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[card.color]}`}>
								<Icon size={20} />
							</span>
							<p className="mt-3 text-3xl font-black text-slate-950">{card.value}</p>
							<p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
						</div>
					);
				})}
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<h2 className="text-lg font-black text-slate-950">Atenção necessária</h2>
				{hasAttention ? (
					<div className="mt-3 space-y-2">
						{cards.filter((card) => card.key !== "nearMisses" && card.value > 0).map((card) => (
							<div key={card.key} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
								<AlertTriangle size={16} /> {card.value} {card.label.toLowerCase()}
							</div>
						))}
					</div>
				) : (
					<div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
						<CheckCircle2 size={16} /> Nenhuma pendência crítica neste momento.
					</div>
				)}
			</section>

			<section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
				<p className="text-sm font-bold text-slate-400">A Central de Protocolos, APRs, Quase Acidentes e demais telas deste módulo chegam nas próximas etapas.</p>
			</section>
		</div>
	);
}

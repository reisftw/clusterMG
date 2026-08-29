import { CalendarX, Clock, Map } from "lucide-react";

const CARDS = [
	{
		key: "total",
		label: "O.S em Aberto",
		icon: Map,
		color: "text-blue-600",
		bg: "bg-blue-50",
		border: "border-blue-100",
		accent: "from-blue-500 to-blue-400",
	},
	{
		key: "pendente",
		label: "Pendentes",
		icon: Clock,
		color: "text-purple-600",
		bg: "bg-purple-50",
		border: "border-purple-100",
		accent: "from-purple-500 to-purple-400",
	},
	{
		key: "aguardando",
		label: "Aguardando Agendamento",
		icon: CalendarX,
		color: "text-orange-600",
		bg: "bg-orange-50",
		border: "border-orange-100",
		accent: "from-orange-500 to-orange-400",
	},
];

export default function MapaKPICards({ ordens = [], variant = "classic" }) {
	const kpis = ordens.reduce(
		(acc, os) => {
			acc.total++;
			if (os.status === "Pendente") acc.pendente++;
			if (os.status === "Aguardando Agendamento") acc.aguardando++;
			return acc;
		},
		{ total: 0, pendente: 0, aguardando: 0 },
	);

	const isModern = variant === "modern";

	return (
		<div
			className={
				isModern
					? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
					: "grid grid-cols-1 sm:grid-cols-3 gap-4"
			}
		>
			{CARDS.map(({ key, label, icon: Icon, color, bg, border, accent }) => (
				<div
					key={key}
					className={
						isModern
							? `rounded-lg border ${border} bg-white p-5 shadow-card transition-shadow hover:shadow-md`
							: `bg-white rounded-2xl border ${border} p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow`
					}
				>
					{isModern ? (
						<>
							<div className="mb-4 flex items-start justify-between gap-3">
								<div
									className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${bg}`}
								>
									<Icon size={21} className={color} />
								</div>
								<span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">
									O.S
								</span>
							</div>
							<p className="text-3xl font-black text-slate-950">
								{kpis[key].toLocaleString("pt-BR")}
							</p>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								{label}
							</p>
							<div
								className={`mt-4 h-1 rounded-full bg-gradient-to-r ${accent} opacity-70`}
							/>
						</>
					) : (
						<>
							<div
								className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}
							>
								<Icon size={22} className={color} />
							</div>
							<div>
								<p className="text-2xl font-extrabold text-gray-900">
									{kpis[key].toLocaleString("pt-BR")}
								</p>
								<p className="text-xs text-gray-500 font-medium mt-0.5">
									{label}
								</p>
							</div>
							<div
								className={`ml-auto w-1 h-10 rounded-full bg-gradient-to-b ${accent} opacity-60`}
							/>
						</>
					)}
				</div>
			))}
		</div>
	);
}

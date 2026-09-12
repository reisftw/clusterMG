import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function todayKey() {
	const hoje = new Date();
	return [
		hoje.getFullYear(),
		String(hoje.getMonth() + 1).padStart(2, "0"),
		String(hoje.getDate()).padStart(2, "0"),
	].join("-");
}

const formatMonthTitle = (date) =>
	date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

// Mesmo padrao de AgendamentosPage.jsx (buildCalendarDays): grid continuo de
// 42 celulas (6 semanas), incluindo os dias do mes anterior/seguinte que
// completam a primeira/ultima semana, em vez de celulas vazias.
function buildCalendarDays(monthDate) {
	const year = monthDate.getFullYear();
	const month = monthDate.getMonth();
	const first = new Date(year, month, 1);
	const start = new Date(first);
	start.setDate(first.getDate() - first.getDay());

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, "0"),
			String(date.getDate()).padStart(2, "0"),
		].join("-");
		return {
			key,
			day: date.getDate(),
			currentMonth: date.getMonth() === month,
		};
	});
}

// Extraido pra achado javascript:S3358 (ternario aninhado) — mesmo padrao
// usado em AgendamentosPage.jsx.
function resolveCalendarDayClass(isToday, currentMonth) {
	if (isToday) return "border-blue-300 bg-blue-50";
	return currentMonth
		? "border-gray-100 bg-gray-50 hover:bg-blue-50"
		: "border-gray-50 bg-gray-50/50 text-gray-300";
}

// resumoPorEmpresaDia vem de getResumoPorEmpresaDia (backend): uma linha por
// dia+empresa. Aqui so precisamos do total por dia pro card do calendario.
function buildTotaisPorDia(resumoPorEmpresaDia) {
	const map = {};
	for (const item of resumoPorEmpresaDia || []) {
		const chave = String(item.dia || "").slice(0, 10);
		if (!chave) continue;
		map[chave] = (map[chave] || 0) + Number(item.total || 0);
	}
	return map;
}

export default function MovimentacoesCalendario({
	resumoPorEmpresaDia,
	mes,
	onMesChange,
	onSelecionarDia,
}) {
	const dias = useMemo(() => buildCalendarDays(mes), [mes]);
	const totaisPorDia = useMemo(
		() => buildTotaisPorDia(resumoPorEmpresaDia),
		[resumoPorEmpresaDia],
	);
	const hojeKey = todayKey();

	return (
		<div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
						<CalendarDays size={16} className="text-blue-600" />
					</div>
					<p className="text-sm font-bold capitalize text-gray-900">
						{formatMonthTitle(mes)}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => onMesChange(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
						className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
						title="Mês anterior"
					>
						<ChevronLeft size={15} />
					</button>
					<button
						type="button"
						onClick={() => onMesChange(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
						className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
						title="Próximo mês"
					>
						<ChevronRight size={15} />
					</button>
				</div>
			</div>

			<div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-gray-400">
				{DIAS_SEMANA.map((dia) => (
					<div key={dia} className="py-1">
						{dia}
					</div>
				))}
			</div>

			<div className="mt-1 grid grid-cols-7 gap-1">
				{dias.map((dia) => {
					const total = totaisPorDia[dia.key] || 0;
					const isToday = dia.key === hojeKey;
					return (
						<button
							key={dia.key}
							type="button"
							onClick={() => {
								if (!total) return;
								onSelecionarDia(dia.key);
							}}
							disabled={!total}
							className={`min-h-16 rounded-xl border p-2 text-left transition-colors disabled:cursor-default ${resolveCalendarDayClass(isToday, dia.currentMonth)} ${total ? "cursor-pointer" : ""}`}
						>
							<div className="flex items-center justify-between gap-1">
								<span
									className={`text-xs font-semibold ${
										dia.currentMonth ? "text-gray-700" : "text-gray-300"
									}`}
								>
									{dia.day}
								</span>
								{total > 0 ? (
									<span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
										{total}
									</span>
								) : null}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

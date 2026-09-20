import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import ModalShell from "./ModalShell";

// Mesmo padrao visual/funcional de AgendamentosCalendar
// (src/modules/agendamentos/components/AgendamentosPage.jsx do
// Retiradas) — pedido explicito do usuario ("igual o do agendamento").
// Generico: recebe os itens ja resolvidos e uma funcao pra extrair a
// chave de data (YYYY-MM-DD) de cada um; quem usa decide como renderizar
// cada item na lista do dia.
function pad2(value) {
	return String(value).padStart(2, "0");
}

function dateKey(date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayKey() {
	return dateKey(new Date());
}

function buildCalendarDays(monthDate) {
	const year = monthDate.getFullYear();
	const month = monthDate.getMonth();
	const first = new Date(year, month, 1);
	const start = new Date(first);
	start.setDate(first.getDate() - first.getDay());

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		return { key: dateKey(date), date, day: date.getDate(), currentMonth: date.getMonth() === month };
	});
}

function formatMonthTitle(date) {
	return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDiaTitle(key) {
	return new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

const PAGE_SIZE = 10;

export default function RotCalendar({ items, getDateKey, month, onMonthChange, renderItem, emptyLabel = "Nenhum item", dotColor = "bg-blue-500", badgeColor = "bg-blue-600" }) {
	const [diaSelecionado, setDiaSelecionado] = useState(null);
	const [page, setPage] = useState(1);

	const dias = useMemo(() => buildCalendarDays(month), [month]);
	const porData = useMemo(() => {
		const grouped = {};
		for (const item of items || []) {
			const key = getDateKey(item);
			if (!key) continue;
			(grouped[key] ||= []).push(item);
		}
		return grouped;
	}, [items, getDateKey]);

	const itensSelecionados = diaSelecionado ? porData[diaSelecionado] || [] : [];
	const totalPages = Math.max(1, Math.ceil(itensSelecionados.length / PAGE_SIZE));
	const paginaAtual = Math.min(page, totalPages);
	const itensPaginados = itensSelecionados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

	return (
		<>
			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
							<CalendarDays size={16} className="text-blue-600" />
						</span>
						<p className="text-sm font-black capitalize text-slate-900">{formatMonthTitle(month)}</p>
					</div>
					<div className="flex items-center gap-1">
						<button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rot-btn-tactile rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Mês anterior">
							<ChevronLeft size={15} />
						</button>
						<button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rot-btn-tactile rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Próximo mês">
							<ChevronRight size={15} />
						</button>
					</div>
				</div>

				<div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-400">
					{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => <div key={dia} className="py-1">{dia}</div>)}
				</div>

				<div className="mt-1 grid grid-cols-7 gap-1">
					{dias.map((dia) => {
						const itens = porData[dia.key] || [];
						const isToday = dia.key === todayKey();
						return (
							<button
								key={dia.key}
								type="button"
								onClick={() => {
									if (!itens.length) return;
									setDiaSelecionado(dia.key);
									setPage(1);
								}}
								disabled={!itens.length}
								className={`rot-btn-tactile min-h-16 rounded-xl border p-2 text-left transition-colors disabled:cursor-default ${
									isToday ? "border-blue-300 bg-blue-50" : dia.currentMonth ? "border-slate-100 bg-slate-50 hover:bg-blue-50" : "border-slate-50 bg-slate-50/50 text-slate-300"
								} ${itens.length ? "cursor-pointer" : ""}`}
							>
								<div className="flex items-center justify-between gap-1">
									<span className={`text-xs font-bold ${dia.currentMonth ? "text-slate-700" : "text-slate-300"}`}>{dia.day}</span>
									{itens.length ? <span className={`rounded-full ${badgeColor} px-1.5 py-0.5 text-[10px] font-black text-white`}>{itens.length}</span> : null}
								</div>
								<div className="mt-2 flex flex-wrap gap-1">
									{itens.slice(0, 3).map((item, index) => <span key={index} className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />)}
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{diaSelecionado ? (
				<ModalShell
					open
					title={formatDiaTitle(diaSelecionado)}
					description={`${itensSelecionados.length} registro(s)`}
					icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CalendarDays size={22} /></span>}
					onClose={() => setDiaSelecionado(null)}
					size="lg"
				>
					<div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
						{itensPaginados.length ? itensPaginados.map((item, index) => <div key={index}>{renderItem(item)}</div>) : (
							<p className="py-6 text-center text-sm font-bold text-slate-400">{emptyLabel}</p>
						)}
					</div>
					{itensSelecionados.length > PAGE_SIZE ? (
						<div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
							<p className="text-xs font-semibold text-slate-500">
								{(paginaAtual - 1) * PAGE_SIZE + 1}-{Math.min(paginaAtual * PAGE_SIZE, itensSelecionados.length)} de {itensSelecionados.length}
							</p>
							<div className="flex items-center gap-2">
								<button type="button" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={paginaAtual === 1} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Anterior</button>
								<span className="text-xs font-bold text-slate-500">{paginaAtual} / {totalPages}</span>
								<button type="button" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={paginaAtual === totalPages} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40">Próxima</button>
							</div>
						</div>
					) : null}
				</ModalShell>
			) : null}
		</>
	);
}

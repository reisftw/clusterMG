import {
	CalendarClock,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Copy,
	UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../router/routes";
import { STATUS_STYLES } from "../constants";
import { useAgendamentos } from "../hooks/useAgendamentos";

const StatusBadge = ({ status }) => (
	<span
		className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
			STATUS_STYLES[status] || "border-gray-200 bg-gray-100 text-gray-600"
		}`}
	>
		{status || "Aguardando dia"}
	</span>
);

const AgendamentosHojeCard = ({
	defaultOpen = false,
	featured = false,
	maxVisibleItems = 5,
}) => {
	const navigate = useNavigate();
	const { agendamentosHoje } = useAgendamentos();
	const [copiadoId, setCopiadoId] = useState(null);
	const [page, setPage] = useState(1);
	const [open, setOpen] = useState(defaultOpen);

	const ordenados = useMemo(
		() =>
			[...agendamentosHoje].sort((a, b) =>
				String(a?.turno || "").localeCompare(String(b?.turno || "")),
			),
		[agendamentosHoje],
	);
	const pageSize = featured ? maxVisibleItems : 10;
	const totalPages = Math.max(1, Math.ceil(ordenados.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const itens = useMemo(
		() => ordenados.slice((safePage - 1) * pageSize, safePage * pageSize),
		[ordenados, safePage, pageSize],
	);

	return (
		<div
			className={
				featured
					? "flex h-full min-h-[260px] flex-col rounded-lg border border-blue-200 bg-white p-5 shadow-card"
					: "flex flex-col rounded-lg border border-gray-100 bg-white p-5 shadow-sm"
			}
		>
			<div
				className={`flex items-center justify-between gap-3 ${open ? "mb-4" : ""}`}
			>
				<button
					type="button"
					onClick={() => setOpen((current) => !current)}
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
				>
					<div
						className={
							featured
								? "flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white"
								: "flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50"
						}
					>
						<CalendarClock
							size={featured ? 21 : 16}
							className={featured ? "" : "text-blue-600"}
						/>
					</div>
					<div className="min-w-0">
						<p
							className={
								featured
									? "truncate text-lg font-black text-slate-950"
									: "text-sm font-bold text-gray-900"
							}
						>
							Agendamentos de Hoje
						</p>
						<p className="text-xs font-semibold text-gray-400">
							{agendamentosHoje.length} item(s) para acompanhar
						</p>
					</div>
					<ChevronDown
						size={18}
						className={`ml-auto shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</button>
				{open && (
					<button
						type="button"
						onClick={() => navigate(ROUTES.AGENDAMENTOS)}
						className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-blue-600 hover:underline"
					>
						Ver todos <ChevronRight size={12} />
					</button>
				)}
			</div>

			{open &&
				(!itens.length ? (
					<p className="py-6 text-center text-sm text-gray-400">
						Nenhum agendamento para hoje.
					</p>
				) : (
					<>
						<ul className="space-y-2">
							{itens.map((item) => (
								<li
									key={item.id}
									className={
										featured
											? "rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50"
											: "rounded-xl bg-gray-50 p-3 transition-colors hover:bg-blue-50"
									}
								>
									<div className="mb-2 flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex min-w-0 items-center gap-1.5">
												<p className="truncate text-sm font-semibold text-gray-800">
													Codigo do Cliente: {item.codigo_cliente}
												</p>
												<button
													type="button"
													onClick={async () => {
														await navigator.clipboard?.writeText(
															item.codigo_cliente || "",
														);
														setCopiadoId(item.id);
														window.setTimeout(() => setCopiadoId(null), 1200);
													}}
													className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-white hover:text-blue-600"
													title="Copiar codigo do cliente"
												>
													<Copy size={12} />
												</button>
											</div>
											{copiadoId === item.id && (
												<p className="mt-0.5 text-[10px] font-semibold text-blue-600">
													Codigo copiado
												</p>
											)}
											<p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-400">
												<UserRound size={11} />
												{item.tecnico_nome || "-"}
											</p>
										</div>
										<StatusBadge status={item.status} />
									</div>
									<p className="flex items-center gap-1 text-xs font-semibold text-blue-600">
										<Clock size={11} />
										{item.turno || "-"}
									</p>
								</li>
							))}
						</ul>

						{ordenados.length > pageSize && (
							<div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
								<p className="text-xs text-gray-400">
									Pagina {safePage} de {totalPages}
								</p>
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() =>
											setPage((current) => Math.max(1, current - 1))
										}
										disabled={safePage === 1}
										className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
										title="Pagina anterior"
									>
										<ChevronLeft size={14} />
									</button>
									<button
										type="button"
										onClick={() =>
											setPage((current) => Math.min(totalPages, current + 1))
										}
										disabled={safePage === totalPages}
										className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
										title="Proxima pagina"
									>
										<ChevronRight size={14} />
									</button>
								</div>
							</div>
						)}
					</>
				))}
		</div>
	);
};

export default AgendamentosHojeCard;

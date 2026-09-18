import { Calendar, ChevronRight, MapPin, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../router/routes";
import { useAgenda } from "../../agenda/hooks/useAgenda";

const parseLocal = (str) => {
	if (!str) return null;
	const [y, m, d] = str.split("-").map(Number);
	return new Date(y, m - 1, d);
};

const formatCurto = (str) => {
	const d = parseLocal(str);
	return d
		? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
		: "—";
};

const TIPO_DOT = {
	Viagem: "bg-blue-500",
	Reuniao: "bg-purple-500",
	"Visita Tecnica": "bg-green-500",
	Treinamento: "bg-amber-500",
	Outro: "bg-gray-400",
};

const ParticipantesTooltip = ({ participantes }) => {
	const [show, setShow] = useState(false);
	if (!participantes?.length) return null;

	return (
		<div className="relative inline-flex items-center">
			<button
				type="button"
				onMouseEnter={() => setShow(true)}
				onMouseLeave={() => setShow(false)}
				className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
			>
				<Users size={12} />
				<span>{participantes.length}</span>
			</button>
			{show && (
				<div className="absolute bottom-full left-0 mb-2 z-20 bg-white border border-gray-100 rounded-xl shadow-lg p-3 min-w-[160px]">
					<p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">
						Participantes
					</p>
					<ul className="space-y-1.5">
						{participantes.map((p) => (
							<li key={p.id} className="flex items-center gap-2">
								<div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
									<span className="text-white text-[9px] font-bold">
										{p.nome.charAt(0)}
									</span>
								</div>
								<div>
									<p className="text-xs font-medium text-gray-800">
										{p.nome.split(" ").slice(0, 2).join(" ")}
									</p>
									{p.cargo && (
										<p className="text-[10px] text-gray-400">{p.cargo}</p>
									)}
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
};

const ProximasAgendas = () => {
	const { eventos } = useAgenda();
	const navigate = useNavigate();

	const proximos = useMemo(() => {
		const hoje = new Date();
		hoje.setHours(0, 0, 0, 0);
		return eventos
			.filter((e) => {
				const fim = parseLocal(e.data_fim || e.data_inicio);
				return fim >= hoje;
			})
			.sort((a, b) => parseLocal(a.data_inicio) - parseLocal(b.data_inicio))
			.slice(0, 4);
	}, [eventos]);

	return (
		<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between mb-5">
				<div className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
						<Calendar size={16} className="text-blue-600" />
					</div>
					<p className="text-sm font-bold text-gray-900">Proximas Agendas</p>
				</div>
				<button
					type="button"
					onClick={() => navigate(ROUTES.AGENDA)}
					className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
				>
					Ver todas <ChevronRight size={12} />
				</button>
			</div>

			{!proximos.length ? (
				<p className="text-sm text-gray-400 text-center py-6">
					Nenhum evento proximo.
				</p>
			) : (
				<ul className="space-y-2">
					{proximos.map((e) => {
						const isMultiDia = e.data_fim && e.data_fim !== e.data_inicio;
						return (
							<li
								key={e.id}
								className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors"
							>
								<div
									className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${TIPO_DOT[e.tipo] ?? "bg-gray-400"}`}
								/>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-semibold text-gray-800 truncate">
										{e.atividade}
									</p>
									<div className="flex items-center gap-3 mt-1 flex-wrap">
										{e.cidade && (
											<span className="flex items-center gap-1 text-xs text-gray-400">
												<MapPin size={10} /> {e.cidade}
											</span>
										)}
										<ParticipantesTooltip participantes={e.participantes} />
									</div>
								</div>
								<div className="text-right shrink-0">
									<p className="text-xs font-semibold text-blue-600">
										{formatCurto(e.data_inicio)}
									</p>
									{isMultiDia && (
										<p className="text-[10px] text-gray-400">
											→ {formatCurto(e.data_fim)}
										</p>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
};

export default ProximasAgendas;

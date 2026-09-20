import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

const COR_POR_CARGO = {
	"Tecnico I": { bg: "bg-blue-400", text: "text-blue-700", dot: "bg-blue-400" },
	"Tecnico II": {
		bg: "bg-blue-500",
		text: "text-blue-700",
		dot: "bg-blue-500",
	},
	"Tecnico III": {
		bg: "bg-blue-700",
		text: "text-blue-800",
		dot: "bg-blue-700",
	},
	"BackOffice I": {
		bg: "bg-purple-400",
		text: "text-purple-700",
		dot: "bg-purple-400",
	},
	"BackOffice II": {
		bg: "bg-purple-500",
		text: "text-purple-700",
		dot: "bg-purple-500",
	},
	"BackOffice III": {
		bg: "bg-purple-700",
		text: "text-purple-800",
		dot: "bg-purple-700",
	},
	"Lider Tecnico": {
		bg: "bg-orange-400",
		text: "text-orange-700",
		dot: "bg-orange-400",
	},
};

const COR_PADRAO = {
	bg: "bg-gray-400",
	text: "text-gray-600",
	dot: "bg-gray-400",
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
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

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveDiaCellClass(isHoje, temFerias) {
	if (isHoje) return "bg-blue-50 border-2 border-blue-300";
	return temFerias
		? "bg-orange-50 border border-orange-100"
		: "bg-gray-50 border border-gray-100 hover:bg-gray-100";
}

const toDateOrNull = (value) => {
	if (!value) return null;
	if (value?.toDate) return value.toDate();
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime()) ? null : date;
};

const getPrimeiroNome = (value) => {
	const nome = String(value || "").trim();
	return nome ? nome.split(" ")[0] : "Sem nome";
};

const FeriasCalendario = ({ ferias, colaboradores }) => {
	const hoje = new Date();
	const [mes, setMes] = useState(hoje.getMonth());
	const [ano, setAno] = useState(hoje.getFullYear());

	const colabMap = useMemo(() => {
		const map = {};
		colaboradores.forEach((colaborador) => {
			map[colaborador.id] = colaborador;
		});
		return map;
	}, [colaboradores]);

	const getCargo = (id) => colabMap[id]?.cargo ?? "";
	const getCor = (id) => COR_POR_CARGO[getCargo(id)] ?? COR_PADRAO;
	const getNome = (id) => colabMap[id]?.nome ?? id ?? "Sem nome";

	const diasNoMes = new Date(ano, mes + 1, 0).getDate();
	const primeiroDia = new Date(ano, mes, 1).getDay();

	const feriasPorDia = useMemo(() => {
		const map = {};

		ferias.forEach((item) => {
			if (item.status === "reprovado") return;

			const inicio = toDateOrNull(item.data_inicio);
			const fim = toDateOrNull(item.data_fim);
			if (!inicio || !fim) return;

			for (let diaNumero = 1; diaNumero <= diasNoMes; diaNumero += 1) {
				const dia = new Date(ano, mes, diaNumero);
				if (dia >= inicio && dia <= fim) {
					if (!map[diaNumero]) map[diaNumero] = [];
					map[diaNumero].push(item);
				}
			}
		});

		return map;
	}, [ano, diasNoMes, ferias, mes]);

	const navMes = (dir) => {
		const novo = mes + dir;
		if (novo < 0) {
			setMes(11);
			setAno((value) => value - 1);
			return;
		}
		if (novo > 11) {
			setMes(0);
			setAno((value) => value + 1);
			return;
		}
		setMes(novo);
	};

	const colaboradoresComFerias = useMemo(() => {
		const ids = new Set(
			Object.values(feriasPorDia)
				.flat()
				.map((item) => item.colaborador_id),
		);

		return [...ids]
			.map((id) => ({ id, ...colabMap[id] }))
			.filter((item) => item.nome || item.id);
	}, [colabMap, feriasPorDia]);

	const isHoje = (dia) =>
		dia === hoje.getDate() &&
		mes === hoje.getMonth() &&
		ano === hoje.getFullYear();

	const celulas = [
		...Array(primeiroDia).fill(null),
		...Array.from({ length: diasNoMes }, (_, index) => index + 1),
	];

	return (
		<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
			<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
				<button
					type="button"
					onClick={() => navMes(-1)}
					className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
				>
					<ChevronLeft size={18} />
				</button>
				<h3 className="text-base font-bold text-gray-900">
					{MESES[mes]} <span className="text-blue-600">{ano}</span>
				</h3>
				<button
					type="button"
					onClick={() => navMes(1)}
					className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
				>
					<ChevronRight size={18} />
				</button>
			</div>

			<div className="p-4">
				<div className="grid grid-cols-7 mb-2">
					{DIAS_SEMANA.map((diaSemana) => (
						<div
							key={diaSemana}
							className="text-center text-xs font-bold text-gray-400 uppercase tracking-wide py-1"
						>
							{diaSemana}
						</div>
					))}
				</div>

				<div className="grid grid-cols-7 gap-1">
					{celulas.map((dia, index) => {
						if (!dia) return <div key={`empty-${index}`} />;

						const feriasHoje = feriasPorDia[dia] ?? [];
						const temFerias = feriasHoje.length > 0;

						return (
							<div
								key={dia}
								className={`min-h-[64px] rounded-xl p-1.5 flex flex-col transition-colors ${resolveDiaCellClass(isHoje(dia), temFerias)}`}
							>
								<span
									className={`text-xs font-bold mb-1 ${isHoje(dia) ? "text-blue-600" : "text-gray-500"}`}
								>
									{dia}
								</span>

								<div className="flex flex-col gap-0.5">
									{feriasHoje.slice(0, 2).map((item) => {
										const cor = getCor(item.colaborador_id);
										const nome = getPrimeiroNome(getNome(item.colaborador_id));

										return (
											<div
												key={item.id}
												title={`${getNome(item.colaborador_id)} — ${getCargo(item.colaborador_id)}`}
												className={`${cor.bg} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate`}
											>
												{nome}
											</div>
										);
									})}

									{feriasHoje.length > 2 && (
										<span className="text-[9px] text-orange-500 font-bold px-1">
											+{feriasHoje.length - 2} mais
										</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{colaboradoresComFerias.length > 0 ? (
				<div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
					<p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
						Ferias neste mes
					</p>
					<div className="flex flex-wrap gap-2">
						{colaboradoresComFerias.map((colaborador) => {
							const cor = getCor(colaborador.id);
							return (
								<div
									key={colaborador.id}
									className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm"
								>
									<span
										className={`w-2 h-2 rounded-full ${cor.dot} shrink-0`}
									/>
									<span className="text-xs font-semibold text-gray-700">
										{getPrimeiroNome(colaborador.nome ?? colaborador.id)}
									</span>
									<span className="text-[10px] text-gray-400">
										{colaborador.cargo ?? ""}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			) : (
				<div className="px-5 py-4 border-t border-gray-100 text-center">
					<p className="text-xs text-gray-400">
						Nenhuma ferias registrada neste mes.
					</p>
				</div>
			)}
		</div>
	);
};

export default FeriasCalendario;

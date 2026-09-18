import {
	AlertTriangle,
	CheckCircle,
	FileText,
	RefreshCw,
	Search,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import RetorninhoLoader from "../../../components/ui/RetorninhoLoader";
import { useMetasAuditoria } from "../hooks/useMetasAuditoria";
import MetasAuditoriaRelatorio from "./MetasAuditoriaRelatorio";

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

const COR_MAP = {
	green: {
		bg: "bg-green-50",
		border: "border-green-200",
		text: "text-green-700",
		badge: "bg-green-100 text-green-700",
	},
	yellow: {
		bg: "bg-yellow-50",
		border: "border-yellow-200",
		text: "text-yellow-700",
		badge: "bg-yellow-100 text-yellow-700",
	},
	orange: {
		bg: "bg-orange-50",
		border: "border-orange-200",
		text: "text-orange-700",
		badge: "bg-orange-100 text-orange-700",
	},
	red: {
		bg: "bg-red-50",
		border: "border-red-200",
		text: "text-red-700",
		badge: "bg-red-100 text-red-700",
	},
};

const ICONE_MAP = {
	green: <CheckCircle size={16} className="text-green-500" />,
	yellow: <TrendingUp size={16} className="text-yellow-500" />,
	orange: <TrendingDown size={16} className="text-orange-500" />,
	red: <AlertTriangle size={16} className="text-red-500" />,
};

const FILTROS = [
	{ id: "todos", label: "Todas" },
	{ id: "red", label: "Criticas" },
	{ id: "orange", label: "Atencao" },
	{ id: "yellow", label: "Em melhora" },
	{ id: "green", label: "Na meta" },
	{ id: "sem", label: "Sem retirada" },
];

const MetasAuditoria = () => {
	const mesAtual = MESES[new Date().getMonth()];
	const [mes, setMes] = useState(mesAtual);
	const [filtro, setFiltro] = useState("todos");
	const [busca, setBusca] = useState("");
	const [cidadeSel, setCidadeSel] = useState(null);

	const { cidades, loading, carregar } = useMetasAuditoria(mes);

	const cidadesFiltradas = cidades.filter((c) => {
		const matchBusca = c.cidade.toLowerCase().includes(busca.toLowerCase());
		if (!matchBusca) return false;
		if (filtro === "todos") return true;
		if (filtro === "sem") return c.total === 0;
		if (filtro === "red") return c.critica.cor === "red" && c.total > 0;
		return c.critica.cor === filtro;
	});

	const resumo = {
		green: cidades.filter((c) => c.critica.cor === "green").length,
		yellow: cidades.filter((c) => c.critica.cor === "yellow").length,
		orange: cidades.filter((c) => c.critica.cor === "orange").length,
		red: cidades.filter((c) => c.total === 0 || c.critica.cor === "red").length,
	};

	if (loading)
		return (
			<div className="bg-white rounded-2xl border border-gray-100 p-14 text-center">
				<RetorninhoLoader
					compact
					title="Carregando auditoria..."
					description="O Retorninho esta analisando as cidades criticas."
				/>
			</div>
		);

	if (cidades.length === 0)
		return (
			<div className="bg-white rounded-2xl border border-gray-100 p-14 text-center">
				<AlertTriangle size={32} className="text-gray-200 mx-auto mb-3" />
				<p className="text-sm font-semibold text-gray-400">
					Nenhum dado de auditoria para {mes}.
				</p>
				<p className="text-xs text-gray-300 mt-1">
					Importe uma planilha para gerar a auditoria.
				</p>
			</div>
		);

	return (
		<div className="space-y-4">
			{/* Cards resumo */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				{[
					{ cor: "green", label: "Na meta", count: resumo.green },
					{ cor: "yellow", label: "Em melhora", count: resumo.yellow },
					{ cor: "orange", label: "Critica", count: resumo.orange },
					{
						cor: "red",
						label: "Ext. critica / Sem retirada",
						count: resumo.red,
					},
				].map(({ cor, label, count }) => {
					const c = COR_MAP[cor];
					return (
						<div
							key={cor}
							className={`${c.bg} ${c.border} border rounded-xl p-4 text-center`}
						>
							<p className={`text-2xl font-bold ${c.text}`}>{count}</p>
							<p className={`text-xs font-semibold ${c.text} mt-1`}>{label}</p>
						</div>
					);
				})}
			</div>

			{/* Filtros */}
			<div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
				<select
					value={mes}
					onChange={(e) => setMes(e.target.value)}
					className="input-field w-auto text-sm"
				>
					{MESES.map((m) => (
						<option key={m} value={m}>
							{m} 2026
						</option>
					))}
				</select>

				<div className="flex gap-1 flex-wrap">
					{FILTROS.map((f) => (
						<button
							type="button"
							key={f.id}
							onClick={() => setFiltro(f.id)}
							className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
								filtro === f.id
									? "bg-blue-600 text-white"
									: "bg-gray-100 text-gray-500 hover:bg-gray-200"
							}`}
						>
							{f.label}
						</button>
					))}
				</div>

				<div className="relative ml-auto">
					<Search
						size={14}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
					/>
					<input
						type="text"
						placeholder="Buscar cidade..."
						value={busca}
						onChange={(e) => setBusca(e.target.value)}
						className="input-field pl-8 text-sm w-48"
					/>
				</div>

				<button
					type="button"
					onClick={carregar}
					className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
				>
					<RefreshCw size={16} />
				</button>
			</div>

			{/* Tabela */}
			<div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
				<table className="min-w-[760px] w-full text-sm">
					<thead>
						<tr className="bg-gray-50 border-b border-gray-100">
							{[
								"Cidade",
								"Regional",
								"Responsavel",
								"Meta",
								"Realizado",
								"Cancelamentos",
								"% Eficiencia",
								"Status",
								"",
							].map((h) => (
								<th
									key={h}
									className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{cidadesFiltradas.map((c) => {
							const col = COR_MAP[c.critica.cor];
							return (
								<tr
									key={c.cidade}
									className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${c.total === 0 ? "opacity-70" : ""}`}
								>
									<td className="px-3 py-2.5 font-semibold text-gray-800 text-center">
										{c.cidade}
									</td>
									<td className="px-3 py-2.5 text-center text-gray-500 text-xs">
										{c.agente?.regional_nome ?? "—"}
									</td>
									<td className="px-3 py-2.5 text-center text-gray-600 text-xs max-w-[160px] truncate">
										{c.agente?.responsavel?.nome ?? "—"}
									</td>
									<td className="px-3 py-2.5 text-center text-gray-600">
										{c.meta}
									</td>
									<td className="px-3 py-2.5 text-center font-bold text-gray-800">
										{c.total}
									</td>
									<td className="px-3 py-2.5 text-center text-gray-500">
										{c.cancelamentos}
									</td>
									<td className="px-3 py-2.5 text-center">
										<span
											className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${col.badge}`}
										>
											{c.total === 0 ? "0%" : `${c.pct}%`}
										</span>
									</td>
									<td className="px-3 py-2.5 text-center">
										<span
											className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${col.badge}`}
										>
											{ICONE_MAP[c.critica.cor]}
											{c.critica.label}
										</span>
									</td>
									<td className="px-3 py-2.5 text-center">
										<button
											type="button"
											onClick={() => setCidadeSel(c)}
											className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
											title="Gerar relatorio"
										>
											<FileText size={15} />
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{cidadesFiltradas.length === 0 && (
					<div className="p-10 text-center text-gray-300 text-sm">
						Nenhuma cidade encontrada.
					</div>
				)}
			</div>

			{cidadeSel && (
				<MetasAuditoriaRelatorio
					cidade={cidadeSel}
					mes={mes}
					onClose={() => setCidadeSel(null)}
				/>
			)}
		</div>
	);
};

export default MetasAuditoria;

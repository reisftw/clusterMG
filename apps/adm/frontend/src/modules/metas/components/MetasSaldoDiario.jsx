import { useMemo } from "react";
import { recalcularSaldoDiario } from "../utils/metasSaldo";

const Badge = ({ v }) => {
	if (v == null) return <span className="text-gray-300 text-xs">—</span>;
	const cls =
		v > 0
			? "bg-green-50 text-green-700 border-green-100"
			: v < 0
				? "bg-red-50 text-red-600 border-red-100"
				: "bg-gray-50 text-gray-500 border-gray-100";
	return (
		<span
			className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold border ${cls}`}
		>
			{v > 0 ? `+${v}` : v}
		</span>
	);
};

const MetasSaldoDiario = ({ dados, feriadosSet = new Set() }) => {
	const { metaDiaria, saldoDiario: sd } = useMemo(
		() => recalcularSaldoDiario(dados, feriadosSet),
		[dados, feriadosSet],
	);

	if (!sd.length) {
		return (
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-300 text-sm">
				Sem dados de movimentacao para este mes.
			</div>
		);
	}

	const totEquipe = sd.reduce((s, x) => s + x.equipe, 0);
	const totAgente = sd.reduce((s, x) => s + x.agente, 0);
	const totLoja = sd.reduce((s, x) => s + x.loja, 0);
	const totRegionais = sd.reduce((s, x) => s + x.regionais, 0);
	const totDia = sd.reduce((s, x) => s + x.totalDia, 0);
	const totMeta = sd.reduce((s, x) => s + x.metaDia, 0);
	const lastSaldo = sd[sd.length - 1]?.saldoMes ?? 0;

	return (
		<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
			<div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
				<h3 className="text-sm font-bold text-gray-800">
					Saldo Diario — Meta por Dia
				</h3>
				<div className="flex items-center gap-3 text-xs text-gray-500">
					<span>
						Meta diaria: <strong className="text-blue-700">{metaDiaria}</strong>
					</span>
					<span>
						Saldo mes:{" "}
						<strong
							className={lastSaldo >= 0 ? "text-green-600" : "text-red-500"}
						>
							{lastSaldo >= 0 ? `+${lastSaldo}` : lastSaldo}
						</strong>
					</span>
				</div>
			</div>

			<div className="overflow-x-auto">
				<table className="min-w-[680px] w-full text-sm">
					<thead>
						<tr className="bg-gray-50 border-b border-gray-100">
							{[
								"Dia",
								"Equipe Tecnica",
								"Agente Aut.",
								"Entregue Loja",
								"Regionais",
								"Total Dia",
								"Meta Diaria",
								"Saldo Dia",
								"Saldo Mes",
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
						{sd.map((row) => (
							<tr
								key={row.dia}
								className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!row.util ? "opacity-40" : ""}`}
							>
								<td className="px-3 py-2.5 text-center font-bold text-gray-700">
									{row.dia}
								</td>
								<td className="px-3 py-2.5 text-center text-gray-600">
									{row.equipe}
								</td>
								<td className="px-3 py-2.5 text-center text-gray-600">
									{row.agente}
								</td>
								<td className="px-3 py-2.5 text-center text-gray-600">
									{row.loja}
								</td>
								<td className="px-3 py-2.5 text-center text-gray-600">
									{row.regionais}
								</td>
								<td className="px-3 py-2.5 text-center font-bold text-gray-800">
									{row.totalDia}
								</td>
								<td className="px-3 py-2.5 text-center text-blue-600 font-semibold">
									{row.metaDia}
								</td>
								<td className="px-3 py-2.5 text-center">
									<Badge v={row.saldoDia} />
								</td>
								<td className="px-3 py-2.5 text-center">
									<Badge v={row.saldoMes} />
								</td>
							</tr>
						))}
						<tr className="bg-blue-50 border-t border-blue-100 font-bold">
							<td className="px-3 py-3 text-center text-blue-700 text-xs uppercase">
								Total
							</td>
							<td className="px-3 py-3 text-center text-blue-700">
								{totEquipe}
							</td>
							<td className="px-3 py-3 text-center text-blue-700">
								{totAgente}
							</td>
							<td className="px-3 py-3 text-center text-blue-700">{totLoja}</td>
							<td className="px-3 py-3 text-center text-blue-700">
								{totRegionais}
							</td>
							<td className="px-3 py-3 text-center text-blue-700">{totDia}</td>
							<td className="px-3 py-3 text-center text-blue-700">{totMeta}</td>
							<td className="px-3 py-3 text-center"></td>
							<td className="px-3 py-3 text-center">
								<Badge v={lastSaldo} />
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
};

export default MetasSaldoDiario;

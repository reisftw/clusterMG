import MetasResumoMensalStatusBadge from "./MetasResumoMensalStatusBadge";

const MetasResumoMensalHistoricoAnual = ({
	historico,
	mesSelecionado,
	onSelectMes,
	onOpenMesDetail,
}) => (
	<div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
		<div className="border-b border-gray-100 px-5 py-4">
			<h3 className="text-sm font-bold text-gray-800">
				Resumo Anual — Retirada FTTH
			</h3>
		</div>
		<div className="overflow-x-auto">
			<table className="min-w-[760px] w-full text-sm">
				<thead>
					<tr className="border-b border-gray-100 bg-gray-50">
						{[
							"Mes",
							"Cancelamentos",
							"Regra da Meta",
							"Brasil Tecpar 65%",
							"Meta OS",
							"Realizado",
							"Saldo Final",
							"% Total",
							"Status",
						].map((header) => (
							<th
								key={header}
								className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500"
							>
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{historico.map(({ mes, vazio, ...item }) => {
						const isSelected = mes === mesSelecionado;
						const baseClassName = `cursor-pointer border-b border-gray-50 transition-colors ${
							isSelected ? "bg-blue-50" : "hover:bg-gray-50"
						}`;

						if (vazio) {
							return (
								<tr
									key={mes}
									onClick={() => {
										onSelectMes(mes);
										onOpenMesDetail(mes);
									}}
									className={baseClassName}
								>
									<td className="px-4 py-3 font-semibold text-gray-700">
										{mes}
									</td>
									<td colSpan={8} className="px-4 py-3 text-xs text-gray-300">
										Sem dados
									</td>
								</tr>
							);
						}

						const saldoClassName =
							item.saldoFinal >= 0 ? "text-green-600" : "text-red-500";

						return (
							<tr
								key={mes}
								onClick={() => {
									onSelectMes(mes);
									onOpenMesDetail(mes);
								}}
								className={baseClassName}
							>
								<td className="px-4 py-3 font-bold text-gray-800">{mes}</td>
								<td className="px-4 py-3 text-gray-600">
									{item.cancelamentos.toLocaleString("pt-BR")}
								</td>
								<td className="px-4 py-3 font-semibold text-purple-600">
									{item.metaModeLabel || "Meta sazonal"} {item.metaSazonal}%
								</td>
								<td className="px-4 py-3 font-semibold text-amber-700">
									{item.metaBrasilTecpar.meta.toLocaleString("pt-BR")}
								</td>
								<td className="px-4 py-3 font-semibold text-blue-700">
									{item.meta.toLocaleString("pt-BR")}
								</td>
								<td className="px-4 py-3 font-semibold text-orange-600">
									{item.totalOS.toLocaleString("pt-BR")}
								</td>
								<td className={`px-4 py-3 font-bold ${saldoClassName}`}>
									{item.saldoFinal >= 0
										? `+${item.saldoFinal}`
										: item.saldoFinal}
								</td>
								<td className="px-4 py-3 font-bold">{item.percentAchieved}%</td>
								<td className="px-4 py-3">
									<MetasResumoMensalStatusBadge
										mes={mes}
										pct={item.percentAchieved}
										metaSazonal={item.metaSazonal}
									/>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	</div>
);

export default MetasResumoMensalHistoricoAnual;

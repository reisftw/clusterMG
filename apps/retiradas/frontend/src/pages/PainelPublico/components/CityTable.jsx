// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveFaltaBadgeTone(falta) {
	if (falta > 0) return "neg";
	return falta < 0 ? "pos" : "zero";
}

export default function CityTable({ cidades = [], onCityClick }) {
	function pctClass(pct) {
		if (pct > 100) return "over";
		if (pct >= 80) return "ok";
		if (pct >= 50) return "warn";
		return "bad";
	}

	function statusPill(pct) {
		if (pct > 100)
			return <span className="status-pill over">⚡ Acima da Meta</span>;
		if (pct >= 80)
			return <span className="status-pill atingido">✅ Meta Atingida</span>;
		if (pct >= 50)
			return <span className="status-pill andamento">⏳ Em Andamento</span>;
		return <span className="status-pill abaixo">🚨 Abaixo</span>;
	}

	const total = cidades.reduce(
		(acc, c) => ({
			cancelamentos: acc.cancelamentos + Number(c.cancelamentos || 0),
			meta80: acc.meta80 + Number(c.meta80 || 0),
			realizado: acc.realizado + Number(c.realizado || 0),
			falta: acc.falta + Number(c.falta || 0),
		}),
		{ cancelamentos: 0, meta80: 0, realizado: 0, falta: 0 },
	);

	const totalPct =
		total.cancelamentos > 0
			? ((total.realizado / total.cancelamentos) * 100).toFixed(1)
			: 0;

	return (
		<div className="city-table-wrap">
			<table className="city-table">
				<thead>
					<tr>
						<th style={{ textAlign: "left" }}>Cidade</th>
						<th>Cancelamentos</th>
						<th>Meta 80%</th>
						<th>Realizado</th>
						<th>Falta</th>
						<th>% Atingido</th>
						<th>Status</th>
						<th>Relatório</th>
					</tr>
				</thead>
				<tbody>
					{cidades.map((c, i) => {
						const cls = pctClass(c.pct);
						return (
							<tr
								key={c.nome || i}
								style={{ cursor: "pointer" }}
								onClick={() => onCityClick(c)}
							>
								<td data-label="Cidade">{c.nome}</td>
								<td data-label="Cancelamentos">{c.cancelamentos}</td>
								<td data-label="Meta 80%">{Math.round(c.meta80)}</td>
								<td data-label="Realizado">
									<strong>{c.realizado}</strong>
								</td>
								<td data-label="Falta">
									<span
										className={`badge ${resolveFaltaBadgeTone(c.falta)}`}
									>
										{c.falta > 0 ? `-${c.falta}` : `+${Math.abs(c.falta)}`}
									</span>
								</td>
								<td data-label="% Atingido">
									<div className="pct-bar-wrap">
										<div className="pct-bar">
											<div
												className={`pct-fill ${cls}`}
												style={{ width: `${Math.min(c.pct, 100)}%` }}
											/>
										</div>
										<span className={`pct-txt ${cls}`}>{c.pct}%</span>
									</div>
								</td>
								<td data-label="Status">{statusPill(c.pct)}</td>
								<td data-label="Relatório">
									<button
										type="button"
										className="btn-city-pdf"
										onClick={(e) => {
											e.stopPropagation();
											onCityClick(c);
										}}
									>
										📄 Ver
									</button>
								</td>
							</tr>
						);
					})}

					<tr className="total-row">
						<td data-label="Cidade">TOTAL GERAL</td>
						<td data-label="Cancelamentos">{total.cancelamentos}</td>
						<td data-label="Meta 80%">{Math.round(total.meta80)}</td>
						<td data-label="Realizado">{total.realizado}</td>
						<td data-label="Falta">
							<span className={`badge ${total.falta > 0 ? "neg" : "pos"}`}>
								{total.falta > 0
									? `-${Math.round(total.falta)}`
									: `+${Math.abs(Math.round(total.falta))}`}
							</span>
						</td>
						<td data-label="% Atingido">
							<div className="pct-bar-wrap">
								<div className="pct-bar">
									<div
										className={`pct-fill ${pctClass(Number.parseFloat(totalPct))}`}
										style={{
											width: `${Math.min(Number.parseFloat(totalPct), 100)}%`,
										}}
									/>
								</div>
								<span
									className={`pct-txt ${pctClass(Number.parseFloat(totalPct))}`}
								>
									{totalPct}%
								</span>
							</div>
						</td>
						<td data-label="Status" colSpan="2">
							{statusPill(Number.parseFloat(totalPct))}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}

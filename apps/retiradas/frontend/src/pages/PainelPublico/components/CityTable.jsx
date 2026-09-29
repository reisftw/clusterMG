// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveFaltaBadgeTone(falta) {
	if (falta < 0) return "neg";
	return falta > 0 ? "pos" : "zero";
}

function formatSigned(value) {
	const number = Math.round(Number(value) || 0);
	if (number > 0) return `+${number}`;
	if (number < 0) return `-${Math.abs(number)}`;
	return "0";
}

export default function CityTable({ cidades = [], onCityClick }) {
	function pctClass(pct) {
		if (pct > 100) return "over";
		if (pct >= 100) return "ok";
		if (pct >= 75) return "warn";
		return "bad";
	}

	function statusPill(cidade) {
		const status = cidade.statusInfo;
		if (status?.tone) {
			return (
				<span className={`status-pill ${status.tone}`}>
					{status.icon} {status.label}
				</span>
			);
		}
		const pct = cidade.pct || 0;
		if (pct > 100)
			return <span className="status-pill over">⚡ Acima da Meta</span>;
		if (pct >= 100)
			return <span className="status-pill atingido">✅ Meta Atingida</span>;
		if (pct >= 75)
			return <span className="status-pill andamento">⏳ Em Andamento</span>;
		return <span className="status-pill abaixo">🚨 Abaixo</span>;
	}

	const total = cidades.reduce(
		(acc, c) => ({
			cancelamentos: acc.cancelamentos + Number(c.cancelamentos || 0),
			meta80: acc.meta80 + Number(c.meta80 || 0),
			realizado: acc.realizado + Number(c.realizado || 0),
			gap: acc.gap + Number(c.gap || 0),
			expectedToday: acc.expectedToday + Number(c.expectedToday || 0),
			desvio: acc.desvio + Number(c.desvio || 0),
		}),
		{
			cancelamentos: 0,
			meta80: 0,
			realizado: 0,
			gap: 0,
			expectedToday: 0,
			desvio: 0,
		},
	);

	const totalPct =
		total.meta80 > 0
			? ((total.realizado / total.meta80) * 100).toFixed(1)
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
						<th>Gap</th>
						<th>% Atingido</th>
						<th>Esperado Hoje</th>
						<th>Desvio</th>
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
								<td data-label="Gap">
									<span
										className={`badge ${resolveFaltaBadgeTone(c.gap)}`}
									>
										{formatSigned(c.gap)}
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
								<td data-label="Esperado Hoje">{Math.round(c.expectedToday || 0)}</td>
								<td data-label="Desvio">
									<span
										className={`badge ${resolveFaltaBadgeTone(c.desvio)}`}
									>
										{formatSigned(c.desvio)}
									</span>
								</td>
								<td data-label="Status">{statusPill(c)}</td>
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
						<td data-label="Gap">
							<span className={`badge ${resolveFaltaBadgeTone(total.gap)}`}>
								{formatSigned(total.gap)}
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
						<td data-label="Esperado Hoje">{Math.round(total.expectedToday)}</td>
						<td data-label="Desvio">
							<span className={`badge ${resolveFaltaBadgeTone(total.desvio)}`}>
								{formatSigned(total.desvio)}
							</span>
						</td>
						<td data-label="Status" colSpan="2">
							{statusPill({ pct: Number.parseFloat(totalPct) })}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}

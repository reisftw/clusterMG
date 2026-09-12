// Extraidos pra achado javascript:S3358 (ternario aninhado).
function resolveTipoDia(item) {
	if (item.feriado) return "feriado";
	if (item.fimDeSemana) return "fim-de-semana";
	return "util";
}

function resolveTipoLabel(item) {
	if (item.feriado) return "Feriado";
	if (item.fimDeSemana) return "Fim de semana";
	return "";
}

function resolveSaldoTone(value) {
	if (value > 0) return "pos";
	if (value < 0) return "neg";
	return "zero";
}

export default function SaldoTable({ saldoDiario = [] }) {
	if (!saldoDiario.length) {
		return (
			<tr>
				<td
					colSpan="9"
					style={{ color: "var(--muted)", padding: 24, textAlign: "center" }}
				>
					Sem dados
				</td>
			</tr>
		);
	}

	return (
		<>
			{saldoDiario.map((s, i) => {
				const tipoDia = resolveTipoDia(s);
				const tipoLabel = resolveTipoLabel(s);

				return (
					<tr key={i} className={`saldo-row saldo-row-${tipoDia}`}>
						<td data-label="Dia">
							<span className="saldo-dia">
								<span>{s.dia}</span>
								{tipoLabel ? (
									<span className={`saldo-dia-tag ${tipoDia}`}>
										{tipoLabel}
									</span>
								) : null}
							</span>
						</td>
						<td data-label="Equipe Tecnica">{s.equipe}</td>
						<td data-label="Agente Aut.">{s.agente}</td>
						<td data-label="Entregue Loja">{s.loja}</td>
						<td data-label="Regionais">{s.regionais}</td>
						<td data-label="Total Dia">
							<strong>{s.totalDia}</strong>
						</td>
						<td data-label="Meta Diaria">{s.metaDia}</td>
						<td data-label="Saldo Dia">
							<span
								className={`badge ${resolveSaldoTone(s.saldoDia)}`}
							>
								{s.saldoDia > 0 ? "+" : ""}
								{s.saldoDia}
							</span>
						</td>
						<td data-label="Saldo Mes">
							<span
								className={`badge ${resolveSaldoTone(s.saldoMes)}`}
							>
								{s.saldoMes > 0 ? "+" : ""}
								{s.saldoMes}
							</span>
						</td>
					</tr>
				);
			})}
		</>
	);
}

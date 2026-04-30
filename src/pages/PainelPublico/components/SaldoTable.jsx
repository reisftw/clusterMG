export default function SaldoTable({ saldoDiario = [] }) {
  if (!saldoDiario.length)
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

  return (
    <>
      {saldoDiario.map((s, i) => (
        <tr key={i}>
          <td>{s.dia}</td>
          <td>{s.equipe}</td>
          <td>{s.agente}</td>
          <td>{s.loja}</td>
          <td>{s.regionais}</td>
          <td>
            <strong>{s.totalDia}</strong>
          </td>
          <td>{s.metaDia}</td>
          <td>
            <span
              className={`badge ${s.saldoDia > 0 ? "pos" : s.saldoDia < 0 ? "neg" : "zero"}`}
            >
              {s.saldoDia > 0 ? "+" : ""}
              {s.saldoDia}
            </span>
          </td>
          <td>
            <span
              className={`badge ${s.saldoMes > 0 ? "pos" : s.saldoMes < 0 ? "neg" : "zero"}`}
            >
              {s.saldoMes > 0 ? "+" : ""}
              {s.saldoMes}
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}

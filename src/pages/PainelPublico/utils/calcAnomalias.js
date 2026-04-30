export function calcAnomalias(d) {
  const anomalias = [];
  if (!d) return anomalias;

  const regionais = Array.isArray(d.regionais) ? d.regionais : [];
  const rawDays = Array.isArray(d.rawDays) ? d.rawDays : [];
  const totalOS = Number(d.totalOS) || 0;
  const percentAchieved = Number(d.percentAchieved) || 0;

  // Regional zerada
  regionais.forEach((r) => {
    const total = Number(r.total) || 0;
    const percent = Number(r.percent) || 0;

    if (total === 0) {
      anomalias.push({
        level: "high",
        icon: "🗺️",
        title: `Regional ${r.name} — Sem dados`,
        desc: "Nenhuma retirada registrada nesta regional.",
      });
      return;
    }

    if (total < 20) {
      anomalias.push({
        level: "medium",
        icon: "⚠️",
        title: `Regional ${r.name} — Produção muito baixa`,
        desc: `Apenas ${total} O.S registradas no mês.`,
      });
      return;
    }

    if (percent > 0 && percent < 50) {
      anomalias.push({
        level: "medium",
        icon: "📉",
        title: `Regional ${r.name} — Abaixo do esperado`,
        desc: `Apenas ${percent.toFixed(1)}% da meta individual atingida.`,
      });
    }
  });

  // Dias com zero total em faixa crítica do mês
  if (rawDays.length) {
    const diasZerados = rawDays.filter((r) => {
      const dia = Number(r.dia) || 0;
      const totalDia = Number(r.totalDia) || 0;
      return totalDia === 0 && dia <= 20;
    });

    if (diasZerados.length > 5) {
      anomalias.push({
        level: "medium",
        icon: "📅",
        title: `${diasZerados.length} dias sem registro`,
        desc: "Muitos dias sem dados podem indicar planilha desatualizada.",
      });
    }
  }

  // Meta geral muito abaixo
  if (percentAchieved < 50 && totalOS > 0) {
    anomalias.push({
      level: "high",
      icon: "📉",
      title: "Meta geral em risco",
      desc: `Apenas ${percentAchieved.toFixed(1)}% da meta atingida. Intervenção necessária.`,
    });
  }

  if (anomalias.length === 0) {
    anomalias.push({
      level: "low",
      icon: "✅",
      title: "Nenhuma anomalia detectada",
      desc: "Todos os indicadores dentro do esperado.",
    });
  }

  return anomalias;
}

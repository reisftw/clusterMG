// src/pages/Mapa/utils/mapaWhatsapp.js

export function formatarRegionalWhatsapp(regional, cidades) {
  const linhas = [];
  linhas.push(`*${regional}*`);
  linhas.push('━━━━━━━━━━━━━━━━');

  const cidadesOrdenadas = Object.entries(cidades)
    .sort((a, b) => {
      const totalA = Object.values(a[1].pendente || {}).reduce((s, v) => s + v, 0)
                   + Object.values(a[1].aguardando || {}).reduce((s, v) => s + v, 0);
      const totalB = Object.values(b[1].pendente || {}).reduce((s, v) => s + v, 0)
                   + Object.values(b[1].aguardando || {}).reduce((s, v) => s + v, 0);
      return totalB - totalA;
    });

  cidadesOrdenadas.forEach(([cidade, data]) => {
    const partesPendente = Object.entries(data.pendente || {})
      .map(([tipo, qtd]) => `_${tipo}:_ *${qtd}*`).join(' | ');
    const partesAguardando = Object.entries(data.aguardando || {})
      .map(([tipo, qtd]) => `_${tipo}:_ *${qtd}*`).join(' | ');

    const todasPartes = [partesPendente, partesAguardando].filter(Boolean).join(' | ');
    if (todasPartes) linhas.push(`*${cidade}:* ${todasPartes}`);
  });

  const total = cidadesOrdenadas.reduce((acc, [, d]) => {
    return acc
      + Object.values(d.pendente || {}).reduce((s, v) => s + v, 0)
      + Object.values(d.aguardando || {}).reduce((s, v) => s + v, 0);
  }, 0);

  linhas.push('━━━━━━━━━━━━━━━━');
  linhas.push(`*Total: ${total} O.S*`);
  return linhas.join('\n');
}

export function formatarAgenteWhatsapp(cidade, data) {
  const linhas = [];
  linhas.push(`*${cidade}*`);
  if (data.regional) linhas.push(`_${data.regional}_`);
  linhas.push('━━━━━━━━━━━━━━━━');

  const partesPendente = Object.entries(data.pendente || {})
    .map(([tipo, qtd]) => `_${tipo}:_ *${qtd}*`).join(' | ');
  const partesAguardando = Object.entries(data.aguardando || {})
    .map(([tipo, qtd]) => `_${tipo}:_ *${qtd}*`).join(' | ');

  if (partesPendente) linhas.push(`*Pendente:* ${partesPendente}`);
  if (partesAguardando) linhas.push(`*Ag. Agendamento:* ${partesAguardando}`);

  const total = Object.values(data.pendente || {}).reduce((s, v) => s + v, 0)
              + Object.values(data.aguardando || {}).reduce((s, v) => s + v, 0);

  linhas.push('━━━━━━━━━━━━━━━━');
  linhas.push(`*Total: ${total} O.S*`);
  return linhas.join('\n');
}

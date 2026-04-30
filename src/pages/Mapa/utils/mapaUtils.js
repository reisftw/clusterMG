export function agruparPorRegional(ordens) {
  const mapa = {};
  ordens.forEach(os => {
    if (os.agente) return;
    const reg = os.regional || 'Sem Regional';
    if (!mapa[reg]) mapa[reg] = {};
    const cidade = os.cidade || 'Desconhecida';
    if (!mapa[reg][cidade]) mapa[reg][cidade] = { pendente: {}, aguardando: {} };
    const statusKey = os.status === 'Pendente' ? 'pendente' : 'aguardando';
    const tipo = os.tipo || 'Outros';
    mapa[reg][cidade][statusKey][tipo] = (mapa[reg][cidade][statusKey][tipo] || 0) + 1;
  });
  return mapa;
}

export function agruparPorAgente(ordens) {
  const mapa = {};
  ordens.forEach(os => {
    if (!os.agente) return;
    const cidade = os.cidade || 'Desconhecida';
    if (!mapa[cidade]) mapa[cidade] = { pendente: {}, aguardando: {}, regional: os.regional || '' };
    const statusKey = os.status === 'Pendente' ? 'pendente' : 'aguardando';
    const tipo = os.tipo || 'Outros';
    mapa[cidade][statusKey][tipo] = (mapa[cidade][statusKey][tipo] || 0) + 1;
  });
  return mapa;
}

export function rankingCidadesRegionais(ordens, top = 10) {
  const contagem = {};
  ordens.forEach(os => {
    if (os.agente) return;
    const cidade = os.cidade || 'Desconhecida';
    contagem[cidade] = (contagem[cidade] || 0) + 1;
  });
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([cidade, total]) => ({ cidade, total }));
}

export function rankingCidadesAgentes(ordens, top = 5) {
  const contagem = {};
  ordens.forEach(os => {
    if (!os.agente) return;
    const cidade = os.cidade || 'Desconhecida';
    contagem[cidade] = (contagem[cidade] || 0) + 1;
  });
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([cidade, total]) => ({ cidade, total }));
}

export function calcularKPIs(ordens) {
  const total = ordens.length;
  const pendente = ordens.filter(o => o.status === 'Pendente').length;
  const aguardando = ordens.filter(o => o.status === 'Aguardando Agendamento').length;
  const totalRegional = ordens.filter(o => !o.agente).length;
  const totalAgente = ordens.filter(o => o.agente).length;
  return { total, pendente, aguardando, totalRegional, totalAgente };
}

export function totalCidade(cidadeData) {
  let t = 0;
  const soma = obj => Object.values(obj).forEach(v => t += v);
  soma(cidadeData.pendente || {});
  soma(cidadeData.aguardando || {});
  return t;
}

export function buildEmptyPublicMapaSnapshot() {
  return {
    totalOrdens: 0,
    kpis: {
      total: 0,
      pendente: 0,
      aguardando: 0,
      totalRegional: 0,
      totalAgente: 0,
    },
    chartRegionais: [],
    rankingRegionais: [],
    rankingAgentes: [],
    regionais: {},
    agentes: {},
  };
}

export function buildPublicMapaSnapshot(ordens = []) {
  const lista = Array.isArray(ordens) ? ordens : [];
  const regionais = agruparPorRegional(lista);
  const agentes = agruparPorAgente(lista);

  return {
    totalOrdens: lista.length,
    kpis: calcularKPIs(lista),
    chartRegionais: Object.entries(regionais)
      .map(([regional, cidades]) => ({
        regional,
        total: Object.values(cidades).reduce(
          (acc, cidadeData) => acc + totalCidade(cidadeData),
          0,
        ),
      }))
      .sort((a, b) => b.total - a.total),
    rankingRegionais: rankingCidadesRegionais(lista, 10),
    rankingAgentes: rankingCidadesAgentes(lista, 5),
    regionais,
    agentes,
  };
}

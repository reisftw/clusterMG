const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

const STATUS_LABEL = { pendente: 'Pendente', aprovado: 'Aprovado', reprovado: 'Reprovado' };

const gerarHtmlFerias = (ferias) => `
  <h2 style="font-family:Arial;color:#1e40af;">📅 Ferias</h2>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial;font-size:13px;width:100%">
    <thead style="background:#dbeafe">
      <tr><th>Colaborador</th><th>Inicio</th><th>Fim</th><th>Dias</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${ferias.map((f) => `
        <tr>
          <td>${f.colaborador_id}</td>
          <td>${formatarData(f.data_inicio)}</td>
          <td>${formatarData(f.data_fim)}</td>
          <td>${f.dias_gozados}</td>
          <td>${STATUS_LABEL[f.status] ?? f.status}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
`;

const gerarHtmlFeriados = (feriados) => `
  <h2 style="font-family:Arial;color:#7e22ce;">🗓️ Proximos Feriados</h2>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial;font-size:13px;width:100%">
    <thead style="background:#f3e8ff">
      <tr><th>Data</th><th>Nome</th><th>Tipo</th></tr>
    </thead>
    <tbody>
      ${feriados.map((f) => `
        <tr>
          <td>${formatarData(f.date ?? f.data)}</td>
          <td>${f.name ?? f.nome}</td>
          <td>${f.type ?? f.tipo}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
`;

export const gerarRelatorioHtml = ({ ferias = [], feriados = [], incluir = {} }) => {
  const partes = [];
  const data   = new Date().toLocaleDateString('pt-BR');

  partes.push(`<div style="font-family:Arial">
    <h1 style="color:#1e293b;">Relatorio Operacional — Sempre Internet</h1>
    <p style="color:#64748b;font-size:13px;">Gerado em: ${data}</p>
    <hr/>
  `);

  if (incluir.ferias   !== false) partes.push(gerarHtmlFerias(ferias));
  if (incluir.feriados !== false) partes.push(gerarHtmlFeriados(feriados));

  partes.push('</div>');
  return partes.join('');
};

export const copiarRelatorioParaClipboard = async (html) => {
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const item = new ClipboardItem({ 'text/html': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    // Fallback para texto plano
    await navigator.clipboard.writeText(html.replace(/<[^>]*>/g, ''));
    return false;
  }
};


import html2pdf from "html2pdf.js";

export const exportarReclamacaoPDF = async (reclamacao) => {
  const {
    titulo,
    tipo,
    categoria,
    regional,
    reclamante,
    data_ocorrido,
    descricao,
    prioridade,
    status,
    resolucao,
    colaboradores_envolvidos = [],
    criado_em,
    atualizado_em,
  } = reclamacao;

  const fmt = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("pt-BR");
  };

  const fmtFull = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const statusConfig = {
    aberta:     { label: "Aberta",     color: "#dc2626", bg: "#fee2e2" },
    em_analise: { label: "Em Análise", color: "#d97706", bg: "#fef3c7" },
    resolvida:  { label: "Resolvida",  color: "#16a34a", bg: "#dcfce7" },
    arquivada:  { label: "Arquivada",  color: "#6b7280", bg: "#f3f4f6" },
  };
  const prioridadeConfig = {
    baixa:   { label: "Baixa",   color: "#6b7280", bg: "#f3f4f6" },
    media:   { label: "Média",   color: "#3b82f6", bg: "#dbeafe" },
    alta:    { label: "Alta",    color: "#ea580c", bg: "#fed7aa" },
    critica: { label: "Crítica", color: "#dc2626", bg: "#fee2e2" },
  };
  const tipoConfig = {
    interna: { label: "Interna", color: "#9333ea", bg: "#f3e8ff" },
    externa: { label: "Externa", color: "#0369a1", bg: "#cffafe" },
  };

  const s = statusConfig[status]    || statusConfig.aberta;
  const p = prioridadeConfig[prioridade] || prioridadeConfig.media;
  const t = tipoConfig[tipo]        || tipoConfig.externa;

  const colaboradoresTags = Array.isArray(colaboradores_envolvidos) && colaboradores_envolvidos.length > 0
    ? colaboradores_envolvidos.map((c) => {
        const cls = c.avulso ? "tag externo" : "tag";
        const label = c.nome + (c.avulso ? " (externo)" : "");
        return '<span class="' + cls + '">' + label + "</span>";
      }).join("")
    : '<span class="field-value">Nenhum colaborador adicionado</span>';

  const resolucaoSection = resolucao
    ? '<div class="section resolucao full"><div class="section-title"><span class="section-icon">✅</span> Resolução / Parecer</div><div class="text-area">' + resolucao + "</div></div>"
    : "";

  const nowDate = new Date().toLocaleDateString("pt-BR");
  const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Reclamação - ${titulo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1f2937; line-height: 1.6; background: #f9fafb; }
    .container { width: 210mm; margin: 0 auto; padding: 18mm 20mm; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 3px solid #1f2937; }
    .header-left h1 { font-size: 26px; color: #0f172a; font-weight: 700; margin-bottom: 4px; }
    .header-left p { font-size: 12px; color: #6b7280; }
    .header-badges { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .badge { padding: 7px 13px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 2px solid; }
    .badge-status     { background: ${s.bg}; color: ${s.color}; border-color: ${s.color}; }
    .badge-tipo       { background: ${t.bg}; color: ${t.color}; border-color: ${t.color}; }
    .badge-prioridade { background: ${p.bg}; color: ${p.color}; border-color: ${p.color}; }
    .titulo-destaque { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 18px 20px; border-radius: 8px; border-left: 5px solid #0284c7; margin-bottom: 22px; font-size: 17px; font-weight: 700; color: #0c4a6e; }
    .sections-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .section { padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; page-break-inside: avoid; }
    .section.full { grid-column: 1 / -1; }
    .section.info-gerais { background: linear-gradient(135deg, #f0fdf4, #dbeafe); border-color: #86efac; }
    .section.detalhes   { background: linear-gradient(135deg, #fef9c3, #fed7aa); border-color: #fcd34d; }
    .section.colab      { background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-color: #7dd3fc; }
    .section.descricao  { background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-color: #d8b4fe; }
    .section.resolucao  { background: linear-gradient(135deg, #f0fdf4, #bbf7d0); border-color: #86efac; }
    .section.historico  { background: linear-gradient(135deg, #f8fafc, #e2e8f0); border-color: #cbd5e1; }
    .section-title { font-size: 12px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid rgba(0,0,0,0.08); display: flex; align-items: center; gap: 6px; }
    .section-icon { font-size: 14px; }
    .field-group { margin-bottom: 10px; }
    .field-group:last-child { margin-bottom: 0; }
    .field-label { font-size: 10px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; display: block; }
    .field-value { font-size: 13px; color: #1f2937; font-weight: 500; }
    .field-value.large { font-size: 14px; font-weight: 600; }
    .colaboradores-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag { display: inline-block; padding: 5px 10px; background: white; color: #0284c7; border: 1.5px solid #0284c7; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .tag.externo { background: #fef3c7; color: #d97706; border-color: #d97706; }
    .text-area { white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.5; color: #1f2937; background: rgba(255,255,255,0.55); padding: 10px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .separator { margin: 20px 0; border: none; border-top: 2px dashed #d1d5db; }
    .footer { font-size: 10px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="header-left">
      <h1>📋 RELATÓRIO DE RECLAMAÇÃO</h1>
      <p>Sistema de Gestão | Field Service</p>
    </div>
    <div class="header-badges">
      <span class="badge badge-status">${s.label}</span>
      <span class="badge badge-tipo">${t.label}</span>
      <span class="badge badge-prioridade">${p.label}</span>
    </div>
  </div>

  <div class="titulo-destaque">${titulo}</div>

  <div class="sections-wrapper">

    <div class="section info-gerais">
      <div class="section-title"><span class="section-icon">ℹ️</span> Informações Gerais</div>
      <div class="field-group"><label class="field-label">Categoria</label><div class="field-value large">${categoria || "—"}</div></div>
      <div class="field-group"><label class="field-label">Regional</label><div class="field-value large">${regional || "—"}</div></div>
      <div class="field-group"><label class="field-label">Reclamante</label><div class="field-value">${reclamante || "—"}</div></div>
      <div class="field-group"><label class="field-label">Data do Ocorrido</label><div class="field-value">${data_ocorrido || fmt(criado_em)}</div></div>
    </div>

    <div class="section detalhes">
      <div class="section-title"><span class="section-icon">⚙️</span> Detalhes</div>
      <div class="field-group"><label class="field-label">Tipo</label><div class="field-value large">${t.label}</div></div>
      <div class="field-group"><label class="field-label">Status</label><div class="field-value large">${s.label}</div></div>
      <div class="field-group"><label class="field-label">Prioridade</label><div class="field-value large">${p.label}</div></div>
      <div class="field-group"><label class="field-label">Registrado em</label><div class="field-value">${fmtFull(criado_em)}</div></div>
    </div>

    <div class="section colab full">
      <div class="section-title"><span class="section-icon">👥</span> Colaboradores Envolvidos</div>
      <div class="colaboradores-list">${colaboradoresTags}</div>
    </div>

    <div class="section descricao full">
      <div class="section-title"><span class="section-icon">📝</span> Descrição Detalhada</div>
      <div class="text-area">${descricao || "—"}</div>
    </div>

    ${resolucaoSection}

    <div class="section historico full">
      <div class="section-title"><span class="section-icon">📅</span> Histórico</div>
      <div class="grid-2">
        <div class="field-group"><label class="field-label">Criado em</label><div class="field-value">${fmtFull(criado_em)}</div></div>
        <div class="field-group"><label class="field-label">Atualizado em</label><div class="field-value">${fmtFull(atualizado_em)}</div></div>
      </div>
    </div>

  </div>

  <hr class="separator">

  <div class="footer">
    <p>Documento gerado automaticamente pelo Sistema de Gestão de Field Service</p>
    <p style="margin-top:4px;">Emitido em ${nowDate} às ${nowTime}</p>
  </div>

</div>
</body>
</html>`;

  const opt = {
    margin: 0,
    filename: "Reclamacao_" + titulo.replace(/[^a-z0-9]/gi, "_").toLowerCase() + "_" + new Date().toISOString().slice(0, 10) + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, allowTaint: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  return new Promise((resolve, reject) => {
    html2pdf().set(opt).from(html).save().then(() => resolve()).catch((e) => reject(e));
  });
};

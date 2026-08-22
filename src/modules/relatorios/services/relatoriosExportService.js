import ExcelJS from "exceljs";
import { formatarDataGeracao, imprimirHtml } from "../../../utils/impressao";
import { buildMatchOSData } from "../../../pages/Mapa/utils/matchOs";
import { gerarPDFMapa } from "../../../pages/Mapa/utils/mapaPDF";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function triggerBlobDownload(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveWorkbook(workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer();
  triggerBlobDownload(buffer, fileName);
}

function applyHeaderStyle(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF003087" },
  };
}

function buildMetaHtmlTable(title, headers, rows) {
  const head = headers
    .map(
      (header) =>
        `<th style="padding:10px 12px;background:#003087;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.06em;text-align:left">${header}</th>`,
    )
    .join("");

  const body = rows
    .map(
      (row, index) => `
        <tr style="background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"}">
          ${row
            .map(
              (cell) =>
                `<td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#1f2937">${cell}</td>`,
            )
            .join("")}
        </tr>`,
    )
    .join("");

  return `
    <div style="margin-top:18px">
      <div style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:10px">${title}</div>
      <div style="border:1px solid #dbe2ee;border-radius:14px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

function buildPdfShell({ title, subtitle, sections }) {
  const generatedAt = formatarDataGeracao(new Date(), {
    incluirPreposicao: true,
  });

  return `
    <div style="font-family:Arial,sans-serif;background:#fff;color:#0f172a;padding:24px">
      <div style="background:linear-gradient(135deg,#001a57 0%,#003087 55%,#0052cc 100%);padding:24px 28px;border-radius:16px;color:#fff;margin-bottom:20px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.68)">Sempre Internet</div>
        <div style="margin-top:8px;font-size:28px;font-weight:800">${title}</div>
        <div style="margin-top:4px;font-size:13px;color:rgba(255,255,255,.82)">${subtitle}</div>
        <div style="margin-top:10px;font-size:11px;color:rgba(255,255,255,.66)">Gerado em ${generatedAt}</div>
      </div>
      ${sections.join("")}
    </div>`;
}

function monthFileName(prefix, month, extension) {
  return `${prefix}-${slugify(month)}-2026.${extension}`;
}

export function exportTecnicosPdf(month, monthData) {
  const rows = (monthData?.technicians || []).map((item, index) => [
    `${index + 1}º`,
    item.name || "-",
    Number(item.total || 0).toLocaleString("pt-BR"),
    `${Number(item.percent || 0).toFixed(1)}%`,
  ]);

  imprimirHtml(
    buildPdfShell({
      title: "Relatório de Técnicos",
      subtitle: `${month} 2026 · desempenho individual de retirada`,
      sections: [
        buildMetaHtmlTable(
          "Técnicos do mês",
          ["Posição", "Técnico", "Total O.S", "% da meta individual"],
          rows,
        ),
      ],
    }),
    { areaId: "relatorio-tecnicos-print", styleId: "relatorio-tecnicos-style" },
  );
}

export async function exportTecnicosXlsx(month, monthData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Técnicos");
  sheet.addRow(["Posição", "Técnico", "Total O.S", "% da meta individual"]);
  applyHeaderStyle(sheet.getRow(1));
  (monthData?.technicians || []).forEach((item, index) => {
    sheet.addRow([
      `${index + 1}º`,
      item.name || "-",
      Number(item.total || 0),
      Number(item.percent || 0),
    ]);
  });
  sheet.columns = [
    { width: 12 },
    { width: 34 },
    { width: 14 },
    { width: 18 },
  ];
  await saveWorkbook(workbook, monthFileName("relatorio-tecnicos", month, "xlsx"));
}

export function exportRegionaisPdf(month, monthData) {
  const rows = (monthData?.regionais || []).map((item, index) => [
    `${index + 1}º`,
    item.name || "-",
    Number(item.total || 0).toLocaleString("pt-BR"),
    `${Number(item.percent || 0).toFixed(1)}%`,
  ]);

  imprimirHtml(
    buildPdfShell({
      title: "Relatório de Regionais",
      subtitle: `${month} 2026 · ranking por regional`,
      sections: [
        buildMetaHtmlTable(
          "Regionais do mês",
          ["Posição", "Regional", "Total O.S", "% da meta de referência"],
          rows,
        ),
      ],
    }),
    { areaId: "relatorio-regionais-print", styleId: "relatorio-regionais-style" },
  );
}

export async function exportRegionaisXlsx(month, monthData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Regionais");
  sheet.addRow(["Posição", "Regional", "Total O.S", "% da meta de referência"]);
  applyHeaderStyle(sheet.getRow(1));
  (monthData?.regionais || []).forEach((item, index) => {
    sheet.addRow([
      `${index + 1}º`,
      item.name || "-",
      Number(item.total || 0),
      Number(item.percent || 0),
    ]);
  });
  sheet.columns = [
    { width: 12 },
    { width: 34 },
    { width: 14 },
    { width: 18 },
  ];
  await saveWorkbook(workbook, monthFileName("relatorio-regionais", month, "xlsx"));
}

export function exportEntregaMesPdf(month, monthData) {
  const resumoRows = [
    ["Meta do mês", Number(monthData?.meta || 0).toLocaleString("pt-BR")],
    ["Total realizado", Number(monthData?.totalOS || 0).toLocaleString("pt-BR")],
    ["Técnico retirada", Number(monthData?.technicians?.reduce((sum, item) => sum + Number(item.total || 0), 0) || 0).toLocaleString("pt-BR")],
    ["Agente autorizado", Number(monthData?.agenteTotal || 0).toLocaleString("pt-BR")],
    ["Entregue em loja", Number(monthData?.lojaTotal || 0).toLocaleString("pt-BR")],
    ["Regionais", Number(monthData?.regionais?.reduce((sum, item) => sum + Number(item.total || 0), 0) || 0).toLocaleString("pt-BR")],
  ];
  const dailyRows = (monthData?.saldoDiario || []).map((row) => [
    row.dia,
    row.equipe || 0,
    row.agente || 0,
    row.loja || 0,
    row.regionais || 0,
    row.totalDia || 0,
  ]);

  imprimirHtml(
    buildPdfShell({
      title: "Entregas do Mês",
      subtitle: `${month} 2026 · distribuição por canal`,
      sections: [
        buildMetaHtmlTable("Resumo", ["Indicador", "Valor"], resumoRows),
        buildMetaHtmlTable(
          "Distribuição diária",
          ["Dia", "Técnico", "Agente", "Loja", "Regionais", "Total dia"],
          dailyRows,
        ),
      ],
    }),
    { areaId: "relatorio-entregas-print", styleId: "relatorio-entregas-style" },
  );
}

export async function exportEntregaMesXlsx(month, monthData) {
  const workbook = new ExcelJS.Workbook();
  const resumo = workbook.addWorksheet("Resumo");
  resumo.addRow(["Indicador", "Valor"]);
  applyHeaderStyle(resumo.getRow(1));
  [
    ["Meta do mês", Number(monthData?.meta || 0)],
    ["Total realizado", Number(monthData?.totalOS || 0)],
    ["Técnico retirada", Number(monthData?.technicians?.reduce((sum, item) => sum + Number(item.total || 0), 0) || 0)],
    ["Agente autorizado", Number(monthData?.agenteTotal || 0)],
    ["Entregue em loja", Number(monthData?.lojaTotal || 0)],
    ["Regionais", Number(monthData?.regionais?.reduce((sum, item) => sum + Number(item.total || 0), 0) || 0)],
  ].forEach((row) => resumo.addRow(row));

  const diario = workbook.addWorksheet("Distribuição diária");
  diario.addRow(["Dia", "Técnico", "Agente", "Loja", "Regionais", "Total dia"]);
  applyHeaderStyle(diario.getRow(1));
  (monthData?.saldoDiario || []).forEach((row) => {
    diario.addRow([
      row.dia || 0,
      row.equipe || 0,
      row.agente || 0,
      row.loja || 0,
      row.regionais || 0,
      row.totalDia || 0,
    ]);
  });

  await saveWorkbook(workbook, monthFileName("relatorio-entregas", month, "xlsx"));
}

export function exportAgentesPdf(month, agentesData) {
  const rows = (agentesData?.cidadesRanking || agentesData?.cidades || []).map(
    (item, index) => [
      `${index + 1}º`,
      item.nome || item.cidade || "-",
      Number(item.cancelamentos || 0).toLocaleString("pt-BR"),
      Number(item.meta80 || item.meta || 0).toLocaleString("pt-BR"),
      Number(item.realizado || item.total || 0).toLocaleString("pt-BR"),
      `${Number(item.pct || 0).toFixed(1)}%`,
    ],
  );

  imprimirHtml(
    buildPdfShell({
      title: "Agentes Autorizados",
      subtitle: `${month} 2026 · desempenho por cidade`,
      sections: [
        buildMetaHtmlTable(
          "Cidades do mês",
          ["Posição", "Cidade", "Cancelamentos", "Meta 80%", "Realizado", "%"],
          rows,
        ),
      ],
    }),
    { areaId: "relatorio-agentes-print", styleId: "relatorio-agentes-style" },
  );
}

export async function exportAgentesXlsx(month, agentesData) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Agentes autorizados");
  sheet.addRow([
    "Posição",
    "Cidade",
    "Cancelamentos",
    "Meta 80%",
    "Realizado",
    "%",
  ]);
  applyHeaderStyle(sheet.getRow(1));
  (agentesData?.cidadesRanking || agentesData?.cidades || []).forEach(
    (item, index) => {
      sheet.addRow([
        `${index + 1}º`,
        item.nome || item.cidade || "-",
        Number(item.cancelamentos || 0),
        Number(item.meta80 || item.meta || 0),
        Number(item.realizado || item.total || 0),
        Number(item.pct || 0),
      ]);
    },
  );
  await saveWorkbook(workbook, monthFileName("relatorio-agentes", month, "xlsx"));
}

export function exportMapaPdf(ordens, ultimaAtualizacao) {
  gerarPDFMapa(ordens || [], ultimaAtualizacao || null);
}

export async function exportMapaXlsx(ordens = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mapa");
  sheet.addRow([
    "OS",
    "Status",
    "Tipo",
    "Cidade",
    "Regional",
    "Agente",
    "Cliente",
    "Código cliente",
    "Técnico",
    "Endereço",
  ]);
  applyHeaderStyle(sheet.getRow(1));
  ordens.forEach((item) => {
    sheet.addRow([
      item.num_os || "",
      item.status || "",
      item.tipo || "",
      item.cidade || "",
      item.regional || "",
      item.agente ? "Sim" : "Não",
      item.nome_cliente || "",
      item.codigo_cliente || "",
      item.tecnico || "",
      item.endereco_resumo || item.endereco || "",
    ]);
  });
  await saveWorkbook(workbook, "relatorio-mapa.xlsx");
}

export function exportMatchPdf(ordens = [], ultimaAtualizacao = null) {
  const matchData = buildMatchOSData(ordens);
  const generatedAt = formatarDataGeracao(new Date(), {
    incluirPreposicao: true,
  });
  const lastUpdate = ultimaAtualizacao?.data
    ? formatarDataGeracao(
        ultimaAtualizacao.data?.toDate?.() || new Date(ultimaAtualizacao.data),
      )
    : "Não informado";

  const regionaisRows = (matchData.regionais || []).map((item) => [
    item.regional,
    item.totalCidades,
    item.totalMatches,
  ]);
  const agentesRows = (matchData.agentes || []).map((item) => [
    item.regional,
    item.totalCidades,
    item.totalMatches,
  ]);

  imprimirHtml(
    `
      <div style="font-family:Arial,sans-serif;background:#fff;color:#0f172a;padding:24px">
        <div style="background:linear-gradient(135deg,#1a0050 0%,#003087 55%,#0052cc 100%);padding:24px 28px;border-radius:16px;color:#fff;margin-bottom:20px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.68)">Sempre Internet</div>
          <div style="margin-top:8px;font-size:28px;font-weight:800">Relatório de Match</div>
          <div style="margin-top:4px;font-size:13px;color:rgba(255,255,255,.82)">Última atualização: ${lastUpdate}</div>
          <div style="margin-top:10px;font-size:11px;color:rgba(255,255,255,.66)">Gerado em ${generatedAt}</div>
        </div>
        ${buildMetaHtmlTable(
          "Resumo",
          ["Grupo", "Total cidades", "Total matches"],
          [
            ["Regionais", matchData.resumo.totalRegionais, matchData.regionais.reduce((sum, item) => sum + item.totalMatches, 0)],
            ["Agentes autorizados", matchData.resumo.totalAgentes, matchData.agentes.reduce((sum, item) => sum + item.totalMatches, 0)],
            ["Geral", matchData.resumo.totalCidades, matchData.resumo.totalMatches],
          ],
        )}
        ${buildMetaHtmlTable("Matches por regional", ["Regional", "Cidades", "Matches"], regionaisRows)}
        ${buildMetaHtmlTable("Matches por agente", ["Grupo", "Cidades", "Matches"], agentesRows)}
      </div>
    `,
    { areaId: "relatorio-match-print", styleId: "relatorio-match-style" },
  );
}

export async function exportMatchXlsx(ordens = []) {
  const workbook = new ExcelJS.Workbook();
  const matchData = buildMatchOSData(ordens);

  const ordensSheet = workbook.addWorksheet("Ordens");
  ordensSheet.addRow([
    "OS",
    "Status",
    "Tipo",
    "Cidade",
    "Regional",
    "Agente",
    "Cliente",
    "Endereco",
  ]);
  applyHeaderStyle(ordensSheet.getRow(1));
  ordens.forEach((item) => {
    ordensSheet.addRow([
      item.num_os || "",
      item.status || "",
      item.tipo || "",
      item.cidade || "",
      item.regional || "",
      item.agente ? "Sim" : "Não",
      item.nome_cliente || "",
      item.endereco_resumo || item.endereco || "",
    ]);
  });

  const resumoSheet = workbook.addWorksheet("Resumo");
  resumoSheet.addRow(["Grupo", "Total cidades", "Total matches"]);
  applyHeaderStyle(resumoSheet.getRow(1));
  [
    ["Regionais", matchData.resumo.totalRegionais, matchData.regionais.reduce((sum, item) => sum + item.totalMatches, 0)],
    ["Agentes autorizados", matchData.resumo.totalAgentes, matchData.agentes.reduce((sum, item) => sum + item.totalMatches, 0)],
    ["Geral", matchData.resumo.totalCidades, matchData.resumo.totalMatches],
  ].forEach((row) => resumoSheet.addRow(row));

  await saveWorkbook(workbook, "relatorio-match.xlsx");
}


import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  PackageCheck,
  PackageX,
  ReceiptText,
  Plug,
  Search,
  Settings,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import ModalShell from "../../../components/ui/ModalShell";
import { useAuthContext } from "../../../context/AuthContext";
import { addClusterLogo } from "../../../utils/pdfBranding";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import {
  buscarConfigEntregasTecnicos,
  salvarConfigEntregasTecnicos,
} from "../services/entregasTecnicosConfigService";

const STATUS = {
  VALIDA: "válida",
  PENDENTE: "pendente",
  INVALIDA: "inválida",
};

const entregasDemo = [
  {
    id: "1",
    tecnico: "Carlos Henrique",
    empresa: "Sempre Internet",
    regional: "Metropolitana",
    mes: "2026-07",
    os: "OS-184921",
    equipamento: "ONU Fiberhome",
    identificador: "A8:32:9A:44:10:21",
    fechamentoOs: "2026-07-28",
    entrega: "2026-07-29",
    status: STATUS.VALIDA,
    motivo: "O.S. fechada e equipamento entregue dentro do prazo.",
  },
  {
    id: "2",
    tecnico: "Mariana Souza",
    empresa: "Parceira Litoral",
    regional: "Litoral",
    mes: "2026-07",
    os: "OS-184712",
    equipamento: "Roteador Wi-Fi 6",
    identificador: "SN-882019",
    fechamentoOs: "2026-07-24",
    entrega: "2026-07-25",
    status: STATUS.VALIDA,
    motivo: "Match por técnico, cliente e serial.",
  },
  {
    id: "3",
    tecnico: "Rafael Lima",
    empresa: "Sempre Internet",
    regional: "Norte",
    mes: "2026-07",
    os: "OS-184333",
    equipamento: "ONU Huawei",
    identificador: "F4:9E:EF:20:17:03",
    fechamentoOs: "2026-07-18",
    entrega: "2026-07-22",
    status: STATUS.PENDENTE,
    motivo: "Entrega encontrada, mas a O.S. ainda precisa de confirmação.",
  },
  {
    id: "4",
    tecnico: "Carlos Henrique",
    empresa: "Sempre Internet",
    regional: "Metropolitana",
    mes: "2026-07",
    os: "OS-183991",
    equipamento: "Roteador Mesh",
    identificador: "SN-550173",
    fechamentoOs: "2026-07-10",
    entrega: "2026-07-17",
    status: STATUS.INVALIDA,
    motivo: "Entrega fora da janela configurada para pagamento.",
  },
  {
    id: "5",
    tecnico: "Mariana Souza",
    empresa: "Parceira Litoral",
    regional: "Litoral",
    mes: "2026-06",
    os: "OS-180442",
    equipamento: "ONU ZTE",
    identificador: "34:B7:DA:90:44:13",
    fechamentoOs: "2026-06-29",
    entrega: "2026-06-29",
    status: STATUS.VALIDA,
    motivo: "Equipamento entregue no mesmo dia do fechamento.",
  },
  {
    id: "6",
    tecnico: "Beatriz Nunes",
    empresa: "Parceira Sul",
    regional: "Sul",
    mes: "2026-07",
    os: "OS-184870",
    equipamento: "ONU Intelbras",
    identificador: "SN-118730",
    fechamentoOs: "2026-07-27",
    entrega: "",
    status: STATUS.PENDENTE,
    motivo: "O.S. fechada encontrada, aguardando movimentação no Playground.",
  },
];

const statusStyle = {
  [STATUS.VALIDA]: "border-green-200 bg-green-50 text-green-700",
  [STATUS.PENDENTE]: "border-amber-200 bg-amber-50 text-amber-700",
  [STATUS.INVALIDA]: "border-red-200 bg-red-50 text-red-600",
};

const statusIcon = {
  [STATUS.VALIDA]: CheckCircle2,
  [STATUS.PENDENTE]: Clock3,
  [STATUS.INVALIDA]: PackageX,
};

const DEFAULT_CONFIG = {
  valorPorEntrega: 8,
  pagamentoAteDia: 10,
  statusOsValido: "Fechada",
  contarSomenteComEquipamento: true,
  bloquearDuplicidade: true,
};

const FALLBACK_REGIONAIS = ["Metropolitana", "Litoral", "Norte", "Sul"];

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    valorPorEntrega: Number(config.valorPorEntrega ?? DEFAULT_CONFIG.valorPorEntrega),
    pagamentoAteDia: Number(config.pagamentoAteDia ?? DEFAULT_CONFIG.pagamentoAteDia),
    statusOsValido: config.statusOsValido || DEFAULT_CONFIG.statusOsValido,
    contarSomenteComEquipamento:
      typeof config.contarSomenteComEquipamento === "boolean"
        ? config.contarSomenteComEquipamento
        : DEFAULT_CONFIG.contarSomenteComEquipamento,
    bloquearDuplicidade:
      typeof config.bloquearDuplicidade === "boolean"
        ? config.bloquearDuplicidade
        : DEFAULT_CONFIG.bloquearDuplicidade,
  };
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatMonth(value) {
  const [year, month] = String(value || "").split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate - startDate) / 86400000);
}

function resolveValor(item, config) {
  return item.status === STATUS.VALIDA ? Number(config.valorPorEntrega || 0) : 0;
}

function buildRanking(entregas, config) {
  const map = new Map();
  entregas.forEach((item) => {
    const current = map.get(item.tecnico) || {
      tecnico: item.tecnico,
      empresa: item.empresa,
      regional: item.regional,
      total: 0,
      validas: 0,
      pendentes: 0,
      invalidas: 0,
      valor: 0,
      entregas: [],
    };

    current.total += 1;
    current.entregas.push(item);
    current.valor += resolveValor(item, config);
    if (item.status === STATUS.VALIDA) current.validas += 1;
    if (item.status === STATUS.PENDENTE) current.pendentes += 1;
    if (item.status === STATUS.INVALIDA) current.invalidas += 1;
    map.set(item.tecnico, current);
  });

  return [...map.values()].sort((a, b) => b.validas - a.validas || b.valor - a.valor);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function buildReportRows(entregas, config, report) {
  return entregas.filter((item) => {
    const tecnicoOk = report.tecnico === "Todos" || item.tecnico === report.tecnico;
    const empresaOk = report.empresa === "Todas" || item.empresa === report.empresa;
    const mesOk = report.mes === "Todos" || item.mes === report.mes;
    return tecnicoOk && empresaOk && mesOk;
  }).map((item) => ({
    ...item,
    valorCalculado: resolveValor(item, config),
    diasParaEntrega: daysBetween(item.fechamentoOs, item.entrega),
  }));
}

function buildPaymentRows(entregas, config, filters) {
  return entregas
    .filter((item) => {
      const regionalOk =
        filters.regional === "Todas" || item.regional === filters.regional;
      const tecnicoOk =
        filters.tecnico === "Todos" || item.tecnico === filters.tecnico;
      const empresaOk =
        filters.empresa === "Todas" || item.empresa === filters.empresa;
      const mesOk = filters.mes === "Todos" || item.mes === filters.mes;
      const statusOk = filters.status === "todos" || item.status === filters.status;
      return regionalOk && tecnicoOk && empresaOk && mesOk && statusOk;
    })
    .map((item) => ({
      ...item,
      valorCalculado: resolveValor(item, config),
      diasParaEntrega: daysBetween(item.fechamentoOs, item.entrega),
    }));
}

function buildRegionalPayments(rows) {
  const map = new Map();

  rows.forEach((item) => {
    const current = map.get(item.regional) || {
      regional: item.regional,
      total: 0,
      validas: 0,
      pendentes: 0,
      invalidas: 0,
      valor: 0,
      tecnicos: new Set(),
      empresas: new Set(),
    };

    current.total += 1;
    current.valor += item.valorCalculado;
    current.tecnicos.add(item.tecnico);
    current.empresas.add(item.empresa);
    if (item.status === STATUS.VALIDA) current.validas += 1;
    if (item.status === STATUS.PENDENTE) current.pendentes += 1;
    if (item.status === STATUS.INVALIDA) current.invalidas += 1;
    map.set(item.regional, current);
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      tecnicos: item.tecnicos.size,
      empresas: item.empresas.size,
    }))
    .sort((a, b) => b.valor - a.valor || b.validas - a.validas);
}

function buildPaymentSummary(rows) {
  return {
    total: rows.length,
    validas: rows.filter((item) => item.status === STATUS.VALIDA).length,
    pendentes: rows.filter((item) => item.status === STATUS.PENDENTE).length,
    invalidas: rows.filter((item) => item.status === STATUS.INVALIDA).length,
    valor: rows.reduce((sum, item) => sum + item.valorCalculado, 0),
  };
}

function exportCsv(rows, config) {
  const header = [
    "Técnico",
    "Empresa",
    "Regional",
    "Mês",
    "O.S.",
    "Equipamento",
    "Identificador",
    "Fechamento O.S.",
    "Entrega em estoque",
    "Dias",
    "Status",
    "Valor",
    "Motivo",
  ];
  const csvRows = rows.map((item) => [
    item.tecnico,
    item.empresa,
    item.regional,
    item.mes,
    item.os,
    item.equipamento,
    item.identificador,
    formatDate(item.fechamentoOs),
    formatDate(item.entrega),
    item.diasParaEntrega ?? "",
    item.status,
    resolveValor(item, config).toFixed(2).replace(".", ","),
    item.motivo,
  ]);
  const content = [header, ...csvRows]
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"),
    )
    .join("\n");
  const blob = new Blob(["\ufeff", content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-entregas-tecnicos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function exportPdf(rows, config, report, summary) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("Relatório de Entregas dos Técnicos", 40, 42);
  await addClusterLogo(pdf, { width: 76, height: 38, y: 22, marginRight: 40 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    `Técnico: ${report.tecnico}  |  Empresa: ${report.empresa}  |  Competência: ${
      report.mes === "Todos" ? "Todas" : formatMonth(report.mes)
    }`,
    40,
    62,
  );
  pdf.text(
    `Contagem: dia 1 ao último dia do mês  |  Pagamento até dia ${config.pagamentoAteDia} do mês seguinte  |  Valor por entrega válida: ${money(config.valorPorEntrega)}`,
    40,
    78,
  );

  autoTable(pdf, {
    startY: 96,
    head: [["Registros", "Válidas", "Pendentes", "Inválidas", "Total a pagar"]],
    body: [[
      summary.total,
      summary.validas,
      summary.pendentes,
      summary.invalidas,
      money(summary.valor),
    ]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  });

  autoTable(pdf, {
    startY: (pdf.lastAutoTable?.finalY || 140) + 16,
    head: [[
      "Técnico",
      "Empresa",
      "O.S.",
      "Equipamento",
      "Identificador",
      "Fechamento O.S.",
      "Entrega em estoque",
      "Status",
      "Valor",
    ]],
    body: rows.map((item) => [
      item.tecnico,
      item.empresa,
      item.os,
      item.equipamento,
      item.identificador,
      formatDate(item.fechamentoOs),
      formatDate(item.entrega),
      item.status,
      money(resolveValor(item, config)),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [17, 24, 39], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 92 },
      2: { cellWidth: 62 },
      3: { cellWidth: 95 },
      4: { cellWidth: 92 },
      5: { cellWidth: 72 },
      6: { cellWidth: 78 },
      7: { cellWidth: 55 },
      8: { cellWidth: 55, halign: "right" },
    },
    didDrawPage: () => {
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        `Gerado em ${new Date().toLocaleString("pt-BR")}`,
        40,
        pdf.internal.pageSize.getHeight() - 18,
      );
      pdf.text(
        `Página ${pdf.internal.getNumberOfPages()}`,
        pageWidth - 80,
        pdf.internal.pageSize.getHeight() - 18,
      );
    },
  });

  pdf.save("relatorio-entregas-tecnicos.pdf");
}

async function exportPagamentosRegionaisPdf(rows, regionais, config, filters, summary) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("Pagamentos por Regional", 40, 42);
  await addClusterLogo(pdf, { width: 76, height: 38, y: 22, marginRight: 40 });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    `Regional: ${filters.regional}  |  Técnico: ${filters.tecnico}  |  Empresa: ${filters.empresa}  |  Competência: ${
      filters.mes === "Todos" ? "Todas" : formatMonth(filters.mes)
    }  |  Status: ${filters.status === "todos" ? "Todos" : filters.status}`,
    40,
    62,
  );
  pdf.text(
    `Pagamento até dia ${config.pagamentoAteDia} do mês seguinte  |  Valor por entrega válida: ${money(config.valorPorEntrega)}`,
    40,
    78,
  );

  autoTable(pdf, {
    startY: 96,
    head: [["Regionais", "Registros", "Válidas", "Pendentes", "Inválidas", "Total a pagar"]],
    body: [[
      regionais.length,
      summary.total,
      summary.validas,
      summary.pendentes,
      summary.invalidas,
      money(summary.valor),
    ]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  });

  autoTable(pdf, {
    startY: (pdf.lastAutoTable?.finalY || 140) + 16,
    head: [["Regional", "Técnicos", "Empresas", "Registros", "Válidas", "Pendentes", "Inválidas", "Total a pagar"]],
    body: regionais.map((item) => [
      item.regional,
      item.tecnicos,
      item.empresas,
      item.total,
      item.validas,
      item.pendentes,
      item.invalidas,
      money(item.valor),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [17, 24, 39], textColor: 255 },
  });

  autoTable(pdf, {
    startY: (pdf.lastAutoTable?.finalY || 220) + 16,
    head: [[
      "Regional",
      "Técnico",
      "Empresa",
      "O.S.",
      "Equipamento",
      "Fechamento O.S.",
      "Entrega em estoque",
      "Status",
      "Valor",
    ]],
    body: rows.map((item) => [
      item.regional,
      item.tecnico,
      item.empresa,
      item.os,
      item.equipamento,
      formatDate(item.fechamentoOs),
      formatDate(item.entrega),
      item.status,
      money(item.valorCalculado),
    ]),
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    didDrawPage: () => {
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        `Gerado em ${new Date().toLocaleString("pt-BR")}`,
        40,
        pdf.internal.pageSize.getHeight() - 18,
      );
      pdf.text(
        `Página ${pdf.internal.getNumberOfPages()}`,
        pageWidth - 80,
        pdf.internal.pageSize.getHeight() - 18,
      );
    },
  });

  pdf.save("pagamentos-regionais-entregas.pdf");
}

function ConfiguracaoPagamentoModal({ config, saving, onSave, onClose }) {
  const [draft, setDraft] = useState(config);

  const handleDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <ModalShell onClose={onClose} showClose={false} size="3xl" bodyClassName="p-0">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Settings size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Configuração de pagamento
              </h2>
              <p className="text-sm text-gray-500">
                Regras usadas para calcular a competência mensal dos técnicos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            aria-label="Fechar configuração"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-bold text-blue-900">
              Contabilidade mensal
            </p>
              <p className="mt-1 text-sm text-blue-700">
                A competência considera entregas do dia 1 ao último dia do mês.
              O pagamento fica previsto até o dia {draft.pagamentoAteDia} do mês seguinte.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Valor por entrega válida
              </span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={draft.valorPorEntrega}
                onChange={(event) =>
                  handleDraft("valorPorEntrega", Number(event.target.value))
                }
                className="input-field"
              />
              <span className="mt-1 block text-xs text-gray-400">
                Aplicado somente às entregas válidas.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Pagar até o dia
              </span>
              <input
                type="number"
                min="1"
                max="31"
                value={draft.pagamentoAteDia}
                onChange={(event) =>
                  handleDraft("pagamentoAteDia", Number(event.target.value))
                }
                className="input-field"
              />
              <span className="mt-1 block text-xs text-gray-400">
                Padrão operacional: até o dia 10 do mês seguinte.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Status de O.S. válido
              </span>
              <input
                value={draft.statusOsValido}
                onChange={(event) => handleDraft("statusOsValido", event.target.value)}
                className="input-field"
              />
              <span className="mt-1 block text-xs text-gray-400">
                Exemplo: Fechada, Concluída.
              </span>
            </label>

            <div className="grid gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={draft.contarSomenteComEquipamento}
                  onChange={(event) =>
                    handleDraft("contarSomenteComEquipamento", event.target.checked)
                  }
                />
                <span className="text-sm font-semibold text-gray-700">
                  Exigir equipamento entregue
                </span>
              </label>

              <label className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={draft.bloquearDuplicidade}
                  onChange={(event) =>
                    handleDraft("bloquearDuplicidade", event.target.checked)
                  }
                />
                <span className="text-sm font-semibold text-gray-700">
                  Bloquear duplicidade
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
    </ModalShell>
  );
}

function PagamentosRegionaisModal({
  filters,
  onFilterChange,
  tecnicos,
  empresas,
  meses,
  regionais,
  rows,
  regionaisResumo,
  summary,
  config,
  onClose,
}) {
  return (
    <ModalShell onClose={onClose} showClose={false} size="6xl" bodyClassName="p-0">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white">
              <ReceiptText size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Pagamentos por regional
              </h2>
              <p className="text-sm text-gray-500">
                Acompanhe valores por regional, técnico, empresa, competência e status.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            aria-label="Fechar pagamentos"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Regional
              </span>
              <select
                value={filters.regional}
                onChange={(event) => onFilterChange("regional", event.target.value)}
                className="input-field"
              >
                <option value="Todas">Todas as regionais</option>
                {regionais.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Técnico
              </span>
              <select
                value={filters.tecnico}
                onChange={(event) => onFilterChange("tecnico", event.target.value)}
                className="input-field"
              >
                <option value="Todos">Todos os técnicos</option>
                {tecnicos.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Empresa
              </span>
              <select
                value={filters.empresa}
                onChange={(event) => onFilterChange("empresa", event.target.value)}
                className="input-field"
              >
                <option value="Todas">Todas as empresas</option>
                {empresas.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Competência
              </span>
              <select
                value={filters.mes}
                onChange={(event) => onFilterChange("mes", event.target.value)}
                className="input-field"
              >
                <option value="Todos">Todas as competências</option>
                {meses.map((item) => (
                  <option key={item} value={item}>
                    {formatMonth(item)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Status
              </span>
              <select
                value={filters.status}
                onChange={(event) => onFilterChange("status", event.target.value)}
                className="input-field"
              >
                <option value="todos">Todos os status</option>
                <option value={STATUS.VALIDA}>Válidas</option>
                <option value={STATUS.PENDENTE}>Pendentes</option>
                <option value={STATUS.INVALIDA}>Inválidas</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-400">Registros</p>
              <p className="text-xl font-black text-gray-900">{summary.total}</p>
            </div>
            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
              <p className="text-xs text-green-600">Válidas</p>
              <p className="text-xl font-black text-green-800">{summary.validas}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-600">Pendentes</p>
              <p className="text-xl font-black text-amber-700">{summary.pendentes}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">Inválidas</p>
              <p className="text-xl font-black text-red-700">{summary.invalidas}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-600">Total a pagar</p>
              <p className="text-xl font-black text-blue-900">{money(summary.valor)}</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-gray-100">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Regional</th>
                    <th className="px-4 py-3">Técnicos</th>
                    <th className="px-4 py-3">Empresas</th>
                    <th className="px-4 py-3">Registros</th>
                    <th className="px-4 py-3">Válidas</th>
                    <th className="px-4 py-3">Pendentes</th>
                    <th className="px-4 py-3">Inválidas</th>
                    <th className="px-4 py-3 text-right">Total a pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {regionaisResumo.map((item) => (
                    <tr key={item.regional}>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {item.regional}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.tecnicos}</td>
                      <td className="px-4 py-3 text-gray-600">{item.empresas}</td>
                      <td className="px-4 py-3 text-gray-600">{item.total}</td>
                      <td className="px-4 py-3 font-semibold text-green-700">
                        {item.validas}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-700">
                        {item.pendentes}
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-700">
                        {item.invalidas}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-gray-900">
                        {money(item.valor)}
                      </td>
                    </tr>
                  ))}
                  {!regionaisResumo.length ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                        Nenhum pagamento encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Detalhamento
            </p>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Regional</th>
                    <th className="py-2 pr-3">Técnico</th>
                    <th className="py-2 pr-3">O.S.</th>
                    <th className="py-2 pr-3">Equipamento</th>
                    <th className="py-2 pr-3">Entrega em estoque</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.slice(0, 30).map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 pr-3 font-semibold text-gray-800">
                        {item.regional}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">{item.tecnico}</td>
                      <td className="py-2 pr-3 font-mono text-gray-600">{item.os}</td>
                      <td className="py-2 pr-3 text-gray-600">{item.equipamento}</td>
                      <td className="py-2 pr-3 text-gray-600">
                        {formatDate(item.entrega)}
                      </td>
                      <td className="py-2 text-right font-bold text-gray-900">
                        {money(item.valorCalculado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={() =>
              exportPagamentosRegionaisPdf(
                rows,
                regionaisResumo,
                config,
                filters,
                summary,
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
          >
            <Download size={16} /> Baixar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
        </div>
    </ModalShell>
  );
}

export default function EntregasTecnicosPage() {
  const { currentUser } = useAuthContext();
  const { regionais: regionaisSistema } = useRegionais();
  const [selectedTecnico, setSelectedTecnico] = useState("Todos");
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [showPagamentos, setShowPagamentos] = useState(false);
  const [report, setReport] = useState({
    tecnico: "Todos",
    empresa: "Todas",
    mes: "2026-07",
  });
  const [paymentFilters, setPaymentFilters] = useState({
    regional: "Todas",
    tecnico: "Todos",
    empresa: "Todas",
    mes: "2026-07",
    status: "todos",
  });

  const regionaisNomes = useMemo(() => {
    const nomes = unique((regionaisSistema || []).map((item) => item?.nome));
    return nomes.length ? nomes : FALLBACK_REGIONAIS;
  }, [regionaisSistema]);

  const entregasBase = useMemo(
    () =>
      entregasDemo.map((item, index) => ({
        ...item,
        regional: regionaisNomes[index % regionaisNomes.length] || item.regional,
      })),
    [regionaisNomes],
  );

  const tecnicos = useMemo(() => unique(entregasBase.map((item) => item.tecnico)), [entregasBase]);
  const empresas = useMemo(() => unique(entregasBase.map((item) => item.empresa)), [entregasBase]);
  const meses = useMemo(() => unique(entregasBase.map((item) => item.mes)), [entregasBase]);
  const ranking = useMemo(() => buildRanking(entregasBase, config), [config, entregasBase]);
  const tecnicoAtual = ranking.find((item) => item.tecnico === selectedTecnico) || ranking[0];
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    let active = true;

    async function carregarConfig() {
      setConfigLoading(true);
      setConfigMessage("");
      try {
        const data = await buscarConfigEntregasTecnicos();
        if (active && data) setConfig(normalizeConfig(data));
      } catch {
        if (active) {
          setConfigMessage("Não foi possível carregar a configuração salva.");
        }
      } finally {
        if (active) setConfigLoading(false);
      }
    }

    carregarConfig();

    return () => {
      active = false;
    };
  }, []);

  const entregasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return entregasBase.filter((item) => {
      const tecnicoOk = selectedTecnico === "Todos" || item.tecnico === selectedTecnico;
      const statusOk = status === "todos" || item.status === status;
      const buscaOk =
        !termo ||
        `${item.tecnico} ${item.empresa} ${item.os} ${item.equipamento} ${item.identificador}`
          .toLowerCase()
        .includes(termo);
      return tecnicoOk && statusOk && buscaOk;
    });
  }, [busca, entregasBase, selectedTecnico, status]);

  const reportRows = useMemo(
    () => buildReportRows(entregasBase, config, report),
    [config, entregasBase, report],
  );

  const paymentRows = useMemo(
    () => buildPaymentRows(entregasBase, config, paymentFilters),
    [config, entregasBase, paymentFilters],
  );

  const regionaisPagamentos = useMemo(
    () => buildRegionalPayments(paymentRows),
    [paymentRows],
  );

  const reportSummary = useMemo(
    () => ({
      total: reportRows.length,
      validas: reportRows.filter((item) => item.status === STATUS.VALIDA).length,
      pendentes: reportRows.filter((item) => item.status === STATUS.PENDENTE).length,
      invalidas: reportRows.filter((item) => item.status === STATUS.INVALIDA).length,
      valor: reportRows.reduce((sum, item) => sum + item.valorCalculado, 0),
    }),
    [reportRows],
  );

  const paymentSummary = useMemo(
    () => buildPaymentSummary(paymentRows),
    [paymentRows],
  );

  const resumo = useMemo(
    () => ({
      total: entregasBase.length,
      validas: entregasBase.filter((item) => item.status === STATUS.VALIDA).length,
      pendentes: entregasBase.filter((item) => item.status === STATUS.PENDENTE).length,
      valor: entregasBase.reduce((sum, item) => sum + resolveValor(item, config), 0),
    }),
    [config, entregasBase],
  );

  const handleReport = (field, value) => {
    setReport((current) => ({ ...current, [field]: value }));
  };

  const handlePaymentFilter = (field, value) => {
    setPaymentFilters((current) => ({ ...current, [field]: value }));
  };

  const handleSaveConfig = async (draft) => {
    const normalized = normalizeConfig(draft);
    setConfigSaving(true);
    setConfigMessage("");
    try {
      await salvarConfigEntregasTecnicos(normalized);
      setConfig(normalized);
      setShowConfig(false);
      setConfigMessage("Configurações salvas com sucesso.");
    } catch {
      setConfigMessage("Não foi possível salvar as configurações.");
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
              <PackageCheck size={21} />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">
                Entregas dos Técnicos
              </h1>
              <p className="text-sm text-gray-500">
                Ranking, validações, configuração de pagamento e relatórios por técnico ou empresa.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              <Plug size={14} /> APIs pendentes
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
              <CalendarDays size={14} /> {formatMonth(report.mes)}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-100 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Entregas mapeadas
          </p>
          <p className="mt-1 text-2xl font-black text-gray-900">{resumo.total}</p>
        </div>
        <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
            Válidas
          </p>
          <p className="mt-1 text-2xl font-black text-green-800">{resumo.validas}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Pendentes
          </p>
          <p className="mt-1 text-2xl font-black text-amber-700">{resumo.pendentes}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Valor previsto
          </p>
          <p className="mt-1 text-2xl font-black text-blue-900">{money(resumo.valor)}</p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Settings size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Regra mensal de pagamento
              </h2>
              <p className="text-sm text-gray-500">
                Contagem do dia 1 ao último dia do mês. Pagamento previsto até o dia{" "}
                {config.pagamentoAteDia} do mês seguinte.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
              {money(config.valorPorEntrega)} por entrega válida
            </span>
            {configLoading ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                Carregando configuração...
              </span>
            ) : null}
            {configMessage ? (
              <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500">
                {configMessage}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowPagamentos(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-700 hover:bg-green-100"
            >
              <ReceiptText size={15} /> Pagamentos
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowConfig(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800"
              >
                <Settings size={15} /> Configurar
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Trophy size={18} className="text-amber-500" />
            <h2 className="text-base font-bold text-gray-900">Ranking de técnicos</h2>
          </div>

          <div className="space-y-2">
            {ranking.map((item, index) => (
              <button
                key={item.tecnico}
                type="button"
                onClick={() => setSelectedTecnico(item.tecnico)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedTecnico === item.tecnico
                    ? "border-blue-200 bg-blue-50"
                    : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">
                      {index + 1}. {item.tecnico}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {item.empresa} · {item.regional}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900">{item.validas}</p>
                    <p className="text-[11px] font-semibold text-gray-400">válidas</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white">
                <UserRound size={18} />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">
                  {tecnicoAtual?.tecnico}
                </h2>
                <p className="text-sm text-gray-500">
                  Perfil do técnico com entregas por mês e pagamento previsto.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              {money(tecnicoAtual?.valor)} previsto
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-xl font-black text-gray-900">{tecnicoAtual?.total}</p>
            </div>
            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
              <p className="text-xs text-green-600">Válidas</p>
              <p className="text-xl font-black text-green-800">{tecnicoAtual?.validas}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-600">Pendentes</p>
              <p className="text-xl font-black text-amber-700">{tecnicoAtual?.pendentes}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">Inválidas</p>
              <p className="text-xl font-black text-red-700">{tecnicoAtual?.invalidas}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Relatórios de pagamento
            </h2>
            <p className="text-sm text-gray-500">
              Gere relatórios por técnico, empresa e competência.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportCsv(reportRows, config)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <Download size={16} /> Baixar CSV
            </button>
            <button
              type="button"
              onClick={() => exportPdf(reportRows, config, report, reportSummary)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
            >
              <Download size={16} /> Baixar PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Técnico
            </span>
            <select
              value={report.tecnico}
              onChange={(event) => handleReport("tecnico", event.target.value)}
              className="input-field"
            >
              <option value="Todos">Todos os técnicos</option>
              {tecnicos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Empresa
            </span>
            <select
              value={report.empresa}
              onChange={(event) => handleReport("empresa", event.target.value)}
              className="input-field"
            >
              <option value="Todas">Todas as empresas</option>
              {empresas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Competência
            </span>
            <select
              value={report.mes}
              onChange={(event) => handleReport("mes", event.target.value)}
              className="input-field"
            >
              <option value="Todos">Todas as competências</option>
              {meses.map((item) => (
                <option key={item} value={item}>
                  {formatMonth(item)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-400">Registros</p>
            <p className="text-xl font-black text-gray-900">{reportSummary.total}</p>
          </div>
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
            <p className="text-xs text-green-600">Válidas</p>
            <p className="text-xl font-black text-green-800">{reportSummary.validas}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-600">Pendentes</p>
            <p className="text-xl font-black text-amber-700">
              {reportSummary.pendentes}
            </p>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">Inválidas</p>
            <p className="text-xl font-black text-red-700">{reportSummary.invalidas}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-xs text-blue-600">Total a pagar</p>
            <p className="text-xl font-black text-blue-900">{money(reportSummary.valor)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Validações de entregas</h2>
            <p className="text-sm text-gray-500">
              Modelo visual da conciliação entre O.S. fechada e equipamento entregue.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="input-field w-full pl-9 sm:min-w-[240px]"
                placeholder="Buscar O.S., técnico, empresa ou equipamento"
              />
            </div>
            <select
              value={selectedTecnico}
              onChange={(event) => setSelectedTecnico(event.target.value)}
              className="input-field sm:w-auto"
            >
              <option value="Todos">Todos os técnicos</option>
              {tecnicos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="input-field sm:w-auto"
            >
              <option value="todos">Todos os status</option>
              <option value={STATUS.VALIDA}>Válidas</option>
              <option value={STATUS.PENDENTE}>Pendentes</option>
              <option value={STATUS.INVALIDA}>Inválidas</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Técnico</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">O.S.</th>
                  <th className="px-4 py-3">Equipamento</th>
                  <th className="px-4 py-3">Datas</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {entregasFiltradas.map((item) => {
                  const StatusIcon = statusIcon[item.status] || AlertTriangle;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900">{item.tecnico}</p>
                        <p className="text-xs text-gray-500">{item.regional}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                        {item.empresa}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {item.os}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{item.equipamento}</p>
                        <p className="font-mono text-xs text-gray-500">
                          {item.identificador}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <p>Fechamento: {formatDate(item.fechamentoOs)}</p>
                        <p>Entrega em estoque: {formatDate(item.entrega)}</p>
                        <p>
                          Janela:{" "}
                          {daysBetween(item.fechamentoOs, item.entrega) ?? "-"} dia(s)
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
                            statusStyle[item.status]
                          }`}
                        >
                          <StatusIcon size={13} />
                          {item.status}
                        </span>
                        <p className="mt-1 max-w-xs text-xs text-gray-500">{item.motivo}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {money(resolveValor(item, config))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {showConfig && isAdmin ? (
        <ConfiguracaoPagamentoModal
          config={config}
          saving={configSaving}
          onSave={handleSaveConfig}
          onClose={() => setShowConfig(false)}
        />
      ) : null}

      {showPagamentos ? (
        <PagamentosRegionaisModal
          filters={paymentFilters}
          onFilterChange={handlePaymentFilter}
          tecnicos={tecnicos}
          empresas={empresas}
          meses={meses}
          regionais={regionaisNomes}
          rows={paymentRows}
          regionaisResumo={regionaisPagamentos}
          summary={paymentSummary}
          config={config}
          onClose={() => setShowPagamentos(false)}
        />
      ) : null}
    </div>
  );
}


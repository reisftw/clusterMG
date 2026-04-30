import {
  ClipboardList,
  Download,
  FileDown,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { useAuditoria } from "../hooks/useAuditoria";
import { resolveFirestoreDate } from "../../../services/firestoreDate";
import InternalStaticDataStatus from "../../../components/ui/InternalStaticDataStatus";

function formatarDataHora(timestamp) {
  const date = resolveFirestoreDate(timestamp);
  if (!date) return "--";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCriticidade(item) {
  const acao = String(item?.acao || "").toLowerCase();
  if (
    acao.includes("removeu") ||
    acao.includes("excluiu") ||
    acao.includes("deletou")
  ) {
    return { label: "Alta", badge: "bg-red-100 text-red-700", row: "bg-red-50/40" };
  }
  if (acao.includes("atualizou") || acao.includes("editou")) {
    return {
      label: "Media",
      badge: "bg-amber-100 text-amber-700",
      row: "bg-amber-50/30",
    };
  }
  return {
    label: "Baixa",
    badge: "bg-emerald-100 text-emerald-700",
    row: "",
  };
}

function exportarCSV(atividades) {
  const rows = atividades.map((item) => ({
    data: formatarDataHora(item.timestamp),
    usuario: item.nome || "",
    acao: item.acao || "",
    modulo: item.modulo || "",
    criticidade: getCriticidade(item).label,
    detalhes: item.detalhes ? JSON.stringify(item.detalhes) : "",
  }));

  const headers = ["Data", "Usuario", "Acao", "Modulo", "Criticidade", "Detalhes"];
  const csv = [
    headers.join(";"),
    ...rows.map((row) =>
      [
        row.data,
        row.usuario,
        row.acao,
        row.modulo,
        row.criticidade,
        row.detalhes.replaceAll(";", ","),
      ]
        .map((value) => `"${String(value || "").replaceAll('"', '""')}"`)
        .join(";"),
    ),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportarPDF(atividades) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text("Relatorio de Auditoria", 14, 16);
  doc.setFontSize(10);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    14,
    23,
  );

  autoTable(doc, {
    startY: 30,
    head: [["Data", "Usuario", "Acao", "Modulo", "Criticidade", "Detalhes"]],
    body: atividades.map((item) => [
      formatarDataHora(item.timestamp),
      item.nome || "--",
      item.acao || "--",
      item.modulo || "--",
      getCriticidade(item).label,
      item.detalhes ? JSON.stringify(item.detalhes) : "--",
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175] },
    columnStyles: {
      5: { cellWidth: 95 },
    },
  });

  doc.save(`auditoria-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function InfoCard({ title, value, icon, tone }) {
  const IconComponent = icon;
  const tones = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    red: "bg-red-50 border-red-100 text-red-700",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-3">
          <IconComponent size={20} />
        </div>
      </div>
    </div>
  );
}

export default function AuditoriaPage() {
  const {
    filtros,
    setFiltros,
    atividades,
    loading,
    carregar,
    opcoesModulo,
    opcoesUsuario,
    opcoesAcao,
  } = useAuditoria();

  const qtdUsuarios = new Set(atividades.map((item) => item.nome).filter(Boolean))
    .size;
  const qtdModulos = new Set(atividades.map((item) => item.modulo).filter(Boolean))
    .size;
  const qtdCriticos = atividades.filter(
    (item) => getCriticidade(item).label === "Alta",
  ).length;

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
          <p className="text-sm text-gray-500">
            Consulte alteracoes registradas no sistema por modulo, usuario,
            periodo e criticidade.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => carregar(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          <button
            onClick={() => exportarCSV(atividades)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Download size={16} />
            CSV
          </button>
          <button
            onClick={() => exportarPDF(atividades)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <FileText size={16} />
            PDF
          </button>
        </div>
      </div>

      <InternalStaticDataStatus className="max-w-xl" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          title="Registros filtrados"
          value={atividades.length}
          icon={ClipboardList}
          tone="blue"
        />
        <InfoCard
          title="Usuarios envolvidos"
          value={qtdUsuarios}
          icon={ShieldCheck}
          tone="emerald"
        />
        <InfoCard
          title="Modulos com atividade"
          value={qtdModulos}
          icon={Filter}
          tone="amber"
        />
        <InfoCard
          title="Acoes criticas"
          value={qtdCriticos}
          icon={ShieldAlert}
          tone="red"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">Filtros</h2>
          <p className="text-sm text-gray-500">
            Refine a consulta para localizar alteracoes especificas.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
            Modulo
            <select
              value={filtros.modulo}
              onChange={(e) =>
                setFiltros((current) => ({ ...current, modulo: e.target.value }))
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
            >
              <option value="">Todos</option>
              {opcoesModulo.map((modulo) => (
                <option key={modulo} value={modulo}>
                  {modulo}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
            Usuario
            <select
              value={filtros.usuario}
              onChange={(e) =>
                setFiltros((current) => ({ ...current, usuario: e.target.value }))
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
            >
              <option value="">Todos</option>
              {opcoesUsuario.map((usuario) => (
                <option key={usuario} value={usuario}>
                  {usuario}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
            Acao
            <select
              value={filtros.acao}
              onChange={(e) =>
                setFiltros((current) => ({ ...current, acao: e.target.value }))
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
            >
              <option value="">Todas</option>
              {opcoesAcao.map((acao) => (
                <option key={acao} value={acao}>
                  {acao}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
            Busca textual
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={filtros.busca}
                onChange={(e) =>
                  setFiltros((current) => ({ ...current, busca: e.target.value }))
                }
                placeholder="Nome, modulo, detalhe..."
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
            Data inicial
            <input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) =>
                setFiltros((current) => ({
                  ...current,
                  dataInicio: e.target.value,
                }))
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-gray-600">
            Data final
            <input
              type="date"
              value={filtros.dataFim}
              onChange={(e) =>
                setFiltros((current) => ({
                  ...current,
                  dataFim: e.target.value,
                }))
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Historico de alteracoes
            </h2>
            <p className="text-sm text-gray-500">
              Lista detalhada das acoes registradas no sistema.
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
            <span className="inline-flex items-center gap-1">
              <FileDown size={13} />
              {atividades.length} registro(s)
            </span>
          </div>
        </div>

        {atividades.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhuma atividade encontrada para os filtros informados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-3 font-semibold">Data</th>
                  <th className="px-3 py-3 font-semibold">Usuario</th>
                  <th className="px-3 py-3 font-semibold">Acao</th>
                  <th className="px-3 py-3 font-semibold">Modulo</th>
                  <th className="px-3 py-3 font-semibold">Criticidade</th>
                  <th className="px-3 py-3 font-semibold">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {atividades.map((item) => {
                  const criticidade = getCriticidade(item);

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-50 align-top last:border-b-0 ${criticidade.row}`}
                    >
                      <td className="px-3 py-3 text-gray-700">
                        {formatarDataHora(item.timestamp)}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        {item.nome || "--"}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{item.acao || "--"}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                          {item.modulo || "--"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${criticidade.badge}`}
                        >
                          {criticidade.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        <pre className="whitespace-pre-wrap break-words font-sans">
                          {item.detalhes
                            ? JSON.stringify(item.detalhes, null, 2)
                            : "--"}
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { BarChart3, CheckCircle2, FileDown, FileSpreadsheet, Link2, Search, Store, UploadCloud } from "lucide-react";

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeKey = (key) =>
  normalizeText(key)
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const normalizeCode = (value) => String(value ?? "").replace(/\D/g, "").trim();

const normalizeRows = (rows) =>
  rows.map((row) => {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      normalized[normalizeKey(key)] = value;
    });
    return normalized;
  });

const readField = (row, keys, fallback = "") => {
  for (const key of keys) {
    const value = row?.[normalizeKey(key)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
};

const parseDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const datePart = text.split(" ")[0];
  const br = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = value instanceof Date ? value : parseDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
};

const parseSheet = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return normalizeRows(XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" }));
};

const buildAtendimento = (row) => {
  const codigo = normalizeCode(readField(row, ["codigo_cliente", "codigo", "codigocliente"]));
  return {
    codigo,
    nome: String(readField(row, ["nome_razaosocial", "nome", "cliente", "razao_social"])).trim(),
    servico: String(readField(row, ["servico", "plano"])).trim(),
    cidade: String(readField(row, ["cidade", "municipio"])).trim(),
    raw: row,
  };
};

const buildOs = (row) => {
  const codigo = normalizeCode(readField(row, ["codigo_cliente", "codigo", "codigocliente"]));
  const tipo = String(readField(row, ["tipo_ordem_servico", "tipo", "tipoos"])).trim();
  const dataCadastro = String(readField(row, ["data_cadastro", "dataabertura", "data_cadastro_os", "data"])).trim();
  return {
    codigo,
    nome: String(readField(row, ["nome_razaosocial", "nome", "cliente", "razao_social"])).trim(),
    status: String(readField(row, ["status"])).trim(),
    tecnicos: String(readField(row, ["tecnicos", "tecnico"])).trim(),
    numeroOs: String(readField(row, ["numero_ordem_servico", "num_os", "numeroos", "os"])).trim(),
    tipo,
    endereco: String(readField(row, ["endereco"])).trim(),
    numero: String(readField(row, ["numero"])).trim(),
    bairro: String(readField(row, ["bairro"])).trim(),
    cidade: String(readField(row, ["cidade", "municipio"])).trim(),
    dataCadastro,
    dataObj: parseDate(dataCadastro),
    servico: String(readField(row, ["servico", "plano"])).trim(),
    telefone: String(readField(row, ["telefone_primario", "telefone", "telefones"])).trim(),
    raw: row,
  };
};

const dedupeBy = (items, getKey) => {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (key && !map.has(key)) map.set(key, item);
  });
  return [...map.values()];
};

const countBy = (items, getKey) =>
  [...items.reduce((map, item) => {
    const key = String(getKey(item) || "Não informado").trim() || "Não informado";
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map())]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));

const triggerDownload = (buffer, fileName) => {
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
};

const KpiCard = ({ label, value, tone = "orange", icon: Icon = BarChart3 }) => {
  const tones = {
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-white text-slate-800",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide opacity-80">
        <Icon size={16} />
        {label}
      </div>
      <strong className="mt-2 block text-3xl font-black">{Number(value || 0).toLocaleString("pt-BR")}</strong>
    </div>
  );
};

const UploadBox = ({ label, fileName, inputRef, onFile }) => (
  <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-4">
    <p className="text-sm font-black text-slate-800">{label}</p>
    <p className="mt-1 min-h-5 text-xs font-semibold text-slate-500">{fileName || "Nenhum arquivo selecionado"}</p>
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600"
    >
      <UploadCloud size={16} />
      Selecionar XLSX
    </button>
    <input
      ref={inputRef}
      type="file"
      accept=".xlsx,.xls"
      className="hidden"
      onChange={(event) => onFile(event.target.files?.[0] || null)}
    />
  </div>
);

const exportWorkbook = async ({ matches, clientesEntregues, atendimentosUnicos, osUnicas }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Retiradas";
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B00" } };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };
  const border = { style: "thin", color: { argb: "FFE2E8F0" } };

  const addTableSheet = (name, rows, columns) => {
    const sheet = workbook.addWorksheet(name);
    sheet.views = [{ showGridLines: false }];
    sheet.columns = columns.map((col) => ({ header: col.header, key: col.key, width: col.width || 18 }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: border, left: border, bottom: border, right: border };
    });
    rows.forEach((row) => sheet.addRow(row));
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    });
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + columns.length)}1` };
    return sheet;
  };

  const dashboard = workbook.addWorksheet("Dashboard");
  dashboard.views = [{ showGridLines: false }];
  dashboard.mergeCells("A1:F1");
  dashboard.getCell("A1").value = "Verificacao Entrega Loja";
  dashboard.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  dashboard.getCell("A1").fill = headerFill;
  dashboard.getCell("A1").alignment = { horizontal: "center" };
  const cards = [
    ["Atendimentos únicos", atendimentosUnicos.length],
    ["O.S únicas", osUnicas.length],
    ["O.S com atendimento", matches.length],
    ["Clientes entregues", clientesEntregues.length],
  ];
  cards.forEach(([label, value], index) => {
    const col = 1 + index;
    dashboard.getCell(3, col).value = label;
    dashboard.getCell(3, col).font = { bold: true, color: { argb: "FFFFFFFF" } };
    dashboard.getCell(3, col).fill = headerFill;
    dashboard.getCell(4, col).value = value;
    dashboard.getCell(4, col).font = { bold: true, size: 20 };
    dashboard.getColumn(col).width = 22;
  });

  const baseColumns = [
    { header: "Código cliente", key: "codigo", width: 16 },
    { header: "Cliente", key: "nome", width: 34 },
    { header: "Numero O.S", key: "numeroOs", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Cidade", key: "cidade", width: 22 },
    { header: "Data cadastro", key: "dataCadastro", width: 18 },
    { header: "Serviço atendimento", key: "servicoAtendimento", width: 45 },
    { header: "Serviço O.S", key: "servicoOs", width: 45 },
    { header: "Telefone", key: "telefone", width: 18 },
  ];
  const rows = matches.map((item) => ({
    codigo: item.codigo,
    nome: item.nome,
    numeroOs: item.numeroOs,
    status: item.status,
    cidade: item.cidade,
    dataCadastro: item.dataCadastro,
    servicoAtendimento: item.atendimento?.servico || "",
    servicoOs: item.servico,
    telefone: item.telefone,
  }));
  addTableSheet("Matches", rows, baseColumns);
  addTableSheet(
    "Clientes Entregues",
    clientesEntregues,
    [
      { header: "Código cliente", key: "codigo", width: 16 },
      { header: "Cliente", key: "nome", width: 38 },
      { header: "Serviço", key: "servico", width: 48 },
      { header: "Cidade", key: "cidade", width: 22 },
      { header: "Qtd O.S", key: "totalOs", width: 14 },
    ],
  );
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, `verificacao-entrega-loja-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
};

const TabEntregaLoja = () => {
  const atendimentoRef = useRef(null);
  const osRef = useRef(null);
  const [atendimentoFile, setAtendimentoFile] = useState("");
  const [osFile, setOsFile] = useState("");
  const [atRows, setAtRows] = useState([]);
  const [osRows, setOsRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("clientes");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const handleFile = async (file, kind) => {
    if (!file) return;
    setLoading(true);
    setStatus("");
    try {
      const rows = await parseSheet(file);
      if (kind === "atendimento") {
        setAtendimentoFile(file.name);
        setAtRows(rows);
      } else {
        setOsFile(file.name);
        setOsRows(rows);
      }
    } catch (error) {
      setStatus(error?.message || "Não foi possível ler a planilha.");
    } finally {
      setLoading(false);
    }
  };

  const analysis = useMemo(() => {
    const atendimentos = atRows.map(buildAtendimento).filter((item) => item.codigo);
    const os = osRows.map(buildOs).filter((item) => item.codigo);
    const atendimentoByCode = new Map();
    atendimentos.forEach((item) => {
      if (!atendimentoByCode.has(item.codigo)) atendimentoByCode.set(item.codigo, item);
    });
    const matches = os
      .filter((order) => atendimentoByCode.has(order.codigo))
      .map((order) => ({
        ...order,
        atendimento: atendimentoByCode.get(order.codigo),
        nome: order.nome || atendimentoByCode.get(order.codigo)?.nome || "",
        cidade: order.cidade || atendimentoByCode.get(order.codigo)?.cidade || "",
      }))
      .sort((a, b) => (b.dataObj?.getTime?.() || 0) - (a.dataObj?.getTime?.() || 0));
    const clientesEntregues = dedupeBy(matches, (item) => item.codigo).map((item) => ({
      codigo: item.codigo,
      nome: item.atendimento?.nome || item.nome,
      cidade: item.atendimento?.cidade || item.cidade,
      servico: item.atendimento?.servico || item.servico,
      totalOs: matches.filter((osItem) => osItem.codigo === item.codigo).length,
    }));
    return {
      atendimentos,
      os,
      atendimentosUnicos: dedupeBy(atendimentos, (item) => item.codigo),
      osUnicas: dedupeBy(os, (item) => item.numeroOs || `${item.codigo}-${item.tipo}-${item.dataCadastro}`),
      matches,
      clientesEntregues,
      porServico: countBy(clientesEntregues, (item) => item.servico),
      porCidade: countBy(clientesEntregues, (item) => item.cidade),
    };
  }, [atRows, osRows]);

  const hasData = Boolean(atRows.length && osRows.length);
  const tableRows = useMemo(() => {
    const source = activeTab === "clientes" ? analysis.clientesEntregues : analysis.matches;
    const search = normalizeText(query);
    if (!search) return source;
    return source.filter((item) =>
      normalizeText(`${item.codigo} ${item.nome} ${item.numeroOs || ""} ${item.servico || ""} ${item.cidade || ""} ${item.status || ""}`).includes(search),
    );
  }, [activeTab, analysis, query]);

  const visibleRows = tableRows.slice(0, 300);

  const handleExport = async () => {
    if (!hasData) return;
    setLoading(true);
    try {
      await exportWorkbook(analysis);
    } catch (error) {
      setStatus(error?.message || "Não foi possível gerar o Excel.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-orange-600">
              <Store size={20} />
              <span className="text-xs font-black uppercase tracking-[0.2em]">Entrega loja</span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Verificar entrega loja</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Cruze o relatório de atendimentos com o relatório de ordens de serviço pelo código do cliente. O foco é identificar quais clientes possuem atendimento aberto para as ordens, com nome, código e serviço.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasData || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-500 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown size={17} />
            Exportar dashboard
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <UploadBox
          label="Relatório de atendimentos"
          fileName={atendimentoFile}
          inputRef={atendimentoRef}
          onFile={(file) => handleFile(file, "atendimento")}
        />
        <UploadBox
          label="Relatório de ordens de serviço"
          fileName={osFile}
          inputRef={osRef}
          onFile={(file) => handleFile(file, "os")}
        />
      </section>

      {status ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{status}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Atendimentos abertos" value={analysis.atendimentosUnicos.length} icon={FileSpreadsheet} tone="blue" />
        <KpiCard label="O.S no relatório" value={analysis.osUnicas.length} icon={BarChart3} tone="slate" />
        <KpiCard label="O.S com atendimento" value={analysis.matches.length} icon={Link2} tone="orange" />
        <KpiCard label="Clientes entregues" value={analysis.clientesEntregues.length} icon={CheckCircle2} tone="green" />
      </section>

      {hasData ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  ["clientes", "Clientes entregues"],
                  ["todos", "Ordens com atendimento"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`rounded-lg px-4 py-2 text-sm font-black transition ${
                      activeTab === id ? "bg-orange-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="relative block w-full md:max-w-xs">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar cliente, codigo, servico, O.S ou cidade"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                />
              </label>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
              {activeTab === "clientes" ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Código</th>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">Serviço</th>
                        <th className="px-4 py-3 text-left">Cidade</th>
                        <th className="px-4 py-3 text-right">Qtd O.S</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {visibleRows.map((item) => (
                        <tr key={item.codigo}>
                          <td className="px-4 py-3 font-black text-blue-700">{item.codigo}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{item.nome || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{item.servico || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{item.cidade || "-"}</td>
                          <td className="px-4 py-3 text-right font-black text-emerald-700">{item.totalOs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Código</th>
                        <th className="px-4 py-3 text-left">Cliente</th>
                        <th className="px-4 py-3 text-left">O.S</th>
                        <th className="px-4 py-3 text-left">Serviço</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Cidade</th>
                        <th className="px-4 py-3 text-left">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {visibleRows.map((item) => (
                        <tr key={`${item.numeroOs}-${item.codigo}`}>
                          <td className="px-4 py-3 font-black text-blue-700">{item.codigo}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{item.nome || "-"}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{item.numeroOs || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{item.atendimento?.servico || item.servico || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{item.status || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{item.cidade || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(item.dataCadastro) || item.dataCadastro || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!visibleRows.length ? <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum registro encontrado.</div> : null}
            </div>
            {tableRows.length > visibleRows.length ? (
              <p className="mt-3 text-xs font-semibold text-slate-500">Mostrando os primeiros {visibleRows.length} de {tableRows.length.toLocaleString("pt-BR")} registros filtrados. Use a busca ou exporte para ver tudo.</p>
            ) : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Serviços com atendimento</h3>
              <div className="mt-3 space-y-2">
                {analysis.porServico.slice(0, 8).map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-bold text-slate-700">{item.label}</span>
                    <strong className="text-orange-700">{item.total}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Cidades dos clientes</h3>
              <div className="mt-3 space-y-2">
                {analysis.porCidade.slice(0, 8).map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                    <span className="font-bold text-slate-700">{item.label}</span>
                    <strong className="text-emerald-700">{item.total}</strong>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Store size={34} className="mx-auto text-orange-500" />
          <p className="mt-3 text-lg font-black text-slate-900">Envie os dois relatórios para gerar a verificação.</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">O match será feito pelo código do cliente.</p>
        </section>
      )}
    </div>
  );
};

export default TabEntregaLoja;

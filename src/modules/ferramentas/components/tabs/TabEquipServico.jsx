import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { FileDown, Plus, Trash2 } from "lucide-react";

const DEFAULT_FAST = ["100 MBPS", "100MB", "FAST 100"];
const DEFAULT_AC = ["200 MBPS", "300 MBPS", "400 MBPS", "500 MBPS", "AC"];
const DEFAULT_AX = [
  "600 MBPS",
  "700 MBPS",
  "800 MBPS",
  "900 MBPS",
  "1 GBPS",
  "GIGA",
  "AX",
];

const normKeys = (data) =>
  data.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => {
      out[
        k
          .trim()
          .toLowerCase()
          .replace(/[\s_]+/g, "")
      ] = row[k];
    });
    return out;
  });

const TabEquipServico = () => {
  const [files, setFiles] = useState([]);
  const [fastKw, setFastKw] = useState(DEFAULT_FAST);
  const [acKw, setAcKw] = useState(DEFAULT_AC);
  const [axKw, setAxKw] = useState(DEFAULT_AX);
  const [newKw, setNewKw] = useState({ fast: "", ac: "", ax: "" });
  const [status, setStatus] = useState(null);
  const inputRef = useRef();

  const loadFiles = (e) => {
    const fArr = [...e.target.files];
    Promise.all(
      fArr.map(
        (f) =>
          new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const wb = XLSX.read(ev.target.result, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                res({
                  name: f.name,
                  rows: normKeys(
                    XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }),
                  ),
                });
              } catch {
                rej(f.name);
              }
            };
            reader.readAsArrayBuffer(f);
          }),
      ),
    ).then((results) => {
      setFiles((prev) => [...prev, ...results]);
      setStatus("ok");
    });
  };

  const classify = (servico) => {
    const s = String(servico).toUpperCase();
    if (axKw.some((k) => s.includes(k.toUpperCase()))) return "AX";
    if (acKw.some((k) => s.includes(k.toUpperCase()))) return "AC";
    if (fastKw.some((k) => s.includes(k.toUpperCase()))) return "Fast";
    return "Outros";
  };

  const addKw = (type) => {
    const val = newKw[type].trim().toUpperCase();
    if (!val) return;
    if (type === "fast") setFastKw((p) => [...p, val]);
    if (type === "ac") setAcKw((p) => [...p, val]);
    if (type === "ax") setAxKw((p) => [...p, val]);
    setNewKw((p) => ({ ...p, [type]: "" }));
  };

  const removeKw = (type, idx) => {
    if (type === "fast") setFastKw((p) => p.filter((_, i) => i !== idx));
    if (type === "ac") setAcKw((p) => p.filter((_, i) => i !== idx));
    if (type === "ax") setAxKw((p) => p.filter((_, i) => i !== idx));
  };

  const removeFile = (idx) => {
    setFiles((p) => p.filter((_, i) => i !== idx));
  };

  const gerar = async () => {
    const allRows = files.flatMap((f) => f.rows);
    if (!allRows.length) return;
    setStatus("gerando");
    try {
      // Após normKeys, a coluna é "servico" (sem underscore)
      const D = allRows.map((r) => ({
        ...r,
        _tipo: classify(r.servico ?? ""),
      }));

      const colors = {
        Fast: "27AE60",
        AC: "2471A3",
        AX: "8E44AD",
        Outros: "566573",
      };
      const wb = new ExcelJS.Workbook();
      wb.creator = "Sempre";
      const C = (hex) => ({ argb: "FF" + hex });

      const xH = (ws, row, col, val, color = "003087") => {
        const c = ws.getCell(row, col);
        c.value = val;
        c.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
        c.fill = { type: "pattern", pattern: "solid", fgColor: C(color) };
        c.alignment = { horizontal: "center", vertical: "middle" };
        const b = { style: "thin", color: C("FFFFFF") };
        c.border = { left: b, right: b, top: b, bottom: b };
      };
      const xD = (ws, r, c, v, bg = "FFFFFF", align = "left") => {
        const cell = ws.getCell(r, c);
        cell.value = v ?? "";
        cell.font = { name: "Arial", size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
        cell.alignment = { horizontal: align, vertical: "middle" };
        const b = { style: "thin", color: C("D0D0D0") };
        cell.border = { left: b, right: b, top: b, bottom: b };
      };

      // ── ABA Resumo ────────────────────────────────────────────────────────
      const wsR = wb.addWorksheet("Resumo");
      wsR.views = [{ showGridLines: false }];
      wsR.mergeCells("A1:4");
      wsR.mergeCells(1, 1, 2, 4);
      const tR = wsR.getCell(1, 1);
      tR.value = `EQUIP. POR SERVIÇO — ${D.length} registros — ${new Date().toLocaleDateString("pt-BR")}`;
      tR.font = { name: "Arial", bold: true, size: 14, color: C("FFFFFF") };
      tR.fill = { type: "pattern", pattern: "solid", fgColor: C("003087") };
      tR.alignment = { horizontal: "center", vertical: "middle" };
      wsR.getRow(1).height = 36;

      // KPIs
      [
        [
          "FAST (≤100 Mbps)",
          D.filter((r) => r._tipo === "Fast").length,
          "27AE60",
        ],
        [
          "AC (101–500 Mbps)",
          D.filter((r) => r._tipo === "AC").length,
          "2471A3",
        ],
        ["AX (>500 Mbps)", D.filter((r) => r._tipo === "AX").length, "8E44AD"],
        [
          "NÃO IDENTIF.",
          D.filter((r) => r._tipo === "Outros").length,
          "566573",
        ],
      ].forEach(([lbl, val, cor], i) => {
        const lc = wsR.getCell(3, i + 1);
        lc.value = lbl;
        lc.font = { name: "Arial", bold: true, size: 8, color: C("FFFFFF") };
        lc.fill = { type: "pattern", pattern: "solid", fgColor: C(cor) };
        lc.alignment = { horizontal: "center" };
        wsR.getRow(3).height = 18;
        const vc = wsR.getCell(4, i + 1);
        vc.value = val;
        vc.font = { name: "Arial", bold: true, size: 22, color: C(cor) };
        vc.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F5F5") };
        vc.alignment = { horizontal: "center" };
        wsR.getRow(4).height = 52;
      });

      // Top planos por tipo
      let rr = 6;
      ["Fast", "AC", "AX"].forEach((tipo) => {
        const tRows = D.filter((r) => r._tipo === tipo);
        if (!tRows.length) return;
        wsR.mergeCells(rr, 1, rr, 4);
        const th = wsR.getCell(rr, 1);
        th.value = `TOP PLANOS — ${tipo} (${tRows.length})`;
        th.font = { name: "Arial", bold: true, size: 11, color: C("FFFFFF") };
        th.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: C(colors[tipo]),
        };
        th.alignment = { horizontal: "left", vertical: "middle" };
        wsR.getRow(rr).height = 20;
        rr++;
        ["Plano/Serviço", "Total", "% do Tipo", "% Geral"].forEach((h, i) =>
          xH(wsR, rr, i + 1, h, colors[tipo]),
        );
        rr++;
        const byPlano = {};
        tRows.forEach((r) => {
          const p = String(r.servico ?? "").trim() || "N/A";
          byPlano[p] = (byPlano[p] || 0) + 1;
        });
        Object.entries(byPlano)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([p, q], i) => {
            const bg = i % 2 ? "FFFFFF" : "F5F5F5";
            xD(wsR, rr, 1, p, bg);
            xD(wsR, rr, 2, q, bg, "center");
            xD(
              wsR,
              rr,
              3,
              `${((q / tRows.length) * 100).toFixed(1)}%`,
              bg,
              "center",
            );
            xD(
              wsR,
              rr,
              4,
              `${((q / D.length) * 100).toFixed(1)}%`,
              bg,
              "center",
            );
            rr++;
          });
        rr++;
      });
      [40, 12, 12, 12].forEach((w, i) => {
        wsR.getColumn(i + 1).width = w;
      });

      // ── ABA por tipo ──────────────────────────────────────────────────────
      ["Fast", "AC", "AX", "Outros"].forEach((tipo) => {
        const tRows = D.filter((r) => r._tipo === tipo);
        const ws = wb.addWorksheet(tipo);
        ws.views = [{ showGridLines: false }];
        ws.mergeCells(1, 1, 2, 5);
        const t = ws.getCell(1, 1);
        t.value = `${tipo} — ${tRows.length} serviços`;
        t.font = { name: "Arial", bold: true, size: 13, color: C("FFFFFF") };
        t.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: C(colors[tipo]),
        };
        t.alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(1).height = 32;

        if (!tRows.length) {
          ws.mergeCells(3, 1, 3, 5);
          const ec = ws.getCell(3, 1);
          ec.value = "Nenhum registro nesta categoria.";
          ec.font = { name: "Arial", size: 11, color: C("888888") };
          ec.alignment = { horizontal: "center" };
          return;
        }

        // Colunas relevantes: numos, servico, tecnico, cidade, dataterminoexecutado
        const cols = [
          { key: "numos", label: "N° O.S", w: 20 },
          { key: "servico", label: "Serviço/Plano", w: 46 },
          { key: "tecnicos", label: "Técnico", w: 28 },
          { key: "cidade", label: "Cidade", w: 24 },
          { key: "dataterminoexecutado", label: "Data Exec.", w: 14 },
        ];

        cols.forEach((col, i) => xH(ws, 3, i + 1, col.label, colors[tipo]));
        tRows.forEach((row, i) => {
          const bg = i % 2 ? "FFFFFF" : "F2F3F4";
          // Técnico: extrai antes do "|"
          const tecRaw =
            String(row.tecnicos ?? row.tecnico ?? "")
              .split("|")[0]
              .trim() || "N/A";
          const vals = [
            String(row.numos ?? row.numeroos ?? ""),
            String(row.servico ?? ""),
            tecRaw,
            String(row.cidade ?? ""),
            String(row.dataterminoexecutado ?? row.datainicioexecutado ?? ""),
          ];
          vals.forEach((v, j) =>
            xD(ws, i + 4, j + 1, v, bg, j === 0 || j >= 2 ? "center" : "left"),
          );
        });
        cols.forEach((col, i) => {
          ws.getColumn(i + 1).width = col.w;
        });
      });

      // ── Download ──────────────────────────────────────────────────────────
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `equip-servico-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("err");
    }
  };

  const KwGroup = ({ label, type, kws, color }) => (
    <div className="rounded-xl border border-gray-200 p-4 bg-white">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-3 h-3 rounded-full`}
          style={{
            background:
              "#" + { fast: "27AE60", ac: "2471A3", ax: "8E44AD" }[type],
          }}
        />
        <span className="font-semibold text-sm text-gray-700">{label}</span>
        <span className="ml-auto text-xs text-gray-400">
          {kws.length} palavras-chave
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {kws.map((k, i) => (
          <span
            key={i}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white"
            style={{
              background:
                "#" + { fast: "27AE60", ac: "2471A3", ax: "8E44AD" }[type],
            }}
          >
            {k}
            <button
              onClick={() => removeKw(type, i)}
              className="opacity-70 hover:opacity-100"
            >
              <Trash2 size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newKw[type]}
          onChange={(e) => setNewKw((p) => ({ ...p, [type]: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && addKw(type)}
          placeholder="Nova palavra-chave..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400"
        />
        <button
          onClick={() => addKw(type)}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );

  const totalRows = files.reduce((s, f) => s + f.rows.length, 0);

  return (
    <div className="space-y-4">
      {/* Upload múltiplo */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${files.length > 0 ? "border-green-400 bg-green-50" : "border-gray-200 bg-white hover:border-orange-400"}`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={loadFiles}
        />
        <span className="text-4xl block mb-2">⚡</span>
        {files.length > 0 ? (
          <>
            <p className="font-semibold text-green-700">
              {files.length} arquivo(s) · {totalRows} registros
            </p>
            <p className="text-sm text-green-600">Clique para adicionar mais</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-gray-700">
              Clique ou arraste os arquivos .xlsx
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Múltiplos arquivos suportados
            </p>
          </>
        )}
      </div>

      {/* Lista de arquivos */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-medium"
            >
              📄 {f.name} ({f.rows.length})
              <button
                onClick={() => removeFile(i)}
                className="text-blue-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Palavras-chave */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KwGroup label="Fast (≤100 Mbps)" type="fast" kws={fastKw} />
        <KwGroup label="AC (101–500 Mbps)" type="ac" kws={acKw} />
        <KwGroup label="AX (>500 Mbps)" type="ax" kws={axKw} />
      </div>

      {/* Botão gerar */}
      {totalRows > 0 && (
        <button
          onClick={gerar}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
        >
          <FileDown size={16} />
          Gerar Equip. por Serviço — {totalRows} registros (5 abas)
        </button>
      )}

      {status === "gerando" && (
        <p className="text-sm text-blue-600 font-medium animate-pulse">
          ⏳ Gerando Excel...
        </p>
      )}
      {status === "err" && (
        <p className="text-sm text-red-600">❌ Erro ao processar o arquivo.</p>
      )}
    </div>
  );
};

export default TabEquipServico;

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";

const TabDevolucoesMes = () => {
  const { regionais } = useFerramentasRegionais();
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [fname, setFname] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const inputRef = useRef();

  const cidMap = {};
  regionais.forEach((r) => {
    (r.cidades || []).forEach((c) => {
      cidMap[String(c.nome).trim().toLowerCase()] = {
        regional: r.nome,
        agente: c.agente,
      };
    });
  });

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

  const extractCidade = (endereco) => {
    if (!endereco) return "N/A";
    const s = String(endereco);
    const m = s.match(/,\s*([^,|/\n]+?)\/[A-Z]{2}(?:\s*\||$)/i);
    if (m) return m[1].trim();
    const m2 = s.match(/,\s*([^,|\n]+?)\s*\|\s*CEP/i);
    if (m2)
      return m2[1]
        .trim()
        .replace(/\/[A-Z]{2}$/, "")
        .trim();
    return "N/A";
  };

  const getInfo = (cidade) =>
    cidMap[
      String(cidade || "")
        .trim()
        .toLowerCase()
    ] || { regional: "Sem Regional", agente: false };

  const parseDate = (v) => {
    if (!v) return null;
    const s = String(v).trim().split(" ")[0];
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  const fmtMes = (d) =>
    d
      ? `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
      : null;

  const load = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFname(f.name);
    setStatus("loading");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = normKeys(
          XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }),
        );
        const enriched = data.map((r) => {
          const cidade =
            r.cidade || extractCidade(r.enderecoinstalacao || r.endereco || "");
          const info = getInfo(cidade);
          return {
            ...r,
            _cidade: cidade,
            _regional: info.regional,
            _agente: info.agente ? "SIM" : "NÃO",
            _date: parseDate(r.datafechamento || ""),
          };
        });
        setRows(enriched);
        setStatus("ok");
      } catch {
        setStatus("err");
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const gerar = async () => {
    if (!rows.length || !de || !ate) return;
    setStatus("gerando");
    try {
      const dtDe = new Date(de + "T00:00:00");
      const dtAte = new Date(ate + "T23:59:59");
      const D = rows.filter(
        (r) => r._date && r._date >= dtDe && r._date <= dtAte,
      );

      if (!D.length) {
        setStatus("ok");
        return;
      }

      const periodo = `${dtDe.toLocaleDateString("pt-BR")} a ${dtAte.toLocaleDateString("pt-BR")}`;

      const wb = new ExcelJS.Workbook();
      wb.creator = "Sempre";
      const C = (hex) => ({ argb: "FF" + hex });
      const xH = (ws, r, c, v, bg = "003087") => {
        const cell = ws.getCell(r, c);
        cell.value = v;
        cell.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        const b = { style: "thin", color: C("FFFFFF") };
        cell.border = { left: b, right: b, top: b, bottom: b };
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
      const xT = (ws, r, n, text, bg = "003087") => {
        ws.mergeCells(r, 1, r, n);
        const cell = ws.getCell(r, 1);
        cell.value = text;
        cell.font = { name: "Arial", bold: true, size: 13, color: C("FFFFFF") };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(r).height = 28;
      };
      const xKpi = (ws, r, c, lbl, val, cor) => {
        const lc = ws.getCell(r, c);
        lc.value = lbl;
        lc.font = { name: "Arial", bold: true, size: 8, color: C("FFFFFF") };
        lc.fill = { type: "pattern", pattern: "solid", fgColor: C(cor) };
        lc.alignment = { horizontal: "center" };
        ws.getRow(r).height = 18;
        const vc = ws.getCell(r + 1, c);
        vc.value = val;
        vc.font = { name: "Arial", bold: true, size: 20, color: C(cor) };
        vc.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F5F5") };
        vc.alignment = { horizontal: "center" };
        ws.getRow(r + 1).height = 46;
      };

      // ── ABA 1: Resumo Mensal ──────────────────────────────────────────────
      const ws1 = wb.addWorksheet("Resumo Mensal");
      ws1.views = [{ showGridLines: false }];
      xT(
        ws1,
        1,
        5,
        `DEVOLUÇÕES POR PERÍODO — ${periodo} — ${D.length} registros`,
        "003087",
      );

      xKpi(ws1, 3, 1, "TOTAL", D.length, "003087");
      xKpi(
        ws1,
        3,
        2,
        "CIDADES",
        new Set(D.map((r) => r._cidade)).size,
        "117A65",
      );
      xKpi(
        ws1,
        3,
        3,
        "REGIONAIS",
        new Set(D.map((r) => r._regional)).size,
        "6C3483",
      );
      xKpi(
        ws1,
        3,
        4,
        "AGENTES AUT.",
        D.filter((r) => r._agente === "SIM").length,
        "B7950B",
      );

      let rr = 6;
      xT(ws1, rr, 3, "DEVOLUÇÕES POR MÊS", "1F618D");
      rr++;
      ["Mês/Ano", "Total", "% Total"].forEach((h, i) =>
        xH(ws1, rr, i + 1, h, "2471A3"),
      );
      rr++;
      const byMes = {};
      D.forEach((r) => {
        const mes = fmtMes(r._date);
        if (mes) byMes[mes] = (byMes[mes] || 0) + 1;
      });
      Object.entries(byMes)
        .sort()
        .forEach(([mes, q], i) => {
          const bg = i % 2 ? "FFFFFF" : "EBF5FB";
          xD(ws1, rr, 1, mes, bg, "center");
          xD(ws1, rr, 2, q, bg, "center");
          xD(ws1, rr, 3, `${((q / D.length) * 100).toFixed(1)}%`, bg, "center");
          rr++;
        });
      [16, 12, 12, 14, 14].forEach((w, i) => {
        ws1.getColumn(i + 1).width = w;
      });

      // ── ABA 2: Por Regional ───────────────────────────────────────────────
      const ws2 = wb.addWorksheet("Por Regional");
      ws2.views = [{ showGridLines: false }];
      xT(ws2, 1, 5, `DEVOLUÇÕES POR REGIONAL — ${periodo}`, "1F618D");
      ["Regional", "Total", "% Total", "Cidades", "Agentes Aut."].forEach(
        (h, i) => xH(ws2, 2, i + 1, h, "2471A3"),
      );
      const byReg = {};
      D.forEach((r) => {
        const reg = r._regional;
        if (!byReg[reg]) byReg[reg] = { q: 0, cidades: new Set(), ag: 0 };
        byReg[reg].q++;
        byReg[reg].cidades.add(r._cidade);
        if (r._agente === "SIM") byReg[reg].ag++;
      });
      Object.entries(byReg)
        .sort((a, b) => b[1].q - a[1].q)
        .forEach(([reg, v], i) => {
          const bg = i % 2 ? "FFFFFF" : "EBF5FB";
          xD(ws2, i + 3, 1, reg, bg);
          xD(ws2, i + 3, 2, v.q, bg, "center");
          xD(
            ws2,
            i + 3,
            3,
            `${((v.q / D.length) * 100).toFixed(1)}%`,
            bg,
            "center",
          );
          xD(ws2, i + 3, 4, v.cidades.size, bg, "center");
          xD(ws2, i + 3, 5, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
        });
      [30, 12, 12, 12, 14].forEach((w, i) => {
        ws2.getColumn(i + 1).width = w;
      });

      // ── ABA 3: Por Cidade ─────────────────────────────────────────────────
      const ws3 = wb.addWorksheet("Por Cidade");
      ws3.views = [{ showGridLines: false }];
      xT(ws3, 1, 4, `DEVOLUÇÕES POR CIDADE — ${periodo}`, "1F618D");
      ["Cidade", "Regional", "Total", "Agente Aut."].forEach((h, i) =>
        xH(ws3, 2, i + 1, h, "2471A3"),
      );
      const byCid = {};
      D.forEach((r) => {
        const c = r._cidade;
        if (!byCid[c]) byCid[c] = { q: 0, regional: r._regional, ag: 0 };
        byCid[c].q++;
        if (r._agente === "SIM") byCid[c].ag++;
      });
      Object.entries(byCid)
        .sort((a, b) => b[1].q - a[1].q)
        .forEach(([cid, v], i) => {
          const bg = i % 2 ? "FFFFFF" : "EBF5FB";
          xD(ws3, i + 3, 1, cid, bg);
          xD(ws3, i + 3, 2, v.regional, bg);
          xD(ws3, i + 3, 3, v.q, bg, "center");
          xD(ws3, i + 3, 4, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
        });
      [28, 28, 12, 14].forEach((w, i) => {
        ws3.getColumn(i + 1).width = w;
      });

      // ── ABA 4: Por Mês e Cidade ───────────────────────────────────────────
      const ws4 = wb.addWorksheet("Por Mês e Cidade");
      ws4.views = [{ showGridLines: false }];
      xT(ws4, 1, 5, `DEVOLUÇÕES POR MÊS E CIDADE — ${periodo}`, "003087");
      ["Mês/Ano", "Cidade", "Regional", "Total", "Agente Aut."].forEach(
        (h, i) => xH(ws4, 2, i + 1, h, "2471A3"),
      );
      const byMesCid = {};
      D.forEach((r) => {
        const mes = fmtMes(r._date);
        if (!mes) return;
        const key = `${mes}||${r._cidade}`;
        if (!byMesCid[key])
          byMesCid[key] = {
            mes,
            cidade: r._cidade,
            regional: r._regional,
            q: 0,
            ag: 0,
          };
        byMesCid[key].q++;
        if (r._agente === "SIM") byMesCid[key].ag++;
      });
      Object.values(byMesCid)
        .sort((a, b) => a.mes.localeCompare(b.mes) || b.q - a.q)
        .forEach((v, i) => {
          const bg = i % 2 ? "FFFFFF" : "EBF5FB";
          xD(ws4, i + 3, 1, v.mes, bg, "center");
          xD(ws4, i + 3, 2, v.cidade, bg);
          xD(ws4, i + 3, 3, v.regional, bg);
          xD(ws4, i + 3, 4, v.q, bg, "center");
          xD(ws4, i + 3, 5, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
        });
      [14, 28, 28, 12, 14].forEach((w, i) => {
        ws4.getColumn(i + 1).width = w;
      });

      // ── ABA 5: Dados Completos ────────────────────────────────────────────
      const ws5 = wb.addWorksheet("Dados Completos");
      ws5.views = [{ showGridLines: false }];
      xT(ws5, 1, 5, `DADOS COMPLETOS — ${periodo}`, "003087");
      [
        "Código Cliente",
        "Cidade",
        "Regional",
        "Agente Aut.",
        "Data Fechamento",
      ].forEach((h, i) => xH(ws5, 2, i + 1, h, "1F618D"));
      D.slice()
        .sort((a, b) => (a._date || 0) - (b._date || 0))
        .forEach((r, i) => {
          const bg = i % 2 ? "FFFFFF" : "EBF5FB";
          xD(ws5, i + 3, 1, String(r.codigocliente || r.codigo || ""), bg);
          xD(ws5, i + 3, 2, r._cidade, bg);
          xD(ws5, i + 3, 3, r._regional, bg);
          xD(
            ws5,
            i + 3,
            4,
            r._agente,
            r._agente === "SIM" ? "FEF9E7" : bg,
            "center",
          );
          xD(
            ws5,
            i + 3,
            5,
            r._date ? r._date.toLocaleDateString("pt-BR") : "",
            bg,
            "center",
          );
        });
      [22, 26, 26, 14, 18].forEach((w, i) => {
        ws5.getColumn(i + 1).width = w;
      });

      // ── Download ──────────────────────────────────────────────────────────
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `devolucoes-mes-${de}-${ate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("err");
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${status === "ok" || status === "gerando" ? "border-green-400 bg-green-50" : status === "err" ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-blue-400"}`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={load}
        />
        <span className="text-4xl block mb-3">📦</span>
        {status === "ok" || status === "gerando" ? (
          <>
            <p className="font-semibold text-green-700">{fname}</p>
            <p className="text-sm text-green-600">
              {rows.length} linhas · clique para trocar
            </p>
          </>
        ) : status === "loading" ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : (
          <>
            <p className="font-semibold text-gray-700">
              Clique ou arraste o arquivo .xlsx
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Campos esperados:{" "}
              <code>codigocliente · cidade · datafechamento</code>
            </p>
          </>
        )}
      </div>

      {/* Filtro de período */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">
              Data Início
            </label>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">
              Data Fim
            </label>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
      )}

      {/* Botão gerar */}
      {rows.length > 0 && de && ate && (
        <button
          onClick={gerar}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
        >
          <FileDown size={16} />
          Gerar Devoluções por Período (5 abas)
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

export default TabDevolucoesMes;

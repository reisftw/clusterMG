import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";

const TabCancelamento = () => {
  const { regionais } = useFerramentasRegionais();
  const [status, setStatus] = useState(null);
  const [rowsCan, setRowsCan] = useState([]);
  const [rowsOs, setRowsOs] = useState([]);
  const [fnameCan, setFnameCan] = useState("");
  const [fnameOs, setFnameOs] = useState("");
  const inputCanRef = useRef();
  const inputOsRef = useRef();

  const cidMap = {};
  regionais.forEach((r) => {
    (r.cidades || []).forEach((c) => {
      cidMap[String(c.nome).trim().toLowerCase()] = r.nome;
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

  const getRegional = (cidade) =>
    cidMap[
      String(cidade || "")
        .trim()
        .toLowerCase()
    ] || "Sem Regional";

  const loadFile = (e, setter, fnameSetter) => {
    const f = e.target.files[0];
    if (!f) return;
    fnameSetter(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = normKeys(
          XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }),
        );
        setter(data);
        setStatus("ok");
      } catch {
        setStatus("err");
      }
    };
    reader.readAsArrayBuffer(f);
  };

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

  const gerar = async () => {
    if (!rowsCan.length) return;
    setStatus("gerando");
    try {
      // Enriquece cancelamentos com cidade (do endereco se nao tiver) e regional
      const D = rowsCan.map((r) => {
        const cidade =
          r.cidade || extractCidade(r.enderecoinstalacao || r.endereco || "");
        return {
          ...r,
          _cidade: cidade,
          _regional: getRegional(cidade),
          _motivo: r.motivocancelamento || r.motivo || "N/A",
          _dataCan: parseDate(r.datacancelamento || r.data || ""),
        };
      });

      // Enriquece O.S (segunda planilha, se enviada)
      const DOS = rowsOs.map((r) => {
        const cidade =
          r.cidade || extractCidade(r.enderecoinstalacao || r.endereco || "");
        return {
          ...r,
          _cidade: cidade,
          _regional: getRegional(cidade),
          _dateExec: parseDate(
            r.dataterminoexecutado ||
              r.datainicioexecutado ||
              r.datacadastro ||
              "",
          ),
        };
      });

      const wb = new ExcelJS.Workbook();
      wb.creator = "Sempre";
      const C = (hex) => ({ argb: "FF" + hex });
      const xH = (ws, r, c, v, bg = "C0392B") => {
        const cell = ws.getCell(r, c);
        cell.value = v;
        cell.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
        cell.alignment = { horizontal: "center", vertical: "middle" };
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
      const xT = (ws, r, n, text, bg = "C0392B") => {
        ws.mergeCells(r, 1, r, n);
        const cell = ws.getCell(r, 1);
        cell.value = text;
        cell.font = { name: "Arial", bold: true, size: 13, color: C("FFFFFF") };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(r).height = 28;
      };

      // -- ABA 1: Por Motivo -------------------------------------------------
      const ws1 = wb.addWorksheet("Por Motivo");
      ws1.views = [{ showGridLines: false }];
      xT(
        ws1,
        1,
        3,
        `CANCELAMENTOS POR MOTIVO — ${D.length} registros`,
        "C0392B",
      );
      ["Motivo", "Total", "% do Total"].forEach((h, i) =>
        xH(ws1, 2, i + 1, h, "C0392B"),
      );
      const byMotivo = {};
      D.forEach((r) => {
        byMotivo[r._motivo] = (byMotivo[r._motivo] || 0) + 1;
      });
      Object.entries(byMotivo)
        .sort((a, b) => b[1] - a[1])
        .forEach(([mot, q], i) => {
          const bg = i % 2 ? "FFFFFF" : "FFF0F0";
          xD(ws1, i + 3, 1, mot, bg);
          xD(ws1, i + 3, 2, q, bg, "center");
          xD(
            ws1,
            i + 3,
            3,
            `${((q / D.length) * 100).toFixed(1)}%`,
            bg,
            "center",
          );
        });
      [42, 12, 14].forEach((w, i) => {
        ws1.getColumn(i + 1).width = w;
      });

      // -- ABA 2: Por Cidade -------------------------------------------------
      const ws2 = wb.addWorksheet("Por Cidade");
      ws2.views = [{ showGridLines: false }];
      xT(ws2, 1, 5, "CANCELAMENTOS POR CIDADE", "E74C3C");
      ["Cidade", "Regional", "Total", "% Total", "Top Motivo"].forEach((h, i) =>
        xH(ws2, 2, i + 1, h, "E74C3C"),
      );
      const byCid = {};
      D.forEach((r) => {
        const c = r._cidade;
        if (!byCid[c]) byCid[c] = { q: 0, regional: r._regional, motivos: {} };
        byCid[c].q++;
        byCid[c].motivos[r._motivo] = (byCid[c].motivos[r._motivo] || 0) + 1;
      });
      Object.entries(byCid)
        .sort((a, b) => b[1].q - a[1].q)
        .forEach(([cid, v], i) => {
          const bg = i % 2 ? "FFFFFF" : "FFF0F0";
          const topMot =
            Object.entries(v.motivos).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
          xD(ws2, i + 3, 1, cid, bg, "left");
          xD(ws2, i + 3, 2, v.regional, bg);
          xD(ws2, i + 3, 3, v.q, bg, "center");
          xD(
            ws2,
            i + 3,
            4,
            `${((v.q / D.length) * 100).toFixed(1)}%`,
            bg,
            "center",
          );
          xD(ws2, i + 3, 5, topMot, bg);
        });
      [26, 26, 12, 12, 40].forEach((w, i) => {
        ws2.getColumn(i + 1).width = w;
      });

      // -- ABA 3: Por Regional -----------------------------------------------
      const ws3 = wb.addWorksheet("Por Regional");
      ws3.views = [{ showGridLines: false }];
      xT(ws3, 1, 4, "CANCELAMENTOS POR REGIONAL", "922B21");
      ["Regional", "Total", "% Total", "Top Motivo"].forEach((h, i) =>
        xH(ws3, 2, i + 1, h, "922B21"),
      );
      const byReg = {};
      D.forEach((r) => {
        const reg = r._regional;
        if (!byReg[reg]) byReg[reg] = { q: 0, motivos: {} };
        byReg[reg].q++;
        byReg[reg].motivos[r._motivo] =
          (byReg[reg].motivos[r._motivo] || 0) + 1;
      });
      Object.entries(byReg)
        .sort((a, b) => b[1].q - a[1].q)
        .forEach(([reg, v], i) => {
          const bg = i % 2 ? "FFFFFF" : "FFF0F0";
          const topMot =
            Object.entries(v.motivos).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
          xD(ws3, i + 3, 1, reg, bg, "left");
          xD(ws3, i + 3, 2, v.q, bg, "center");
          xD(
            ws3,
            i + 3,
            3,
            `${((v.q / D.length) * 100).toFixed(1)}%`,
            bg,
            "center",
          );
          xD(ws3, i + 3, 4, topMot, bg);
        });
      [30, 12, 12, 40].forEach((w, i) => {
        ws3.getColumn(i + 1).width = w;
      });

      // -- ABA 4: Por Mes ----------------------------------------------------
      const ws4 = wb.addWorksheet("Por Mes");
      ws4.views = [{ showGridLines: false }];
      xT(ws4, 1, 3, "CANCELAMENTOS POR MES", "C0392B");
      ["Mes/Ano", "Total Cancelamentos", "O.S Executadas no Mes"].forEach(
        (h, i) => xH(ws4, 2, i + 1, h, "C0392B"),
      );
      const byMes = {};
      D.forEach((r) => {
        const mes = fmtMes(r._dataCan);
        if (mes) byMes[mes] = (byMes[mes] || 0) + 1;
      });
      // O.S executadas por mes (segunda planilha)
      const osByMes = {};
      DOS.forEach((r) => {
        const mes = fmtMes(r._dateExec);
        if (mes) osByMes[mes] = (osByMes[mes] || 0) + 1;
      });
      Object.entries(byMes)
        .sort(([mesA], [mesB]) => String(mesA).localeCompare(String(mesB), "pt-BR"))
        .forEach(([mes, q], i) => {
          const bg = i % 2 ? "FFFFFF" : "FFF0F0";
          xD(ws4, i + 3, 1, mes, bg, "center");
          xD(ws4, i + 3, 2, q, bg, "center");
          xD(ws4, i + 3, 3, osByMes[mes] ?? "-", bg, "center");
        });
      [14, 22, 24].forEach((w, i) => {
        ws4.getColumn(i + 1).width = w;
      });

      // -- ABA 5: Confronto Mes/Cidade ---------------------------------------
      const ws5 = wb.addWorksheet("Confronto Mes-Cidade");
      ws5.views = [{ showGridLines: false }];
      xT(ws5, 1, 5, "CONFRONTO CANCELAMENTOS × O.S POR MES E CIDADE", "7B241C");
      [
        "Mes/Ano",
        "Cidade",
        "Regional",
        "Cancelamentos",
        "O.S Executadas",
      ].forEach((h, i) => xH(ws5, 2, i + 1, h, "7B241C"));
      const canMesCid = {};
      D.forEach((r) => {
        const mes = fmtMes(r._dataCan);
        if (!mes) return;
        const key = `${mes}||${r._cidade}`;
        if (!canMesCid[key])
          canMesCid[key] = {
            mes,
            cidade: r._cidade,
            regional: r._regional,
            can: 0,
            os: 0,
          };
        canMesCid[key].can++;
      });
      DOS.forEach((r) => {
        const mes = fmtMes(r._dateExec);
        if (!mes) return;
        const key = `${mes}||${r._cidade}`;
        if (!canMesCid[key])
          canMesCid[key] = {
            mes,
            cidade: r._cidade,
            regional: r._regional,
            can: 0,
            os: 0,
          };
        canMesCid[key].os++;
      });
      Object.values(canMesCid)
        .sort((a, b) => a.mes.localeCompare(b.mes) || b.can - a.can)
        .forEach((v, i) => {
          const bg = i % 2 ? "FFFFFF" : "FFF0F0";
          xD(ws5, i + 3, 1, v.mes, bg, "center");
          xD(ws5, i + 3, 2, v.cidade, bg);
          xD(ws5, i + 3, 3, v.regional, bg);
          xD(ws5, i + 3, 4, v.can, bg, "center");
          xD(ws5, i + 3, 5, v.os || "-", bg, "center");
        });
      [14, 26, 26, 16, 18].forEach((w, i) => {
        ws5.getColumn(i + 1).width = w;
      });

      // -- ABA 6: Dados Completos --------------------------------------------
      const ws6 = wb.addWorksheet("Dados Completos");
      ws6.views = [{ showGridLines: false }];
      xT(ws6, 1, 5, "DADOS COMPLETOS — CANCELAMENTOS", "922B21");
      ["Código", "Cidade", "Regional", "Data Cancelamento", "Motivo"].forEach(
        (h, i) => xH(ws6, 2, i + 1, h, "922B21"),
      );
      D.slice()
        .sort((a, b) => (a._dataCan || 0) - (b._dataCan || 0))
        .forEach((r, i) => {
          const bg = i % 2 ? "FFFFFF" : "FFF0F0";
          xD(ws6, i + 3, 1, String(r.codigocliente || ""), bg);
          xD(ws6, i + 3, 2, r._cidade, bg);
          xD(ws6, i + 3, 3, r._regional, bg);
          xD(
            ws6,
            i + 3,
            4,
            r._dataCan ? r._dataCan.toLocaleDateString("pt-BR") : "",
            bg,
            "center",
          );
          xD(ws6, i + 3, 5, r._motivo, bg);
        });
      [18, 26, 26, 18, 42].forEach((w, i) => {
        ws6.getColumn(i + 1).width = w;
      });

      // -- Download ----------------------------------------------------------
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cancelamentos-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("ok");
    } catch (e) {
      console.error(e);
      setStatus("err");
    }
  };

  const canOk = rowsCan.length > 0;
  const osOk = rowsOs.length > 0;

  return (
    <div className="space-y-4">
      {/* Upload Cancelamentos */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${canOk ? "border-green-400 bg-green-50" : status === "err" ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-red-400"}`}
        onClick={() => inputCanRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputCanRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputCanRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => loadFile(e, setRowsCan, setFnameCan)}
        />
        <span className="text-3xl block mb-2">❌</span>
        {canOk ? (
          <>
            <p className="font-semibold text-green-700">{fnameCan}</p>
            <p className="text-sm text-green-600">
              {rowsCan.length} cancelamentos · clique para trocar
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold text-gray-700">
              Planilha de Cancelamentos
            </p>
            <p className="text-xs text-gray-400 mt-1">
              <code>datacancelamento · cidade · motivocancelamento</code>
            </p>
          </>
        )}
      </div>

      {/* Upload O.S (opcional) */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${osOk ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-400"}`}
        onClick={() => inputOsRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputOsRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputOsRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => loadFile(e, setRowsOs, setFnameOs)}
        />
        <span className="text-3xl block mb-2">📋</span>
        {osOk ? (
          <>
            <p className="font-semibold text-blue-700">{fnameOs}</p>
            <p className="text-sm text-blue-600">
              {rowsOs.length} O.S · clique para trocar
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold text-gray-700">
              Planilha de O.S Executadas{" "}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              <code>datacadastro · cidade · data_termino_executado</code>
            </p>
          </>
        )}
      </div>

      {/* Botao */}
      {canOk && (
        <button
          onClick={gerar}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-700 text-white rounded-xl font-semibold hover:bg-red-800 transition-colors"
        >
          <FileDown size={16} />
          Gerar Relatorio de Cancelamentos (6 abas)
        </button>
      )}

      {status === "gerando" && (
        <p className="text-sm text-red-600 font-medium animate-pulse">
          ⏳ Gerando Excel...
        </p>
      )}
      {status === "err" && (
        <p className="text-sm text-red-600">❌ Erro ao processar o arquivo.</p>
      )}
    </div>
  );
};

export default TabCancelamento;


import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";
import {
	buildCidadeRegionalMap,
	extractCidadeFromEndereco,
	normalizeText,
	normalizeWorksheetRows,
	parseFerramentasDate,
} from "../../utils/ferramentasTabUtils";

const TabDiario = () => {
	const { regionais } = useFerramentasRegionais();
	const [status, setStatus] = useState(null);
	const [rows, setRows] = useState([]);
	const [fname, setFname] = useState("");
	const [filtroData, setFiltroData] = useState("todos");
	const inputRef = useRef();

	const tecSet = new Set(
		(regionais || []).flatMap((r) =>
			(r.tecnicos || []).map((t) => normalizeText(t.nome)),
		),
	);

	const cidMap = buildCidadeRegionalMap(regionais, (r, c) => ({
		regional: r.nome,
		agente: c.agente,
	}));

	const extractTec = (v) => {
		if (!v) return "ND";
		return String(v).split("|")[0].trim() || "ND";
	};

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
				const data = normalizeWorksheetRows(
					XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }),
				);
				const enriched = data.map((r) => {
					const tecRaw = extractTec(r.tecnicos ?? r.tecnico ?? "");
					const cidadeExtr = extractCidadeFromEndereco(
						r.enderecoinstalacao || r.endereco || "",
					);
					const cidade = cidadeExtr || r.cidade || "N/A";
					const info = cidMap[normalizeText(cidade)] || {};
					const dateVal = r.dataterminoexecutado || r.datainicioexecutado || "";
					const dateParsed = parseFerramentasDate(dateVal);
					return {
						...r,
						_tecnico: tecRaw,
						_cidade: cidade,
						_regional: info.regional || "Sem Regional",
						_agente: info.agente ? "SIM" : "NAO",
						_tectipo: tecSet.has(normalizeText(tecRaw)) ? "RETIRADA" : "ATIVA",
						_date: dateParsed,
						_dateStr: dateParsed ? dateParsed.toLocaleDateString("pt-BR") : "",
					};
				});
				setRows(enriched);
				setFiltroData("todos");
				setStatus("ok");
			} catch {
				setStatus("err");
			}
		};
		reader.readAsArrayBuffer(f);
	};

	// Datas unicas para filtro
	const datas = [...new Set(rows.map((r) => r._dateStr).filter(Boolean))].sort(
		(a, b) => {
			const [da, ma, ya] = a.split("/");
			const [db, mb, yb] = b.split("/");
			return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
		},
	);

	const D =
		filtroData === "todos"
			? rows
			: rows.filter((r) => r._dateStr === filtroData);

	const gerar = async () => {
		if (!D.length) return;
		setStatus("gerando");
		try {
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
			const xD = (ws, r, c, v, bg = "FFFFFF", align = "left", bold = false) => {
				const cell = ws.getCell(r, c);
				cell.value = v ?? "";
				cell.font = { name: "Arial", size: 10, bold };
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

			const titulo = filtroData === "todos" ? "TODAS AS DATAS" : filtroData;
			const dataSlug =
				filtroData === "todos" ? "geral" : filtroData.replace(/\//g, "-");

			// -- ABA 1: O.S do Dia -------------------------------------------------
			const ws1 = wb.addWorksheet("O.S do Dia");
			ws1.views = [{ showGridLines: false }];
			xT(ws1, 1, 7, `O.S DO DIA — ${titulo} — ${D.length} registros`, "003087");
			[
				"N° O.S",
				"Técnico",
				"Tipo Tec.",
				"Cidade",
				"Regional",
				"Ag. Aut.",
				"Data",
			].forEach((h, i) => xH(ws1, 2, i + 1, h, "1F618D"));
			D.forEach((r, i) => {
				const bg = i % 2 ? "FFFFFF" : "EBF5FB";
				const retBg = r._tectipo === "RETIRADA" ? "EBF5FB" : bg;
				xD(ws1, i + 3, 1, String(r.numos || r.numeroos || ""), bg);
				xD(ws1, i + 3, 2, r._tecnico, bg);
				xD(ws1, i + 3, 3, r._tectipo, retBg, "center");
				xD(ws1, i + 3, 4, r._cidade, bg);
				xD(ws1, i + 3, 5, r._regional, bg);
				xD(
					ws1,
					i + 3,
					6,
					r._agente,
					r._agente === "SIM" ? "FEF9E7" : bg,
					"center",
				);
				xD(ws1, i + 3, 7, r._dateStr, bg, "center");
			});
			[20, 30, 14, 26, 26, 12, 14].forEach((w, i) => {
				ws1.getColumn(i + 1).width = w;
			});

			// -- ABA 2: Por Técnico ------------------------------------------------
			const ws2 = wb.addWorksheet("Por Técnico");
			ws2.views = [{ showGridLines: false }];
			xT(ws2, 1, 5, `O.S POR TECNICO — ${titulo}`, "2C3E50");
			["Técnico", "Tipo", "O.S", "Regionais", "Cidades"].forEach((h, i) =>
				xH(ws2, 2, i + 1, h, "566573"),
			);
			const byTec = {};
			D.forEach((r) => {
				const t = r._tecnico;
				if (!byTec[t])
					byTec[t] = {
						tipo: r._tectipo,
						q: 0,
						regs: new Set(),
						cids: new Set(),
					};
				byTec[t].q++;
				byTec[t].regs.add(r._regional);
				byTec[t].cids.add(r._cidade);
			});
			Object.entries(byTec)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([tec, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "F2F3F4";
					const retBg = v.tipo === "RETIRADA" ? "EBF5FB" : bg;
					xD(ws2, i + 3, 1, tec, bg, "left", true);
					xD(ws2, i + 3, 2, v.tipo, retBg, "center");
					xD(ws2, i + 3, 3, v.q, bg, "center");
					xD(ws2, i + 3, 4, [...v.regs].join(", "), bg);
					xD(ws2, i + 3, 5, [...v.cids].join(", "), bg);
				});
			[32, 14, 10, 32, 32].forEach((w, i) => {
				ws2.getColumn(i + 1).width = w;
			});

			// -- ABA 3: Por Regional -----------------------------------------------
			const ws3 = wb.addWorksheet("Por Regional");
			ws3.views = [{ showGridLines: false }];
			xT(ws3, 1, 5, `O.S POR REGIONAL — ${titulo}`, "117A65");
			[
				"Regional",
				"Total O.S",
				"Tec. Ativa",
				"Tec. Retirada",
				"Agentes Aut.",
			].forEach((h, i) => xH(ws3, 2, i + 1, h, "1E8449"));
			const byReg = {};
			D.forEach((r) => {
				const reg = r._regional;
				if (!byReg[reg]) byReg[reg] = { q: 0, ativa: 0, retirada: 0, ag: 0 };
				byReg[reg].q++;
				if (r._agente === "SIM") byReg[reg].ag++;
				else if (r._tectipo === "RETIRADA") byReg[reg].retirada++;
				else byReg[reg].ativa++;
			});
			Object.entries(byReg)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([reg, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "EAFAF1";
					xD(ws3, i + 3, 1, reg, bg, "left", true);
					xD(ws3, i + 3, 2, v.q, bg, "center");
					xD(ws3, i + 3, 3, v.ativa, bg, "center");
					xD(
						ws3,
						i + 3,
						4,
						v.retirada,
						v.retirada > 0 ? "EBF5FB" : bg,
						"center",
					);
					xD(ws3, i + 3, 5, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
				});
			[30, 12, 14, 16, 14].forEach((w, i) => {
				ws3.getColumn(i + 1).width = w;
			});

			// -- ABA 4: Por Cidade -------------------------------------------------
			const ws4 = wb.addWorksheet("Por Cidade");
			ws4.views = [{ showGridLines: false }];
			xT(ws4, 1, 4, `O.S POR CIDADE — ${titulo}`, "1F618D");
			["Cidade", "Regional", "Total O.S", "Agentes Aut."].forEach((h, i) =>
				xH(ws4, 2, i + 1, h, "2471A3"),
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
					xD(ws4, i + 3, 1, cid, bg, "left", true);
					xD(ws4, i + 3, 2, v.regional, bg);
					xD(ws4, i + 3, 3, v.q, bg, "center");
					xD(ws4, i + 3, 4, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
				});
			[28, 28, 12, 14].forEach((w, i) => {
				ws4.getColumn(i + 1).width = w;
			});

			// -- Download ----------------------------------------------------------
			const buf = await wb.xlsx.writeBuffer();
			const blob = new Blob([buf], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `os-dia-${dataSlug}.xlsx`;
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
          ${status === "ok" || status === "gerando" ? "border-green-400 bg-green-50" : status === "err" ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-orange-400"}`}
				onClick={() => inputRef.current?.click()}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						inputRef.current?.click();
					}
				}}
				role="button"
				tabIndex={0}
			>
				<input
					ref={inputRef}
					type="file"
					accept=".xlsx,.xls"
					className="hidden"
					onChange={load}
				/>
				<span className="text-4xl block mb-3">📋</span>
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
							<code>
								numos · tecnicos · endereco_instalacao · data_termino_executado
							</code>
						</p>
					</>
				)}
			</div>

			{/* Filtro de data */}
			{datas.length > 1 && (
				<div className="flex flex-wrap gap-2 items-center">
					<span className="text-sm text-gray-500 font-medium">
						Filtrar por dia:
					</span>
					<button
						type="button"
						onClick={() => setFiltroData("todos")}
						className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors
              ${filtroData === "todos" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:text-orange-600"}`}
					>
						Todos ({rows.length})
					</button>
					{datas.map((d) => (
						<button
							type="button"
							key={d}
							onClick={() => setFiltroData(d)}
							className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors
                ${filtroData === d ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-200 hover:border-orange-400 hover:text-orange-600"}`}
						>
							{d} ({rows.filter((r) => r._dateStr === d).length})
						</button>
					))}
				</div>
			)}

			{/* Botao gerar */}
			{D.length > 0 && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
				>
					<FileDown size={16} />
					Gerar O.S do Dia —{" "}
					{filtroData === "todos" ? `${D.length} registros` : filtroData} (4
					abas)
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

export default TabDiario;

import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import RetorninhoLoader from "../../../../components/ui/RetorninhoLoader";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";
import {
	buildCidadeRegionalMap,
	extractCidadeFromEndereco,
	normalizeText,
	normalizeWorksheetRows,
} from "../../utils/ferramentasTabUtils";

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveDropzoneClass(status) {
	if (status === "ok") return "border-green-400 bg-green-50";
	if (status === "err") return "border-red-400 bg-red-50";
	return "border-gray-200 bg-white hover:border-blue-400";
}

const TabDevolucoesDia = () => {
	const { regionais } = useFerramentasRegionais();
	const [status, setStatus] = useState(null);
	const [rows, setRows] = useState([]);
	const [fname, setFname] = useState("");
	const [filtroData, setFiltroData] = useState("");
	const inputRef = useRef();

	const cidMap = buildCidadeRegionalMap(regionais, (r, c) => ({
		regional: r.nome,
		agente: c.agente,
	}));

	const getInfo = (cidade) =>
		cidMap[normalizeText(cidade)] || { regional: "Sem Regional", agente: false };

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
				// Enriquece cidade e regional
				const enriched = data.map((r) => {
					const cidade =
						r.cidade ||
						extractCidadeFromEndereco(
							r.enderecoinstalacao || r.endereco || "",
							"N/A",
						);
					const info = getInfo(cidade);
					return {
						...r,
						_cidade: cidade,
						_regional: info.regional,
						_agente: info.agente ? "SIM" : "NAO",
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

	// Extrai datas unicas da coluna datafechamento
	const getDatas = () => {
		const datas = new Set();
		rows.forEach((r) => {
			const v = String(r.datafechamento || "").split(" ")[0];
			if (v) datas.add(v);
		});
		return [...datas].sort((a, b) =>
			String(a).localeCompare(String(b), "pt-BR"),
		);
	};

	const gerar = async () => {
		if (!rows.length || !filtroData) return;
		setStatus("gerando");
		try {
			const D = rows.filter((r) =>
				String(r.datafechamento || "").startsWith(filtroData),
			);

			if (!D.length) {
				setStatus("ok");
				return;
			}

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

			// -- ABA 1: Resumo do Dia ----------------------------------------------
			const ws1 = wb.addWorksheet(`Resumo ${filtroData.replace(/\//g, "-")}`);
			ws1.views = [{ showGridLines: false }];
			xT(
				ws1,
				1,
				5,
				`DEVOLUCOES DIARIA — ${filtroData} — ${D.length} registros`,
				"003087",
			);

			// KPIs
			const totalCidades = new Set(D.map((r) => r._cidade)).size;
			const totalRegs = new Set(D.map((r) => r._regional)).size;
			const totalAgentes = D.filter((r) => r._agente === "SIM").length;
			[
				["TOTAL", D.length, "003087"],
				["CIDADES", totalCidades, "117A65"],
				["REGIONAIS", totalRegs, "6C3483"],
				["AGENTES AUT.", totalAgentes, "B7950B"],
			].forEach(([lbl, val, cor], i) => {
				const lc = ws1.getCell(3, i + 1);
				lc.value = lbl;
				lc.font = { name: "Arial", bold: true, size: 8, color: C("FFFFFF") };
				lc.fill = { type: "pattern", pattern: "solid", fgColor: C(cor) };
				lc.alignment = { horizontal: "center" };
				ws1.getRow(3).height = 18;
				const vc = ws1.getCell(4, i + 1);
				vc.value = val;
				vc.font = { name: "Arial", bold: true, size: 20, color: C(cor) };
				vc.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F5F5") };
				vc.alignment = { horizontal: "center" };
				ws1.getRow(4).height = 46;
			});

			// Por Regional
			let rr = 6;
			xT(ws1, rr, 5, "POR REGIONAL", "1F618D");
			rr++;
			["Regional", "Total", "% Total", "Cidades", "Agentes Aut."].forEach(
				(h, i) => xH(ws1, rr, i + 1, h, "2471A3"),
			);
			rr++;
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
					xD(ws1, rr, 1, reg, bg, "left");
					xD(ws1, rr, 2, v.q, bg, "center");
					xD(
						ws1,
						rr,
						3,
						`${((v.q / D.length) * 100).toFixed(1)}%`,
						bg,
						"center",
					);
					xD(ws1, rr, 4, v.cidades.size, bg, "center");
					xD(ws1, rr, 5, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
					rr++;
				});
			[28, 12, 12, 12, 14].forEach((w, i) => {
				ws1.getColumn(i + 1).width = w;
			});

			// -- ABA 2: Por Cidade -------------------------------------------------
			const ws2 = wb.addWorksheet("Por Cidade");
			ws2.views = [{ showGridLines: false }];
			xT(ws2, 1, 4, `DEVOLUCOES POR CIDADE — ${filtroData}`, "1F618D");
			["Cidade", "Regional", "Total", "Agente Aut."].forEach((h, i) =>
				xH(ws2, 2, i + 1, h, "2471A3"),
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
					xD(ws2, i + 3, 1, cid, bg);
					xD(ws2, i + 3, 2, v.regional, bg);
					xD(ws2, i + 3, 3, v.q, bg, "center");
					xD(ws2, i + 3, 4, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
				});
			[28, 28, 12, 14].forEach((w, i) => {
				ws2.getColumn(i + 1).width = w;
			});

			// -- ABA 3: Dados Completos --------------------------------------------
			const ws3 = wb.addWorksheet("Dados Completos");
			ws3.views = [{ showGridLines: false }];
			xT(ws3, 1, 5, `DADOS COMPLETOS — ${filtroData}`, "003087");
			[
				"Código Cliente",
				"Cidade",
				"Regional",
				"Agente Aut.",
				"Data Fechamento",
			].forEach((h, i) => xH(ws3, 2, i + 1, h, "1F618D"));
			D.forEach((r, i) => {
				const bg = i % 2 ? "FFFFFF" : "EBF5FB";
				xD(ws3, i + 3, 1, String(r.codigocliente || r.codigo || ""), bg);
				xD(ws3, i + 3, 2, r._cidade, bg);
				xD(ws3, i + 3, 3, r._regional, bg);
				xD(
					ws3,
					i + 3,
					4,
					r._agente,
					r._agente === "SIM" ? "FEF9E7" : bg,
					"center",
				);
				xD(ws3, i + 3, 5, String(r.datafechamento || ""), bg, "center");
			});
			[22, 26, 26, 14, 18].forEach((w, i) => {
				ws3.getColumn(i + 1).width = w;
			});

			// -- Download ----------------------------------------------------------
			const buf = await wb.xlsx.writeBuffer();
			const blob = new Blob([buf], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `devolucoes-dia-${filtroData.replace(/\//g, "-")}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
			setStatus("ok");
		} catch (e) {
			console.error(e);
			setStatus("err");
		}
	};

	const datas = getDatas();

	return (
		<div className="space-y-4">
			{/* Upload */}
			<div
				className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${resolveDropzoneClass(status)}`}
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
				<span className="text-4xl block mb-3">📦</span>
				{(() => {
					// Extraido pra achado javascript:S3358 (ternario aninhado).
					if (status === "ok" || status === "gerando") {
						return (
							<>
								<p className="font-semibold text-green-700">{fname}</p>
								<p className="text-sm text-green-600">
									{rows.length} linhas · clique para trocar
								</p>
							</>
						);
					}
					if (status === "loading") {
						return <RetorninhoLoader compact size="sm" title="Carregando..." />;
					}
					return (
						<>
							<p className="font-semibold text-gray-700">
								Clique ou arraste o arquivo .xlsx
							</p>
							<p className="text-xs text-gray-400 mt-1">
								Campos esperados:{" "}
								<code>codigocliente · cidade · datafechamento</code>
							</p>
						</>
					);
				})()}
			</div>

			{/* Filtro de data */}
			{datas.length > 0 && (
				<div className="flex flex-wrap gap-2 items-center">
					<span className="text-sm text-gray-500 font-medium">
						Selecione o dia:
					</span>
					{datas.map((d) => (
						<button
							type="button"
							key={d}
							onClick={() => setFiltroData(d)}
							className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors
                ${
									filtroData === d
										? "bg-blue-700 text-white border-blue-700"
										: "bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700"
								}`}
						>
							{d}
						</button>
					))}
				</div>
			)}

			{/* Botao gerar */}
			{rows.length > 0 && filtroData && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
				>
					<FileDown size={16} />
					Gerar Devolucoes — {filtroData} (3 abas)
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

export default TabDevolucoesDia;

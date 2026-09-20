import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";
import {
	buildCidadeRegionalMap,
	extractCidadeFromEndereco,
	formatFerramentasMonth,
	normalizeText,
	normalizeWorksheetRows,
	parseFerramentasDate,
} from "../../utils/ferramentasTabUtils";

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveDropzoneClass(status) {
	if (status === "ok" || status === "gerando") return "border-green-400 bg-green-50";
	if (status === "err") return "border-red-400 bg-red-50";
	return "border-gray-200 bg-white hover:border-purple-400";
}

const TabMultas = () => {
	const { regionais } = useFerramentasRegionais();
	const [status, setStatus] = useState(null);
	const [rows, setRows] = useState([]);
	const [fname, setFname] = useState("");
	const inputRef = useRef();

	const cidMap = buildCidadeRegionalMap(regionais);

	const getRegional = (cidade) =>
		cidMap[normalizeText(cidade)] || "Sem Regional";

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
					const cidadeExtr = extractCidadeFromEndereco(
						r.enderecoinstalacao || r.endereco || "",
					);
					const cidade = cidadeExtr || r.cidade || r.estado || "N/A";
					return {
						...r,
						_cidade: cidade,
						_regional: getRegional(cidade),
						_dataCad: parseFerramentasDate(
							r.datacadastro || r.dataabertura || r.data || "",
						),
						_dataFech: parseFerramentasDate(r.datafechamento || ""),
						_aberto:
							!r.datafechamento || String(r.datafechamento).trim() === "",
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
		if (!rows.length) return;
		setStatus("gerando");
		try {
			const D = rows;
			const abertas = D.filter((r) => r._aberto);

			const wb = new ExcelJS.Workbook();
			wb.creator = "Sempre";
			const C = (hex) => ({ argb: "FF" + hex });
			const xH = (ws, row, col, val, color = "8E44AD") => {
				const c = ws.getCell(row, col);
				c.value = val;
				c.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
				c.fill = { type: "pattern", pattern: "solid", fgColor: C(color) };
				c.alignment = {
					horizontal: "center",
					vertical: "middle",
					wrapText: true,
				};
				const b = { style: "thin", color: C("FFFFFF") };
				c.border = { left: b, right: b, top: b, bottom: b };
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
			const xT = (ws, r, n, text, bg = "8E44AD") => {
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
				vc.font = { name: "Arial", bold: true, size: 22, color: C(cor) };
				vc.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F5F5") };
				vc.alignment = { horizontal: "center" };
				ws.getRow(r + 1).height = 48;
			};

			// -- ABA 1: Por Mes ----------------------------------------------------
			const ws1 = wb.addWorksheet("Por Mes");
			ws1.views = [{ showGridLines: false }];
			xT(ws1, 1, 5, `MULTAS POR MES — ${D.length} registros`, "8E44AD");
			xKpi(ws1, 3, 1, "TOTAL", D.length, "8E44AD");
			xKpi(ws1, 3, 2, "EM ABERTO", abertas.length, "C0392B");
			xKpi(ws1, 3, 3, "ENCERRADAS", D.length - abertas.length, "117A65");
			xKpi(
				ws1,
				3,
				4,
				"CIDADES",
				new Set(D.map((r) => r._cidade)).size,
				"1F618D",
			);
			xKpi(
				ws1,
				3,
				5,
				"REGIONAIS",
				new Set(D.map((r) => r._regional)).size,
				"B7950B",
			);

			let rr = 6;
			xT(ws1, rr, 4, "ABERTAS POR MES DE CADASTRO", "8E44AD");
			rr++;
			["Mes/Ano", "Total Multas", "Em Aberto", "Cidades"].forEach((h, i) =>
				xH(ws1, rr, i + 1, h, "8E44AD"),
			);
			rr++;
			const byMes = {};
			D.forEach((r) => {
				const mes = formatFerramentasMonth(r._dataCad);
				if (!mes) return;
				if (!byMes[mes]) byMes[mes] = { q: 0, abertas: 0, cidades: new Set() };
				byMes[mes].q++;
				if (r._aberto) byMes[mes].abertas++;
				byMes[mes].cidades.add(r._cidade);
			});
			Object.entries(byMes)
				.sort(([mesA], [mesB]) =>
					String(mesA).localeCompare(String(mesB), "pt-BR"),
				)
				.forEach(([mes, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "F5EEF8";
					xD(ws1, rr, 1, mes, bg, "center");
					xD(ws1, rr, 2, v.q, bg, "center");
					xD(ws1, rr, 3, v.abertas, v.abertas > 0 ? "FADBD8" : bg, "center");
					xD(ws1, rr, 4, [...v.cidades].join(", "), bg);
					rr++;
				});
			[14, 14, 14, 40].forEach((w, i) => {
				ws1.getColumn(i + 1).width = w;
			});

			// -- ABA 2: Por Dia (Top 30) -------------------------------------------
			const ws2 = wb.addWorksheet("Por Dia");
			ws2.views = [{ showGridLines: false }];
			xT(ws2, 1, 4, "MULTAS POR DIA — TOP 30", "6C3483");
			["Data", "Total", "Em Aberto", "Cidades"].forEach((h, i) =>
				xH(ws2, 2, i + 1, h, "6C3483"),
			);
			const byDia = {};
			D.forEach((r) => {
				const d = r._dataCad;
				if (!d) return;
				const key = d.toLocaleDateString("pt-BR");
				if (!byDia[key])
					byDia[key] = { q: 0, abertas: 0, cidades: new Set(), _d: d };
				byDia[key].q++;
				if (r._aberto) byDia[key].abertas++;
				byDia[key].cidades.add(r._cidade);
			});
			Object.entries(byDia)
				.sort((a, b) => b[1]._d - a[1]._d)
				.slice(0, 30)
				.forEach(([dia, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "F5EEF8";
					xD(ws2, i + 3, 1, dia, bg, "center");
					xD(ws2, i + 3, 2, v.q, bg, "center");
					xD(ws2, i + 3, 3, v.abertas, v.abertas > 0 ? "FADBD8" : bg, "center");
					xD(ws2, i + 3, 4, [...v.cidades].join(", "), bg);
				});
			[14, 12, 14, 40].forEach((w, i) => {
				ws2.getColumn(i + 1).width = w;
			});

			// -- ABA 3: Por Cidade -------------------------------------------------
			const ws3 = wb.addWorksheet("Por Cidade");
			ws3.views = [{ showGridLines: false }];
			xT(ws3, 1, 4, "MULTAS POR CIDADE", "1F618D");
			["Cidade", "Regional", "Total", "Em Aberto"].forEach((h, i) =>
				xH(ws3, 2, i + 1, h, "1F618D"),
			);
			const byCid = {};
			D.forEach((r) => {
				const c = r._cidade;
				if (!byCid[c]) byCid[c] = { q: 0, regional: r._regional, abertas: 0 };
				byCid[c].q++;
				if (r._aberto) byCid[c].abertas++;
			});
			Object.entries(byCid)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([cid, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "EBF5FB";
					xD(ws3, i + 3, 1, cid, bg, "left", true);
					xD(ws3, i + 3, 2, v.regional, bg);
					xD(ws3, i + 3, 3, v.q, bg, "center");
					xD(ws3, i + 3, 4, v.abertas, v.abertas > 0 ? "FADBD8" : bg, "center");
				});
			[28, 28, 12, 14].forEach((w, i) => {
				ws3.getColumn(i + 1).width = w;
			});

			// -- ABA 4: Em Aberto --------------------------------------------------
			const ws4 = wb.addWorksheet("Em Aberto");
			ws4.views = [{ showGridLines: false }];
			xT(ws4, 1, 5, `MULTAS EM ABERTO — ${abertas.length} registros`, "C0392B");
			[
				"Código",
				"Nome/Razao Social",
				"Cidade",
				"Regional",
				"Data Cadastro",
			].forEach((h, i) => xH(ws4, 2, i + 1, h, "C0392B"));
			abertas
				.slice()
				.sort((a, b) => (a._dataCad || 0) - (b._dataCad || 0))
				.forEach((r, i) => {
					const bg = i % 2 ? "FFFFFF" : "FADBD8";
					xD(ws4, i + 3, 1, String(r.codigocliente || r.codigo || ""), bg);
					xD(ws4, i + 3, 2, String(r.nomerazaosocial || r.nome || ""), bg);
					xD(ws4, i + 3, 3, r._cidade, bg);
					xD(ws4, i + 3, 4, r._regional, bg);
					xD(
						ws4,
						i + 3,
						5,
						r._dataCad ? r._dataCad.toLocaleDateString("pt-BR") : "",
						bg,
						"center",
					);
				});
			[20, 36, 26, 26, 16].forEach((w, i) => {
				ws4.getColumn(i + 1).width = w;
			});

			// -- ABA 5: Dados Completos --------------------------------------------
			const ws5 = wb.addWorksheet("Dados Completos");
			ws5.views = [{ showGridLines: false }];
			xT(ws5, 1, 6, "DADOS COMPLETOS — MULTAS", "2C3E50");
			[
				"Código",
				"Nome/Razao Social",
				"Cidade",
				"Regional",
				"Data Cadastro",
				"Status",
			].forEach((h, i) => xH(ws5, 2, i + 1, h, "566573"));
			D.slice()
				.sort((a, b) => (a._dataCad || 0) - (b._dataCad || 0))
				.forEach((r, i) => {
					const bg = i % 2 ? "FFFFFF" : "F2F3F4";
					const abBg = r._aberto ? "FADBD8" : bg;
					xD(ws5, i + 3, 1, String(r.codigocliente || r.codigo || ""), bg);
					xD(ws5, i + 3, 2, String(r.nomerazaosocial || r.nome || ""), bg);
					xD(ws5, i + 3, 3, r._cidade, bg);
					xD(ws5, i + 3, 4, r._regional, bg);
					xD(
						ws5,
						i + 3,
						5,
						r._dataCad ? r._dataCad.toLocaleDateString("pt-BR") : "",
						bg,
						"center",
					);
					xD(ws5, i + 3, 6, r._aberto ? "ABERTO" : "ENCERRADO", abBg, "center");
				});
			[20, 36, 26, 26, 16, 14].forEach((w, i) => {
				ws5.getColumn(i + 1).width = w;
			});

			// -- Download ----------------------------------------------------------
			const buf = await wb.xlsx.writeBuffer();
			const blob = new Blob([buf], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `multas-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
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
				<span className="text-4xl block mb-3">⚖️</span>
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
						return <p className="text-sm text-gray-500">Carregando...</p>;
					}
					return (
						<>
							<p className="font-semibold text-gray-700">
								Clique ou arraste o arquivo .xlsx
							</p>
							<p className="text-xs text-gray-400 mt-1">
								Campos esperados:{" "}
								<code>
									codigocliente · cidade · datacadastro · datafechamento
								</code>
							</p>
						</>
					);
				})()}
			</div>

			{/* Preview */}
			{rows.length > 0 && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					{[
						["Total", rows.length, "text-purple-700"],
						["Em Aberto", rows.filter((r) => r._aberto).length, "text-red-600"],
						[
							"Cidades",
							new Set(rows.map((r) => r._cidade)).size,
							"text-blue-700",
						],
						[
							"Regionais",
							new Set(rows.map((r) => r._regional)).size,
							"text-yellow-600",
						],
					].map(([lbl, val, cls]) => (
						<div
							key={lbl}
							className="bg-white border border-gray-200 rounded-xl p-4 text-center"
						>
							<div className={`text-2xl font-bold ${cls}`}>{val}</div>
							<div className="text-xs text-gray-400 uppercase tracking-wide mt-1">
								{lbl}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Botao */}
			{rows.length > 0 && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-purple-700 text-white rounded-xl font-semibold hover:bg-purple-800 transition-colors"
				>
					<FileDown size={16} />
					Gerar Relatorio de Multas (5 abas)
				</button>
			)}

			{status === "gerando" && (
				<p className="text-sm text-purple-600 font-medium animate-pulse">
					⏳ Gerando Excel...
				</p>
			)}
			{status === "err" && (
				<p className="text-sm text-red-600">❌ Erro ao processar o arquivo.</p>
			)}
		</div>
	);
};

export default TabMultas;

import ExcelJS from "exceljs";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";
import {
	buildCidadeRegionalMap,
	normalizeText,
	normalizeWorksheetRows,
} from "../../utils/ferramentasTabUtils";

const percent = (part, total) =>
	total ? `${((Number(part || 0) / total) * 100).toFixed(1)}%` : "0.0%";

const groupCount = (rows, getKey, buildInitial = () => ({})) => {
	const grouped = {};
	rows.forEach((row) => {
		const key = getKey(row) || "N/A";
		if (!grouped[key]) grouped[key] = { q: 0, ...buildInitial(row) };
		grouped[key].q += 1;
	});
	return grouped;
};

const pickWorksheet = (workbook) => {
	const tecnologiaSheet = workbook.SheetNames.find((name) =>
		normalizeText(name).includes("tecnologia"),
	);
	return workbook.Sheets[tecnologiaSheet || workbook.SheetNames[0]];
};

const TabMesInicial = () => {
	const { regionais } = useFerramentasRegionais();
	const [status, setStatus] = useState(null);
	const [rows, setRows] = useState([]);
	const [fname, setFname] = useState("");
	const inputRef = useRef();

	const cidMap = useMemo(() => {
		return buildCidadeRegionalMap(regionais, (regional, cidade) => ({
			regional: regional.nome,
			agente: cidade.agente,
		}));
	}, [regionais]);

	const load = (event) => {
		const file = event.target.files[0];
		if (!file) return;
		setFname(file.name);
		setStatus("loading");

		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const workbook = XLSX.read(ev.target.result, { type: "array" });
				const worksheet = pickWorksheet(workbook);
				const data = normalizeWorksheetRows(
					XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" }),
				);

				const enriched = data.map((row) => {
					const cidade = String(row.cidade || "").trim() || "N/A";
					const info = cidMap[normalizeText(cidade)] || {};
					const tecnologia = String(row.tecnologia || "").trim() || "N/A";
					return {
						...row,
						_codigo: String(row.codigocliente || row.idcliente || "").trim(),
						_servico: String(row.servico || "").trim() || "N/A",
						_tecnologia: tecnologia,
						_isFibra: normalizeText(tecnologia) === "fibra",
						_cidade: cidade,
						_regional: info.regional || "Sem Regional",
						_agente: info.agente ? "SIM" : "NAO",
						_status: String(row.status || "").trim(),
						_valor: String(row.valorr || row.valor || "").trim(),
						_dataCadastro: String(row.datacadastro || "").trim(),
						_dataCancelamento: String(row.datacancelamento || "").trim(),
					};
				});

				setRows(enriched);
				setStatus("ok");
			} catch (error) {
				console.error(error);
				setRows([]);
				setStatus("err");
			}
		};
		reader.readAsArrayBuffer(file);
	};

	const totalFibra = rows.filter((row) => row._isFibra).length;
	const totalOutros = rows.length - totalFibra;

	const gerar = async () => {
		if (!rows.length) return;
		setStatus("generating");
		try {
			const fibra = rows.filter((row) => row._isFibra);
			const outros = rows.filter((row) => !row._isFibra);
			const wb = new ExcelJS.Workbook();
			wb.creator = "Sempre";
			wb.created = new Date();

			const C = (hex) => ({ argb: "FF" + hex });
			const xH = (ws, row, col, val, color = "003087") => {
				const cell = ws.getCell(row, col);
				cell.value = val;
				cell.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(color) };
				cell.alignment = {
					horizontal: "center",
					vertical: "middle",
					wrapText: true,
				};
				const border = { style: "thin", color: C("FFFFFF") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
			};
			const xD = (
				ws,
				row,
				col,
				val,
				bg = "FFFFFF",
				align = "left",
				bold = false,
			) => {
				const cell = ws.getCell(row, col);
				cell.value = val ?? "";
				cell.font = { name: "Arial", size: 10, bold };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = { horizontal: align, vertical: "middle" };
				const border = { style: "thin", color: C("D0D0D0") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
			};
			const xT = (ws, row, cols, text, bg = "003087") => {
				ws.mergeCells(row, 1, row, cols);
				const cell = ws.getCell(row, 1);
				cell.value = text;
				cell.font = { name: "Arial", bold: true, size: 13, color: C("FFFFFF") };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(row).height = 28;
			};
			const xKpi = (ws, row, col, label, value, color) => {
				const labelCell = ws.getCell(row, col);
				labelCell.value = label;
				labelCell.font = {
					name: "Arial",
					bold: true,
					size: 8,
					color: C("FFFFFF"),
				};
				labelCell.fill = {
					type: "pattern",
					pattern: "solid",
					fgColor: C(color),
				};
				labelCell.alignment = { horizontal: "center", vertical: "middle" };
				const valueCell = ws.getCell(row + 1, col);
				valueCell.value = value;
				valueCell.font = {
					name: "Arial",
					bold: true,
					size: 22,
					color: C(color),
				};
				valueCell.fill = {
					type: "pattern",
					pattern: "solid",
					fgColor: C("F5F5F5"),
				};
				valueCell.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(row + 1).height = 48;
			};

			const byReg = {};
			fibra.forEach((row) => {
				const reg = row._regional;
				if (!byReg[reg]) {
					byReg[reg] = {
						q: 0,
						cidades: new Set(),
						agentes: 0,
						cancelados: 0,
					};
				}
				byReg[reg].q += 1;
				byReg[reg].cidades.add(row._cidade);
				if (row._agente === "SIM") byReg[reg].agentes += 1;
				if (normalizeText(row._status) === "cancelado") byReg[reg].cancelados += 1;
			});

			const byCidade = {};
			fibra.forEach((row) => {
				const cidade = row._cidade;
				if (!byCidade[cidade]) {
					byCidade[cidade] = {
						q: 0,
						regional: row._regional,
						agentes: 0,
						cancelados: 0,
					};
				}
				byCidade[cidade].q += 1;
				if (row._agente === "SIM") byCidade[cidade].agentes += 1;
				if (normalizeText(row._status) === "cancelado")
					byCidade[cidade].cancelados += 1;
			});

			const byAgenteCidade = {};
			fibra
				.filter((row) => row._agente === "SIM")
				.forEach((row) => {
					const cidade = row._cidade;
					if (!byAgenteCidade[cidade]) {
						byAgenteCidade[cidade] = {
							q: 0,
							regional: row._regional,
							cancelados: 0,
						};
					}
					byAgenteCidade[cidade].q += 1;
					if (normalizeText(row._status) === "cancelado") {
						byAgenteCidade[cidade].cancelados += 1;
					}
				});

			const byTecnologia = groupCount(outros, (row) => row._tecnologia);
			const byOutrosReg = {};
			outros.forEach((row) => {
				const reg = row._regional;
				const tech = row._tecnologia;
				if (!byOutrosReg[reg]) byOutrosReg[reg] = {};
				byOutrosReg[reg][tech] = (byOutrosReg[reg][tech] || 0) + 1;
			});

			const wsD = wb.addWorksheet("Dashboard");
			wsD.views = [{ showGridLines: false }];
			xT(
				wsD,
				1,
				6,
				`MES INICIAL - FIBRA - ${fibra.length} registros - ${new Date().toLocaleDateString("pt-BR")}`,
				"003087",
			);
			xKpi(wsD, 3, 1, "TOTAL FIBRA", fibra.length, "003087");
			xKpi(
				wsD,
				3,
				2,
				"REGIONAIS",
				new Set(fibra.map((r) => r._regional)).size,
				"117A65",
			);
			xKpi(
				wsD,
				3,
				3,
				"CIDADES",
				new Set(fibra.map((r) => r._cidade)).size,
				"1F618D",
			);
			xKpi(wsD, 3, 4, "OUTROS SERVICOS", outros.length, "6C3483");
			xKpi(wsD, 3, 5, "TOTAL PLANILHA", rows.length, "566573");
			xKpi(wsD, 3, 6, "% FIBRA", percent(fibra.length, rows.length), "B7950B");

			let rr = 7;
			xT(wsD, rr, 6, "FIBRA POR REGIONAL", "1F618D");
			rr++;
			[
				"Regional",
				"Fibra",
				"% Fibra",
				"Cidades",
				"Ag. Aut.",
				"Cancelados",
			].forEach((h, i) => xH(wsD, rr, i + 1, h, "2471A3"));
			rr++;
			Object.entries(byReg)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([reg, data], index) => {
					const bg = index % 2 ? "FFFFFF" : "EBF5FB";
					xD(wsD, rr, 1, reg, bg, "left", true);
					xD(wsD, rr, 2, data.q, bg, "center");
					xD(wsD, rr, 3, percent(data.q, fibra.length), bg, "center");
					xD(wsD, rr, 4, data.cidades.size, bg, "center");
					xD(
						wsD,
						rr,
						5,
						data.agentes,
						data.agentes > 0 ? "FEF9E7" : bg,
						"center",
					);
					xD(wsD, rr, 6, data.cancelados, bg, "center");
					rr++;
				});

			rr += 2;
			xT(wsD, rr, 3, "OUTROS SERVICOS POR TECNOLOGIA", "6C3483");
			rr++;
			["Tecnologia", "Total", "% Planilha"].forEach((h, i) =>
				xH(wsD, rr, i + 1, h, "6C3483"),
			);
			rr++;
			Object.entries(byTecnologia)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([tech, data], index) => {
					const bg = index % 2 ? "FFFFFF" : "F5EEF8";
					xD(wsD, rr, 1, tech, bg, "left", true);
					xD(wsD, rr, 2, data.q, bg, "center");
					xD(wsD, rr, 3, percent(data.q, rows.length), bg, "center");
					rr++;
				});
			[30, 12, 12, 12, 12, 14].forEach((w, index) => {
				wsD.getColumn(index + 1).width = w;
			});

			const wsR = wb.addWorksheet("Fibra por Regional");
			wsR.views = [{ showGridLines: false }];
			xT(wsR, 1, 6, "FIBRA POR REGIONAL", "1F618D");
			[
				"Regional",
				"Fibra",
				"% Fibra",
				"Cidades",
				"Ag. Aut.",
				"Cancelados",
			].forEach((h, i) => xH(wsR, 2, i + 1, h, "2471A3"));
			Object.entries(byReg)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([reg, data], index) => {
					const row = index + 3;
					const bg = index % 2 ? "FFFFFF" : "EBF5FB";
					xD(wsR, row, 1, reg, bg, "left", true);
					xD(wsR, row, 2, data.q, bg, "center");
					xD(wsR, row, 3, percent(data.q, fibra.length), bg, "center");
					xD(wsR, row, 4, data.cidades.size, bg, "center");
					xD(
						wsR,
						row,
						5,
						data.agentes,
						data.agentes > 0 ? "FEF9E7" : bg,
						"center",
					);
					xD(wsR, row, 6, data.cancelados, bg, "center");
				});
			[30, 12, 12, 12, 12, 14].forEach((w, index) => {
				wsR.getColumn(index + 1).width = w;
			});

			const wsC = wb.addWorksheet("Fibra por Cidade");
			wsC.views = [{ showGridLines: false }];
			xT(wsC, 1, 6, "FIBRA POR CIDADE", "117A65");
			[
				"Cidade",
				"Regional",
				"Fibra",
				"% Fibra",
				"Ag. Aut.",
				"Cancelados",
			].forEach((h, i) => xH(wsC, 2, i + 1, h, "1E8449"));
			Object.entries(byCidade)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([cidade, data], index) => {
					const row = index + 3;
					const bg = index % 2 ? "FFFFFF" : "EAFAF1";
					xD(wsC, row, 1, cidade, bg, "left", true);
					xD(wsC, row, 2, data.regional, bg);
					xD(wsC, row, 3, data.q, bg, "center");
					xD(wsC, row, 4, percent(data.q, fibra.length), bg, "center");
					xD(
						wsC,
						row,
						5,
						data.agentes,
						data.agentes > 0 ? "FEF9E7" : bg,
						"center",
					);
					xD(wsC, row, 6, data.cancelados, bg, "center");
				});
			[28, 28, 12, 12, 12, 14].forEach((w, index) => {
				wsC.getColumn(index + 1).width = w;
			});

			const wsA = wb.addWorksheet("Fibra por Agente");
			wsA.views = [{ showGridLines: false }];
			xT(wsA, 1, 5, "FIBRA POR AGENTE AUTORIZADO", "B7950B");
			["Cidade/Agente", "Regional", "Fibra", "% Fibra", "Cancelados"].forEach(
				(h, i) => xH(wsA, 2, i + 1, h, "B7950B"),
			);
			Object.entries(byAgenteCidade)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([cidade, data], index) => {
					const row = index + 3;
					const bg = index % 2 ? "FFFFFF" : "FEF9E7";
					xD(wsA, row, 1, cidade, bg, "left", true);
					xD(wsA, row, 2, data.regional, bg);
					xD(wsA, row, 3, data.q, bg, "center");
					xD(wsA, row, 4, percent(data.q, fibra.length), bg, "center");
					xD(wsA, row, 5, data.cancelados, bg, "center");
				});
			if (!Object.keys(byAgenteCidade).length) {
				xD(
					wsA,
					3,
					1,
					"Nenhum agente autorizado com fibra encontrado.",
					"FFFFFF",
				);
			}
			[28, 28, 12, 12, 14].forEach((w, index) => {
				wsA.getColumn(index + 1).width = w;
			});

			const wsO = wb.addWorksheet("Outros Serviços");
			wsO.views = [{ showGridLines: false }];
			xT(wsO, 1, 4, "OUTROS SERVICOS", "6C3483");
			["Regional", "Tecnologia", "Total", "% Outros"].forEach((h, i) =>
				xH(wsO, 2, i + 1, h, "6C3483"),
			);
			let outrosRow = 3;
			Object.entries(byOutrosReg)
				.sort((a, b) => a[0].localeCompare(b[0]))
				.forEach(([reg, tecnologias]) => {
					Object.entries(tecnologias)
						.sort((a, b) => b[1] - a[1])
						.forEach(([tech, total], index) => {
							const bg = outrosRow % 2 ? "FFFFFF" : "F5EEF8";
							xD(wsO, outrosRow, 1, reg, bg, "left", index === 0);
							xD(wsO, outrosRow, 2, tech, bg);
							xD(wsO, outrosRow, 3, total, bg, "center");
							xD(
								wsO,
								outrosRow,
								4,
								percent(total, outros.length),
								bg,
								"center",
							);
							outrosRow++;
						});
				});
			[30, 24, 12, 12].forEach((w, index) => {
				wsO.getColumn(index + 1).width = w;
			});

			const wsF = wb.addWorksheet("Dados Fibra");
			wsF.views = [{ showGridLines: false }];
			xT(wsF, 1, 9, "DADOS FIBRA", "2C3E50");
			[
				"Código Cliente",
				"Cidade",
				"Regional",
				"Tecnologia",
				"Serviço",
				"Status",
				"Valor",
				"Data Cadastro",
				"Data Cancelamento",
			].forEach((h, i) => xH(wsF, 2, i + 1, h, "566573"));
			fibra.forEach((row, index) => {
				const excelRow = index + 3;
				const bg = index % 2 ? "FFFFFF" : "F2F3F4";
				xD(wsF, excelRow, 1, row._codigo, bg);
				xD(wsF, excelRow, 2, row._cidade, bg);
				xD(wsF, excelRow, 3, row._regional, bg);
				xD(wsF, excelRow, 4, row._tecnologia, bg, "center");
				xD(wsF, excelRow, 5, row._servico, bg);
				xD(wsF, excelRow, 6, row._status, bg, "center");
				xD(wsF, excelRow, 7, row._valor, bg, "center");
				xD(wsF, excelRow, 8, row._dataCadastro, bg, "center");
				xD(wsF, excelRow, 9, row._dataCancelamento, bg, "center");
			});
			[18, 24, 26, 14, 58, 16, 12, 24, 24].forEach((w, index) => {
				wsF.getColumn(index + 1).width = w;
			});

			const buffer = await wb.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `mes-inicial-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
			link.click();
			URL.revokeObjectURL(url);
			setStatus("ok");
		} catch (error) {
			console.error(error);
			setStatus("err");
		}
	};

	return (
		<div className="space-y-4">
			<div
				className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${status === "ok" || status === "generating" ? "border-green-400 bg-green-50" : status === "err" ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-orange-400"}`}
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
				<FileSpreadsheet className="mx-auto mb-3 text-blue-800" size={40} />
				{status === "ok" || status === "generating" ? (
					<>
						<p className="font-semibold text-green-700">{fname}</p>
						<p className="text-sm text-green-600">
							{rows.length} linhas - {totalFibra} fibra - {totalOutros} outros
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
							Campos esperados: <code>tecnologia - cidade - servico</code>
						</p>
					</>
				)}
			</div>

			{rows.length > 0 && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					{[
						["Total Fibra", totalFibra, "text-blue-700"],
						[
							"Regionais",
							new Set(rows.filter((r) => r._isFibra).map((r) => r._regional))
								.size,
							"text-green-700",
						],
						[
							"Cidades",
							new Set(rows.filter((r) => r._isFibra).map((r) => r._cidade))
								.size,
							"text-teal-700",
						],
						["Outros Serviços", totalOutros, "text-purple-700"],
					].map(([label, value, className]) => (
						<div
							key={label}
							className="bg-white border border-gray-200 rounded-xl p-4 text-center"
						>
							<div className={`text-2xl font-bold ${className}`}>{value}</div>
							<div className="text-xs text-gray-400 uppercase tracking-wide mt-1">
								{label}
							</div>
						</div>
					))}
				</div>
			)}

			{rows.length > 0 && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
				>
					<FileDown size={16} />
					Gerar MES INICIAL ({totalFibra} fibra)
				</button>
			)}

			{status === "generating" && (
				<p className="text-sm text-blue-600 font-medium animate-pulse">
					Gerando Excel...
				</p>
			)}
			{status === "err" && (
				<p className="text-sm text-red-600">Erro ao processar o arquivo.</p>
			)}
		</div>
	);
};

export default TabMesInicial;

import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useRegionais } from "../../../regionais/hooks/useRegionais";
import {
	normalizeText,
	normalizeWorksheetRows,
	parseFerramentasDate,
	pickFirst,
} from "../../utils/ferramentasTabUtils";

const formatDate = (date) => (date ? date.toLocaleDateString("pt-BR") : "");

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveDropzoneClass(status) {
	if (status === "ok" || status === "generating") return "border-green-400 bg-green-50";
	if (status === "err") return "border-red-400 bg-red-50";
	return "border-gray-200 bg-white hover:border-orange-400";
}

const monthKeyFromDate = (date) =>
	date
		? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
		: "sem-data";

const formatMonth = (monthKey) => {
	if (monthKey === "sem-data") return "Sem data";
	const [year, month] = monthKey.split("-").map(Number);
	return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
		month: "short",
		year: "numeric",
	});
};

const formatPeríodo = (dates) => {
	const validDates = dates.filter(Boolean).sort((a, b) => a - b);
	if (!validDates.length) return "Período não identificado";

	const formatter = new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
	});
	const first = validDates[0];
	const last = validDates[validDates.length - 1];

	if (
		first.getMonth() === last.getMonth() &&
		first.getFullYear() === last.getFullYear()
	) {
		return formatter.format(first);
	}

	return `${formatter.format(first)} a ${formatter.format(last)}`;
};

const extractCidade = (row) => {
	const cidade = pickFirst(row, [
		"cidade",
		"cidadedeinstalacao",
		"municipio",
		"cidadecliente",
		"nomecidade",
	]);
	if (cidade) return cidade;

	const endereco = row.enderecoinstalacao || row.endereco || "";
	const source = String(endereco);
	if (!source) return "N/A";

	const ufMatch = source.match(/,\s*([^,|/\n]+?)\/[A-Z]{2}(?:\s*\||$)/i);
	if (ufMatch) return ufMatch[1].trim();

	const cepMatch = source.match(/,\s*([^,|\n]+?)\s*\|\s*CEP/i);
	if (cepMatch) {
		return cepMatch[1]
			.trim()
			.replace(/\/[A-Z]{2}$/, "")
			.trim();
	}

	return "N/A";
};

const extractRegionalFromRow = (row) =>
	pickFirst(row, [
		"regional",
		"nomeregional",
		"regionalcliente",
		"regionalinstalacao",
		"regionaldeinstalacao",
		"regionalatendimento",
		"regionaldeatendimento",
		"filial",
		"unidade",
		"empresa",
		"provedor",
		"marca",
	]);

const resolveRegional = (row, cidade, regionalMap) => {
	const regionalFromRow = extractRegionalFromRow(row);
	if (normalizeText(regionalFromRow).includes("onnet")) return "ONNET";
	return regionalMap[normalizeText(cidade)] || "Sem Regional";
};

const isFibraTecnologia = (row) =>
	normalizeText(row.tecnologia).includes("fibra");

const buildRegionalMap = (regionais) => {
	const map = {};
	(regionais || []).forEach((regional) => {
		const nomeRegional = regional.nome || regional.name || regional.label || "";
		(regional.cidades || []).forEach((cidade) => {
			const nomeCidade =
				typeof cidade === "string"
					? cidade
					: cidade?.nome ||
						cidade?.cidade ||
						cidade?.name ||
						cidade?.label ||
						"";
			const chaveCidade = normalizeText(nomeCidade);
			if (chaveCidade && nomeRegional) map[chaveCidade] = nomeRegional;
		});
	});
	return map;
};

const buildAnalytics = (rows) => {
	const months = [...new Set(rows.map((row) => row._monthKey))].sort((a, b) =>
		String(a).localeCompare(String(b), "pt-BR"),
	);
	const byRegional = {};
	const byMonth = {};
	const byRegionalMonth = {};

	rows.forEach((row) => {
		const regional = row._regional || "Sem Regional";
		const monthKey = row._monthKey;

		byRegional[regional] = (byRegional[regional] || 0) + 1;
		byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
		byRegionalMonth[regional] = byRegionalMonth[regional] || {};
		byRegionalMonth[regional][monthKey] =
			(byRegionalMonth[regional][monthKey] || 0) + 1;
	});

	const regionalRows = Object.keys(byRegional)
		.sort(
			(a, b) => byRegional[b] - byRegional[a] || a.localeCompare(b, "pt-BR"),
		)
		.map((regional) => ({
			regional,
			total: byRegional[regional],
			months: months.reduce(
				(acc, monthKey) => ({
					...acc,
					[monthKey]: byRegionalMonth[regional]?.[monthKey] || 0,
				}),
				{},
			),
		}));

	const monthRows = months.map((monthKey) => ({
		monthKey,
		monthLabel: formatMonth(monthKey),
		total: byMonth[monthKey] || 0,
	}));

	return {
		totalRetiradas: rows.length,
		totalRegionais: regionalRows.length,
		totalMeses: months.length,
		periodo: formatPeríodo(rows.map((row) => row._dataCancelamento)),
		months,
		monthRows,
		regionalRows,
	};
};

const TabCancelamentoAvaliacao = () => {
	const { regionais } = useRegionais();
	const [status, setStatus] = useState(null);
	const [rawRows, setRawRows] = useState([]);
	const [fileName, setFileName] = useState("");
	const inputRef = useRef();

	const regionalMap = useMemo(() => buildRegionalMap(regionais), [regionais]);

	const rows = useMemo(
		() =>
			rawRows
				.map((row) => {
					const cidade = extractCidade(row);
					const dataCancelamento = parseFerramentasDate(
						pickFirst(row, [
							"datacancelamento",
							"dataalteracostatus",
							"datadecancelamento",
							"data",
						]),
					);
					const monthKey = monthKeyFromDate(dataCancelamento);

					return {
						...row,
						_codigoCliente: pickFirst(row, [
							"codigocliente",
							"idcliente",
							"codigo",
							"cliente",
						]),
						_cidade: cidade,
						_regional: resolveRegional(row, cidade, regionalMap),
						_dataCancelamento: dataCancelamento,
						_monthKey: monthKey,
						_monthLabel: formatMonth(monthKey),
						_tecnologia: String(row.tecnologia || "").trim(),
						_isFibra: isFibraTecnologia(row),
					};
				})
				.filter((row) => row._isFibra),
		[rawRows, regionalMap],
	);

	const analytics = useMemo(() => buildAnalytics(rows), [rows]);

	const loadFile = (event) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setFileName(file.name);
		setStatus("loading");

		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const workbook = XLSX.read(ev.target.result, { type: "array" });
				const worksheet = workbook.Sheets[workbook.SheetNames[0]];
				const data = normalizeWorksheetRows(
					XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" }),
				);
				setRawRows(data);
				setStatus("ok");
			} catch (error) {
				console.error(error);
				setRawRows([]);
				setStatus("err");
			}
		};

		reader.readAsArrayBuffer(file);
	};

	const gerar = async () => {
		if (!rows.length) return;

		setStatus("generating");
		try {
			const workbook = new ExcelJS.Workbook();
			workbook.creator = "Sempre";
			workbook.created = new Date();

			const color = (hex) => ({ argb: `FF${hex}` });
			const stripe = (index, alt = "FFF6E9") => (index % 2 ? "FFFFFF" : alt);

			const setTitle = (sheet, row, columns, text, bg = "C2410C") => {
				sheet.mergeCells(row, 1, row, columns);
				const cell = sheet.getCell(row, 1);
				cell.value = text;
				cell.font = {
					name: "Arial",
					bold: true,
					size: 13,
					color: color("FFFFFF"),
				};
				cell.fill = { type: "pattern", pattern: "solid", fgColor: color(bg) };
				cell.alignment = { horizontal: "center", vertical: "middle" };
				sheet.getRow(row).height = 28;
			};

			const setHeader = (sheet, row, col, text, bg = "C2410C") => {
				const cell = sheet.getCell(row, col);
				cell.value = text;
				cell.font = {
					name: "Arial",
					bold: true,
					size: 10,
					color: color("FFFFFF"),
				};
				cell.fill = { type: "pattern", pattern: "solid", fgColor: color(bg) };
				cell.alignment = {
					horizontal: "center",
					vertical: "middle",
					wrapText: true,
				};
				const border = { style: "thin", color: color("FFFFFF") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
			};

			const setCell = (
				sheet,
				row,
				col,
				value,
				bg = "FFFFFF",
				align = "left",
				bold = false,
			) => {
				const cell = sheet.getCell(row, col);
				cell.value = value ?? "";
				cell.font = { name: "Arial", size: 10, bold };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: color(bg) };
				cell.alignment = { horizontal: align, vertical: "middle" };
				const border = { style: "thin", color: color("E5E7EB") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
			};

			const setKpi = (sheet, row, col, label, value, accent) => {
				const labelCell = sheet.getCell(row, col);
				labelCell.value = label;
				labelCell.font = {
					name: "Arial",
					bold: true,
					size: 8,
					color: color("FFFFFF"),
				};
				labelCell.fill = {
					type: "pattern",
					pattern: "solid",
					fgColor: color(accent),
				};
				labelCell.alignment = { horizontal: "center", vertical: "middle" };

				const valueCell = sheet.getCell(row + 1, col);
				valueCell.value = value;
				valueCell.font = {
					name: "Arial",
					bold: true,
					size: 20,
					color: color(accent),
				};
				valueCell.fill = {
					type: "pattern",
					pattern: "solid",
					fgColor: color("F9FAFB"),
				};
				valueCell.alignment = { horizontal: "center", vertical: "middle" };
			};

			const createSheet = (name) => {
				const sheet = workbook.addWorksheet(name);
				sheet.views = [{ showGridLines: false }];
				return sheet;
			};

			const dashboard = createSheet("Dashboard");
			const matrixColumns = Math.max(5, analytics.months.length + 2);
			setTitle(
				dashboard,
				1,
				matrixColumns,
				`CANCELAMENTO AVALIACAO - FTTH POR REGIONAL E MES`,
			);
			setTitle(
				dashboard,
				2,
				matrixColumns,
				`${analytics.totalRetiradas} clientes FIBRA processados - ${fileName}`,
				"EA580C",
			);

			[
				["CLIENTES FIBRA", analytics.totalRetiradas, "C2410C"],
				["REGIONAIS", analytics.totalRegionais, "15803D"],
				["MESES", analytics.totalMeses, "1D4ED8"],
				["PERIODO", analytics.periodo, "7C3AED"],
			].forEach(([label, value, accent], index) => {
				setKpi(dashboard, 4, index + 1, label, value, accent);
				dashboard.getColumn(index + 1).width = index === 3 ? 28 : 18;
			});

			setTitle(
				dashboard,
				7,
				matrixColumns,
				"FTTH POR REGIONAL E MES",
				"15803D",
			);
			setHeader(dashboard, 8, 1, "Regional", "15803D");
			analytics.months.forEach((monthKey, index) =>
				setHeader(dashboard, 8, index + 2, formatMonth(monthKey), "15803D"),
			);
			setHeader(dashboard, 8, analytics.months.length + 2, "Total", "15803D");

			analytics.regionalRows.forEach((item, index) => {
				const row = index + 9;
				const bg = stripe(index, "ECFDF5");
				setCell(dashboard, row, 1, item.regional, bg, "left", true);
				analytics.months.forEach((monthKey, monthIndex) => {
					setCell(
						dashboard,
						row,
						monthIndex + 2,
						item.months[monthKey],
						bg,
						"center",
					);
				});
				setCell(
					dashboard,
					row,
					analytics.months.length + 2,
					item.total,
					bg,
					"center",
					true,
				);
			});

			const totalRow = analytics.regionalRows.length + 9;
			setCell(dashboard, totalRow, 1, "Total", "DCFCE7", "left", true);
			analytics.months.forEach((monthKey, index) => {
				const total =
					analytics.monthRows.find((item) => item.monthKey === monthKey)
						?.total || 0;
				setCell(
					dashboard,
					totalRow,
					index + 2,
					total,
					"DCFCE7",
					"center",
					true,
				);
			});
			setCell(
				dashboard,
				totalRow,
				analytics.months.length + 2,
				analytics.totalRetiradas,
				"DCFCE7",
				"center",
				true,
			);
			dashboard.getColumn(1).width = 28;
			analytics.months.forEach((_, index) => {
				dashboard.getColumn(index + 2).width = 14;
			});
			dashboard.getColumn(analytics.months.length + 2).width = 12;

			const regionalSheet = createSheet("Por Regional Mes");
			setTitle(
				regionalSheet,
				1,
				analytics.months.length + 2,
				"RETIRADAS FTTH POR REGIONAL E MES",
				"15803D",
			);
			setHeader(regionalSheet, 2, 1, "Regional", "15803D");
			analytics.months.forEach((monthKey, index) =>
				setHeader(regionalSheet, 2, index + 2, formatMonth(monthKey), "15803D"),
			);
			setHeader(
				regionalSheet,
				2,
				analytics.months.length + 2,
				"Total",
				"15803D",
			);
			analytics.regionalRows.forEach((item, index) => {
				const row = index + 3;
				const bg = stripe(index, "ECFDF5");
				setCell(regionalSheet, row, 1, item.regional, bg, "left", true);
				analytics.months.forEach((monthKey, monthIndex) => {
					setCell(
						regionalSheet,
						row,
						monthIndex + 2,
						item.months[monthKey],
						bg,
						"center",
					);
				});
				setCell(
					regionalSheet,
					row,
					analytics.months.length + 2,
					item.total,
					bg,
					"center",
					true,
				);
			});
			regionalSheet.getColumn(1).width = 28;
			analytics.months.forEach((_, index) => {
				regionalSheet.getColumn(index + 2).width = 14;
			});
			regionalSheet.getColumn(analytics.months.length + 2).width = 12;

			const dataSheet = createSheet("Dados FTTH");
			setTitle(dataSheet, 1, 7, "BASE DETALHADA - CLIENTES FIBRA", "334155");
			[
				"Código Cliente",
				"Cidade",
				"Regional",
				"Mes",
				"Data Cancelamento",
				"Tecnologia",
				"Linha",
			].forEach((label, index) =>
				setHeader(dataSheet, 2, index + 1, label, "334155"),
			);
			rows.forEach((row, index) => {
				const bg = stripe(index, "F8FAFC");
				setCell(dataSheet, index + 3, 1, row._codigoCliente, bg, "center");
				setCell(dataSheet, index + 3, 2, row._cidade, bg, "left", true);
				setCell(dataSheet, index + 3, 3, row._regional, bg);
				setCell(dataSheet, index + 3, 4, row._monthLabel, bg, "center");
				setCell(
					dataSheet,
					index + 3,
					5,
					formatDate(row._dataCancelamento),
					bg,
					"center",
				);
				setCell(dataSheet, index + 3, 6, row._tecnologia, bg, "center");
				setCell(dataSheet, index + 3, 7, index + 1, bg, "center");
			});
			[16, 24, 24, 16, 18, 18, 10].forEach((width, index) => {
				dataSheet.getColumn(index + 1).width = width;
			});

			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `cancelamento-avaliacao-${new Date()
				.toLocaleDateString("pt-BR")
				.replace(/\//g, "-")}.xlsx`;
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
				className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${resolveDropzoneClass(status)}`}
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
					onChange={loadFile}
				/>
				<span className="text-4xl font-black text-orange-500 block mb-3">
					FTTH
				</span>
				{(() => {
					// Extraido pra achado javascript:S3358 (ternario aninhado).
					if (rawRows.length > 0) {
						return (
							<>
								<p className="font-semibold text-green-700">{fileName}</p>
								<p className="text-sm text-green-600">
									{analytics.totalRetiradas} clientes FIBRA em{" "}
									{rawRows.length} linhas
								</p>
							</>
						);
					}
					if (status === "loading") {
						return <p className="text-sm text-gray-500">Carregando planilha...</p>;
					}
					return (
						<>
							<p className="font-semibold text-gray-700">
								Clique ou arraste a planilha de cancelamentos para avaliacao
							</p>
							<p className="text-xs text-gray-400 mt-1">
								Agrupa clientes FIBRA por regional e mes usando cidade e data de
								cancelamento
							</p>
						</>
					);
				})()}
			</div>

			{rawRows.length > 0 && rows.length === 0 && (
				<p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
					Nenhuma linha com tecnologia FIBRA foi identificada na planilha
					enviada.
				</p>
			)}

			{rows.length > 0 && (
				<>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						{[
							["Clientes FIBRA", analytics.totalRetiradas, "text-orange-700"],
							["Regionais", analytics.totalRegionais, "text-green-700"],
							["Meses", analytics.totalMeses, "text-blue-700"],
							["Período", analytics.periodo, "text-purple-700"],
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

					<div className="bg-white border border-gray-200 rounded-xl p-4 overflow-auto">
						<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
							Dashboard - FTTH por regional e mes
						</p>
						<table className="min-w-full text-sm">
							<thead>
								<tr className="bg-orange-50 text-orange-800">
									<th className="text-left p-2">Regional</th>
									{analytics.months.map((monthKey) => (
										<th key={monthKey} className="text-center p-2">
											{formatMonth(monthKey)}
										</th>
									))}
									<th className="text-center p-2">Total</th>
								</tr>
							</thead>
							<tbody>
								{analytics.regionalRows.map((item) => (
									<tr key={item.regional} className="border-t border-gray-100">
										<td className="p-2 font-semibold text-gray-800">
											{item.regional}
										</td>
										{analytics.months.map((monthKey) => (
											<td key={monthKey} className="p-2 text-center">
												{item.months[monthKey]}
											</td>
										))}
										<td className="p-2 text-center font-bold text-orange-700">
											{item.total}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<button
						type="button"
						onClick={gerar}
						className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors"
					>
						<FileDown size={16} />
						Gerar Cancelamento Avaliacao (3 abas)
					</button>
				</>
			)}

			{status === "generating" && (
				<p className="text-sm text-orange-600 font-medium animate-pulse">
					Gerando Excel...
				</p>
			)}
			{status === "err" && (
				<p className="text-sm text-red-600">
					Erro ao processar o arquivo de cancelamentos.
				</p>
			)}
		</div>
	);
};

export default TabCancelamentoAvaliacao;

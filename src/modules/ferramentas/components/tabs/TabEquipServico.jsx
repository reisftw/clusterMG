import ExcelJS from "exceljs";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useRegionais } from "../../../regionais/hooks/useRegionais";
import {
	normalizeKey,
	normalizeText,
	normalizeWorksheetRows,
	pickFirst,
} from "../../utils/ferramentasTabUtils";

const DEFAULT_FAST = [
	"FAST",
	"100 MB",
	"100MB",
	"200 MB",
	"200MB",
	"250 MB",
	"250MB",
	"299 MB",
	"299MB",
];
const DEFAULT_AC = [
	"AC",
	"300 MB",
	"300MB",
	"400 MB",
	"400MB",
	"500 MB",
	"500MB",
];
const DEFAULT_AX = [
	"AX",
	"600 MB",
	"600MB",
	"700 MB",
	"800 MB",
	"900 MB",
	"1 GB",
	"1GB",
	"GIGA",
];

const PLAN_ORDER = ["Fast", "AC", "AX", "Outros"];
const COMPANY_ORDER = ["ONNET", "SEMPRE"];
const COLORS = {
	Fast: "27AE60",
	AC: "2471A3",
	AX: "8E44AD",
	Outros: "566573",
	ONNET: "7F1D1D",
	SEMPRE: "0F766E",
	title: "003087",
};

const ONNET_REGIONAIS_KEYS = new Set([
	"triangulomineiro",
	"noroestedeminas",
	"altoparanaiba",
	"nortedeminas",
]);

const ONNET_CITY_REGIONAL = {
	[normalizeText("Abadia dos Dourados")]: "Alto Paranaiba",
	[normalizeText("Araguari")]: "Triangulo Mineiro",
	[normalizeText("Buritizeiro")]: "Norte de Minas",
	[normalizeText("Coromandel")]: "Alto Paranaiba",
	[normalizeText("Cruzeiro da Fortaleza")]: "Alto Paranaiba",
	[normalizeText("Guimarania")]: "Alto Paranaiba",
	[normalizeText("Guimarania")]: "Alto Paranaiba",
	[normalizeText("Irai de Minas")]: "Alto Paranaiba",
	[normalizeText("Irai de Minas")]: "Alto Paranaiba",
	[normalizeText("Joao Pinheiro")]: "Noroeste de Minas",
	[normalizeText("Joao Pinheiro")]: "Noroeste de Minas",
	[normalizeText("Lagoa Formosa")]: "Alto Paranaiba",
	[normalizeText("Monte Alegre de Minas")]: "Triangulo Mineiro",
	[normalizeText("Paracatu")]: "Noroeste de Minas",
	[normalizeText("Patos de Minas")]: "Alto Paranaiba",
	[normalizeText("Patrocinio")]: "Alto Paranaiba",
	[normalizeText("Patrocinio")]: "Alto Paranaiba",
	[normalizeText("Pirapora")]: "Norte de Minas",
	[normalizeText("Prata")]: "Triangulo Mineiro",
	[normalizeText("Presidente Olegario")]: "Alto Paranaiba",
	[normalizeText("Presidente Olegario")]: "Alto Paranaiba",
	[normalizeText("Sao Goncalo do Abaete")]: "Noroeste de Minas",
	[normalizeText("Sao Goncalo do Abaete")]: "Noroeste de Minas",
	[normalizeText("Tres Marias")]: "Norte de Minas",
	[normalizeText("Tres Marias")]: "Norte de Minas",
	[normalizeText("Tupaciguara")]: "Triangulo Mineiro",
	[normalizeText("Uberaba")]: "Triangulo Mineiro",
	[normalizeText("Uberlandia")]: "Triangulo Mineiro",
	[normalizeText("Uberlandia")]: "Triangulo Mineiro",
	[normalizeText("Unai")]: "Noroeste de Minas",
	[normalizeText("Unai")]: "Noroeste de Minas",
	[normalizeText("Varjao de Minas")]: "Alto Paranaiba",
	[normalizeText("Varjao de Minas")]: "Alto Paranaiba",
	[normalizeText("Varzea da Palma")]: "Norte de Minas",
	[normalizeText("Varzea da Palma")]: "Norte de Minas",
};

const loadImageBase64 = async (path) => {
	try {
		const response = await fetch(path);
		if (!response.ok) return null;
		const blob = await response.blob();
		return await new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
};

const parseMoneyInput = (value) => {
	const normalized = String(value ?? "")
		.replace(/\./g, "")
		.replace(",", ".")
		.replace(/[^\d.-]/g, "");
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
};

const parseClientName = (row) => {
	const rawCode = pickFirst(row, [
		"codigocliente",
		"codcliente",
		"codigo",
		"idcliente",
		"clienteid",
		"codigodocliente",
	]);
	const rawName = pickFirst(row, [
		"nomerazaosocial",
		"razaosocial",
		"nomecliente",
		"cliente",
		"assinante",
		"nome",
	]);

	const combined = rawName || rawCode;
	const match = combined.match(/^\s*(\d{3,})\s*[-–|:]?\s*(.+)$/);
	return {
		codigo: rawCode || match?.[1] || "",
		nome: rawName && match ? match[2].trim() : rawName || "",
	};
};

const parsePlanSpeedMbps = (servico) => {
	const text = normalizeText(servico).replace(/(\d),(?=\d)/g, "$1.");
	const regex =
		/(\d+(?:\.\d+)?)\s*(giga|gbps|gb|g|megas|mega|mbps|mb|k)(?=[^a-z0-9]|$)/g;
	let match;
	let best = null;

	while ((match = regex.exec(text))) {
		const value = Number(match[1]);
		if (!Number.isFinite(value)) continue;
		const unit = match[2];
		const mbps = unit.startsWith("g")
			? value * 1000
			: unit === "k"
				? value / 1000
				: value;
		if (mbps > 0 && (!best || mbps > best)) best = mbps;
	}

	const fiberOn = text.match(/fiber\s+on\s+(\d+(?:\.\d+)?)\s+internet/);
	if (fiberOn) {
		const mbps = Number(fiberOn[1]);
		if (Number.isFinite(mbps) && mbps > 0 && (!best || mbps > best))
			best = mbps;
	}

	return best;
};

const keywordMatch = (servico, keywords) => {
	const text = normalizeText(servico);
	return keywords.some((keyword) => {
		const normalized = normalizeText(keyword);
		return normalized && text.includes(normalized);
	});
};

const classifyPlan = (servico, fastKw, acKw, axKw) => {
	const speed = parsePlanSpeedMbps(servico);
	if (speed !== null) {
		if (speed <= 299) return "Fast";
		if (speed <= 500) return "AC";
		return "AX";
	}
	if (keywordMatch(servico, axKw)) return "AX";
	if (keywordMatch(servico, acKw)) return "AC";
	if (keywordMatch(servico, fastKw)) return "Fast";
	return "Outros";
};

const buildCityMap = (regionais) => {
	const map = {};
	(regionais || []).forEach((regional) => {
		const regionalName = regional.nome || regional.name || regional.label || "";
		(regional.cidades || []).forEach((cidade) => {
			const cityName = cidade.nome || cidade.name || cidade.label || cidade;
			if (!cityName) return;
			map[normalizeText(cityName)] = {
				regional: regionalName,
				agente: Boolean(cidade.agente),
			};
		});
	});
	return map;
};

const resolveRegional = (row, cidade, cityMap) => {
	const fromRow = pickFirst(row, [
		"regional",
		"nomeregional",
		"regionalcliente",
		"regionalinstalacao",
		"regionaldeinstalacao",
		"filial",
		"unidade",
		"empresa",
		"provedor",
		"marca",
	]);
	const cityKey = normalizeText(cidade);
	const mapped = cityMap[cityKey]?.regional;
	const fallbackOnnet = ONNET_CITY_REGIONAL[cityKey];

	if (mapped) return mapped;
	if (fallbackOnnet) return fallbackOnnet;
	if (normalizeText(fromRow).includes("onnet"))
		return fallbackOnnet || "Sem Regional";

	return fromRow || "Sem Regional";
};

const resolveCompany = (row, regional, servico) => {
	const source = [
		regional,
		servico,
		pickFirst(row, [
			"empresa",
			"provedor",
			"marca",
			"filial",
			"unidade",
			"grupo",
			"origem",
		]),
	].join(" ");

	return normalizeText(source).includes("onnet") ||
		ONNET_REGIONAIS_KEYS.has(normalizeKey(regional))
		? "ONNET"
		: "SEMPRE";
};

const groupRows = (rows, getKey, buildInitial = () => ({})) => {
	const grouped = {};
	rows.forEach((row) => {
		const key = getKey(row) || "N/A";
		if (!grouped[key]) grouped[key] = { total: 0, ...buildInitial(row) };
		grouped[key].total += 1;
	});
	return grouped;
};

const sortEntriesByTotal = (entries) =>
	entries.sort((a, b) => b[1].total - a[1].total);

const renderKwGroup = ({
	label,
	type,
	kws,
	newKw,
	setNewKw,
	addKw,
	removeKw,
}) => (
	<div className="rounded-xl border border-gray-200 p-4 bg-white">
		<div className="flex items-center gap-2 mb-3">
			<span
				className="w-3 h-3 rounded-full"
				style={{
					background:
						"#" + { fast: COLORS.Fast, ac: COLORS.AC, ax: COLORS.AX }[type],
				}}
			/>
			<span className="font-semibold text-sm text-gray-700">{label}</span>
			<span className="ml-auto text-xs text-gray-400">
				{kws.length} palavras-chave
			</span>
		</div>
		<div className="flex flex-wrap gap-1.5 mb-3">
			{kws.map((keyword, index) => (
				<span
					key={`${keyword}-${index}`}
					className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white"
					style={{
						background:
							"#" + { fast: COLORS.Fast, ac: COLORS.AC, ax: COLORS.AX }[type],
					}}
				>
					{keyword}
					<button
						type="button"
						onClick={() => removeKw(type, index)}
						className="opacity-70 hover:opacity-100"
						aria-label={`Remover ${keyword}`}
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
				onChange={(event) =>
					setNewKw((prev) => ({ ...prev, [type]: event.target.value }))
				}
				onKeyDown={(event) => event.key === "Enter" && addKw(type)}
				placeholder="Nova palavra-chave..."
				className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400"
			/>
			<button
				type="button"
				onClick={() => addKw(type)}
				className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
			>
				<Plus size={14} /> Add
			</button>
		</div>
	</div>
);

const TabEquipServiço = () => {
	const { regionais } = useRegionais();
	const [files, setFiles] = useState([]);
	const [fastKw, setFastKw] = useState(DEFAULT_FAST);
	const [acKw, setAcKw] = useState(DEFAULT_AC);
	const [axKw, setAxKw] = useState(DEFAULT_AX);
	const [newKw, setNewKw] = useState({ fast: "", ac: "", ax: "" });
	const [equipValues, setEquipValues] = useState({ Fast: "", AC: "", AX: "" });
	const [withdrawalCost, setWithdrawalCost] = useState("");
	const [status, setStatus] = useState(null);
	const inputRef = useRef();

	const cityMap = useMemo(() => buildCityMap(regionais), [regionais]);

	const loadFiles = (event) => {
		const selectedFiles = [...event.target.files];
		Promise.all(
			selectedFiles.map(
				(file) =>
					new Promise((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = (ev) => {
							try {
								const workbook = XLSX.read(ev.target.result, { type: "array" });
								const worksheet = workbook.Sheets[workbook.SheetNames[0]];
								resolve({
									name: file.name,
									rows: normalizeWorksheetRows(
										XLSX.utils.sheet_to_json(worksheet, {
											raw: false,
											defval: "",
										}),
									),
								});
							} catch {
								reject(file.name);
							}
						};
						reader.readAsArrayBuffer(file);
					}),
			),
		).then((results) => {
			setFiles((prev) => [...prev, ...results]);
			setStatus("ok");
			if (inputRef.current) inputRef.current.value = "";
		});
	};

	const addKw = (type) => {
		const val = newKw[type].trim().toUpperCase();
		if (!val) return;
		if (type === "fast") setFastKw((prev) => [...prev, val]);
		if (type === "ac") setAcKw((prev) => [...prev, val]);
		if (type === "ax") setAxKw((prev) => [...prev, val]);
		setNewKw((prev) => ({ ...prev, [type]: "" }));
	};

	const removeKw = (type, idx) => {
		if (type === "fast") setFastKw((prev) => prev.filter((_, i) => i !== idx));
		if (type === "ac") setAcKw((prev) => prev.filter((_, i) => i !== idx));
		if (type === "ax") setAxKw((prev) => prev.filter((_, i) => i !== idx));
	};

	const removeFile = (idx) => {
		setFiles((prev) => prev.filter((_, i) => i !== idx));
	};

	const enrichRows = (rows) =>
		rows.map((row) => {
			const servico = pickFirst(row, [
				"servico",
				"plano",
				"produto",
				"servicoplano",
				"planoservico",
			]);
			const cidade =
				pickFirst(row, [
					"cidade",
					"municipio",
					"cidadecliente",
					"cidadedeinstalacao",
				]) || "N/A";
			const regional = resolveRegional(row, cidade, cityMap);
			const cliente = parseClientName(row);
			const plano = classifyPlan(servico, fastKw, acKw, axKw);
			const empresa = resolveCompany(row, regional, servico);

			return {
				...row,
				_codigo: cliente.codigo,
				_nome: cliente.nome,
				_servico: servico || "N/A",
				_cidade: cidade,
				_regional: regional,
				_empresa: empresa,
				_plano: plano,
				_velocidade: parsePlanSpeedMbps(servico),
				_os: pickFirst(row, [
					"numeroordemservico",
					"numos",
					"numeroos",
					"ordemservico",
					"os",
				]),
				_status: pickFirst(row, ["status", "situacao"]),
				_tipoOs: pickFirst(row, ["tipoordemservico", "tipoos", "tipo"]),
			};
		});

	const gerar = async () => {
		const allRows = files.flatMap((file) => file.rows);
		if (!allRows.length) return;
		setStatus("gerando");
		try {
			const data = enrichRows(allRows);
			const wb = new ExcelJS.Workbook();
			wb.creator = "Sempre";
			wb.created = new Date();
			wb.calcProperties.fullCalcOnLoad = true;
			const C = (hex) => ({ argb: "FF" + hex });
			const planValues = {
				Fast: parseMoneyInput(equipValues.Fast),
				AC: parseMoneyInput(equipValues.AC),
				AX: parseMoneyInput(equipValues.AX),
				Outros: 0,
			};
			const withdrawalUnitCost = parseMoneyInput(withdrawalCost);
			const logoBase64 = await loadImageBase64("/brasil-tecpar-logo.png");
			const logoImageId = logoBase64
				? wb.addImage({ base64: logoBase64, extension: "png" })
				: null;

			const addBranding = (ws, cols = 7) => {
				if (logoImageId) {
					ws.addImage(logoImageId, {
						tl: { col: Math.max(0, cols - 2.2), row: 0.15 },
						ext: { width: 150, height: 42 },
					});
				}
			};

			const setHeader = (ws, row, col, value, color = COLORS.title) => {
				const cell = ws.getCell(row, col);
				cell.value = value;
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
			const setCell = (
				ws,
				row,
				col,
				value,
				bg = "FFFFFF",
				align = "left",
				bold = false,
			) => {
				const cell = ws.getCell(row, col);
				cell.value = value ?? "";
				cell.font = { name: "Arial", size: 10, bold };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = {
					horizontal: align,
					vertical: "middle",
					wrapText: col === 4 || col === 5,
				};
				const border = { style: "thin", color: C("D0D0D0") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
			};
			const setTitle = (ws, row, cols, text, color = COLORS.title) => {
				ws.mergeCells(row, 1, row + 1, cols);
				const cell = ws.getCell(row, 1);
				cell.value = text;
				cell.font = { name: "Arial", bold: true, size: 14, color: C("FFFFFF") };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(color) };
				cell.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(row).height = 28;
				ws.getRow(row + 1).height = 16;
				addBranding(ws, cols);
			};
			const setFormula = (
				ws,
				row,
				col,
				formula,
				result = null,
				bg = "FFFFFF",
				align = "center",
				bold = false,
				numFmt = null,
				fontColor = null,
			) => {
				const cell = ws.getCell(row, col);
				cell.value = { formula, result };
				cell.font = {
					name: "Arial",
					size: 10,
					bold,
					...(fontColor ? { color: C(fontColor) } : {}),
				};
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = { horizontal: align, vertical: "middle" };
				const border = { style: "thin", color: C("D0D0D0") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
				if (numFmt) cell.numFmt = numFmt;
			};
			const setKpiFormula = (
				ws,
				row,
				col,
				label,
				formula,
				result,
				color,
				numFmt = "#,##0",
			) => {
				setHeader(ws, row, col, label, color);
				const cell = ws.getCell(row + 1, col);
				cell.value = { formula, result };
				cell.font = { name: "Arial", bold: true, size: 22, color: C(color) };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F7FA") };
				cell.alignment = { horizontal: "center", vertical: "middle" };
				const border = { style: "thin", color: C("D0D0D0") };
				cell.border = {
					left: border,
					right: border,
					top: border,
					bottom: border,
				};
				cell.numFmt = numFmt;
				ws.getRow(row + 1).height = 46;
			};

			const byPlan = groupRows(data, (row) => row._plano);
			const byCompany = groupRows(data, (row) => row._empresa);
			const byCity = groupRows(
				data,
				(row) => row._cidade,
				(row) => ({
					regional: row._regional,
					empresa: row._empresa,
					Fast: 0,
					AC: 0,
					AX: 0,
					Outros: 0,
				}),
			);
			data.forEach((row) => {
				byCity[row._cidade][row._plano] += 1;
			});
			const cityRows = sortEntriesByTotal(Object.entries(byCity)).map(
				([cidade, info]) => ({
					cidade,
					...info,
				}),
			);
			const priorityScore = (city) => city.AX * 5 + city.AC * 2;
			const priorityProfit = (city) =>
				city.AC * (planValues.AC || 0) +
				city.AX * (planValues.AX || 0) -
				(city.AC + city.AX) * withdrawalUnitCost;
			const cityPriorityRows = [...cityRows].sort((a, b) => {
				const scoreDiff = priorityScore(b) - priorityScore(a);
				if (scoreDiff) return scoreDiff;
				const profitDiff = priorityProfit(b) - priorityProfit(a);
				if (profitDiff) return profitDiff;
				return b.total - a.total;
			});
			const dataStart = 4;
			const dataEnd = Math.max(data.length + 3, dataStart);
			const dataRef = (col) =>
				`'Dados Geral'!$${col}$${dataStart}:$${col}$${dataEnd}`;
			const totalFormula = `COUNTA(${dataRef("B")})`;
			const paramRowByPlan = { Fast: 5, AC: 6, AX: 7, Outros: 8 };
			const paramValueRef = (plan) =>
				`'Parametros'!$B$${paramRowByPlan[plan] || 8}`;
			const paramCostRef = (plan) =>
				`'Parametros'!$E$${paramRowByPlan[plan] || 8}`;

			const writeSummarySheet = (sheetName, title, rows, columns, color) => {
				const ws = wb.addWorksheet(sheetName);
				ws.views = [{ showGridLines: false }];
				setTitle(ws, 1, columns.length, title, color);
				columns.forEach((col, index) =>
					setHeader(ws, 3, index + 1, col.label, color),
				);
				rows.forEach((item, index) => {
					const excelRow = index + 4;
					const bg = index % 2 ? "FFFFFF" : "F2F3F4";
					columns.forEach((col, colIndex) => {
						const value = col.value(item, excelRow, index);
						if (typeof value === "object" && value?.formula) {
							setFormula(
								ws,
								excelRow,
								colIndex + 1,
								value.formula,
								value.result,
								bg,
								col.align || "left",
								col.bold,
								col.numFmt,
								col.fontColor,
							);
						} else {
							setCell(
								ws,
								excelRow,
								colIndex + 1,
								value,
								bg,
								col.align || "left",
								col.bold,
							);
						}
					});
				});
				columns.forEach((col, index) => {
					ws.getColumn(index + 1).width = col.width;
				});
				if (rows.length) {
					ws.autoFilter = {
						from: { row: 3, column: 1 },
						to: { row: 3 + rows.length, column: columns.length },
					};
				}
				return ws;
			};

			const wsP = wb.addWorksheet("Parametros");
			wsP.views = [{ showGridLines: false }];
			setTitle(wsP, 1, 7, "PARAMETROS FINANCEIROS - BRASIL TECPAR", "003087");
			[
				"Plano",
				"Valor Unitario",
				"Quantidade",
				"Previsao Parada",
				"Custo Retirada",
				"Previsao Custo",
				"Lucro Previsto",
			].forEach((label, index) =>
				setHeader(wsP, 4, index + 1, label, "F97316"),
			);
			PLAN_ORDER.forEach((plan, index) => {
				const excelRow = index + 5;
				const bg = index % 2 ? "FFFFFF" : "FFF7ED";
				const qty = data.filter((item) => item._plano === plan).length;
				setCell(wsP, excelRow, 1, plan, bg, "left", true);
				setCell(wsP, excelRow, 2, planValues[plan] || 0, bg, "center");
				wsP.getCell(excelRow, 2).numFmt = '"R$" #,##0.00';
				setFormula(
					wsP,
					excelRow,
					3,
					`COUNTIF(${dataRef("A")},A${excelRow})`,
					qty,
					bg,
				);
				setFormula(
					wsP,
					excelRow,
					4,
					`B${excelRow}*C${excelRow}`,
					(planValues[plan] || 0) * qty,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
				);
				setCell(wsP, excelRow, 5, withdrawalUnitCost, bg, "center");
				wsP.getCell(excelRow, 5).numFmt = '"R$" #,##0.00';
				setFormula(
					wsP,
					excelRow,
					6,
					`C${excelRow}*E${excelRow}`,
					qty * withdrawalUnitCost,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
				);
				setFormula(
					wsP,
					excelRow,
					7,
					`D${excelRow}-F${excelRow}`,
					(planValues[plan] || 0) * qty - qty * withdrawalUnitCost,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
					"117A65",
				);
			});
			setCell(wsP, 10, 1, "TOTAL", "E0F2FE", "left", true);
			setFormula(
				wsP,
				10,
				3,
				"SUM(C5:C8)",
				data.length,
				"E0F2FE",
				"center",
				true,
				"#,##0",
			);
			setFormula(
				wsP,
				10,
				4,
				"SUM(D5:D8)",
				["Fast", "AC", "AX"].reduce(
					(sum, plan) =>
						sum + (planValues[plan] || 0) * (byPlan[plan]?.total || 0),
					0,
				),
				"E0F2FE",
				"center",
				true,
				'"R$" #,##0.00',
			);
			setFormula(
				wsP,
				10,
				6,
				"SUM(F5:F8)",
				data.length * withdrawalUnitCost,
				"E0F2FE",
				"center",
				true,
				'"R$" #,##0.00',
			);
			setFormula(
				wsP,
				10,
				7,
				"D10-F10",
				["Fast", "AC", "AX"].reduce(
					(sum, plan) =>
						sum + (planValues[plan] || 0) * (byPlan[plan]?.total || 0),
					0,
				) -
					data.length * withdrawalUnitCost,
				"E8F5E9",
				"center",
				true,
				'"R$" #,##0.00',
				"117A65",
			);
			[20, 18, 14, 22, 18, 20, 20].forEach((width, index) => {
				wsP.getColumn(index + 1).width = width;
			});

			const totalRecoverable = ["Fast", "AC", "AX"].reduce(
				(sum, plan) =>
					sum + (planValues[plan] || 0) * (byPlan[plan]?.total || 0),
				0,
			);

			const wsC = wb.addWorksheet("Cenarios");
			wsC.views = [{ showGridLines: false }];
			setTitle(wsC, 1, 7, "CENARIOS DE CUSTO DE RETIRADA", "003087");
			[
				"Cenario",
				"Custo Unit.",
				"Qtd. Retiradas",
				"Valor Recuperavel",
				"Previsao Custo",
				"Lucro Previsto",
				"Observacao",
			].forEach((label, index) =>
				setHeader(wsC, 4, index + 1, label, "F97316"),
			);
			[
				{
					name: "Otimista",
					formula: "'Parametros'!E5*0.8",
					result: withdrawalUnitCost * 0.8,
					note: "Custo 20% abaixo do base",
				},
				{
					name: "Base",
					formula: "'Parametros'!E5",
					result: withdrawalUnitCost,
					note: "Custo informado na tela/Parametros",
				},
				{
					name: "Conservador",
					formula: "'Parametros'!E5*1.2",
					result: withdrawalUnitCost * 1.2,
					note: "Custo 20% acima do base",
				},
				{
					name: "Personalizado",
					formula: "'Parametros'!E5",
					result: withdrawalUnitCost,
					note: "Edite o custo unitario desta linha para simular",
				},
			].forEach((scenario, index) => {
				const row = index + 5;
				const bg = index % 2 ? "FFFFFF" : "FFF7ED";
				setCell(wsC, row, 1, scenario.name, bg, "left", true);
				if (scenario.name === "Personalizado") {
					setCell(wsC, row, 2, scenario.result, bg, "center");
					wsC.getCell(row, 2).numFmt = '"R$" #,##0.00';
				} else {
					setFormula(
						wsC,
						row,
						2,
						scenario.formula,
						scenario.result,
						bg,
						"center",
						false,
						'"R$" #,##0.00',
					);
				}
				setFormula(
					wsC,
					row,
					3,
					"'Parametros'!C10",
					data.length,
					bg,
					"center",
					false,
					"#,##0",
				);
				setFormula(
					wsC,
					row,
					4,
					"'Parametros'!D10",
					totalRecoverable,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
				);
				setFormula(
					wsC,
					row,
					5,
					`B${row}*C${row}`,
					scenario.result * data.length,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
				);
				setFormula(
					wsC,
					row,
					6,
					`D${row}-E${row}`,
					totalRecoverable - scenario.result * data.length,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
					"117A65",
				);
				setCell(wsC, row, 7, scenario.note, bg, "left");
			});
			setCell(wsC, 11, 1, "Como usar", "E0F2FE", "left", true);
			setCell(
				wsC,
				11,
				2,
				"Altere o custo unitario na linha Personalizado ou na aba Parametros para recalcular as previsoes.",
				"E0F2FE",
				"left",
			);
			wsC.mergeCells(11, 2, 11, 7);
			[18, 16, 16, 22, 20, 20, 44].forEach((width, index) => {
				wsC.getColumn(index + 1).width = width;
			});

			writeSummarySheet(
				"Dados Geral",
				"DADOS GERAL - EDITE ESTA ABA PARA RECALCULAR OS RESUMOS",
				data,
				[
					{
						label: "Plano",
						value: (item) => item._plano,
						width: 14,
						align: "center",
						bold: true,
					},
					{
						label: "Código Cliente",
						value: (item) => item._codigo,
						width: 18,
						align: "center",
					},
					{ label: "Nome Razaosocial", value: (item) => item._nome, width: 36 },
					{
						label: "Empresa",
						value: (item) => item._empresa,
						width: 14,
						align: "center",
					},
					{ label: "Cidade", value: (item) => item._cidade, width: 24 },
					{ label: "Serviço", value: (item) => item._servico, width: 70 },
					{
						label: "Velocidade Mbps",
						value: (item) => item._velocidade || "",
						width: 16,
						align: "center",
					},
					{ label: "Regional", value: (item) => item._regional, width: 24 },
					{
						label: "O.S.",
						value: (item) => item._os,
						width: 22,
						align: "center",
					},
					{
						label: "Status",
						value: (item) => item._status,
						width: 22,
						align: "center",
					},
					{ label: "Tipo O.S.", value: (item) => item._tipoOs, width: 32 },
				],
				"566573",
			);

			const wsD = wb.addWorksheet("Dashboard");
			wsD.views = [{ showGridLines: false }];
			setTitle(
				wsD,
				1,
				7,
				`EQUIP. POR SERVICO - ${data.length} registros - ${new Date().toLocaleDateString("pt-BR")}`,
			);
			setKpiFormula(
				wsD,
				4,
				1,
				"TOTAL",
				totalFormula,
				data.length,
				COLORS.title,
			);
			setKpiFormula(
				wsD,
				4,
				2,
				"FAST <=299",
				`COUNTIF(${dataRef("A")},"Fast")`,
				byPlan.Fast?.total || 0,
				COLORS.Fast,
			);
			setKpiFormula(
				wsD,
				4,
				3,
				"AC 300-500",
				`COUNTIF(${dataRef("A")},"AC")`,
				byPlan.AC?.total || 0,
				COLORS.AC,
			);
			setKpiFormula(
				wsD,
				4,
				4,
				"AX >500",
				`COUNTIF(${dataRef("A")},"AX")`,
				byPlan.AX?.total || 0,
				COLORS.AX,
			);
			setKpiFormula(
				wsD,
				4,
				5,
				"ONNET",
				`COUNTIF(${dataRef("D")},"ONNET")`,
				byCompany.ONNET?.total || 0,
				COLORS.ONNET,
			);
			setKpiFormula(
				wsD,
				4,
				6,
				"SEMPRE",
				`COUNTIF(${dataRef("D")},"SEMPRE")`,
				byCompany.SEMPRE?.total || 0,
				COLORS.SEMPRE,
			);
			setKpiFormula(
				wsD,
				4,
				7,
				"OUTROS",
				`COUNTIF(${dataRef("A")},"Outros")`,
				byPlan.Outros?.total || 0,
				COLORS.Outros,
			);

			setKpiFormula(
				wsD,
				7,
				1,
				"VALOR FAST",
				`'Parametros'!D5`,
				(byPlan.Fast?.total || 0) * planValues.Fast,
				COLORS.Fast,
				'"R$" #,##0.00',
			);
			setKpiFormula(
				wsD,
				7,
				2,
				"VALOR AC",
				`'Parametros'!D6`,
				(byPlan.AC?.total || 0) * planValues.AC,
				COLORS.AC,
				'"R$" #,##0.00',
			);
			setKpiFormula(
				wsD,
				7,
				3,
				"VALOR AX",
				`'Parametros'!D7`,
				(byPlan.AX?.total || 0) * planValues.AX,
				COLORS.AX,
				'"R$" #,##0.00',
			);
			setKpiFormula(
				wsD,
				7,
				4,
				"TOTAL PARADO",
				`'Parametros'!D10`,
				["Fast", "AC", "AX"].reduce(
					(sum, plan) =>
						sum + (byPlan[plan]?.total || 0) * (planValues[plan] || 0),
					0,
				),
				"F97316",
				'"R$" #,##0.00',
			);
			setKpiFormula(
				wsD,
				7,
				5,
				"CUSTO RETIRADA",
				`'Parametros'!F10`,
				data.length * withdrawalUnitCost,
				"C0392B",
				'"R$" #,##0.00',
			);
			setKpiFormula(
				wsD,
				7,
				6,
				"LUCRO PREVISTO",
				`'Parametros'!G10`,
				["Fast", "AC", "AX"].reduce(
					(sum, plan) =>
						sum + (byPlan[plan]?.total || 0) * (planValues[plan] || 0),
					0,
				) -
					data.length * withdrawalUnitCost,
				"117A65",
				'"R$" #,##0.00',
			);

			let rowCursor = 11;
			setTitle(wsD, rowCursor, 5, "RESUMO POR PLANO", "2C3E50");
			rowCursor += 2;
			["Plano", "Total", "% Geral", "ONNET", "SEMPRE"].forEach((label, index) =>
				setHeader(wsD, rowCursor, index + 1, label, "2C3E50"),
			);
			rowCursor += 1;
			PLAN_ORDER.forEach((plan, index) => {
				const planRows = data.filter((item) => item._plano === plan);
				const bg = index % 2 ? "FFFFFF" : "F2F3F4";
				setCell(wsD, rowCursor, 1, plan, bg, "left", true);
				setFormula(
					wsD,
					rowCursor,
					2,
					`COUNTIF(${dataRef("A")},A${rowCursor})`,
					planRows.length,
					bg,
				);
				setFormula(
					wsD,
					rowCursor,
					3,
					`IFERROR(B${rowCursor}/${totalFormula},0)`,
					planRows.length / (data.length || 1),
					bg,
					"center",
					false,
					"0.0%",
				);
				setFormula(
					wsD,
					rowCursor,
					4,
					`COUNTIFS(${dataRef("A")},A${rowCursor},${dataRef("D")},"ONNET")`,
					planRows.filter((item) => item._empresa === "ONNET").length,
					bg,
				);
				setFormula(
					wsD,
					rowCursor,
					5,
					`COUNTIFS(${dataRef("A")},A${rowCursor},${dataRef("D")},"SEMPRE")`,
					planRows.filter((item) => item._empresa === "SEMPRE").length,
					bg,
				);
				rowCursor += 1;
			});

			rowCursor += 2;
			setTitle(wsD, rowCursor, 7, "TOP CIDADES GERAL", "117A65");
			rowCursor += 2;
			["Cidade", "Empresa", "Regional", "Total", "Fast", "AC", "AX"].forEach(
				(label, index) => setHeader(wsD, rowCursor, index + 1, label, "117A65"),
			);
			rowCursor += 1;
			cityRows.slice(0, 15).forEach((info, index) => {
				const bg = index % 2 ? "FFFFFF" : "EAFAF1";
				const cidadeCell = `A${rowCursor}`;
				setCell(wsD, rowCursor, 1, info.cidade, bg, "left", true);
				setFormula(
					wsD,
					rowCursor,
					2,
					`IFERROR(INDEX(${dataRef("D")},MATCH(${cidadeCell},${dataRef("E")},0)),"")`,
					info.empresa,
					bg,
					"center",
				);
				setFormula(
					wsD,
					rowCursor,
					3,
					`IFERROR(INDEX(${dataRef("H")},MATCH(${cidadeCell},${dataRef("E")},0)),"")`,
					info.regional,
					bg,
				);
				setFormula(
					wsD,
					rowCursor,
					4,
					`COUNTIF(${dataRef("E")},${cidadeCell})`,
					info.total,
					bg,
				);
				setFormula(
					wsD,
					rowCursor,
					5,
					`COUNTIFS(${dataRef("E")},${cidadeCell},${dataRef("A")},"Fast")`,
					info.Fast,
					bg,
				);
				setFormula(
					wsD,
					rowCursor,
					6,
					`COUNTIFS(${dataRef("E")},${cidadeCell},${dataRef("A")},"AC")`,
					info.AC,
					bg,
				);
				setFormula(
					wsD,
					rowCursor,
					7,
					`COUNTIFS(${dataRef("E")},${cidadeCell},${dataRef("A")},"AX")`,
					info.AX,
					bg,
				);
				rowCursor += 1;
			});
			[28, 14, 26, 12, 12, 12, 12].forEach((width, index) => {
				wsD.getColumn(index + 1).width = width;
			});

			setCell(wsD, 11, 9, "GRAFICO - PLANOS", "003087", "center", true);
			wsD.mergeCells(11, 9, 11, 11);
			["Plano", "Total", "Barra"].forEach((label, index) =>
				setHeader(wsD, 12, index + 9, label, "003087"),
			);
			PLAN_ORDER.forEach((plan, index) => {
				const row = index + 13;
				const planRows = data.filter((item) => item._plano === plan);
				const bg = index % 2 ? "FFFFFF" : "E0F2FE";
				setCell(wsD, row, 9, plan, bg, "left", true);
				setFormula(
					wsD,
					row,
					10,
					`COUNTIF(${dataRef("A")},I${row})`,
					planRows.length,
					bg,
				);
				setFormula(
					wsD,
					row,
					11,
					`REPT("█",IFERROR(ROUND(J${row}/MAX($J$13:$J$16)*22,0),0))`,
					"█".repeat(
						Math.round(
							(planRows.length /
								Math.max(
									...PLAN_ORDER.map(
										(p) => data.filter((item) => item._plano === p).length,
									),
									1,
								)) *
								22,
						),
					),
					bg,
					"left",
					true,
				);
				wsD.getCell(row, 11).font = {
					name: "Arial",
					bold: true,
					size: 10,
					color: C(COLORS[plan]),
				};
			});

			setCell(wsD, 19, 9, "TOP PRIORIDADE AX/AC", "117A65", "center", true);
			wsD.mergeCells(19, 9, 19, 14);
			["Cidade", "AX", "AC", "Lucro s/ FAST", "Prioridade", "Barra"].forEach(
				(label, index) => setHeader(wsD, 20, index + 9, label, "117A65"),
			);
			cityPriorityRows.slice(0, 8).forEach((info, index) => {
				const row = index + 21;
				const bg = index % 2 ? "FFFFFF" : "EAFAF1";
				const score = priorityScore(info);
				const lucro = priorityProfit(info);
				setCell(wsD, row, 9, info.cidade, bg, "left", true);
				setFormula(
					wsD,
					row,
					10,
					`COUNTIFS(${dataRef("E")},I${row},${dataRef("A")},"AX")`,
					info.AX,
					bg,
				);
				setFormula(
					wsD,
					row,
					11,
					`COUNTIFS(${dataRef("E")},I${row},${dataRef("A")},"AC")`,
					info.AC,
					bg,
				);
				setFormula(
					wsD,
					row,
					12,
					`J${row}*${paramValueRef("AX")}+K${row}*${paramValueRef("AC")}-(J${row}+K${row})*'Parametros'!$E$5`,
					lucro,
					bg,
					"center",
					true,
					'"R$" #,##0.00',
					"117A65",
				);
				setCell(wsD, row, 13, index < 5 ? "ALTA" : "MEDIA", bg, "center", true);
				setFormula(
					wsD,
					row,
					14,
					`REPT("█",IF(MAX($J$21*5+$K$21*2,$J$22*5+$K$22*2,$J$23*5+$K$23*2,$J$24*5+$K$24*2,$J$25*5+$K$25*2,$J$26*5+$K$26*2,$J$27*5+$K$27*2,$J$28*5+$K$28*2)>0,MAX(0,ROUND((J${row}*5+K${row}*2)/MAX($J$21*5+$K$21*2,$J$22*5+$K$22*2,$J$23*5+$K$23*2,$J$24*5+$K$24*2,$J$25*5+$K$25*2,$J$26*5+$K$26*2,$J$27*5+$K$27*2,$J$28*5+$K$28*2)*18,0)),0))`,
					"█".repeat(
						Math.max(
							0,
							Math.round(
								(score /
									Math.max(
										...cityPriorityRows.slice(0, 8).map(priorityScore),
										1,
									)) *
									18,
							),
						),
					),
					bg,
					"left",
					true,
					null,
					"117A65",
				);
			});
			[24, 10, 10, 18, 14, 28].forEach((width, index) => {
				wsD.getColumn(index + 9).width = width;
			});

			writeSummarySheet(
				"Por Plano",
				"RESUMO POR PLANO",
				PLAN_ORDER.map((plan) => {
					const planRows = data.filter((item) => item._plano === plan);
					return {
						plano: plan,
						total: planRows.length,
						onnet: planRows.filter((item) => item._empresa === "ONNET").length,
						sempre: planRows.filter((item) => item._empresa === "SEMPRE")
							.length,
					};
				}),
				[
					{
						label: "Plano",
						value: (item) => item.plano,
						width: 18,
						bold: true,
					},
					{
						label: "Total",
						value: (item, row) => ({
							formula: `COUNTIF(${dataRef("A")},A${row})`,
							result: item.total,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "% Geral",
						value: (item, row) => ({
							formula: `IFERROR(B${row}/${totalFormula},0)`,
							result: item.total / (data.length || 1),
						}),
						width: 12,
						align: "center",
						numFmt: "0.0%",
					},
					{
						label: "ONNET",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("A")},A${row},${dataRef("D")},"ONNET")`,
							result: item.onnet,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "SEMPRE",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("A")},A${row},${dataRef("D")},"SEMPRE")`,
							result: item.sempre,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Valor Unit.",
						value: (item, row) => ({
							formula: `IFERROR(VLOOKUP(A${row},'Parametros'!$A$5:$B$8,2,FALSE),0)`,
							result: planValues[item.plano] || 0,
						}),
						width: 14,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Valor Parado",
						value: (item, row) => ({
							formula: `B${row}*F${row}`,
							result: item.total * (planValues[item.plano] || 0),
						}),
						width: 16,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Custo Ret.",
						value: (item, row) => ({
							formula: `B${row}*${paramCostRef(item.plano)}`,
							result: item.total * withdrawalUnitCost,
						}),
						width: 16,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Lucro Previsto",
						value: (item, row) => ({
							formula: `G${row}-H${row}`,
							result:
								item.total * (planValues[item.plano] || 0) -
								item.total * withdrawalUnitCost,
						}),
						width: 18,
						align: "center",
						bold: true,
						numFmt: '"R$" #,##0.00',
						fontColor: "117A65",
					},
				],
				"2C3E50",
			);

			writeSummarySheet(
				"Por Empresa",
				"RESUMO POR EMPRESA",
				COMPANY_ORDER.map((company) => {
					const companyRows = data.filter((item) => item._empresa === company);
					return {
						empresa: company,
						total: companyRows.length,
						cidades: new Set(companyRows.map((item) => item._cidade)).size,
						fast: companyRows.filter((item) => item._plano === "Fast").length,
						ac: companyRows.filter((item) => item._plano === "AC").length,
						ax: companyRows.filter((item) => item._plano === "AX").length,
						outros: companyRows.filter((item) => item._plano === "Outros")
							.length,
					};
				}),
				[
					{
						label: "Empresa",
						value: (item) => item.empresa,
						width: 16,
						bold: true,
					},
					{
						label: "Total",
						value: (item, row) => ({
							formula: `COUNTIF(${dataRef("D")},A${row})`,
							result: item.total,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "% Geral",
						value: (item, row) => ({
							formula: `IFERROR(B${row}/${totalFormula},0)`,
							result: item.total / (data.length || 1),
						}),
						width: 12,
						align: "center",
						numFmt: "0.0%",
					},
					{
						label: "Cidades",
						value: (item, row) => ({
							formula: `IFERROR(COUNTA(UNIQUE(FILTER(${dataRef("E")},${dataRef("D")}=A${row}))),0)`,
							result: item.cidades,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Fast",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("D")},A${row},${dataRef("A")},"Fast")`,
							result: item.fast,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "AC",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("D")},A${row},${dataRef("A")},"AC")`,
							result: item.ac,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "AX",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("D")},A${row},${dataRef("A")},"AX")`,
							result: item.ax,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Outros",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("D")},A${row},${dataRef("A")},"Outros")`,
							result: item.outros,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Valor Parado",
						value: (item, row) => ({
							formula: `E${row}*${paramValueRef("Fast")}+F${row}*${paramValueRef("AC")}+G${row}*${paramValueRef("AX")}`,
							result:
								item.fast * planValues.Fast +
								item.ac * planValues.AC +
								item.ax * planValues.AX,
						}),
						width: 18,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Custo Ret.",
						value: (item, row) => ({
							formula: `E${row}*${paramCostRef("Fast")}+F${row}*${paramCostRef("AC")}+G${row}*${paramCostRef("AX")}+H${row}*${paramCostRef("Outros")}`,
							result: item.total * withdrawalUnitCost,
						}),
						width: 16,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Lucro Previsto",
						value: (item, row) => ({
							formula: `I${row}-J${row}`,
							result:
								item.fast * planValues.Fast +
								item.ac * planValues.AC +
								item.ax * planValues.AX -
								item.total * withdrawalUnitCost,
						}),
						width: 18,
						align: "center",
						bold: true,
						numFmt: '"R$" #,##0.00',
						fontColor: "117A65",
					},
				],
				"0F766E",
			);

			writeSummarySheet(
				"Por Cidade",
				"RESUMO POR CIDADE",
				cityRows,
				[
					{
						label: "Cidade",
						value: (item) => item.cidade,
						width: 28,
						bold: true,
					},
					{
						label: "Empresa",
						value: (item, row) => ({
							formula: `IFERROR(INDEX(${dataRef("D")},MATCH(A${row},${dataRef("E")},0)),"")`,
							result: item.empresa,
						}),
						width: 14,
						align: "center",
					},
					{
						label: "Regional",
						value: (item, row) => ({
							formula: `IFERROR(INDEX(${dataRef("H")},MATCH(A${row},${dataRef("E")},0)),"")`,
							result: item.regional,
						}),
						width: 28,
					},
					{
						label: "Total",
						value: (item, row) => ({
							formula: `COUNTIF(${dataRef("E")},A${row})`,
							result: item.total,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "% Geral",
						value: (item, row) => ({
							formula: `IFERROR(D${row}/${totalFormula},0)`,
							result: item.total / (data.length || 1),
						}),
						width: 12,
						align: "center",
						numFmt: "0.0%",
					},
					{
						label: "Fast",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},A${row},${dataRef("A")},"Fast")`,
							result: item.Fast,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "AC",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},A${row},${dataRef("A")},"AC")`,
							result: item.AC,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "AX",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},A${row},${dataRef("A")},"AX")`,
							result: item.AX,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Outros",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},A${row},${dataRef("A")},"Outros")`,
							result: item.Outros,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Valor Parado",
						value: (item, row) => ({
							formula: `F${row}*${paramValueRef("Fast")}+G${row}*${paramValueRef("AC")}+H${row}*${paramValueRef("AX")}`,
							result:
								item.Fast * planValues.Fast +
								item.AC * planValues.AC +
								item.AX * planValues.AX,
						}),
						width: 18,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Custo Ret.",
						value: (item, row) => ({
							formula: `F${row}*${paramCostRef("Fast")}+G${row}*${paramCostRef("AC")}+H${row}*${paramCostRef("AX")}+I${row}*${paramCostRef("Outros")}`,
							result: item.total * withdrawalUnitCost,
						}),
						width: 16,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Lucro Previsto",
						value: (item, row) => ({
							formula: `J${row}-K${row}`,
							result:
								item.Fast * planValues.Fast +
								item.AC * planValues.AC +
								item.AX * planValues.AX -
								item.total * withdrawalUnitCost,
						}),
						width: 18,
						align: "center",
						bold: true,
						numFmt: '"R$" #,##0.00',
						fontColor: "117A65",
					},
				],
				"117A65",
			);

			writeSummarySheet(
				"Ranking Cidades",
				"RANKING DE PRIORIDADE POR CIDADE",
				cityPriorityRows,
				[
					{
						label: "Rank",
						value: (_item, _row, index) => index + 1,
						width: 8,
						align: "center",
						bold: true,
					},
					{
						label: "Cidade",
						value: (item) => item.cidade,
						width: 28,
						bold: true,
					},
					{
						label: "Empresa",
						value: (item, row) => ({
							formula: `IFERROR(INDEX(${dataRef("D")},MATCH(B${row},${dataRef("E")},0)),"")`,
							result: item.empresa,
						}),
						width: 14,
						align: "center",
					},
					{
						label: "Regional",
						value: (item, row) => ({
							formula: `IFERROR(INDEX(${dataRef("H")},MATCH(B${row},${dataRef("E")},0)),"")`,
							result: item.regional,
						}),
						width: 28,
					},
					{
						label: "Total",
						value: (item, row) => ({
							formula: `COUNTIF(${dataRef("E")},B${row})`,
							result: item.total,
						}),
						width: 12,
						align: "center",
					},
					{
						label: "Fast",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},B${row},${dataRef("A")},"Fast")`,
							result: item.Fast,
						}),
						width: 10,
						align: "center",
					},
					{
						label: "AC",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},B${row},${dataRef("A")},"AC")`,
							result: item.AC,
						}),
						width: 10,
						align: "center",
					},
					{
						label: "AX",
						value: (item, row) => ({
							formula: `COUNTIFS(${dataRef("E")},B${row},${dataRef("A")},"AX")`,
							result: item.AX,
						}),
						width: 10,
						align: "center",
					},
					{
						label: "Valor AX/AC",
						value: (item, row) => ({
							formula: `G${row}*${paramValueRef("AC")}+H${row}*${paramValueRef("AX")}`,
							result: item.AC * planValues.AC + item.AX * planValues.AX,
						}),
						width: 18,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Custo Ret.",
						value: (item, row) => ({
							formula: `(G${row}+H${row})*'Parametros'!$E$5`,
							result: (item.AC + item.AX) * withdrawalUnitCost,
						}),
						width: 16,
						align: "center",
						numFmt: '"R$" #,##0.00',
					},
					{
						label: "Lucro AX/AC",
						value: (item, row) => ({
							formula: `I${row}-J${row}`,
							result: priorityProfit(item),
						}),
						width: 18,
						align: "center",
						bold: true,
						numFmt: '"R$" #,##0.00',
						fontColor: "117A65",
					},
					{
						label: "Prioridade",
						value: (_item, _row, index) =>
							index < 10 ? "ALTA" : index < 30 ? "MEDIA" : "BAIXA",
						width: 14,
						align: "center",
						bold: true,
					},
					{
						label: "Barra Prioridade",
						value: (item, row) => {
							const score = priorityScore(item);
							const maxScore = Math.max(
								...cityPriorityRows.map(priorityScore),
								1,
							);
							return {
								formula: `REPT("█",IF(MAX($H$4:$H$${cityPriorityRows.length + 3}*5+$G$4:$G$${cityPriorityRows.length + 3}*2)>0,MAX(0,ROUND((H${row}*5+G${row}*2)/MAX($H$4:$H$${cityPriorityRows.length + 3}*5+$G$4:$G$${cityPriorityRows.length + 3}*2)*24,0)),0))`,
								result: "█".repeat(
									Math.max(0, Math.round((score / maxScore) * 24)),
								),
							};
						},
						width: 30,
						align: "left",
						bold: true,
						fontColor: "117A65",
					},
				],
				"003087",
			);

			PLAN_ORDER.forEach((plan) => {
				const planRows = data.filter((item) => item._plano === plan);
				const ws = wb.addWorksheet(plan);
				ws.views = [{ showGridLines: false }];
				setTitle(
					ws,
					1,
					10,
					`${plan.toUpperCase()} - DETALHE DINAMICO`,
					COLORS[plan],
				);
				[
					"Código Cliente",
					"Nome Razaosocial",
					"Empresa",
					"Cidade",
					"Serviço",
					"Velocidade Mbps",
					"Regional",
					"O.S.",
					"Status",
					"Tipo O.S.",
				].forEach((label, index) =>
					setHeader(ws, 3, index + 1, label, COLORS[plan]),
				);
				const detailRange = `'Dados Geral'!$B$${dataStart}:$K$${dataEnd}`;
				const planRange = dataRef("A");
				setFormula(
					ws,
					4,
					1,
					`IFERROR(FILTER(${detailRange},${planRange}="${plan}"),"Sem registros")`,
					planRows[0]?._codigo || "Sem registros",
					"FFFFFF",
					"left",
				);
				[18, 36, 14, 24, 70, 16, 24, 22, 22, 32].forEach((width, index) => {
					ws.getColumn(index + 1).width = width;
				});
			});

			const buffer = await wb.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `equip-servico-planos-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
			link.click();
			URL.revokeObjectURL(url);
			setStatus("ok");
		} catch (error) {
			console.error(error);
			setStatus("err");
		}
	};

	const totalRows = files.reduce((sum, file) => sum + file.rows.length, 0);

	return (
		<div className="space-y-4">
			<div
				className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${files.length > 0 ? "border-green-400 bg-green-50" : "border-gray-200 bg-white hover:border-orange-400"}`}
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
							Campos esperados:{" "}
							<code>codigo_cliente · nome_razaosocial · servico · cidade</code>
						</p>
					</>
				)}
			</div>

			{files.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{files.map((file, index) => (
						<span
							key={`${file.name}-${index}`}
							className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-medium"
						>
							📄 {file.name} ({file.rows.length})
							<button
								type="button"
								onClick={() => removeFile(index)}
								className="text-blue-400 hover:text-red-500 transition-colors"
								aria-label={`Remover ${file.name}`}
							>
								<Trash2 size={12} />
							</button>
						</span>
					))}
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				{renderKwGroup({
					label: "Fast (ate 299 Mbps)",
					type: "fast",
					kws: fastKw,
					newKw,
					setNewKw,
					addKw,
					removeKw,
				})}
				{renderKwGroup({
					label: "AC (300 a 500 Mbps)",
					type: "ac",
					kws: acKw,
					newKw,
					setNewKw,
					addKw,
					removeKw,
				})}
				{renderKwGroup({
					label: "AX (acima de 500 Mbps)",
					type: "ax",
					kws: axKw,
					newKw,
					setNewKw,
					addKw,
					removeKw,
				})}
			</div>

			<div className="rounded-xl border border-blue-100 bg-white p-4">
				<div className="mb-3">
					<p className="text-sm font-bold text-gray-800">
						Valores unitarios dos equipamentos
					</p>
					<p className="text-xs text-gray-500">
						Esses valores alimentam a aba Parametros e a previsao de valor
						parado no dashboard.
					</p>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
					{PLAN_ORDER.filter((plan) => plan !== "Outros").map((plan) => (
						<label key={plan} className="block">
							<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
								Valor {plan}
							</span>
							<input
								type="text"
								inputMode="decimal"
								value={equipValues[plan]}
								onChange={(event) =>
									setEquipValues((prev) => ({
										...prev,
										[plan]: event.target.value,
									}))
								}
								placeholder="Ex: 120,00"
								className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
							/>
						</label>
					))}
					<label className="block">
						<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
							Custo retirada
						</span>
						<input
							type="text"
							inputMode="decimal"
							value={withdrawalCost}
							onChange={(event) => setWithdrawalCost(event.target.value)}
							placeholder="Ex: 35,00"
							className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
						/>
					</label>
				</div>
			</div>

			{totalRows > 0 && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
				>
					<FileDown size={16} />
					Gerar Equip. por Serviço - {totalRows} registros
				</button>
			)}

			{status === "gerando" && (
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

export default TabEquipServiço;

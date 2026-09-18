import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useRegionais } from "../../../regionais/hooks/useRegionais";
import {
	normalizeKey,
	normalizeText,
	normalizeWorksheetRows,
	parseFerramentasDate,
	pickFirst,
} from "../../utils/ferramentasTabUtils";

const ONNET_REGIONAIS_KEYS = new Set([
	"triangulomineiro",
	"noroestedeminas",
	"altoparanaiba",
	"nortedeminas",
]);

const isOnnetRegional = (regional) =>
	ONNET_REGIONAIS_KEYS.has(normalizeKey(regional));

const extractCidade = (row) => {
	const cidade =
		row.cidade ||
		row.cidadedeinstalacao ||
		row.municipio ||
		row.cidadecliente ||
		"";
	if (String(cidade).trim()) return String(cidade).trim();

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
	const normalizedRegional = normalizeText(regionalFromRow);

	if (normalizedRegional.includes("onnet")) return "ONNET";

	return regionalMap[normalizeText(cidade)] || "Sem Regional";
};

const resolveEmpresa = (row, regional) => {
	const source = [
		regional,
		pickFirst(row, [
			"empresa",
			"provedor",
			"marca",
			"filial",
			"unidade",
			"grupo",
			"origem",
			"regional",
		]),
	].join(" ");

	return normalizeText(source).includes("onnet") || isOnnetRegional(regional)
		? "ONNET"
		: "SEMPRE INTERNET";
};

const resolveTipoServiço = (tecnologia, servico) => {
	const tech = normalizeText(tecnologia);
	const svc = normalizeText(servico);

	if (
		tech.includes("fibra") ||
		svc.includes("fibra") ||
		tech.includes("ftth") ||
		svc.includes("ftth")
	) {
		return "FTTH";
	}
	if (
		tech.includes("wireless") ||
		tech.includes("radio") ||
		svc.includes("wireless") ||
		svc.includes("radio")
	) {
		return "Wireless";
	}
	if (tech.includes("epon") || svc.includes("epon")) return "Pac EPON";

	const raw = String(tecnologia || servico || "").trim();
	return raw || "Não informado";
};

const isFtthRetirada = (row) => {
	const source = [
		row.tecnologia,
		row.servico,
		row.tiposervico,
		row.tipodeservico,
		row.plano,
		row.produto,
		row.descricaoservico,
		row.descricao,
	].join(" ");
	const normalized = normalizeText(source);
	return normalized.includes("ftth") || normalized.includes("fibra");
};

const toInteger = (value) => {
	if (typeof value === "number" && Number.isFinite(value))
		return Math.trunc(value);
	const digits = String(value ?? "").replace(/[^\d-]/g, "");
	if (!digits) return 0;
	const parsed = Number(digits);
	return Number.isFinite(parsed) ? parsed : 0;
};

const formatPercent = (value, total) =>
	total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";

const formatPeríodo = (dates) => {
	const validDates = dates.filter(Boolean).sort((a, b) => a - b);
	if (!validDates.length) return "Período não identificado";

	const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
	});

	const first = validDates[0];
	const last = validDates[validDates.length - 1];

	if (
		first.getMonth() === last.getMonth() &&
		first.getFullYear() === last.getFullYear()
	) {
		return monthFormatter.format(first);
	}

	return `${monthFormatter.format(first)} a ${monthFormatter.format(last)}`;
};

const formatDate = (date) => (date ? date.toLocaleDateString("pt-BR") : "");

const buildSummaryRows = (map, formatter) =>
	Object.entries(map)
		.sort((a, b) => b[1].total - a[1].total)
		.map(([label, value]) => formatter(label, value));

const TabCancelamentosMes = () => {
	const { regionais } = useRegionais();
	const [status, setStatus] = useState(null);
	const [rawRows, setRawRows] = useState([]);
	const [fileName, setFileName] = useState("");
	const inputRef = useRef();

	const regionalMap = useMemo(() => {
		const map = {};
		(regionais || []).forEach((regional) => {
			const nomeRegional =
				regional.nome || regional.name || regional.label || "";
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
				if (chaveCidade && nomeRegional) {
					map[chaveCidade] = nomeRegional;
				}
			});
		});
		return map;
	}, [regionais]);

	const rows = useMemo(
		() =>
			rawRows.map((row) => {
				const cidade = extractCidade(row);
				const regional = resolveRegional(row, cidade, regionalMap);
				const empresa = resolveEmpresa(row, regional);
				const tipoServiço = resolveTipoServiço(row.tecnologia, row.servico);
				const isFtth = isFtthRetirada(row) || tipoServiço === "FTTH";
				const motivo =
					String(
						row.motivocancelamento || row.motivo || "Não informado",
					).trim() || "Não informado";
				const categoriaMotivo = motivo.startsWith("VOL")
					? "Voluntario"
					: motivo.startsWith("INV")
						? "Involuntario"
						: "Outros";

				return {
					...row,
					_codigoCliente: String(
						row.codigocliente || row.idcliente || "",
					).trim(),
					_cidade: cidade,
					_regional: regional,
					_empresa: empresa,
					_motivo: motivo,
					_categoriaMotivo: categoriaMotivo,
					_tipoServiço: tipoServiço,
					_isFtth: isFtth,
					_tecnologia: String(row.tecnologia || "").trim() || "Não informado",
					_servico: String(row.servico || "").trim() || "Não informado",
	_dataCancelamento: parseFerramentasDate(
						row.datacancelamento || row.dataalteracostatus || row.data || "",
					),
					_osAbertas: toInteger(row.osdecancelamentoabertas),
				};
			}),
		[rawRows, regionalMap],
	);

	const analytics = useMemo(() => {
		const byTipo = {};
		const byCidade = {};
		const byRegional = {};
		const byMotivo = {};
		const byCategoriaMotivo = { Voluntario: 0, Involuntario: 0, Outros: 0 };
		const ftthByEmpresa = { ONNET: 0, "SEMPRE INTERNET": 0 };

		rows.forEach((row) => {
			const tipo = row._tipoServiço || "Não informado";
			const cidade = row._cidade || "N/A";
			const regional = row._regional || "Sem Regional";
			const motivo = row._motivo || "Não informado";
			const categoriaMotivo = row._categoriaMotivo || "Outros";
			const empresa = row._empresa === "ONNET" ? "ONNET" : "SEMPRE INTERNET";

			if (row._isFtth) {
				ftthByEmpresa[empresa] = (ftthByEmpresa[empresa] || 0) + 1;
			}

			byTipo[tipo] = { tipo, total: (byTipo[tipo]?.total || 0) + 1 };
			byCidade[cidade] = {
				cidade,
				regional,
				total: (byCidade[cidade]?.total || 0) + 1,
			};
			byRegional[regional] = {
				regional,
				total: (byRegional[regional]?.total || 0) + 1,
				cidades: new Set([...(byRegional[regional]?.cidades || []), cidade]),
			};
			byMotivo[motivo] = { motivo, total: (byMotivo[motivo]?.total || 0) + 1 };
			byCategoriaMotivo[categoriaMotivo] =
				(byCategoriaMotivo[categoriaMotivo] || 0) + 1;
		});

		return {
			totalCancelamentos: rows.length,
			totalCidades: Object.keys(byCidade).length,
			totalRegionais: Object.keys(byRegional).length,
			totalTiposServiço: Object.keys(byTipo).length,
			totalMotivos: Object.keys(byMotivo).length,
			totalOsAbertas: rows.reduce((acc, row) => acc + row._osAbertas, 0),
			totalFtthOnnet: ftthByEmpresa.ONNET || 0,
			totalFtthSempre: ftthByEmpresa["SEMPRE INTERNET"] || 0,
			totalFtth:
				(ftthByEmpresa.ONNET || 0) + (ftthByEmpresa["SEMPRE INTERNET"] || 0),
			periodo: formatPeríodo(
				rows.map((row) => row._dataCancelamento).filter(Boolean),
			),
			totalVoluntarios: byCategoriaMotivo.Voluntario || 0,
			totalInvoluntarios: byCategoriaMotivo.Involuntario || 0,
			byTipoRows: buildSummaryRows(byTipo, (label, value) => ({
				tipo: label,
				total: value.total,
			})),
			byCidadeRows: buildSummaryRows(byCidade, (label, value) => ({
				cidade: label,
				regional: value.regional,
				total: value.total,
			})),
			byRegionalRows: buildSummaryRows(byRegional, (label, value) => ({
				regional: label,
				total: value.total,
				cidades: value.cidades.size,
			})),
			byMotivoRows: buildSummaryRows(byMotivo, (label, value) => ({
				motivo: label,
				total: value.total,
			})),
		};
	}, [rows]);

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
			setTitle(
				dashboard,
				1,
				8,
				`RELATORIO DE CANCELAMENTOS DO MES — ${String(analytics.periodo).toUpperCase()}`,
			);
			setTitle(
				dashboard,
				2,
				8,
				`${analytics.totalCancelamentos} cancelamentos processados • ${fileName}`,
				"EA580C",
			);

			[
				["TOTAL CANCEL.", analytics.totalCancelamentos, "C2410C"],
				["FTTH ONNET", analytics.totalFtthOnnet, "7F1D1D"],
				["FTTH SEMPRE", analytics.totalFtthSempre, "0F766E"],
				["CIDADES", analytics.totalCidades, "15803D"],
				["REGIONAIS", analytics.totalRegionais, "1D4ED8"],
				["TIPOS SERVICO", analytics.totalTiposServiço, "7C3AED"],
				["MOTIVOS", analytics.totalMotivos, "B45309"],
				["O.S ABERTAS", analytics.totalOsAbertas, "0F766E"],
			].forEach(([label, value, accent], index) => {
				setKpi(dashboard, 4, index + 1, label, value, accent);
				dashboard.getColumn(index + 1).width = 18;
			});

			setTitle(dashboard, 7, 2, "RESUMO EXECUTIVO", "9A3412");
			[
				["Período identificado", analytics.periodo],
				["Cancelamentos voluntarios", analytics.totalVoluntarios],
				["Cancelamentos involuntarios", analytics.totalInvoluntarios],
				["Retirada FTTH Onnet", analytics.totalFtthOnnet],
				["Retirada FTTH Sempre Internet", analytics.totalFtthSempre],
				["Total retirada FTTH", analytics.totalFtth],
				["Motivos distintos", analytics.totalMotivos],
				["Cidades com cancelamento", analytics.totalCidades],
				["Regionais impactadas", analytics.totalRegionais],
			].forEach(([label, value], index) => {
				const row = index + 8;
				const bg = stripe(index, "FFF7ED");
				setCell(dashboard, row, 1, label, bg, "left", true);
				setCell(dashboard, row, 2, value, bg, "center");
			});
			dashboard.getColumn(1).width = 30;
			dashboard.getColumn(2).width = 20;

			let rowCursor = 18;
			setTitle(dashboard, rowCursor, 4, "TOP 10 CIDADES", "1D4ED8");
			rowCursor += 1;
			["Cidade", "Regional", "Total", "% Total"].forEach((label, index) =>
				setHeader(dashboard, rowCursor, index + 1, label, "1D4ED8"),
			);
			rowCursor += 1;
			analytics.byCidadeRows.slice(0, 10).forEach((item, index) => {
				const bg = stripe(index, "EFF6FF");
				setCell(dashboard, rowCursor, 1, item.cidade, bg, "left", true);
				setCell(dashboard, rowCursor, 2, item.regional, bg);
				setCell(dashboard, rowCursor, 3, item.total, bg, "center");
				setCell(
					dashboard,
					rowCursor,
					4,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
				rowCursor += 1;
			});
			[28, 24, 12, 12].forEach((width, index) => {
				dashboard.getColumn(index + 1).width = width;
			});

			rowCursor += 2;
			setTitle(dashboard, rowCursor, 3, "TIPOS DE SERVICO", "7C3AED");
			rowCursor += 1;
			["Tipo", "Total", "% Total"].forEach((label, index) =>
				setHeader(dashboard, rowCursor, index + 1, label, "7C3AED"),
			);
			rowCursor += 1;
			analytics.byTipoRows.forEach((item, index) => {
				const bg = stripe(index, "F5F3FF");
				setCell(dashboard, rowCursor, 1, item.tipo, bg, "left", true);
				setCell(dashboard, rowCursor, 2, item.total, bg, "center");
				setCell(
					dashboard,
					rowCursor,
					3,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
				rowCursor += 1;
			});

			rowCursor += 2;
			setTitle(dashboard, rowCursor, 3, "TOP 10 MOTIVOS", "B45309");
			rowCursor += 1;
			["Motivo", "Total", "% Total"].forEach((label, index) =>
				setHeader(dashboard, rowCursor, index + 1, label, "B45309"),
			);
			rowCursor += 1;
			analytics.byMotivoRows.slice(0, 10).forEach((item, index) => {
				const bg = stripe(index, "FFF7ED");
				setCell(dashboard, rowCursor, 1, item.motivo, bg);
				setCell(dashboard, rowCursor, 2, item.total, bg, "center");
				setCell(
					dashboard,
					rowCursor,
					3,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
				rowCursor += 1;
			});

			const tipoSheet = createSheet("Tipos de Serviço");
			setTitle(tipoSheet, 1, 3, "CANCELAMENTOS POR TIPO DE SERVICO", "7C3AED");
			["Tipo", "Total", "% Total"].forEach((label, index) =>
				setHeader(tipoSheet, 2, index + 1, label, "7C3AED"),
			);
			analytics.byTipoRows.forEach((item, index) => {
				const bg = stripe(index, "F5F3FF");
				setCell(tipoSheet, index + 3, 1, item.tipo, bg, "left", true);
				setCell(tipoSheet, index + 3, 2, item.total, bg, "center");
				setCell(
					tipoSheet,
					index + 3,
					3,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
			});
			[34, 12, 12].forEach((width, index) => {
				tipoSheet.getColumn(index + 1).width = width;
			});

			const cidadeSheet = createSheet("Ranking por Cidade");
			setTitle(
				cidadeSheet,
				1,
				4,
				"RANKING DE CANCELAMENTOS POR CIDADE",
				"1D4ED8",
			);
			["Cidade", "Regional", "Total", "% Total"].forEach((label, index) =>
				setHeader(cidadeSheet, 2, index + 1, label, "1D4ED8"),
			);
			analytics.byCidadeRows.forEach((item, index) => {
				const bg = stripe(index, "EFF6FF");
				setCell(cidadeSheet, index + 3, 1, item.cidade, bg, "left", true);
				setCell(cidadeSheet, index + 3, 2, item.regional, bg);
				setCell(cidadeSheet, index + 3, 3, item.total, bg, "center");
				setCell(
					cidadeSheet,
					index + 3,
					4,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
			});
			[28, 24, 12, 12].forEach((width, index) => {
				cidadeSheet.getColumn(index + 1).width = width;
			});

			const regionalSheet = createSheet("Por Regional");
			setTitle(regionalSheet, 1, 4, "CANCELAMENTOS POR REGIONAL", "15803D");
			["Regional", "Total", "Cidades", "% Total"].forEach((label, index) =>
				setHeader(regionalSheet, 2, index + 1, label, "15803D"),
			);
			analytics.byRegionalRows.forEach((item, index) => {
				const bg = stripe(index, "ECFDF5");
				setCell(regionalSheet, index + 3, 1, item.regional, bg, "left", true);
				setCell(regionalSheet, index + 3, 2, item.total, bg, "center");
				setCell(regionalSheet, index + 3, 3, item.cidades, bg, "center");
				setCell(
					regionalSheet,
					index + 3,
					4,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
			});
			[28, 12, 12, 12].forEach((width, index) => {
				regionalSheet.getColumn(index + 1).width = width;
			});

			const motivoSheet = createSheet("Por Motivo");
			setTitle(motivoSheet, 1, 3, "CANCELAMENTOS POR MOTIVO", "B45309");
			["Motivo Cancelamento", "Total", "% Total"].forEach((label, index) =>
				setHeader(motivoSheet, 2, index + 1, label, "B45309"),
			);
			analytics.byMotivoRows.forEach((item, index) => {
				const bg = stripe(index, "FFF7ED");
				setCell(motivoSheet, index + 3, 1, item.motivo, bg);
				setCell(motivoSheet, index + 3, 2, item.total, bg, "center");
				setCell(
					motivoSheet,
					index + 3,
					3,
					formatPercent(item.total, analytics.totalCancelamentos),
					bg,
					"center",
				);
			});
			[64, 12, 12].forEach((width, index) => {
				motivoSheet.getColumn(index + 1).width = width;
			});

			const dataSheet = createSheet("Dados Completos");
			setTitle(dataSheet, 1, 10, "BASE DETALHADA DE CANCELAMENTOS", "334155");
			[
				"Código Cliente",
				"Cidade",
				"Regional",
				"Empresa",
				"Tipo Serviço",
				"FTTH?",
				"Tecnologia",
				"Motivo Cancelamento",
				"Data Cancelamento",
				"O.S Cancel. Abertas",
			].forEach((label, index) =>
				setHeader(dataSheet, 2, index + 1, label, "334155"),
			);
			rows.forEach((row, index) => {
				const bg = stripe(index, "F8FAFC");
				setCell(dataSheet, index + 3, 1, row._codigoCliente, bg, "center");
				setCell(dataSheet, index + 3, 2, row._cidade, bg, "left", true);
				setCell(dataSheet, index + 3, 3, row._regional, bg);
				setCell(dataSheet, index + 3, 4, row._empresa, bg, "center");
				setCell(dataSheet, index + 3, 5, row._tipoServiço, bg, "center");
				setCell(
					dataSheet,
					index + 3,
					6,
					row._isFtth ? "Sim" : "Não",
					bg,
					"center",
				);
				setCell(dataSheet, index + 3, 7, row._tecnologia, bg, "center");
				setCell(dataSheet, index + 3, 8, row._motivo, bg);
				setCell(
					dataSheet,
					index + 3,
					9,
					formatDate(row._dataCancelamento),
					bg,
					"center",
				);
				setCell(dataSheet, index + 3, 10, row._osAbertas, bg, "center");
			});
			[16, 24, 24, 20, 18, 12, 18, 48, 16, 16].forEach((width, index) => {
				dataSheet.getColumn(index + 1).width = width;
			});

			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `cancelamentos-mes-${new Date()
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
				className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
					status === "ok" || status === "generating"
						? "border-green-400 bg-green-50"
						: status === "err"
							? "border-red-400 bg-red-50"
							: "border-gray-200 bg-white hover:border-orange-400"
				}`}
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
				<span className="text-4xl block mb-3">📉</span>
				{rows.length > 0 ? (
					<>
						<p className="font-semibold text-green-700">{fileName}</p>
						<p className="text-sm text-green-600">
							{rows.length} linhas processadas • clique para trocar
						</p>
					</>
				) : status === "loading" ? (
					<p className="text-sm text-gray-500">Carregando planilha...</p>
				) : (
					<>
						<p className="font-semibold text-gray-700">
							Clique ou arraste a planilha de cancelamentos do mes
						</p>
						<p className="text-xs text-gray-400 mt-1">
							Campos esperados:{" "}
							<code>
								cidade • tecnologia • motivo_cancelamento • data_cancelamento
							</code>
						</p>
					</>
				)}
			</div>

			{rows.length > 0 && (
				<>
					<div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
						{[
							[
								"Cancelamentos",
								analytics.totalCancelamentos,
								"text-orange-700",
							],
							["FTTH Onnet", analytics.totalFtthOnnet, "text-red-700"],
							["FTTH Sempre", analytics.totalFtthSempre, "text-emerald-700"],
							["Cidades", analytics.totalCidades, "text-blue-700"],
							["Regionais", analytics.totalRegionais, "text-green-700"],
							["Tipos Serviço", analytics.totalTiposServiço, "text-purple-700"],
							["O.S Abertas", analytics.totalOsAbertas, "text-emerald-700"],
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

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						<div className="bg-white border border-gray-200 rounded-xl p-4">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
								Período
							</p>
							<p className="text-lg font-semibold text-gray-800 capitalize">
								{analytics.periodo}
							</p>
							<p className="text-sm text-gray-500 mt-2">
								Voluntarios: {analytics.totalVoluntarios} • Involuntarios:{" "}
								{analytics.totalInvoluntarios}
							</p>
						</div>

						<div className="bg-white border border-gray-200 rounded-xl p-4">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
								Top 5 Cidades
							</p>
							<div className="space-y-2">
								{analytics.byCidadeRows.slice(0, 5).map((item) => (
									<div
										key={item.cidade}
										className="flex items-center justify-between text-sm"
									>
										<div>
											<p className="font-semibold text-gray-800">
												{item.cidade}
											</p>
											<p className="text-xs text-gray-400">{item.regional}</p>
										</div>
										<span className="font-bold text-orange-600">
											{item.total}
										</span>
									</div>
								))}
							</div>
						</div>

						<div className="bg-white border border-gray-200 rounded-xl p-4">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
								Tipos de Serviço
							</p>
							<div className="space-y-2">
								{analytics.byTipoRows.slice(0, 5).map((item) => (
									<div
										key={item.tipo}
										className="flex items-center justify-between text-sm"
									>
										<span className="font-semibold text-gray-800">
											{item.tipo}
										</span>
										<span className="font-bold text-purple-700">
											{item.total}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>

					<button
						onClick={gerar}
						className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors"
					>
						<FileDown size={16} />
						Gerar Relatorio de Cancelamentos do Mes (6 abas)
					</button>
				</>
			)}

			{status === "generating" && (
				<p className="text-sm text-orange-600 font-medium animate-pulse">
					⏳ Gerando Excel...
				</p>
			)}
			{status === "err" && (
				<p className="text-sm text-red-600">
					❌ Erro ao processar o arquivo de cancelamentos.
				</p>
			)}
		</div>
	);
};

export default TabCancelamentosMes;

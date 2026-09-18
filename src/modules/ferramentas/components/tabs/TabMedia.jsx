import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";

const norm = (v) =>
	String(v ?? "")
		.trim()
		.toLowerCase();

function countRowTypes(rows = []) {
	return rows.reduce(
		(acc, row) => {
			if (row._agente === "SIM") acc.agente += 1;
			else if (row._tectipo === "RETIRADA") acc.retirada += 1;
			else acc.ativa += 1;
			return acc;
		},
		{ ativa: 0, retirada: 0, agente: 0 },
	);
}

function compareBrDateKeys(a, b) {
	const [da, ma, ya] = a.split("/");
	const [db, mb, yb] = b.split("/");
	return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
}

function setSheetColumns(ws, widths) {
	widths.forEach((width, index) => {
		ws.getColumn(index + 1).width = width;
	});
}

function writeMergedHeader(
	ws,
	rowIndex,
	columnCount,
	value,
	color,
	C,
	size = 10,
) {
	ws.mergeCells(rowIndex, 1, rowIndex, columnCount);
	const cell = ws.getCell(rowIndex, 1);
	cell.value = value;
	cell.font = { name: "Arial", bold: true, size, color: C("FFFFFF") };
	cell.fill = { type: "pattern", pattern: "solid", fgColor: C(color) };
	cell.alignment = { horizontal: "left", vertical: "middle" };
	ws.getRow(rowIndex).height = size >= 11 ? 20 : 18;
}

function writePorDiaCidadeRow({
	ws,
	rowIndex,
	dia,
	regional,
	cidade,
	rows,
	bg,
	xD,
}) {
	const counts = countRowTypes(rows);
	xD(ws, rowIndex, 1, dia, bg, false, "center");
	xD(ws, rowIndex, 2, regional, bg);
	xD(ws, rowIndex, 3, cidade, bg, true);
	xD(ws, rowIndex, 4, rows.length, bg, false, "center");
	xD(ws, rowIndex, 5, counts.ativa, bg, false, "center");
	xD(
		ws,
		rowIndex,
		6,
		counts.retirada,
		counts.retirada > 0 ? "EBF5FB" : bg,
		false,
		"center",
	);
	xD(
		ws,
		rowIndex,
		7,
		counts.agente,
		counts.agente > 0 ? "FEF9E7" : bg,
		false,
		"center",
	);
}

const TabMedia = () => {
	const { regionais, config } = useFerramentasRegionais();
	const [status, setStatus] = useState(null);
	const [rows, setRows] = useState([]);
	const [fname, setFname] = useState("");
	const inputRef = useRef();

	const tecSet = new Set((config?.tecnicos || []).map((t) => norm(t.nome)));

	const cidMap = {};
	regionais.forEach((r) => {
		(r.cidades || []).forEach((c) => {
			cidMap[norm(c.nome)] = { regional: r.nome, agente: c.agente };
		});
	});

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
				const data = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
				// Normaliza chaves: minusculo sem espacos/underscores
				const normalized = data.map((row) => {
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
				setRows(normalized);
				setStatus("ok");
			} catch {
				setStatus("err");
			}
		};
		reader.readAsArrayBuffer(f);
	};

	const parseDate = (v) => {
		if (!v) return null;
		if (v instanceof Date) return Number.isNaN(v) ? null : v;
		const s = String(v).trim();
		// dd/mm/yyyy
		const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
		if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
		// yyyy-mm-dd
		const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
		const d = new Date(s);
		return Number.isNaN(d) ? null : d;
	};

	const fmtD = (v) => {
		const d = parseDate(v);
		return d ? d.toLocaleDateString("pt-BR") : "";
	};

	// Extrai cidade do endereco: "RUA X, 123 - BAIRRO, CIDADE/MG | CEP: XXXXX"
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

	// Extrai nome do tecnico antes do " | "
	const extractTec = (v) => {
		if (!v) return "ND";
		return String(v).split("|")[0].trim() || "ND";
	};

	const grpBy = (arr, keyFn) =>
		arr.reduce((acc, r) => {
			const k = typeof keyFn === "function" ? keyFn(r) : r[keyFn] || "N/A";
			if (!acc[k]) acc[k] = [];
			acc[k].push(r);
			return acc;
		}, {});

	const gerar = async () => {
		if (!rows.length) return;
		setStatus("gerando");
		try {
			// Apos normalizacao de chaves, a coluna fica "dataterminoexecutado"
			const dateCol = "dataterminoexecutado";

			const D = rows.map((r) => {
				const tecRaw = extractTec(r.tecnicos ?? r.tecnico ?? "");
				const tec = norm(tecRaw);
				const cidade = extractCidade(r.enderecoinstalacao ?? r.endereco ?? "");
				const info = cidMap[norm(cidade)] || {};
				return {
					...r,
					_numos: r.numos ?? r.numeros ?? r.numas ?? "",
					_tipo: r.tipo || "N/A",
					tecnico: tecRaw,
					cidade,
					_regional: info.regional || "Sem Regional",
					_agente: info.agente ? "SIM" : "NAO",
					_tectipo: tecSet.has(tec) ? "RETIRADA" : "ATIVA",
					_date: parseDate(r[dateCol]),
				};
			});

			const dkFn = (r) =>
				r._date && !Number.isNaN(r._date)
					? r._date.toLocaleDateString("pt-BR")
					: null;

			const byDia = grpBy(
				D.filter((r) => dkFn(r)),
				dkFn,
			);
			const diasSort = Object.keys(byDia).sort(compareBrDateKeys);
			const nd = diasSort.length || 1;
			const dMin = diasSort[0];
			const dMax = diasSort[diasSort.length - 1];
			const periodo = dMin === dMax ? dMin : `${dMin} a ${dMax}`;

			const metaAtiva = config?.metaAtiva ?? 110;
			const metaRet = config?.metaRetirada ?? 110;

			const wb = new ExcelJS.Workbook();
			wb.creator = "Sempre";
			wb.created = new Date();

			// -- Helpers ------------------------------------------------------------
			const C = (hex) => ({ argb: "FF" + hex.replace("#", "") });
			const xH = (ws, r, c, v, bg = "1A5276") => {
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
			const xD = (ws, r, c, v, bg = null, bold = false, align = "left") => {
				const cell = ws.getCell(r, c);
				cell.value = v ?? "";
				cell.font = { name: "Arial", bold, size: 10 };
				if (bg)
					cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = { horizontal: align, vertical: "middle" };
				const b = { style: "thin", color: C("D0D0D0") };
				cell.border = { left: b, right: b, top: b, bottom: b };
			};
			const xT = (ws, r, n, text, bg = "1F4E79") => {
				ws.mergeCells(r, 1, r, n);
				const cell = ws.getCell(r, 1);
				cell.value = text;
				cell.font = { name: "Arial", bold: true, size: 13, color: C("FFFFFF") };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(r).height = 28;
			};
			const xKpi = (ws, r, c, lbl, val, color) => {
				const l = ws.getCell(r, c);
				l.value = lbl;
				l.font = { name: "Arial", bold: true, size: 8, color: C("FFFFFF") };
				l.fill = { type: "pattern", pattern: "solid", fgColor: C(color) };
				l.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(r).height = 20;
				const v = ws.getCell(r + 1, c);
				v.value = val;
				v.font = { name: "Arial", bold: true, size: 22, color: C(color) };
				v.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F5F5") };
				v.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(r + 1).height = 52;
			};

			// -- byReg2 compartilhado -----------------------------------------------
			const byReg2 = {};
			D.forEach((r) => {
				if (!byReg2[r._regional])
					byReg2[r._regional] = {
						q: 0,
						ativa: 0,
						retirada: 0,
						ag: 0,
						agAutoriz: 0,
						retCidades: new Set(),
						dias: new Set(),
					};
				byReg2[r._regional].q++;
				if (r._agente === "SIM") {
					byReg2[r._regional].agAutoriz++;
					byReg2[r._regional].retCidades.add(r.cidade || "N/A");
				} else if (r._tectipo === "RETIRADA") {
					byReg2[r._regional].retirada++;
					byReg2[r._regional].retCidades.add(r.cidade || "N/A");
				} else {
					byReg2[r._regional].ativa++;
				}
				if (r._agente === "SIM") byReg2[r._regional].ag++;
				const dk = dkFn(r);
				if (dk) byReg2[r._regional].dias.add(dk);
			});

			// -- ABA 1: Resumo Geral -----------------------------------------------
			const ws1 = wb.addWorksheet("Resumo Geral");
			ws1.views = [{ showGridLines: false }];
			ws1.mergeCells("A1:H2");
			let cell = ws1.getCell("A1");
			cell.value = `ANALISE MEDIA DE O.S — ${periodo}`;
			cell.font = { name: "Arial", bold: true, size: 16, color: C("FFFFFF") };
			cell.fill = { type: "pattern", pattern: "solid", fgColor: C("1A5276") };
			cell.alignment = { horizontal: "center", vertical: "middle" };
			ws1.getRow(1).height = 38;
			ws1.mergeCells("A3:H3");
			cell = ws1.getCell("A3");
			cell.value = `Gerado em ${new Date().toLocaleString("pt-BR")} — ${D.length} O.S — ${nd} dias — Media ${(D.length / nd).toFixed(1)}/dia`;
			cell.font = { name: "Arial", size: 10, color: C("FFFFFF") };
			cell.fill = { type: "pattern", pattern: "solid", fgColor: C("2471A3") };
			cell.alignment = { horizontal: "center", vertical: "middle" };

			[
				["TOTAL O.S", D.length, "1A5276"],
				["DIAS", nd, "117A65"],
				["MEDIA/DIA", (D.length / nd).toFixed(1), "B7950B"],
				["TECNICOS", new Set(D.map((r) => r.tecnico)).size, "6C3483"],
				["CIDADES", new Set(D.map((r) => r.cidade)).size, "1F618D"],
			].forEach(([l, v, c], i) => xKpi(ws1, 5, i + 1, l, v, c));

			let rr = 8;

			xT(ws1, rr, 4, "TOTAL POR TIPO DE O.S", "1A5276");
			rr++;
			["Tipo", "Total", "Media/Dia", "% Total"].forEach((h, i) =>
				xH(ws1, rr, i + 1, h, "2471A3"),
			);
			rr++;
			const tm = {};
			D.forEach((r) => {
				const t = r._tipo || "N/A";
				if (!tm[t]) tm[t] = 0;
				tm[t]++;
			});
			Object.entries(tm)
				.sort((a, b) => b[1] - a[1])
				.forEach(([t, q], i) => {
					const bg = i % 2 ? "FFFFFF" : "EBF5FB";
					xD(ws1, rr, 1, t, bg);
					xD(ws1, rr, 2, q, bg, false, "center");
					xD(ws1, rr, 3, (q / nd).toFixed(1), bg, false, "center");
					xD(
						ws1,
						rr,
						4,
						`${((q / D.length) * 100).toFixed(1)}%`,
						bg,
						false,
						"center",
					);
					rr++;
				});
			rr++;

			xT(ws1, rr, 8, "RESUMO POR REGIONAL", "117A65");
			rr++;
			[
				"Regional",
				"Total",
				"Tec. Ativa",
				"Tec. Retirada",
				"Ag. Autorizado",
				"Cid. Retirada",
				"Dias Ativos",
				"O.S Agentes",
			].forEach((h, i) => xH(ws1, rr, i + 1, h, "1E8449"));
			rr++;
			Object.entries(byReg2)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([reg, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "EAFAF1";
					xD(ws1, rr, 1, reg, bg, true);
					xD(ws1, rr, 2, v.q, bg, false, "center");
					xD(ws1, rr, 3, v.ativa, bg, false, "center");
					xD(
						ws1,
						rr,
						4,
						v.retirada,
						v.retirada > 0 ? "EBF5FB" : bg,
						false,
						"center",
					);
					xD(
						ws1,
						rr,
						5,
						v.agAutoriz,
						v.agAutoriz > 0 ? "FEF9E7" : bg,
						false,
						"center",
					);
					xD(
						ws1,
						rr,
						6,
						[...v.retCidades].join(", ") || "-",
						bg,
						false,
						"left",
					);
					xD(ws1, rr, 7, v.dias.size, bg, false, "center");
					xD(ws1, rr, 8, v.ag, bg, false, "center");
					rr++;
				});
			rr++;

			xT(ws1, rr, 4, "AGENTES POR REGIONAL", "6C3483");
			rr++;
			["Regional", "Total O.S", "O.S Agentes", "% Agentes"].forEach((h, i) =>
				xH(ws1, rr, i + 1, h, "8E44AD"),
			);
			rr++;
			Object.entries(byReg2)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([reg, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "F5EEF8";
					xD(ws1, rr, 1, reg, bg, true);
					xD(ws1, rr, 2, v.q, bg, false, "center");
					xD(ws1, rr, 3, v.ag, bg, false, "center");
					xD(
						ws1,
						rr,
						4,
						`${((v.ag / v.q) * 100).toFixed(1)}%`,
						bg,
						false,
						"center",
					);
					rr++;
				});
			setSheetColumns(ws1, [30, 14, 14, 16, 16, 28, 14, 14]);

			// -- ABA 2: Por Dia e Regional -----------------------------------------
			const ws2 = wb.addWorksheet("Por Dia e Regional");
			ws2.views = [{ showGridLines: false }];
			xT(ws2, 1, 7, `O.S POR DIA — ${periodo}`, "1A5276");
			[
				"Data",
				"Regional",
				"Cidade",
				"Total",
				"Tec. Ativa",
				"Tec. Retirada",
				"Ag. Autorizado",
			].forEach((h, i) => xH(ws2, 2, i + 1, h, "2471A3"));
			let r2 = 3;
			diasSort.forEach((dia) => {
				const dRows = byDia[dia];
				const dayCounts = countRowTypes(dRows);
				writeMergedHeader(
					ws2,
					r2,
					7,
					`${dia} — ${dRows.length} O.S  Ativa: ${dayCounts.ativa}  Ret: ${dayCounts.retirada}  Ag.Aut: ${dayCounts.agente}`,
					"1A5276",
					C,
					11,
				);
				r2++;
				Object.entries(grpBy(dRows, "_regional"))
					.sort((a, b) => b[1].length - a[1].length)
					.forEach(([reg, rRows]) => {
						const regionalCounts = countRowTypes(rRows);
						writeMergedHeader(
							ws2,
							r2,
							7,
							`${reg} — ${rRows.length}  A:${regionalCounts.ativa}  R:${regionalCounts.retirada}  Ag.Aut:${regionalCounts.agente}`,
							"117A65",
							C,
						);
						r2++;
						Object.entries(grpBy(rRows, "cidade"))
							.sort((a, b) => b[1].length - a[1].length)
							.forEach(([cidade, cRows], ci) => {
								const bg = ci % 2 ? "FFFFFF" : "E8F8F5";
								writePorDiaCidadeRow({
									ws: ws2,
									rowIndex: r2,
									dia,
									regional: reg,
									cidade,
									rows: cRows,
									bg,
									xD,
								});
								r2++;
							});
					});
			});
			setSheetColumns(ws2, [16, 28, 26, 12, 14, 16, 16]);

			// -- ABA 3: Agentes por Dia --------------------------------------------
			const ws3 = wb.addWorksheet("Agentes por Dia");
			ws3.views = [{ showGridLines: false }];
			xT(ws3, 1, 5, "AGENTES POR DIA", "6C3483");
			["Data", "Regional", "Cidade", "O.S Agentes", "% do Dia"].forEach(
				(h, i) => xH(ws3, 2, i + 1, h, "8E44AD"),
			);
			let r3 = 3;
			const agByDia = grpBy(
				D.filter((r) => r._agente === "SIM"),
				dkFn,
			);
			diasSort.forEach((dia) => {
				const dAg = agByDia[dia];
				if (!dAg?.length) return;
				const diaT = byDia[dia]?.length || 1;
				ws3.mergeCells(r3, 1, r3, 5);
				const ch = ws3.getCell(r3, 1);
				ch.value = `${dia} — ${dAg.length} por agentes de ${diaT}`;
				ch.font = { name: "Arial", bold: true, size: 11, color: C("FFFFFF") };
				ch.fill = { type: "pattern", pattern: "solid", fgColor: C("6C3483") };
				ch.alignment = { horizontal: "left", vertical: "middle" };
				ws3.getRow(r3).height = 20;
				r3++;
				Object.entries(grpBy(dAg, "cidade"))
					.sort((a, b) => b[1].length - a[1].length)
					.forEach(([cidade, cRows], ci) => {
						const bg = ci % 2 ? "FFFFFF" : "F5EEF8";
						xD(ws3, r3, 1, dia, bg, false, "center");
						xD(ws3, r3, 2, cRows[0]?._regional || "", bg);
						xD(ws3, r3, 3, cidade, bg, true);
						xD(ws3, r3, 4, cRows.length, bg, false, "center");
						xD(
							ws3,
							r3,
							5,
							`${((cRows.length / diaT) * 100).toFixed(1)}%`,
							bg,
							false,
							"center",
						);
						r3++;
					});
			});
			setSheetColumns(ws3, [16, 28, 26, 14, 14]);

			// -- ABA 4: Técnicos por Dia -------------------------------------------
			const ws4 = wb.addWorksheet("Técnicos por Dia");
			ws4.views = [{ showGridLines: false }];
			xT(ws4, 1, 4, `O.S POR TECNICO — ${periodo}`, "2C3E50");
			["Técnico", "Tipo", "Data", "O.S no Dia"].forEach((h, i) =>
				xH(ws4, 2, i + 1, h, "566573"),
			);
			let r4 = 3;
			Object.entries(grpBy(D, "tecnico"))
				.sort((a, b) => b[1].length - a[1].length)
				.forEach(([tec, tRows]) => {
					const diasTec = new Set(tRows.map((r) => dkFn(r)).filter(Boolean));
					const tipoTec =
						tRows[0]?._tectipo === "RETIRADA" ? "RETIRADA" : "ATIVA";
					ws4.mergeCells(r4, 1, r4, 4);
					const th = ws4.getCell(r4, 1);
					th.value = `${tec} (${tipoTec}) — ${tRows.length} O.S em ${diasTec.size} dias — media ${(tRows.length / (diasTec.size || 1)).toFixed(1)}/dia`;
					th.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
					th.fill = {
						type: "pattern",
						pattern: "solid",
						fgColor: C(tipoTec === "RETIRADA" ? "1F618D" : "2C3E50"),
					};
					th.alignment = { horizontal: "left", vertical: "middle" };
					ws4.getRow(r4).height = 18;
					r4++;
					const byDiaTec = grpBy(tRows, dkFn);
					Object.keys(byDiaTec)
						.sort(compareBrDateKeys)
						.forEach((dia, di) => {
							const bg = di % 2 ? "FFFFFF" : "F2F3F4";
							xD(ws4, r4, 1, tec, bg);
							xD(
								ws4,
								r4,
								2,
								tipoTec,
								tipoTec === "RETIRADA" ? "EBF5FB" : bg,
								false,
								"center",
							);
							xD(ws4, r4, 3, dia, bg, false, "center");
							xD(ws4, r4, 4, byDiaTec[dia].length, bg, false, "center");
							r4++;
						});
				});
			setSheetColumns(ws4, [32, 14, 16, 14]);

			// -- ABA 5: Dados Completos --------------------------------------------
			const ws5 = wb.addWorksheet("Dados Completos");
			ws5.views = [{ showGridLines: false }];
			xT(ws5, 1, 8, "DADOS COMPLETOS", "2C3E50");
			[
				"N° O.S",
				"Técnico",
				"Tipo Tec.",
				"Tipo O.S",
				"Cidade",
				"Regional",
				"Agente Aut.",
				"Data",
			].forEach((h, i) => xH(ws5, 2, i + 1, h, "566573"));
			D.slice()
				.sort((a, b) => (a._date || 0) - (b._date || 0))
				.forEach((row, i) => {
					const bg = i % 2 ? "FFFFFF" : "F2F3F4";
					const retBg = row._tectipo === "RETIRADA" ? "EBF5FB" : bg;
					xD(ws5, i + 3, 1, String(row._numos || row.numos || ""), bg);
					xD(ws5, i + 3, 2, row.tecnico, bg);
					xD(ws5, i + 3, 3, row._tectipo, retBg, false, "center");
					xD(ws5, i + 3, 4, row._tipo, bg);
					xD(ws5, i + 3, 5, row.cidade, bg);
					xD(ws5, i + 3, 6, row._regional, bg);
					xD(ws5, i + 3, 7, row._agente, bg, false, "center");
					xD(ws5, i + 3, 8, fmtD(row[dateCol]), bg, false, "center");
				});
			setSheetColumns(ws5, [20, 30, 14, 26, 24, 24, 16, 14]);

			// -- ABA 6: Meta Ativa por Regional -----------------------------------
			const wsMa = wb.addWorksheet("Meta Ativa Regional");
			wsMa.views = [{ showGridLines: false }];
			wsMa.mergeCells("A1:G2");
			const maTit = wsMa.getCell("A1");
			maTit.value = `META TECNICOS DA ATIVA — ${periodo}`;
			maTit.font = { name: "Arial", bold: true, size: 15, color: C("FFFFFF") };
			maTit.fill = { type: "pattern", pattern: "solid", fgColor: C("1E8449") };
			maTit.alignment = { horizontal: "center", vertical: "middle" };
			wsMa.getRow(1).height = 36;
			wsMa.mergeCells("A3:G3");
			const maSub = wsMa.getCell("A3");
			maSub.value = `Meta: ${metaAtiva} O.S/mes por regional — ${periodo}`;
			maSub.font = { name: "Arial", size: 10, color: C("FFFFFF") };
			maSub.fill = { type: "pattern", pattern: "solid", fgColor: C("27AE60") };
			maSub.alignment = { horizontal: "center", vertical: "middle" };
			const dAtiva = D.filter((r) => r._tectipo !== "RETIRADA");
			const regsAtiva = Object.keys(byReg2).filter((r) => byReg2[r].ativa > 0);
			const regsBateram = regsAtiva.filter(
				(r) => byReg2[r].ativa >= metaAtiva,
			).length;
			[
				["O.S ATIVA", dAtiva.length, "1E8449"],
				["REGIONAIS", regsAtiva.length, "117A65"],
				["BATERAM", regsBateram, "27AE60"],
				["NAO BATERAM", regsAtiva.length - regsBateram, "C0392B"],
			].forEach(([l, v, c], i) => xKpi(wsMa, 5, i + 1, l, v, c));
			let rMa = 8;
			xT(wsMa, rMa, 7, "DESEMPENHO POR REGIONAL VS META", "1E8449");
			rMa++;
			[
				"Regional",
				"O.S Ativa",
				"Meta",
				"Saldo",
				"% Meta",
				"Status",
				"Técnicos unicos",
			].forEach((h, i) => xH(wsMa, rMa, i + 1, h, "27AE60"));
			rMa++;
			Object.entries(byReg2)
				.sort((a, b) => b[1].ativa - a[1].ativa)
				.forEach(([reg, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "EAFAF1";
					const saldo = v.ativa - metaAtiva;
					const bateu = v.ativa >= metaAtiva;
					const tecU = new Set(
						D.filter(
							(r) => r._regional === reg && r._tectipo !== "RETIRADA",
						).map((r) => r.tecnico),
					).size;
					xD(wsMa, rMa, 1, reg, bg, true);
					xD(wsMa, rMa, 2, v.ativa, bg, false, "center");
					xD(wsMa, rMa, 3, metaAtiva, bg, false, "center");
					xD(
						wsMa,
						rMa,
						4,
						saldo,
						saldo >= 0 ? "D5F5E3" : "FADBD8",
						false,
						"center",
					);
					xD(
						wsMa,
						rMa,
						5,
						`${((v.ativa / metaAtiva) * 100).toFixed(1)}%`,
						bg,
						false,
						"center",
					);
					xD(
						wsMa,
						rMa,
						6,
						bateu ? "BATEU ✓" : "ABAIXO",
						bateu ? "D5F5E3" : "FADBD8",
						false,
						"center",
					);
					xD(wsMa, rMa, 7, tecU, bg, false, "center");
					rMa++;
				});
			const totAtiva = dAtiva.length;
			const totMetaA = regsAtiva.length * metaAtiva;
			[
				"TOTAL GERAL",
				totAtiva,
				totMetaA,
				totAtiva - totMetaA,
				`${(totMetaA > 0 ? (totAtiva / totMetaA) * 100 : 0).toFixed(1)}%`,
				"",
				"",
			].forEach((v, i) => {
				const c = wsMa.getCell(rMa, i + 1);
				c.value = v;
				c.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
				c.fill = { type: "pattern", pattern: "solid", fgColor: C("1E8449") };
				c.alignment = {
					horizontal: i === 0 ? "left" : "center",
					vertical: "middle",
				};
				wsMa.getRow(rMa).height = 18;
			});
			rMa += 2;
			xT(wsMa, rMa, 5, "TOP TECNICOS POR REGIONAL ATIVA", "117A65");
			rMa++;
			[
				"Regional",
				"Técnico",
				"O.S",
				"Media/Dia",
				"% da Regional",
				"Dias Ativos",
			].forEach((h, i) => xH(wsMa, rMa, i + 1, h, "1E8449"));
			rMa++;
			Object.entries(byReg2)
				.sort((a, b) => b[1].ativa - a[1].ativa)
				.forEach(([reg]) => {
					const tmReg = {};
					D.filter(
						(r) => r._regional === reg && r._tectipo !== "RETIRADA",
					).forEach((r) => {
						if (!tmReg[r.tecnico]) tmReg[r.tecnico] = { q: 0, dias: new Set() };
						tmReg[r.tecnico].q++;
						const dk = dkFn(r);
						if (dk) tmReg[r.tecnico].dias.add(dk);
					});
					const regTot = Object.values(tmReg).reduce((s, v) => s + v.q, 0) || 1;
					Object.entries(tmReg)
						.sort((a, b) => b[1].q - a[1].q)
						.forEach(([tec, tv], ti) => {
							const bg = ti % 2 ? "FFFFFF" : "EAFAF1";
							xD(wsMa, rMa, 1, reg, bg);
							xD(wsMa, rMa, 2, tec, bg, true);
							xD(wsMa, rMa, 3, tv.q, bg, false, "center");
							xD(
								wsMa,
								rMa,
								4,
								(tv.q / (tv.dias.size || 1)).toFixed(1),
								bg,
								false,
								"center",
							);
							xD(
								wsMa,
								rMa,
								5,
								`${((tv.q / regTot) * 100).toFixed(1)}%`,
								bg,
								false,
								"center",
							);
							xD(wsMa, rMa, 6, tv.dias.size, bg, false, "center");
							rMa++;
						});
				});
			[28, 30, 12, 12, 16, 14].forEach((w, i) => {
				wsMa.getColumn(i + 1).width = w;
			});

			// -- ABA 7: Meta Retirada Individual ----------------------------------
			const dRet = D.filter((r) => r._tectipo === "RETIRADA");
			const wsMr = wb.addWorksheet("Meta Retirada Individual");
			wsMr.views = [{ showGridLines: false }];
			wsMr.mergeCells("A1:G2");
			const mrTit = wsMr.getCell("A1");
			mrTit.value = `META TECNICOS DE RETIRADA INDIVIDUAL — ${periodo}`;
			mrTit.font = { name: "Arial", bold: true, size: 15, color: C("FFFFFF") };
			mrTit.fill = { type: "pattern", pattern: "solid", fgColor: C("1F618D") };
			mrTit.alignment = { horizontal: "center", vertical: "middle" };
			wsMr.getRow(1).height = 36;
			wsMr.mergeCells("A3:G3");
			const mrSub = wsMr.getCell("A3");
			mrSub.value = `Meta individual: ${metaRet} O.S/mes — ${periodo}`;
			mrSub.font = { name: "Arial", size: 10, color: C("FFFFFF") };
			mrSub.fill = { type: "pattern", pattern: "solid", fgColor: C("2471A3") };
			mrSub.alignment = { horizontal: "center", vertical: "middle" };
			const tecsByRet = Object.entries(grpBy(dRet, "tecnico"));
			const retBateram = tecsByRet.filter(
				([, tr]) => tr.length >= metaRet,
			).length;
			[
				["O.S RETIRADA", dRet.length, "1F618D"],
				["TECNICOS", tecsByRet.length, "117A65"],
				["BATERAM", retBateram, "27AE60"],
				["NAO BATERAM", tecsByRet.length - retBateram, "C0392B"],
			].forEach(([l, v, c], i) => xKpi(wsMr, 5, i + 1, l, v, c));
			let rMr = 8;
			xT(wsMr, rMr, 7, "DESEMPENHO INDIVIDUAL VS META", "1F618D");
			rMr++;
			[
				"Técnico",
				"Regional Principal",
				"O.S",
				"Meta",
				"Saldo",
				"% Meta",
				"Status",
			].forEach((h, i) => xH(wsMr, rMr, i + 1, h, "2471A3"));
			rMr++;
			tecsByRet
				.sort((a, b) => b[1].length - a[1].length)
				.forEach(([tec, tRows], i) => {
					const bg = i % 2 ? "FFFFFF" : "EBF5FB";
					const saldo = tRows.length - metaRet;
					const bateu = tRows.length >= metaRet;
					const rc = {};
					tRows.forEach((r) => {
						rc[r._regional] = (rc[r._regional] || 0) + 1;
					});
					const rp =
						Object.entries(rc).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
					xD(wsMr, rMr, 1, tec, bg, true);
					xD(wsMr, rMr, 2, rp, bg);
					xD(wsMr, rMr, 3, tRows.length, bg, false, "center");
					xD(wsMr, rMr, 4, metaRet, bg, false, "center");
					xD(
						wsMr,
						rMr,
						5,
						saldo,
						saldo >= 0 ? "D5F5E3" : "FADBD8",
						false,
						"center",
					);
					xD(
						wsMr,
						rMr,
						6,
						`${((tRows.length / metaRet) * 100).toFixed(1)}%`,
						bg,
						false,
						"center",
					);
					xD(
						wsMr,
						rMr,
						7,
						bateu ? "BATEU ✓" : "ABAIXO",
						bateu ? "D5F5E3" : "FADBD8",
						false,
						"center",
					);
					rMr++;
				});
			const totRet = dRet.length;
			const totMetaR = tecsByRet.length * metaRet;
			[
				"TOTAL GERAL",
				"",
				totRet,
				totMetaR,
				totRet - totMetaR,
				`${(totMetaR > 0 ? (totRet / totMetaR) * 100 : 0).toFixed(1)}%`,
				"",
			].forEach((v, i) => {
				const c = wsMr.getCell(rMr, i + 1);
				c.value = v;
				c.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
				c.fill = { type: "pattern", pattern: "solid", fgColor: C("1F618D") };
				c.alignment = {
					horizontal: i === 0 ? "left" : "center",
					vertical: "middle",
				};
				wsMr.getRow(rMr).height = 18;
			});
			rMr += 2;
			xT(wsMr, rMr, 4, "DETALHE O.S POR DIA — RETIRADA", "1F618D");
			rMr++;
			["Técnico", "Data", "Regional", "O.S no Dia"].forEach((h, i) =>
				xH(wsMr, rMr, i + 1, h, "2471A3"),
			);
			rMr++;
			tecsByRet
				.sort((a, b) => b[1].length - a[1].length)
				.forEach(([tec, tRows]) => {
					const diasTec = new Set(tRows.map((r) => dkFn(r)).filter(Boolean));
					const bateu = tRows.length >= metaRet;
					wsMr.mergeCells(rMr, 1, rMr, 4);
					const th = wsMr.getCell(rMr, 1);
					th.value = `${tec} — ${tRows.length} O.S | Meta: ${metaRet} | Saldo: ${tRows.length - metaRet >= 0 ? "+" : ""}${tRows.length - metaRet} | Media: ${(tRows.length / (diasTec.size || 1)).toFixed(1)}/dia`;
					th.font = { name: "Arial", bold: true, size: 10, color: C("FFFFFF") };
					th.fill = {
						type: "pattern",
						pattern: "solid",
						fgColor: C(bateu ? "1F618D" : "C0392B"),
					};
					th.alignment = { horizontal: "left", vertical: "middle" };
					wsMr.getRow(rMr).height = 18;
					rMr++;
					const byDiaTec = grpBy(tRows, dkFn);
					Object.keys(byDiaTec)
						.sort((a, b) => {
							const [da, ma, ya] = a.split("/");
							const [db, mb, yb] = b.split("/");
							return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
						})
						.forEach((dia, di) => {
							const bg = di % 2 ? "FFFFFF" : "EBF5FB";
							xD(wsMr, rMr, 1, tec, bg);
							xD(wsMr, rMr, 2, dia, bg, false, "center");
							xD(wsMr, rMr, 3, byDiaTec[dia][0]?._regional || "N/A", bg);
							xD(wsMr, rMr, 4, byDiaTec[dia].length, bg, false, "center");
							rMr++;
						});
				});
			[32, 16, 24, 14].forEach((w, i) => {
				wsMr.getColumn(i + 1).width = w;
			});

			// -- Download ----------------------------------------------------------
			const buf = await wb.xlsx.writeBuffer();
			const blob = new Blob([buf], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `analisemedia_${(dMin || "").replace(/\//g, "-")}_${(dMax || "").replace(/\//g, "-")}.xlsx`;
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
			<div
				className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${status === "ok" ? "border-green-400 bg-green-50" : status === "err" ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-orange-400"}`}
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
				<span className="text-4xl block mb-3">📊</span>
				{status === "ok" ? (
					<>
						<p className="font-semibold text-green-700">{fname}</p>
						<p className="text-sm text-green-600">
							{rows.length} linhas · clique para trocar
						</p>
					</>
				) : status === "loading" || status === "gerando" ? (
					<p className="text-sm text-gray-500">Processando...</p>
				) : (
					<>
						<p className="font-semibold text-gray-700">
							Clique ou arraste o arquivo .xlsx
						</p>
						<p className="text-xs text-gray-400 mt-1">
							Campos esperados:{" "}
							<code>
								num_o_s · tecnicos · endereco_instalacao ·
								data_termino_executado
							</code>
						</p>
					</>
				)}
			</div>

			{status === "ok" && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors"
				>
					<FileDown size={16} />
					Gerar Análise Média (7 abas)
				</button>
			)}

			{status === "gerando" && (
				<p className="text-sm text-blue-600 font-medium animate-pulse">
					⏳ Gerando Excel...
				</p>
			)}
		</div>
	);
};

export default TabMedia;

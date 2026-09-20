import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";
import { useFerramentasTabData } from "../../hooks/useFerramentasTabData";
import { TabUploadDropzone } from "./TabBaseLayout";
import {
	buildCidadeRegionalMap,
	extractCidadeFromEndereco,
	normalizeText,
} from "../../utils/ferramentasTabUtils";

const TabMensal = () => {
	const { regionais } = useFerramentasRegionais();

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

	const { status, setStatus, rows, fname, inputRef, load } =
		useFerramentasTabData({
			transformRows: (data) =>
				data.map((r) => {
					const tecRaw = extractTec(r.tecnicos ?? r.tecnico ?? "");
					const cidadeExtr = extractCidadeFromEndereco(
						r.enderecoinstalacao || r.endereco || "",
					);
					const cidade = cidadeExtr || r.cidade || "N/A";
					const info = cidMap[normalizeText(cidade)] || {};
					return {
						...r,
						_tecnico: tecRaw,
						_cidade: cidade,
						_servico: String(r.servico || r.servicos || "N/A"),
						_regional: info.regional || "Sem Regional",
						_agente: info.agente ? "SIM" : "NAO",
						_tectipo: tecSet.has(normalizeText(tecRaw)) ? "RETIRADA" : "ATIVA",
					};
				}),
		});
	const gerar = async () => {
		if (!rows.length) return;
		setStatus("generating");
		try {
			const D = rows;
			const wb = new ExcelJS.Workbook();
			wb.creator = "Sempre";
			wb.created = new Date();

			const C = (hex) => ({ argb: "FF" + hex });
			const xH = (ws, row, col, val, color = "003087") => {
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
			const xD = (
				ws,
				row,
				col,
				val,
				bg = "FFFFFF",
				align = "left",
				bold = false,
			) => {
				const c = ws.getCell(row, col);
				c.value = val ?? "";
				c.font = { name: "Arial", size: 10, bold };
				c.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				c.alignment = { horizontal: align, vertical: "middle" };
				const b = { style: "thin", color: C("D0D0D0") };
				c.border = { left: b, right: b, top: b, bottom: b };
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
				vc.font = { name: "Arial", bold: true, size: 22, color: C(cor) };
				vc.fill = { type: "pattern", pattern: "solid", fgColor: C("F5F5F5") };
				vc.alignment = { horizontal: "center" };
				ws.getRow(r + 1).height = 48;
			};

			// -- ABA 1: Por Regional -----------------------------------------------
			const ws1 = wb.addWorksheet("Por Regional");
			ws1.views = [{ showGridLines: false }];
			xT(
				ws1,
				1,
				6,
				`ANALISE MENSAL — ${D.length} registros — ${new Date().toLocaleDateString("pt-BR")}`,
				"003087",
			);
			xKpi(ws1, 3, 1, "TOTAL O.S", D.length, "003087");
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
			xKpi(
				ws1,
				3,
				5,
				"RETIRADAS",
				D.filter((r) => r._tectipo === "RETIRADA").length,
				"1F618D",
			);
			xKpi(
				ws1,
				3,
				6,
				"ATIVAS",
				D.filter((r) => r._tectipo === "ATIVA").length,
				"1E8449",
			);

			let rr = 6;
			xT(ws1, rr, 6, "POR REGIONAL", "003087");
			rr++;
			[
				"Regional",
				"Total O.S",
				"Ativa",
				"Retirada",
				"Ag. Aut.",
				"% Total",
			].forEach((h, i) => xH(ws1, rr, i + 1, h, "003087"));
			rr++;

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
					const bg = i % 2 ? "FFFFFF" : "EBF5FB";
					xD(ws1, rr, 1, reg, bg, "left", true);
					xD(ws1, rr, 2, v.q, bg, "center");
					xD(ws1, rr, 3, v.ativa, bg, "center");
					xD(ws1, rr, 4, v.retirada, v.retirada > 0 ? "EBF5FB" : bg, "center");
					xD(ws1, rr, 5, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
					xD(
						ws1,
						rr,
						6,
						`${((v.q / D.length) * 100).toFixed(1)}%`,
						bg,
						"center",
					);
					rr++;
				});
			[30, 12, 12, 14, 12, 12].forEach((w, i) => {
				ws1.getColumn(i + 1).width = w;
			});

			// -- ABA 2: Por Cidade -------------------------------------------------
			const ws2 = wb.addWorksheet("Por Cidade");
			ws2.views = [{ showGridLines: false }];
			xT(ws2, 1, 6, "POR CIDADE", "1F618D");
			["Cidade", "Regional", "Total", "Ativa", "Retirada", "Ag. Aut."].forEach(
				(h, i) => xH(ws2, 2, i + 1, h, "1F618D"),
			);
			const byCid = {};
			D.forEach((r) => {
				const c = r._cidade;
				if (!byCid[c])
					byCid[c] = {
						q: 0,
						regional: r._regional,
						ativa: 0,
						retirada: 0,
						ag: 0,
					};
				byCid[c].q++;
				if (r._agente === "SIM") byCid[c].ag++;
				else if (r._tectipo === "RETIRADA") byCid[c].retirada++;
				else byCid[c].ativa++;
			});
			Object.entries(byCid)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([cid, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "EAF4FB";
					xD(ws2, i + 3, 1, cid, bg, "left", true);
					xD(ws2, i + 3, 2, v.regional, bg);
					xD(ws2, i + 3, 3, v.q, bg, "center");
					xD(ws2, i + 3, 4, v.ativa, bg, "center");
					xD(
						ws2,
						i + 3,
						5,
						v.retirada,
						v.retirada > 0 ? "EBF5FB" : bg,
						"center",
					);
					xD(ws2, i + 3, 6, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
				});
			[28, 28, 12, 12, 14, 12].forEach((w, i) => {
				ws2.getColumn(i + 1).width = w;
			});

			// -- ABA 3: Por Serviço ------------------------------------------------
			const ws3 = wb.addWorksheet("Por Serviço");
			ws3.views = [{ showGridLines: false }];
			xT(ws3, 1, 3, "POR TIPO DE SERVICO", "6C3483");
			["Serviço", "Total", "% do Total"].forEach((h, i) =>
				xH(ws3, 2, i + 1, h, "6C3483"),
			);
			const bySvc = {};
			D.forEach((r) => {
				const s = r._servico;
				bySvc[s] = (bySvc[s] || 0) + 1;
			});
			Object.entries(bySvc)
				.sort((a, b) => b[1] - a[1])
				.forEach(([svc, q], i) => {
					const bg = i % 2 ? "FFFFFF" : "F5EEF8";
					xD(ws3, i + 3, 1, svc, bg);
					xD(ws3, i + 3, 2, q, bg, "center");
					xD(
						ws3,
						i + 3,
						3,
						`${((q / D.length) * 100).toFixed(1)}%`,
						bg,
						"center",
					);
				});
			[46, 12, 14].forEach((w, i) => {
				ws3.getColumn(i + 1).width = w;
			});

			// -- ABA 4: Por Técnico ------------------------------------------------
			const ws4 = wb.addWorksheet("Por Técnico");
			ws4.views = [{ showGridLines: false }];
			xT(ws4, 1, 5, "POR TECNICO", "2C3E50");
			["Técnico", "Tipo", "Total O.S", "Regional Principal", "% Total"].forEach(
				(h, i) => xH(ws4, 2, i + 1, h, "566573"),
			);
			const byTec = {};
			D.forEach((r) => {
				const t = r._tecnico;
				if (!byTec[t]) byTec[t] = { q: 0, tipo: r._tectipo, regs: {} };
				byTec[t].q++;
				byTec[t].regs[r._regional] = (byTec[t].regs[r._regional] || 0) + 1;
			});
			Object.entries(byTec)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([tec, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "F2F3F4";
					const retBg = v.tipo === "RETIRADA" ? "EBF5FB" : bg;
					const regPrinc =
						Object.entries(v.regs).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
					xD(ws4, i + 3, 1, tec, bg, "left", true);
					xD(ws4, i + 3, 2, v.tipo, retBg, "center");
					xD(ws4, i + 3, 3, v.q, bg, "center");
					xD(ws4, i + 3, 4, regPrinc, bg);
					xD(
						ws4,
						i + 3,
						5,
						`${((v.q / D.length) * 100).toFixed(1)}%`,
						bg,
						"center",
					);
				});
			[32, 14, 12, 30, 12].forEach((w, i) => {
				ws4.getColumn(i + 1).width = w;
			});

			// -- ABA 5: Dados Completos --------------------------------------------
			const ws5 = wb.addWorksheet("Dados Completos");
			ws5.views = [{ showGridLines: false }];
			xT(ws5, 1, 7, "DADOS COMPLETOS", "2C3E50");
			[
				"Código",
				"Serviço",
				"Cidade",
				"Regional",
				"Técnico",
				"Tipo Tec.",
				"Ag. Aut.",
			].forEach((h, i) => xH(ws5, 2, i + 1, h, "566573"));
			D.forEach((r, i) => {
				const bg = i % 2 ? "FFFFFF" : "F2F3F4";
				const retBg = r._tectipo === "RETIRADA" ? "EBF5FB" : bg;
				xD(ws5, i + 3, 1, String(r.codigocliente || r.codigo || ""), bg);
				xD(ws5, i + 3, 2, r._servico, bg);
				xD(ws5, i + 3, 3, r._cidade, bg);
				xD(ws5, i + 3, 4, r._regional, bg);
				xD(ws5, i + 3, 5, r._tecnico, bg);
				xD(ws5, i + 3, 6, r._tectipo, retBg, "center");
				xD(
					ws5,
					i + 3,
					7,
					r._agente,
					r._agente === "SIM" ? "FEF9E7" : bg,
					"center",
				);
			});
			[20, 46, 26, 26, 30, 14, 12].forEach((w, i) => {
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
			a.download = `analise-mensal-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
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
			<TabUploadDropzone
				inputRef={inputRef}
				onChange={load}
				status={status}
				fileName={fname}
				rowCount={rows.length}
				icon="📊"
				expectedFields="codigocliente · servico · cidade · tecnicos"
			/>

			{/* Preview KPIs */}
			{rows.length > 0 && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					{[
						["Total O.S", rows.length, "text-blue-700"],
						[
							"Cidades",
							new Set(rows.map((r) => r._cidade)).size,
							"text-green-700",
						],
						[
							"Regionais",
							new Set(rows.map((r) => r._regional)).size,
							"text-purple-700",
						],
						[
							"Agentes Aut.",
							rows.filter((r) => r._agente === "SIM").length,
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

			{/* Botao gerar */}
			{rows.length > 0 && (
				<button
					type="button"
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors"
				>
					<FileDown size={16} />
					Gerar Analise Mensal (5 abas)
				</button>
			)}

			{status === "generating" && (
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

export default TabMensal;

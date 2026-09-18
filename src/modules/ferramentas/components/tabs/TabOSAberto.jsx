import ExcelJS from "exceljs";
import { FileDown } from "lucide-react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";

const normCod = (v) =>
	String(v ?? "")
		.trim()
		.toLowerCase()
		.replace(/\D/g, "");

const TabOSAberto = () => {
	const { regionais } = useFerramentasRegionais();
	const [atFile, setAtFile] = useState(null);
	const [osFile, setOsFile] = useState(null);
	const [atRows, setAtRows] = useState([]);
	const [osRows, setOsRows] = useState([]);
	const [resultado, setResultado] = useState(null);
	const [status, setStatus] = useState(null);
	const atRef = useRef();
	const osRef = useRef();

	const cidMap = {};
	(regionais || []).forEach((r) => {
		(r.cidades || []).forEach((c) => {
			cidMap[String(c.nome).trim().toLowerCase()] = {
				regional: r.nome,
				agente: c.agente,
			};
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
		if (!endereco) return null;
		const s = String(endereco);
		const m = s.match(/,\s*([^,|/\n]+?)\/[A-Z]{2}(?:\s*\||$)/i);
		if (m) return m[1].trim();
		const m2 = s.match(/,\s*([^,|\n]+?)\s*\|\s*CEP/i);
		if (m2)
			return m2[1]
				.trim()
				.replace(/\/[A-Z]{2}$/, "")
				.trim();
		return null;
	};

	const getInfo = (cidade) =>
		cidMap[
			String(cidade || "")
				.trim()
				.toLowerCase()
		] || { regional: "Sem Regional", agente: false };

	const extractTec = (v) =>
		String(v || "")
			.split("|")[0]
			.trim() || "N/D";

	const parseDate = (v) => {
		if (!v) return null;
		const s = String(v).trim().split(" ")[0];
		const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
		if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
		const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
		const d = new Date(s);
		return Number.isNaN(d) ? null : d;
	};

	const loadFile = (e, setName, setRows) => {
		const f = e.target.files[0];
		if (!f) return;
		setName(f.name);
		setResultado(null);
		const reader = new FileReader();
		reader.onload = (ev) => {
			const wb = XLSX.read(ev.target.result, { type: "array" });
			const ws = wb.Sheets[wb.SheetNames[0]];
			setRows(
				normKeys(XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" })),
			);
		};
		reader.readAsArrayBuffer(f);
	};

	const confrontar = () => {
		if (!atRows.length || !osRows.length) return;
		// atRows = planilha de atendimentos/inadimplentes com codigocliente
		// osRows = planilha de O.S abertas com codigocliente
		const atCods = new Set(
			atRows.map((r) => normCod(r.codigocliente || r.codigo || "")),
		);
		const match = osRows
			.filter((r) => atCods.has(normCod(r.codigocliente || r.codigo || "")))
			.map((r) => {
				const cidadeExtr = extractCidade(
					r.enderecoinstalacao || r.endereco || "",
				);
				const cidade = cidadeExtr || r.cidade || "N/A";
				const info = getInfo(cidade);
				const datAb = parseDate(
					r.dataabertura || r.datacriacao || r.data || "",
				);
				return {
					...r,
					_tecnico: extractTec(r.tecnicos ?? r.tecnico ?? ""),
					_cidade: cidade,
					_regional: info.regional,
					_agente: info.agente ? "SIM" : "NAO",
					_datAb: datAb,
					_datAbStr: datAb ? datAb.toLocaleDateString("pt-BR") : "",
				};
			});
		setResultado(match);
	};

	const gerar = async () => {
		if (!resultado?.length) return;
		setStatus("gerando");
		try {
			const wb = new ExcelJS.Workbook();
			wb.creator = "Sempre";
			const C = (hex) => ({ argb: "FF" + hex });
			const xH = (ws, r, c, v, bg = "DE350B") => {
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
			const xT = (ws, r, n, text, bg = "DE350B") => {
				ws.mergeCells(r, 1, r, n);
				const cell = ws.getCell(r, 1);
				cell.value = text;
				cell.font = { name: "Arial", bold: true, size: 14, color: C("FFFFFF") };
				cell.fill = { type: "pattern", pattern: "solid", fgColor: C(bg) };
				cell.alignment = { horizontal: "center", vertical: "middle" };
				ws.getRow(r).height = 36;
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

			// -- ABA 1: O.S em Aberto ----------------------------------------------
			const ws1 = wb.addWorksheet("O.S em Aberto");
			ws1.views = [{ showGridLines: false }];
			xT(
				ws1,
				1,
				6,
				`O.S EM ABERTO — ${resultado.length} registros — ${new Date().toLocaleDateString("pt-BR")}`,
				"DE350B",
			);
			xKpi(ws1, 3, 1, "TOTAL", resultado.length, "DE350B");
			xKpi(
				ws1,
				3,
				2,
				"CIDADES",
				new Set(resultado.map((r) => r._cidade)).size,
				"1F618D",
			);
			xKpi(
				ws1,
				3,
				3,
				"REGIONAIS",
				new Set(resultado.map((r) => r._regional)).size,
				"6C3483",
			);
			xKpi(
				ws1,
				3,
				4,
				"AGENTES AUT.",
				resultado.filter((r) => r._agente === "SIM").length,
				"B7950B",
			);

			let rr = 6;
			[
				"N° O.S",
				"Código",
				"Técnico",
				"Cidade",
				"Regional",
				"Ag. Aut.",
				"Data Abertura",
			].forEach((h, i) => xH(ws1, rr, i + 1, h, "DE350B"));
			rr++;
			resultado
				.slice()
				.sort((a, b) => (a._datAb || 0) - (b._datAb || 0))
				.forEach((r, i) => {
					const bg = i % 2 ? "FFFFFF" : "FFF0F0";
					xD(ws1, rr, 1, String(r.numos || r.numeroos || ""), bg);
					xD(ws1, rr, 2, String(r.codigocliente || r.codigo || ""), bg);
					xD(ws1, rr, 3, r._tecnico, bg);
					xD(ws1, rr, 4, r._cidade, bg);
					xD(ws1, rr, 5, r._regional, bg);
					xD(
						ws1,
						rr,
						6,
						r._agente,
						r._agente === "SIM" ? "FEF9E7" : bg,
						"center",
					);
					xD(ws1, rr, 7, r._datAbStr, bg, "center");
					rr++;
				});
			[18, 16, 28, 26, 26, 12, 14].forEach((w, i) => {
				ws1.getColumn(i + 1).width = w;
			});

			// -- ABA 2: Por Regional -----------------------------------------------
			const ws2 = wb.addWorksheet("Por Regional");
			ws2.views = [{ showGridLines: false }];
			xT(ws2, 1, 4, "O.S EM ABERTO — POR REGIONAL", "1F618D");
			["Regional", "Total O.S", "Cidades", "Agentes Aut."].forEach((h, i) =>
				xH(ws2, 2, i + 1, h, "1F618D"),
			);
			const byReg = {};
			resultado.forEach((r) => {
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
					xD(ws2, i + 3, 1, reg, bg, "left", true);
					xD(ws2, i + 3, 2, v.q, bg, "center");
					xD(ws2, i + 3, 3, v.cidades.size, bg, "center");
					xD(ws2, i + 3, 4, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
				});
			[30, 12, 12, 14].forEach((w, i) => {
				ws2.getColumn(i + 1).width = w;
			});

			// -- ABA 3: Por Cidade -------------------------------------------------
			const ws3 = wb.addWorksheet("Por Cidade");
			ws3.views = [{ showGridLines: false }];
			xT(ws3, 1, 4, "O.S EM ABERTO — POR CIDADE", "6C3483");
			["Cidade", "Regional", "Total O.S", "Ag. Aut."].forEach((h, i) =>
				xH(ws3, 2, i + 1, h, "6C3483"),
			);
			const byCid = {};
			resultado.forEach((r) => {
				const c = r._cidade;
				if (!byCid[c]) byCid[c] = { q: 0, regional: r._regional, ag: 0 };
				byCid[c].q++;
				if (r._agente === "SIM") byCid[c].ag++;
			});
			Object.entries(byCid)
				.sort((a, b) => b[1].q - a[1].q)
				.forEach(([cid, v], i) => {
					const bg = i % 2 ? "FFFFFF" : "F5EEF8";
					xD(ws3, i + 3, 1, cid, bg, "left", true);
					xD(ws3, i + 3, 2, v.regional, bg);
					xD(ws3, i + 3, 3, v.q, bg, "center");
					xD(ws3, i + 3, 4, v.ag, v.ag > 0 ? "FEF9E7" : bg, "center");
				});
			[28, 28, 12, 14].forEach((w, i) => {
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
			a.download = `os-aberto-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
			setStatus("ok");
		} catch (e) {
			console.error(e);
			setStatus("err");
		}
	};

	const UZone = ({ label, sub, fname, inputRef, onChange }) => (
		<div
			className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${fname ? "border-green-400 bg-green-50" : "border-gray-200 bg-white hover:border-red-400"}`}
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
				onChange={onChange}
			/>
			<span className="text-3xl block mb-2">{fname ? "✅" : "📂"}</span>
			{fname ? (
				<p className="font-semibold text-green-700 text-sm">{fname}</p>
			) : (
				<>
					<p className="font-semibold text-gray-700 text-sm">{label}</p>
					<p className="text-xs text-gray-400 mt-1">{sub}</p>
				</>
			)}
		</div>
	);

	return (
		<div className="space-y-4">
			{/* Upload dois arquivos */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<UZone
					label="Planilha de Atendimentos"
					sub="codigocliente dos inadimplentes/pendentes"
					fname={atFile}
					inputRef={atRef}
					onChange={(e) => loadFile(e, setAtFile, setAtRows)}
				/>
				<UZone
					label="Planilha de O.S Abertas"
					sub="numos · codigocliente · tecnico · endereco"
					fname={osFile}
					inputRef={osRef}
					onChange={(e) => loadFile(e, setOsFile, setOsRows)}
				/>
			</div>

			{/* Botao confrontar */}
			{atRows.length > 0 && osRows.length > 0 && (
				<button
					onClick={confrontar}
					className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors"
				>
					🔍 Confrontar — {atRows.length} atend. × {osRows.length} O.S
				</button>
			)}

			{/* Resultado */}
			{resultado !== null && (
				<div
					className={`rounded-xl border p-4 ${resultado.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}
				>
					{resultado.length > 0 ? (
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
							{[
								["O.S em Aberto", resultado.length, "text-red-700"],
								[
									"Cidades",
									new Set(resultado.map((r) => r._cidade)).size,
									"text-blue-700",
								],
								[
									"Regionais",
									new Set(resultado.map((r) => r._regional)).size,
									"text-purple-700",
								],
								[
									"Agentes Aut.",
									resultado.filter((r) => r._agente === "SIM").length,
									"text-yellow-600",
								],
							].map(([lbl, val, cls]) => (
								<div
									key={lbl}
									className="bg-white border border-gray-200 rounded-xl p-3 text-center"
								>
									<div className={`text-2xl font-bold ${cls}`}>{val}</div>
									<div className="text-xs text-gray-400 uppercase tracking-wide mt-1">
										{lbl}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-green-700 font-semibold text-center">
							✅ Nenhuma O.S em aberto encontrada!
						</p>
					)}
				</div>
			)}

			{/* Botao gerar */}
			{resultado?.length > 0 && (
				<button
					onClick={gerar}
					className="flex items-center gap-2 px-5 py-2.5 bg-red-700 text-white rounded-xl font-semibold hover:bg-red-800 transition-colors"
				>
					<FileDown size={16} />
					Gerar O.S em Aberto (3 abas)
				</button>
			)}

			{status === "gerando" && (
				<p className="text-sm text-red-600 font-medium animate-pulse">
					⏳ Gerando Excel...
				</p>
			)}
			{status === "err" && (
				<p className="text-sm text-red-600">❌ Erro ao gerar o arquivo.</p>
			)}
		</div>
	);
};

export default TabOSAberto;

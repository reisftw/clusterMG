import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { buildMetaDiariaSchedule } from "../../../utils/metasProjection";

import { addClusterLogo } from "../../../utils/pdfBranding";

const MESES = [
	"Janeiro",
	"Fevereiro",
	"Marco",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

// Extraidos pra achado javascript:S3358 (ternario aninhado).
function resolveStatusLabel(percentAchieved, falta) {
	if (Number.parseFloat(percentAchieved) >= 100) return "Atingido";
	if (falta > 0) return `Faltam ${falta.toLocaleString("pt-BR")} OS`;
	return "Em andamento";
}

function formatSaldoDiaLabel(util, saldoDia) {
	if (!util) return "—";
	return saldoDia >= 0 ? `+${saldoDia}` : String(saldoDia);
}

function isDiaUtil(mes, dia, feriadosSet) {
	const mIdx = MESES.indexOf(mes);
	if (mIdx < 0) return true;
	const m = mIdx + 1;
	const ano = new Date().getFullYear();
	const dt = new Date(ano, m - 1, dia);
	if (dt.getDay() === 0 || dt.getDay() === 6) return false;
	const key = `${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
	return !feriadosSet.has(key);
}

// Extraidos de gerarPDF (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// — cada um e o mesmo callback didParseCell de antes, so nomeado e
// movido pra fora do literal de opcoes do autoTable() (sem mudar nenhuma
// regra de estilo/cor).
function styleResumoAnualCell(data) {
	if (data.section === "body" && data.column.index === 7) {
		const v = data.cell.raw;
		if (v === "Atingido") data.cell.styles.textColor = [22, 163, 74];
		else if (String(v).startsWith("Faltam"))
			data.cell.styles.textColor = [220, 38, 38];
	}
	if (data.section === "body" && data.column.index === 6) {
		const v = String(data.cell.raw);
		let color = [30, 30, 30];
		if (v.startsWith("+")) color = [22, 163, 74];
		else if (v.startsWith("-")) color = [220, 38, 38];
		data.cell.styles.textColor = color;
	}
}

function styleSaldoMesCell(data, saldoRecalc) {
	if (data.section !== "body") return;
	const rowData = saldoRecalc[data.row.index];
	if (rowData && !rowData.util) {
		data.cell.styles.textColor = [180, 180, 180];
	}
	if (data.column.index === 7 && data.section === "body") {
		const v = String(data.cell.raw);
		if (v.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
		else if (v.startsWith("-")) data.cell.styles.textColor = [220, 38, 38];
	}
	if (data.column.index === 8 && data.section === "body") {
		const v = Number.parseFloat(data.cell.raw);
		if (!Number.isNaN(v))
			data.cell.styles.textColor = v >= 0 ? [22, 163, 74] : [220, 38, 38];
	}
}

async function gerarPDF(dados, feriadosSet) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");

	const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	const W = doc.internal.pageSize.getWidth();
	const agora = new Date();
	const dataGeracao = `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;

	// -- cabecalho --------------------------------------------------------------
	doc.setFillColor(37, 99, 235); // blue-600
	doc.rect(0, 0, W, 22, "F");
	doc.setTextColor(255, 255, 255);
	doc.setFontSize(14);
	doc.setFont("helvetica", "bold");
	doc.text("Retirada FTTH · Relatorio 2026", 14, 10);
	doc.setFontSize(8);
	doc.setFont("helvetica", "normal");
	doc.text(`Gerado em ${dataGeracao}`, 14, 17);
	await addClusterLogo(doc, { width: 24, height: 12, y: 5, marginRight: 12 });

	let y = 30;

	// -- resumo anual -----------------------------------------------------------
	doc.setTextColor(30, 30, 30);
	doc.setFontSize(11);
	doc.setFont("helvetica", "bold");
	doc.text("Resumo Anual", 14, y);
	y += 5;

	const resumoRows = MESES.filter(
		(mes) => dados[mes] && dados[mes].totalOS > 0,
	).map((mes) => {
		const m = dados[mes];
		const saldo = m.saldoDiario?.length
			? m.saldoDiario[m.saldoDiario.length - 1].saldoMes
			: 0;
		const falta = Math.max(0, m.meta - m.totalOS);
		const status = resolveStatusLabel(m.percentAchieved, falta);
		return [
			mes,
			Math.round(m.cancelamentos).toLocaleString("pt-BR"),
			`${m.metaModeLabel || "Meta sazonal"} ${m.metaSazonal ?? 80}%`,
			Math.round(m.meta).toLocaleString("pt-BR"),
			Number(m.totalOS).toLocaleString("pt-BR"),
			`${m.percentAchieved}%`,
			saldo >= 0 ? `+${saldo}` : String(saldo),
			status,
		];
	});

	autoTable(doc, {
		startY: y,
		head: [
			[
				"Mes",
				"Cancelamentos",
				"Regra Meta",
				"Meta OS",
				"Realizado",
				"% Total",
				"Saldo Final",
				"Status",
			],
		],
		body: resumoRows,
		styles: { fontSize: 8, cellPadding: 2 },
		headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
		alternateRowStyles: { fillColor: [243, 244, 246] },
		columnStyles: {
			0: { fontStyle: "bold" },
			5: { halign: "center" },
			6: { halign: "center" },
			7: { halign: "center" },
		},
		didParseCell: styleResumoAnualCell,
	});

	// -- detalhe por mes --------------------------------------------------------
	const mesesComDados = MESES.filter(
		(mes) => dados[mes] && dados[mes].totalOS > 0,
	);

	for (const mes of mesesComDados) {
		const m = dados[mes];
		doc.addPage();

		// cabecalho da pagina
		doc.setFillColor(37, 99, 235);
		doc.rect(0, 0, W, 16, "F");
		doc.setTextColor(255, 255, 255);
		doc.setFontSize(12);
		doc.setFont("helvetica", "bold");
		doc.text(`${mes} 2026 · Detalhamento`, 14, 11);

		y = 24;

		// KPIs
		const { diasUteis, metaDiariaMedia, metaPorDia } = buildMetaDiariaSchedule({
			month: mes,
			meta: m.meta,
			feriadosSet,
		});
		const metaDiaria = diasUteis > 0 ? Math.ceil(metaDiariaMedia) : 0;
		const falta = Math.max(0, m.meta - m.totalOS);

		const kpis = [
			["Cancelamentos", Math.round(m.cancelamentos).toLocaleString("pt-BR")],
			[m.metaModeLabel || "Meta sazonal", `${m.metaSazonal ?? 80}%`],
			["Meta OS", Math.round(m.meta).toLocaleString("pt-BR")],
			["Realizado", Number(m.totalOS).toLocaleString("pt-BR")],
			["% Atingido", `${m.percentAchieved}%`],
			["Falta", falta > 0 ? falta.toLocaleString("pt-BR") : "—"],
			["Dias Uteis", String(diasUteis)],
			["Meta Diaria", `${metaDiaria} OS/dia`],
		];

		doc.setTextColor(30, 30, 30);
		doc.setFontSize(9);
		doc.setFont("helvetica", "bold");
		doc.text("Indicadores do mes", 14, y);
		y += 4;

		// grid de KPIs 4 colunas
		const colW = (W - 28) / 4;
		kpis.forEach(([label, value], i) => {
			const col = i % 4;
			const row = Math.floor(i / 4);
			const x = 14 + col * colW;
			const ky = y + row * 16;

			doc.setFillColor(248, 250, 252);
			doc.roundedRect(x, ky, colW - 2, 13, 2, 2, "F");
			doc.setTextColor(100, 116, 139);
			doc.setFontSize(7);
			doc.setFont("helvetica", "normal");
			doc.text(label, x + 2, ky + 4);
			doc.setTextColor(30, 30, 30);
			doc.setFontSize(9);
			doc.setFont("helvetica", "bold");
			doc.text(String(value), x + 2, ky + 10);
		});

		y += Math.ceil(kpis.length / 4) * 16 + 6;

		// top tecnicos
		if (m.technicians?.length) {
			doc.setFontSize(9);
			doc.setFont("helvetica", "bold");
			doc.setTextColor(30, 30, 30);
			doc.text("Top Tecnicos", 14, y);
			y += 3;

			autoTable(doc, {
				startY: y,
				head: [["#", "Tecnico", "Total OS"]],
				body: m.technicians
					.slice(0, 7)
					.map((t, i) => [
						`${i + 1}º`,
						t.name,
						Number(t.total).toLocaleString("pt-BR"),
					]),
				styles: { fontSize: 8, cellPadding: 2 },
				headStyles: {
					fillColor: [100, 116, 139],
					textColor: 255,
					fontStyle: "bold",
				},
				alternateRowStyles: { fillColor: [248, 250, 252] },
				columnStyles: {
					0: { halign: "center", cellWidth: 10 },
					2: { halign: "center" },
				},
				tableWidth: 90,
				margin: { left: 14 },
			});

			const afterTec = doc.lastAutoTable.finalY;

			// top regionais (ao lado)
			if (m.regionais?.length) {
				doc.setFontSize(9);
				doc.setFont("helvetica", "bold");
				doc.setTextColor(30, 30, 30);
				doc.text("Top Regionais", W / 2 + 2, y);

				autoTable(doc, {
					startY: y + 3,
					head: [["#", "Regional", "Total OS"]],
					body: m.regionais
						.slice(0, 7)
						.map((r, i) => [
							`${i + 1}º`,
							r.name,
							Number(r.total).toLocaleString("pt-BR"),
						]),
					styles: { fontSize: 8, cellPadding: 2 },
					headStyles: {
						fillColor: [100, 116, 139],
						textColor: 255,
						fontStyle: "bold",
					},
					alternateRowStyles: { fillColor: [248, 250, 252] },
					columnStyles: {
						0: { halign: "center", cellWidth: 10 },
						2: { halign: "center" },
					},
					tableWidth: 90,
					margin: { left: W / 2 + 2 },
				});

				y = Math.max(afterTec, doc.lastAutoTable.finalY) + 8;
			} else {
				y = afterTec + 8;
			}
		}

		// saldo diario
		if (m.saldoDiario?.length) {
			doc.setFontSize(9);
			doc.setFont("helvetica", "bold");
			doc.setTextColor(30, 30, 30);
			doc.text("Saldo Diario", 14, y);
			y += 3;

			const saldoRecalc = m.saldoDiario.map((r) => ({
				...r,
				util: isDiaUtil(mes, r.dia, feriadosSet),
				metaDia: isDiaUtil(mes, r.dia, feriadosSet)
					? metaPorDia.get(Number(r.dia)) || 0
					: 0,
			}));

			autoTable(doc, {
				startY: y,
				head: [
					[
						"Dia",
						"Equipe Tec.",
						"Agente",
						"Loja",
						"Regionais",
						"Total Dia",
						"Meta Dia",
						"Saldo Dia",
						"Saldo Mes",
					],
				],
				body: saldoRecalc.map((r) => [
					String(r.dia),
					String(r.equipe ?? 0),
					String(r.agente ?? 0),
					String(r.loja ?? 0),
					String(r.regionais ?? 0),
					String(r.totalDia ?? 0),
					r.util ? String(metaDiaria) : "—",
					formatSaldoDiaLabel(r.util, r.totalDia - metaDiaria),
					String(r.saldoMes ?? 0),
				]),
				styles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
				headStyles: {
					fillColor: [37, 99, 235],
					textColor: 255,
					fontStyle: "bold",
					fontSize: 7,
				},
				alternateRowStyles: { fillColor: [243, 244, 246] },
				didParseCell: (data) => styleSaldoMesCell(data, saldoRecalc),
			});
		}
	}

	// -- rodape em todas as paginas ---------------------------------------------
	const totalPages = doc.getNumberOfPages();
	for (let i = 1; i <= totalPages; i++) {
		doc.setPage(i);
		const H = doc.internal.pageSize.getHeight();
		doc.setFillColor(248, 250, 252);
		doc.rect(0, H - 8, W, 8, "F");
		doc.setTextColor(150, 150, 150);
		doc.setFontSize(7);
		doc.setFont("helvetica", "normal");
		doc.text("Retirada FTTH 2026 · Sistema de Gestao", 14, H - 3);
		doc.text(`Pagina ${i} de ${totalPages}`, W - 14, H - 3, { align: "right" });
	}

	doc.save(
		`Relatorio_FTTH_2026_${dataGeracao.replace(/[/:]/g, "-").replace(" ", "_")}.pdf`,
	);
}

const MetasExportPDF = ({ allData, feriadosSet = new Set() }) => {
	const [loading, setLoading] = useState(false);

	const handleExport = async () => {
		if (!allData || Object.keys(allData).length === 0) return;
		setLoading(true);
		try {
			await gerarPDF(allData, feriadosSet);
		} catch (e) {
			console.error("[MetasExportPDF] Erro ao gerar PDF:", e);
		} finally {
			setLoading(false);
		}
	};

	return (
		<button
			type="button"
			onClick={handleExport}
			disabled={loading}
			className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
		>
			{loading ? (
				<Loader2 size={15} className="animate-spin" />
			) : (
				<FileDown size={15} />
			)}
			{loading ? "Gerando PDF..." : "Exportar PDF"}
		</button>
	);
};

export default MetasExportPDF;

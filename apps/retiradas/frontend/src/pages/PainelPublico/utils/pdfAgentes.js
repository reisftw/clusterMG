import { formatarDataGeracao, imprimirHtml } from "../../../utils/impressao";
import { obterMesesAnteriores } from "../../../utils/mes";

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
const PRINT_ONE_PAGE_OPTIONS = {
	areaId: "pdf-print-area",
	styleId: "pdf-print-style",
	pageCss: `
      @page { size: A4 portrait; margin: 7mm; }
      #pdf-print-area { width: 196mm !important; max-width: 196mm !important; margin: 0 auto !important; }
      #pdf-print-area, #pdf-print-area * { box-sizing: border-box !important; }
      #pdf-print-area .one-page-report { min-height: auto !important; page-break-after: avoid !important; }
      #pdf-print-area .avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
    `,
};

function reportLogoHtml() {
	return `
    <div style="width:118px;height:46px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;padding:8px;box-shadow:0 8px 20px rgba(0,0,0,.12)">
      <img src="/sempre-logo-documento.png" alt="Sempre Internet" style="display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain" />
    </div>`;
}

function reportHeaderHtml({ title, subtitle, badge, dataGeracao }) {
	return `
  <div class="avoid-break" style="background:linear-gradient(135deg,#002A78 0%,#003087 58%,#0052CC 100%);padding:12px 15px;border-radius:13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;gap:14px;color:#fff">
    <div style="display:flex;align-items:center;gap:14px;min-width:0">
      ${reportLogoHtml()}
      <div style="min-width:0">
        <div style="font-size:8px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;opacity:.72">Agentes Autorizados · Sempre Internet</div>
        <div style="font-size:21px;font-weight:900;line-height:1.08;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        <div style="font-size:10px;opacity:.82;margin-top:3px">${subtitle}</div>
      </div>
    </div>
    <div style="text-align:right;flex:0 0 auto">
      <div style="display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:5px 10px;font-size:10px;font-weight:900">${badge}</div>
      <div style="font-size:8px;opacity:.68;margin-top:6px">Gerado em ${dataGeracao}</div>
    </div>
  </div>`;
}

function compactMetricCardHtml({ label, value, color = "#003087" }) {
	return `
    <div style="border:1px solid #DDE3EE;border-radius:9px;padding:7px 9px;background:#F8FAFC;border-top:3px solid ${color}">
      <div style="font-size:7px;color:#6B7897;text-transform:uppercase;font-weight:900;letter-spacing:.7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      <div style="font-size:18px;font-weight:900;line-height:1.05;color:${color};margin-top:3px">${value}</div>
    </div>`;
}

function normalizarNumero(value) {
	return Math.round(Number(value) || 0);
}

async function carregarImagemDataUrl(src) {
	try {
		const response = await fetch(src);
		const blob = await response.blob();
		return await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

function getPerformanceStatus(pct) {
	if (pct > 100) {
		return {
			key: "over",
			color: "#7c3aed",
			bg: "#F3E8FF",
			text: "Acima da Meta",
		};
	}
	if (pct >= 80) {
		return {
			key: "atingido",
			color: "#00875A",
			bg: "#E3FCEF",
			text: "Meta Atingida",
		};
	}
	if (pct >= 50) {
		return {
			key: "andamento",
			color: "#FF8B00",
			bg: "#FFF3CD",
			text: "Em Andamento",
		};
	}
	return {
		key: "abaixo",
		color: "#DE350B",
		bg: "#FFEBE6",
		text: "Abaixo da Meta",
	};
}

function getFaltaInfo(falta) {
	const value = Number.parseFloat(falta.toFixed(1));
	if (falta < 0) {
		return {
			display: `+${Math.abs(value)}`,
			text: `${Math.abs(value)} acima da meta`,
		};
	}
	if (falta === 0) {
		return {
			display: value,
			text: "Meta cumprida",
		};
	}
	return {
		display: value,
		text: `${value} retiradas pendentes`,
	};
}

function getDailyCellStyle(value) {
	return {
		bg: value > 0 ? "#E6EEFF" : "#F4F6FA",
		color: value > 0 ? "#003087" : "#aaa",
	};
}

function getThreeMonthAlertTone(mesesAbaixoCount) {
	if (mesesAbaixoCount === 0) {
		return { bg: "#E3FCEF", border: "#00875A", color: "#00875A" };
	}
	if (mesesAbaixoCount >= 2) {
		return { bg: "#FFEBE6", border: "#DE350B", color: "#DE350B" };
	}
	return { bg: "#FFF3CD", border: "#FF8B00", color: "#7A5700" };
}

function getThreeMonthAlertTitle({ mesesAbaixoCount, mesesComDados }) {
	if (mesesAbaixoCount === 0) {
		return `Excelente! Atingiu a meta nos ${mesesComDados} meses analisados.`;
	}
	const monthLabel = mesesComDados === 1 ? "mês" : "meses";
	return `Ficou abaixo da meta em ${mesesAbaixoCount} de ${mesesComDados} ${monthLabel} analisados.`;
}

function getThreeMonthAlertDescription(mesesAbaixoCount) {
	if (mesesAbaixoCount >= 2) {
		return "Atenção: desempenho recorrentemente abaixo do esperado. Ação necessária.";
	}
	if (mesesAbaixoCount === 1) {
		return "Desempenho irregular. Monitorar evolucao no proximo periodo.";
	}
	return "Continue assim! Performance consistente acima dos 80%.";
}

function buildThreeMonthAlertHtml({ mesesComDados, mesesAbaixoCount }) {
	if (mesesComDados <= 0) return "";
	const tone = getThreeMonthAlertTone(mesesAbaixoCount);
	return `
    <div class="avoid-break" style="border-radius:9px;padding:7px 10px;margin-bottom:7px;background:${tone.bg};border:1px solid ${tone.border}">
      <div style="font-size:10.5px;font-weight:900;color:${tone.color};margin-bottom:1px">
        ${getThreeMonthAlertTitle({ mesesAbaixoCount, mesesComDados })}
      </div>
      <div style="font-size:9px;color:${tone.color};font-weight:800">
        ${getThreeMonthAlertDescription(mesesAbaixoCount)}
      </div>
    </div>`;
}

export async function gerarPDFMetaMensal(month, cidades = []) {
	const linhas = [...cidades]
		.map((cidade) => {
			const cancelamentos = normalizarNumero(cidade.cancelamentos);
			const meta80 = normalizarNumero(
				cidade.meta80 ?? cidade.meta ?? cancelamentos * 0.8,
			);

			return {
				nome: cidade.nome || cidade.cidade || "Sem cidade",
				cancelamentos,
				meta80,
			};
		})
		.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

	if (linhas.length === 0) return;

	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const logoDataUrl = await carregarImagemDataUrl("/sempre-logo-documento.png");
	const dataGeracao = formatarDataGeracao(new Date(), {
		incluirPreposicao: true,
	});
	const totalCancelamentos = linhas.reduce(
		(total, cidade) => total + cidade.cancelamentos,
		0,
	);
	const totalMeta = linhas.reduce((total, cidade) => total + cidade.meta80, 0);
	const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();

	pdf.setFillColor(0, 48, 135);
	pdf.rect(0, 0, pageWidth, 34, "F");
	pdf.setFillColor(255, 107, 0);
	pdf.rect(0, 31, pageWidth, 3, "F");
	pdf.setTextColor(255, 255, 255);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(16);
	pdf.text("Meta Mensal - Agentes Autorizados", 14, 13);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(9);
	pdf.text(`${month} 2026 | Gerado em ${dataGeracao}`, 14, 22);

	if (logoDataUrl) {
		pdf.setFillColor(255, 255, 255);
		pdf.roundedRect(pageWidth - 54, 7, 40, 18, 2, 2, "F");
		const props = pdf.getImageProperties(logoDataUrl);
		const ratio = props.width / props.height;
		const maxW = 34;
		const maxH = 12;
		const width = ratio > maxW / maxH ? maxW : maxH * ratio;
		const height = width / ratio;
		pdf.addImage(
			logoDataUrl,
			"PNG",
			pageWidth - 54 + (40 - width) / 2,
			7 + (18 - height) / 2,
			width,
			height,
		);
	}

	const cardY = 42;
	const cardW = 55;
	const cards = [
		["Cidades", intFmt.format(linhas.length), [0, 48, 135]],
		["Cancelamentos", intFmt.format(totalCancelamentos), [255, 107, 0]],
		["Meta 80%", `${intFmt.format(totalMeta)} retiradas`, [0, 135, 90]],
	];

	cards.forEach(([label, value, color], index) => {
		const x = 14 + index * (cardW + 7);
		pdf.setFillColor(248, 250, 252);
		pdf.roundedRect(x, cardY, cardW, 18, 2, 2, "F");
		pdf.setDrawColor(221, 227, 238);
		pdf.roundedRect(x, cardY, cardW, 18, 2, 2, "S");
		pdf.setTextColor(107, 120, 151);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(7);
		pdf.text(label.toUpperCase(), x + 4, cardY + 6);
		pdf.setTextColor(...color);
		pdf.setFontSize(12);
		pdf.text(String(value), x + 4, cardY + 14);
	});

	pdf.setTextColor(26, 35, 64);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(9);
	pdf.text(
		"Metas calculadas por cidade com base nos cancelamentos do mês anterior.",
		14,
		69,
	);

	autoTable(pdf, {
		startY: 75,
		head: [["Cidade", "Cancelamento mês anterior", "Meta 80%"]],
		body: linhas.map((cidade) => [
			cidade.nome,
			`${intFmt.format(cidade.cancelamentos)} ${cidade.cancelamentos === 1 ? "cancelamento" : "cancelamentos"}`,
			`${intFmt.format(cidade.meta80)} ${cidade.meta80 === 1 ? "retirada" : "retiradas"}`,
		]),
		theme: "grid",
		styles: {
			font: "helvetica",
			fontSize: 9,
			cellPadding: 2.5,
			textColor: [26, 35, 64],
			lineColor: [221, 227, 238],
			lineWidth: 0.2,
		},
		alternateRowStyles: {
			fillColor: [248, 250, 252],
		},
		headStyles: {
			fillColor: [0, 48, 135],
			textColor: [255, 255, 255],
			fontStyle: "bold",
			halign: "center",
		},
		columnStyles: {
			0: { halign: "left", cellWidth: 76 },
			1: { halign: "center", cellWidth: 54 },
			2: { halign: "center", cellWidth: 50 },
		},
		didParseCell: (data) => {
			if (data.section === "body" && data.column.index === 0) {
				data.cell.styles.fontStyle = "bold";
				data.cell.styles.textColor = [0, 48, 135];
			}
			if (data.section === "body" && data.column.index === 2) {
				data.cell.styles.fontStyle = "bold";
				data.cell.styles.textColor = [0, 135, 90];
			}
		},
		didDrawPage: () => {
			const pageCount = pdf.internal.getNumberOfPages();
			pdf.setFillColor(243, 246, 250);
			pdf.rect(0, 282, pageWidth, 15, "F");
			pdf.setFontSize(8);
			pdf.setTextColor(107, 120, 151);
			pdf.text("Sempre Internet | Dashboard Agentes Autorizados", 14, 290);
			pdf.text(
				`Página ${pdf.internal.getCurrentPageInfo().pageNumber} de ${pageCount}`,
				196,
				290,
				{ align: "right" },
			);
		},
	});

	const nomeMes = String(month || "mes")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
	pdf.save(`Meta_Mensal_Agentes_${nomeMes}_2026.pdf`);
}

export function gerarPDFCidade(cidadeNome, month, allData) {
	const d = allData[month];
	if (!d) return;
	const c = d.cidades.find((x) => x.nome === cidadeNome);
	if (!c) return;

	const dataGeracao = formatarDataGeracao(new Date(), {
		incluirPreposicao: true,
	});

	const pct = c.pct;
	const barW = Math.min(pct, 100);
	const status = getPerformanceStatus(pct);
	const faltaInfo = getFaltaInfo(c.falta);
	const totalRealizado = c.daily.reduce((a, b) => a + b, 0);
	const dayCells = c.daily
		.map((val, i) => {
			const { bg, color } = getDailyCellStyle(val);
			return `
      <div style="border:1px solid #DDE3EE;border-radius:5px;padding:3px 2px;text-align:center;background:${bg};min-height:27px">
        <div style="font-size:6.5px;color:#6B7897;font-weight:800;line-height:1">D${i + 1}</div>
        <div style="font-size:11px;font-weight:900;line-height:1.15;color:${color};margin-top:2px">${val > 0 ? val : "-"}</div>
      </div>`;
		})
		.join("");

	const conteudo = `
<div class="one-page-report" style="font-family:Arial,sans-serif;color:#1A2340;font-size:10.5px;background:#fff;padding:0">
  ${reportHeaderHtml({
		title: c.nome,
		subtitle: `${month} 2026 · Relatório individual de performance`,
		badge: status.text,
		dataGeracao,
	})}

  <div class="avoid-break" style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:8px">
    ${compactMetricCardHtml({ label: "Cancelamentos", value: c.cancelamentos, color: "#003087" })}
    ${compactMetricCardHtml({ label: "Meta 80%", value: Math.round(c.meta80), color: "#FF6B00" })}
    ${compactMetricCardHtml({ label: "Realizado", value: c.realizado, color: "#00875A" })}
    ${compactMetricCardHtml({ label: "Falta / Sobra", value: faltaInfo.display, color: status.color })}
  </div>

  <div class="avoid-break" style="border:1px solid #DDE3EE;border-radius:10px;padding:9px 10px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px">
      <div style="font-size:10px;font-weight:900;color:#003087;text-transform:uppercase;letter-spacing:.6px">Progresso da meta</div>
      <div style="font-size:16px;font-weight:900;color:#1A2340">${pct.toFixed(1)}%</div>
    </div>
    <div style="background:#F4F6FA;border-radius:999px;overflow:hidden;height:11px;margin-bottom:5px">
      <div style="width:${barW}%;height:100%;background:${status.color};border-radius:999px"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:#6B7897;font-weight:800">
      <span>${totalRealizado.toLocaleString("pt-BR")} retiradas</span>
      <span>Meta: ${Math.round(c.meta80)}</span>
      <span>${faltaInfo.text}</span>
    </div>
  </div>

  <div class="avoid-break" style="border:1px solid #DDE3EE;border-radius:10px;padding:9px 10px;margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
      <div style="font-size:10px;font-weight:900;color:#003087;text-transform:uppercase;letter-spacing:.6px">Retiradas por dia</div>
      <div style="font-size:9px;color:#6B7897;font-weight:800">Total acumulado: <strong style="color:#003087">${totalRealizado.toLocaleString("pt-BR")}</strong></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(16,1fr);gap:3px">
      ${dayCells}
    </div>
  </div>

  <div class="avoid-break" style="background:#F0F3F8;border-radius:10px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:8px;color:#6B7897;font-weight:900;text-transform:uppercase;letter-spacing:.8px">Situação atual</div>
      <div style="font-size:12px;font-weight:900;color:${status.color};margin-top:2px">${faltaInfo.text}</div>
    </div>
    <div style="text-align:right;font-size:8px;color:#6B7897;font-weight:800">
      <div style="font-weight:600">Sempre Internet</div>
      <div>Dashboard Agentes Autorizados</div>
      <div>${dataGeracao}</div>
    </div>
  </div>

</div>`;

	imprimirHtml(conteudo, PRINT_ONE_PAGE_OPTIONS);
}

export function gerarRelatorio3Meses(cidadeNome, mesAtual, allData) {
	const dataGeracao = formatarDataGeracao(new Date(), {
		incluirPreposicao: true,
	});
	const meses3 = obterMesesAnteriores(mesAtual, 3);

	let blocosHtml = "";
	let mesesAbaixoCount = 0;
	let mesesComDados = 0;

	meses3.forEach((m) => {
		const dadosMes = allData[m];
		if (!dadosMes) {
			blocosHtml += `
        <div class="avoid-break" style="border:1px solid #DDE3EE;border-radius:10px;padding:10px;margin-bottom:7px;opacity:.55;background:#F8FAFC">
          <div style="font-size:13px;font-weight:900;color:#003087;margin-bottom:3px">${m} 2026</div>
          <div style="font-size:10px;color:#6B7897;font-weight:800">Sem dados disponíveis para este mês.</div>
        </div>`;
			return;
		}

		const cidadeM = dadosMes.cidades.find((x) => x.nome === cidadeNome);
		if (!cidadeM) {
			blocosHtml += `
        <div class="avoid-break" style="border:1px solid #DDE3EE;border-radius:10px;padding:10px;margin-bottom:7px;opacity:.55;background:#F8FAFC">
          <div style="font-size:13px;font-weight:900;color:#003087;margin-bottom:3px">${m} 2026</div>
          <div style="font-size:10px;color:#6B7897;font-weight:800">Cidade não encontrada nos dados deste mês.</div>
        </div>`;
			return;
		}

		mesesComDados += 1;
		const pct = cidadeM.pct;
		const atingiu = pct >= 80;
		if (!atingiu) mesesAbaixoCount += 1;

		const status = getPerformanceStatus(pct);
		const barW = Math.min(pct, 100);
		const faltaInfo = getFaltaInfo(cidadeM.falta);

		blocosHtml += `
      <div class="avoid-break" style="border:1px solid ${atingiu ? "#00875A" : "#DE350B"};border-radius:10px;padding:9px 10px;margin-bottom:7px;background:${atingiu ? "#F0FFF7" : "#FFF8F7"}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:13px;font-weight:900;color:#003087">${m} 2026</div>
          <div style="background:${status.bg};color:${status.color};border-radius:999px;padding:3px 9px;font-size:9px;font-weight:900">${status.text}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:7px">
          ${compactMetricCardHtml({ label: "Cancel.", value: cidadeM.cancelamentos, color: "#003087" })}
          ${compactMetricCardHtml({ label: "Meta", value: Math.round(cidadeM.meta80), color: "#FF6B00" })}
          ${compactMetricCardHtml({ label: "Realizado", value: cidadeM.realizado, color: "#00875A" })}
          ${compactMetricCardHtml({ label: "Gap", value: faltaInfo.display, color: status.color })}
        </div>
        <div style="background:#F4F6FA;border-radius:999px;overflow:hidden;height:8px;margin-bottom:3px">
          <div style="width:${barW}%;height:100%;background:${status.color};border-radius:999px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:8.5px;color:#6B7897;font-weight:800">
          <span>${cidadeM.realizado} realizados</span>
          <span style="font-weight:900;color:#1A2340;font-size:10px">${pct.toFixed(1)}%</span>
          <span>Meta ${Math.round(cidadeM.meta80)}</span>
        </div>
      </div>`;
	});

	const alertaHtml = buildThreeMonthAlertHtml({
		mesesComDados,
		mesesAbaixoCount,
	});

	const conteudo = `
<div class="one-page-report" style="font-family:Arial,sans-serif;color:#1A2340;font-size:10px;background:#fff;padding:0">
  ${reportHeaderHtml({
		title: cidadeNome,
		subtitle: "Relatório de performance · Últimos 3 meses",
		badge: "Trimestral",
		dataGeracao,
	})}

  ${alertaHtml}
  ${blocosHtml}

  <div class="avoid-break" style="background:#F0F3F8;border-radius:9px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
    <div>
      <div style="font-size:8px;color:#6B7897;font-weight:900;text-transform:uppercase;letter-spacing:.8px">Meses abaixo da meta</div>
      <div style="font-size:14px;font-weight:900;color:${mesesAbaixoCount === 0 ? "#00875A" : "#DE350B"};margin-top:1px">${mesesAbaixoCount} de ${mesesComDados} ${mesesComDados === 1 ? "mês" : "meses"}</div>
    </div>
    <div style="text-align:right;font-size:8px;color:#6B7897;font-weight:800">
      <div style="font-weight:600">Sempre Internet</div>
      <div>Dashboard Agentes Autorizados</div>
      <div>${dataGeracao}</div>
    </div>
  </div>

</div>`;

	imprimirHtml(conteudo, PRINT_ONE_PAGE_OPTIONS);
}

export function gerarPDFInsightAgente(cidadeNome, insight) {
	if (!insight) return;
	const dataGeracao = formatarDataGeracao(new Date(), {
		incluirPreposicao: true,
	});
	const rowsHtml = (insight.meses || [])
		.map((row) => {
			const statusColor = row.atingiu
				? "#00875A"
				: row.realizado <= 0
					? "#DE350B"
					: "#FF8B00";
			return `
        <tr>
          <td style="padding:4px 6px;border-bottom:1px solid #E6EAF2">${row.mes}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E6EAF2;text-align:center">${intFmt.format(row.cancelamentos)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E6EAF2;text-align:center">${intFmt.format(row.meta)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E6EAF2;text-align:center">${intFmt.format(row.realizado)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E6EAF2;color:${statusColor};font-weight:800;text-align:center">${row.atingiu ? "Meta" : row.realizado <= 0 ? "Sem retirada" : "Abaixo"}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #E6EAF2;text-align:center">${pctFmt.format(row.taxa)}%</td>
        </tr>`;
		})
		.join("");
	const conteudo = `
<div class="one-page-report" style="font-family:Arial,sans-serif;color:#1A2340;background:#fff;padding:0;font-size:10px">
  ${reportHeaderHtml({
		title: cidadeNome,
		subtitle: "Histórico desde Janeiro/2026 · Base para acionamento jurídico",
		badge: "Insight jurídico",
		dataGeracao,
	})}
  <div class="avoid-break" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:8px">
    ${[
			["Meses analisados", insight.mesesComDados],
			["Bateu meta", insight.mesesMeta],
			["Abaixo meta", insight.mesesAbaixo],
			["Sem retirada", insight.mesesSemRetirada],
			["Cancelamentos", insight.totalCancelamentos],
			["Retiradas", insight.totalRealizado],
		]
			.map(
				([label, value]) => `
      <div style="border:1px solid #DDE3EE;border-radius:8px;padding:6px 7px;background:#F8FAFC">
        <div style="font-size:6.5px;color:#6B7897;text-transform:uppercase;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
        <div style="font-size:16px;font-weight:900;color:#003087;margin-top:2px;line-height:1">${intFmt.format(value || 0)}</div>
      </div>`,
			)
			.join("")}
  </div>
  <div class="avoid-break" style="display:grid;grid-template-columns:1.25fr .75fr;gap:8px;margin-bottom:8px">
    <div style="border:1px solid #DDE3EE;border-radius:8px;padding:8px 9px">
      <div style="font-size:8px;color:#6B7897;text-transform:uppercase;font-weight:900;letter-spacing:.6px">Leitura executiva</div>
      <div style="font-size:10.5px;line-height:1.3;margin-top:4px;font-weight:800">${insight.leitura}</div>
    </div>
    <div style="border:1px solid #DDE3EE;border-radius:8px;padding:8px 9px;background:#FFF8F2">
      <div style="font-size:8px;color:#C44700;text-transform:uppercase;font-weight:900;letter-spacing:.6px">Taxa de retirada</div>
      <div style="font-size:25px;font-weight:900;color:#FF6B00;margin-top:4px;line-height:1">${pctFmt.format(insight.taxaEntrega)}%</div>
      <div style="font-size:8.5px;color:#6B7897;font-weight:800;margin-top:3px">Realizado sobre cancelamentos</div>
    </div>
  </div>
  <table class="avoid-break" style="width:100%;border-collapse:collapse;font-size:8.5px;border:1px solid #DDE3EE;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#003087;color:#fff">
        <th style="padding:5px 6px;text-align:left">Mês</th>
        <th style="padding:5px 6px">Cancel.</th>
        <th style="padding:5px 6px">Meta</th>
        <th style="padding:5px 6px">Retiradas</th>
        <th style="padding:5px 6px">Status</th>
        <th style="padding:5px 6px">% canc.</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>`;

	imprimirHtml(conteudo, PRINT_ONE_PAGE_OPTIONS);
}

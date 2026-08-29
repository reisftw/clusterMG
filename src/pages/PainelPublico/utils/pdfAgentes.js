import { formatarDataGeracao, imprimirHtml } from "../../../utils/impressao";
import { obterMesesAnteriores } from "../../../utils/mes";

const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

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
    <div style="border-radius:8px;padding:9px 14px;margin-bottom:10px;background:${tone.bg};border:1.5px solid ${tone.border}">
      <div style="font-size:12px;font-weight:700;color:${tone.color};margin-bottom:2px">
        ${getThreeMonthAlertTitle({ mesesAbaixoCount, mesesComDados })}
      </div>
      <div style="font-size:11px;color:${tone.color}">
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
	const logoDataUrl = await carregarImagemDataUrl("/cluster-mg.png");
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
		pdf.roundedRect(pageWidth - 38, 6, 22, 22, 2, 2, "F");
		pdf.addImage(logoDataUrl, "PNG", pageWidth - 35.5, 8.5, 17, 17);
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

	let daysHtml = "";
	c.daily.forEach((val, i) => {
		const { bg, color } = getDailyCellStyle(val);
		daysHtml += `
      <div style="border:1px solid #DDE3EE;border-radius:6px;padding:6px 4px;text-align:center;background:${bg}">
        <div style="font-size:9px;color:#6B7897;font-weight:600">Dia ${i + 1}</div>
        <div style="font-size:18px;font-weight:700;color:${color}">${val > 0 ? val : "-"}</div>
      </div>`;
	});

	const conteudo = `
<div style="font-family:Arial,sans-serif;color:#1A2340;font-size:13px;background:#fff;padding:24px">

  <div style="background:linear-gradient(135deg,#1a0050 0%,#003087 55%,#0052CC 100%);padding:24px 28px;border-radius:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="color:rgba(255,255,255,.6);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:5px">Sempre Internet · Agentes Autorizados</div>
      <div style="color:#fff;font-size:26px;font-weight:800;letter-spacing:1px;margin-bottom:3px">${c.nome}</div>
      <div style="color:rgba(255,255,255,.75);font-size:13px">${month} 2026 · Relatório Individual de Performance</div>
    </div>
    <div style="text-align:right">
      <div style="background:${status.bg};color:${status.color};border-radius:20px;padding:6px 16px;font-size:12px;font-weight:700">${status.text}</div>
      <div style="color:rgba(255,255,255,.5);font-size:10px;margin-top:8px">Gerado em ${dataGeracao}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid #003087">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Cancelamentos</div>
      <div style="font-size:32px;font-weight:800;color:#003087">${c.cancelamentos}</div>
    </div>
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid #FF6B00">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Meta 80%</div>
      <div style="font-size:32px;font-weight:800;color:#FF6B00">${Math.round(c.meta80)}</div>
    </div>
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid #00875A">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Realizado</div>
      <div style="font-size:32px;font-weight:800;color:#00875A">${c.realizado}</div>
    </div>
    <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:14px;border-top:4px solid ${status.color}">
      <div style="font-size:9px;font-weight:700;color:#6B7897;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Falta / Sobra</div>
      <div style="font-size:32px;font-weight:800;color:${status.color}">${faltaInfo.display}</div>
    </div>
  </div>

  <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:18px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#003087;margin-bottom:12px">Progresso da Meta</div>
    <div style="background:#F4F6FA;border-radius:8px;overflow:hidden;height:18px;margin-bottom:7px">
      <div style="width:${barW}%;height:100%;background:${status.color};border-radius:8px"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#6B7897">
      <span>${c.daily.reduce((a, b) => a + b, 0).toLocaleString("pt-BR")} retiradas</span>
      <span style="font-size:18px;font-weight:800;color:#1A2340">${pct.toFixed(1)}% da meta</span>
      <span>Meta: ${Math.round(c.meta80)}</span>
    </div>
  </div>

  <div style="border:1.5px solid #DDE3EE;border-radius:10px;padding:18px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#003087;margin-bottom:12px">Retiradas por Dia</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(50px,1fr));gap:5px">
      ${daysHtml}
    </div>
    <div style="margin-top:10px;font-size:11px;color:#6B7897">
      Total acumulado no mês: <strong style="color:#003087">${c.daily.reduce((a, b) => a + b, 0).toLocaleString("pt-BR")}</strong> retiradas
    </div>
  </div>

  <div style="background:#F0F3F8;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:10px;color:#6B7897;font-weight:700;text-transform:uppercase;letter-spacing:1px">Situacao atual</div>
      <div style="font-size:14px;font-weight:700;color:${status.color};margin-top:3px">${faltaInfo.text}</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#6B7897">
      <div style="font-weight:600">Sempre Internet</div>
      <div>Dashboard Agentes Autorizados</div>
      <div>${dataGeracao}</div>
    </div>
  </div>

</div>`;

	imprimirHtml(conteudo, {
		areaId: "pdf-print-area",
		styleId: "pdf-print-style",
	});
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
        <div style="border:1.5px solid #DDE3EE;border-radius:12px;padding:18px;margin-bottom:16px;opacity:.5">
          <div style="font-size:15px;font-weight:700;color:#003087;margin-bottom:8px">${m} 2026</div>
          <div style="font-size:13px;color:#6B7897">Sem dados disponíveis para este mês.</div>
        </div>`;
			return;
		}

		const cidadeM = dadosMes.cidades.find((x) => x.nome === cidadeNome);
		if (!cidadeM) {
			blocosHtml += `
        <div style="border:1.5px solid #DDE3EE;border-radius:12px;padding:18px;margin-bottom:16px;opacity:.5">
          <div style="font-size:15px;font-weight:700;color:#003087;margin-bottom:8px">${m} 2026</div>
          <div style="font-size:13px;color:#6B7897">Cidade não encontrada nos dados deste mês.</div>
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
      <div style="border:1.5px solid ${atingiu ? "#00875A" : "#DE350B"};border-radius:8px;padding:10px 14px;margin-bottom:8px;background:${atingiu ? "#F0FFF7" : "#FFF8F7"}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#003087">${m} 2026</div>
          <div style="background:${status.bg};color:${status.color};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:700">${status.text}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:8px">
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid #003087">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Cancelamentos</div>
            <div style="font-size:19px;font-weight:800;color:#003087;line-height:1">${cidadeM.cancelamentos}</div>
          </div>
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid #FF6B00">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Meta 80%</div>
            <div style="font-size:19px;font-weight:800;color:#FF6B00;line-height:1">${Math.round(cidadeM.meta80)}</div>
          </div>
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid #00875A">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Realizado</div>
            <div style="font-size:19px;font-weight:800;color:#00875A;line-height:1">${cidadeM.realizado}</div>
          </div>
          <div style="background:#fff;border:1px solid #DDE3EE;border-radius:6px;padding:7px 8px;border-top:3px solid ${status.color}">
            <div style="font-size:8px;color:#6B7897;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Falta/Sobra</div>
            <div style="font-size:19px;font-weight:800;color:${status.color};line-height:1">${faltaInfo.text}</div>
          </div>
        </div>
        <div style="background:#F4F6FA;border-radius:6px;overflow:hidden;height:10px;margin-bottom:4px">
          <div style="width:${barW}%;height:100%;background:${status.color};border-radius:6px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#6B7897">
          <span>${cidadeM.realizado} realizados</span>
          <span style="font-weight:700;color:#1A2340;font-size:12px">${pct.toFixed(1)}%</span>
          <span>Meta ${Math.round(cidadeM.meta80)}</span>
        </div>
      </div>`;
	});

	const alertaHtml = buildThreeMonthAlertHtml({
		mesesComDados,
		mesesAbaixoCount,
	});

	const conteudo = `
<div style="font-family:Arial,sans-serif;color:#1A2340;font-size:12px;background:#fff;padding:16px">

  <div style="background:linear-gradient(135deg,#1a0050 0%,#003087 55%,#0052CC 100%);padding:16px 20px;border-radius:10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="color:rgba(255,255,255,.6);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">Sempre Internet · Agentes Autorizados</div>
      <div style="color:#fff;font-size:21px;font-weight:800;letter-spacing:1px;margin-bottom:2px">${cidadeNome}</div>
      <div style="color:rgba(255,255,255,.75);font-size:11px">Relatório de Performance · Últimos 3 Meses</div>
    </div>
    <div style="text-align:right">
      <div style="background:rgba(255,255,255,.15);color:#fff;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700">Trimestral</div>
      <div style="color:rgba(255,255,255,.5);font-size:9px;margin-top:6px">Gerado em ${dataGeracao}</div>
    </div>
  </div>

  ${alertaHtml}
  ${blocosHtml}

  <div style="background:#F0F3F8;border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
    <div>
      <div style="font-size:9px;color:#6B7897;font-weight:700;text-transform:uppercase;letter-spacing:1px">Meses abaixo da meta</div>
      <div style="font-size:17px;font-weight:800;color:${mesesAbaixoCount === 0 ? "#00875A" : "#DE350B"};margin-top:1px">${mesesAbaixoCount} de ${mesesComDados} ${mesesComDados === 1 ? "mês" : "meses"}</div>
    </div>
    <div style="text-align:right;font-size:9px;color:#6B7897">
      <div style="font-weight:600">Sempre Internet</div>
      <div>Dashboard Agentes Autorizados</div>
      <div>${dataGeracao}</div>
    </div>
  </div>

</div>`;

	imprimirHtml(conteudo, {
		areaId: "pdf-print-area",
		styleId: "pdf-print-style",
	});
}

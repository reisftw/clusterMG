import { addClusterLogo } from "../../../utils/pdfBranding";

const currency = (value) =>
	Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});

const formatDate = (value) => {
	if (!value) return "-";
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
};

const groupByTecnico = (visitas) =>
	visitas.reduce((acc, item) => {
		const key = item.tecnico_nome || "Sem tecnico";
		acc[key] = [...(acc[key] || []), item];
		return acc;
	}, {});

export const gerarRelatorioVisitasPDF = async ({
	visitas,
	regional,
	mesLabel,
	valorVisita,
}) => {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");

	const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
	const total = visitas.length;
	const totalValor = total * Number(valorVisita || 0);
	const totalRegionais = visitas.filter(
		(item) => item.tecnico_tipo !== "retirada",
	).length;
	const totalRetirada = visitas.filter(
		(item) => item.tecnico_tipo === "retirada",
	).length;
	const porTecnico = groupByTecnico(visitas);

	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(16);
	pdf.text("Relatorio Mensal de Visitas", 40, 44);
	await addClusterLogo(pdf, { width: 76, height: 38, y: 22, marginRight: 40 });
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(10);
	pdf.text(`Regional: ${regional}`, 40, 64);
	pdf.text(`Periodo: ${mesLabel}`, 40, 80);
	pdf.text(`Valor por visita: ${currency(valorVisita)}`, 40, 96);
	pdf.text(`Total de visitas: ${total}`, 40, 112);
	pdf.text(
		`Tecnicos regionais: ${totalRegionais} - ${currency(totalRegionais * Number(valorVisita || 0))}`,
		40,
		128,
	);
	pdf.text(
		`Tecnicos de retirada: ${totalRetirada} - ${currency(totalRetirada * Number(valorVisita || 0))}`,
		40,
		144,
	);
	pdf.text(`Total a pagar: ${currency(totalValor)}`, 40, 160);

	autoTable(pdf, {
		startY: 186,
		head: [["Tecnico", "Tipo", "Qtd.", "Total"]],
		body: Object.entries(porTecnico).map(([tecnico, items]) => [
			tecnico,
			items.some((item) => item.tecnico_tipo === "retirada")
				? "Retirada"
				: "Regional",
			items.length,
			currency(items.length * Number(valorVisita || 0)),
		]),
		styles: { fontSize: 9, cellPadding: 6 },
		headStyles: { fillColor: [37, 99, 235] },
	});

	autoTable(pdf, {
		startY: pdf.lastAutoTable.finalY + 18,
		head: [
			["Data", "Codigo do cliente", "Tecnico", "Tipo", "Status", "Observacao"],
		],
		body: visitas.map((item) => [
			formatDate(item.data),
			item.codigo_cliente || "-",
			item.tecnico_nome || "-",
			item.tecnico_tipo === "retirada" ? "Retirada" : "Regional",
			item.status || "-",
			item.observacao || "",
		]),
		styles: { fontSize: 8, cellPadding: 5 },
		headStyles: { fillColor: [15, 23, 42] },
		columnStyles: {
			0: { cellWidth: 64 },
			1: { cellWidth: 82 },
			2: { cellWidth: 110 },
			3: { cellWidth: 58 },
			4: { cellWidth: 58 },
			5: { cellWidth: 150 },
		},
	});

	pdf.save(
		`visitas-${regional}-${mesLabel}.pdf`.replace(/\s+/g, "-").toLowerCase(),
	);
};

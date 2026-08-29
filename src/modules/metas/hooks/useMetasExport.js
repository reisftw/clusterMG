import jsPDF from "jspdf";
import "jspdf-autotable";

export const exportMetasPDF = (dados) => {
	const doc = new jsPDF();
	doc.setFont("helvetica", "bold");
	doc.setFontSize(16);
	doc.text("Relatorio de Metas - Retirada FTTH", 14, 20);

	doc.setFontSize(12);
	doc.text(`${dados.mes} 2026`, 14, 30);

	// KPIs
	doc.text(
		`Cancelamentos: ${Math.round(dados.meta / 0.8).toLocaleString("pt-BR")}`,
		14,
		45,
	);
	doc.text(
		`Meta 80%: ${Math.round(dados.meta).toLocaleString("pt-BR")}`,
		14,
		55,
	);
	doc.text(
		`Realizado: ${Number(dados.totalOS).toLocaleString("pt-BR")}`,
		14,
		65,
	);
	doc.text(`% Atingido: ${dados.percentAchieved}%`, 14, 75);

	// Ranking
	doc.autoTable({
		startY: 90,
		head: [["Ranking", "Tecnico", "O.S"]],
		body: dados.technicians.slice(0, 5).map((t, i) => [i + 1, t.name, t.total]),
	});

	doc.save(`metas-${dados.mes.toLowerCase()}.pdf`);
};

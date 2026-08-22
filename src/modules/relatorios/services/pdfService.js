import { logger } from "../../../utils/logger";

export const exportRelatorioMensal = (dados) => {
  logger.log("Exportando relatorio:", dados);

  const csvContent =
    "Colaborador,Realizado,Meta,Percentual\n" +
    Object.entries(dados)
      .map(([colaborador, info]) => {
        const pct = info.meta
          ? ((info.realizado / info.meta) * 100).toFixed(1)
          : "0.0";
        return `${colaborador.replace(/,/g, " ")},${info.realizado || 0},${info.meta || 0},${pct}%`;
      })
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `metas-${new Date().toLocaleDateString("pt-BR")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  setTimeout(() => {
    alert(`Exportado: ${Object.keys(dados).length} colaboradores`);
  }, 500);
};


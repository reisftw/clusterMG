import { logger } from "../../../utils/logger";

export const exportRelatorioMensal = (dados) => {
  logger.log("Dados exportados:", dados);

  const csvContent =
    "Colaborador,Realizado,Meta,Percentual\n" +
    Object.entries(dados)
      .map(([colaborador, info]) => {
        const pct = info.meta
          ? ((info.realizado / info.meta) * 100).toFixed(1)
          : "0";
        return `${colaborador},${info.realizado || 0},${info.meta || 0},${pct}%`;
      })
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `metas-${new Date().getMonth() + 1}-${new Date().getFullYear()}.csv`,
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert(`Exportado: ${Object.keys(dados).length} colaboradores`);
};


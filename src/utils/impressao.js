import { sanitizeHtml } from "../shared/html/sanitizeHtml";

/**
 * Formata data e hora de geracao para exibicao em relatorios.
 * @param {Date} [data]
 * @param {{ incluirPreposicao?: boolean }} [options]
 * @returns {string}
 */
export function formatarDataGeracao(
	data = new Date(),
	options = { incluirPreposicao: false },
) {
	const prefixo = options.incluirPreposicao ? " as " : " ";
	const dia = String(data.getDate()).padStart(2, "0");
	const mes = String(data.getMonth() + 1).padStart(2, "0");
	const ano = data.getFullYear();
	const hora = String(data.getHours()).padStart(2, "0");
	const minuto = String(data.getMinutes()).padStart(2, "0");
	return `${dia}/${mes}/${ano}${prefixo}${hora}:${minuto}`;
}

/**
 * Renderiza um HTML sanitizado em uma area temporaria e dispara a impressao.
 * @param {string} conteudo
 * @param {{ areaId?: string, styleId?: string }} [options]
 * @returns {void}
 */
export function imprimirHtml(
	conteudo,
	options = { areaId: "print-area", styleId: "print-style" },
) {
	const areaId = options.areaId ?? "print-area";
	const styleId = options.styleId ?? "print-style";

	const existingArea = document.getElementById(areaId);
	if (existingArea) existingArea.remove();

	const existingStyle = document.getElementById(styleId);
	if (existingStyle) existingStyle.remove();

	const printArea = document.createElement("div");
	printArea.id = areaId;
	printArea.innerHTML = sanitizeHtml(conteudo);
	printArea.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: #fff;
    z-index: 99999;
    overflow: auto;
  `;
	document.body.appendChild(printArea);

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = `
    @media print {
      body > *:not(#${areaId}) { display: none !important; }
      #${areaId} { display: block !important; position: static !important; }
    }
  `;
	document.head.appendChild(style);

	window.print();

	setTimeout(() => {
		printArea.remove();
		style.remove();
	}, 1000);
}

// Compartilhado por movimentacoesEntregas.js e movimentacoesOrdensFechadas.js.
//
// O Portal de Movimentacoes (Playground) parece ter algum limite interno
// pra consultas de periodo muito largo: mesmo com o teto de paginas do
// nosso lado bem acima do necessario, uma varredura de "ano todo" (ou uma
// conciliacao de Ordens Fechadas com periodo largo) parava sempre perto de
// ~800-850 registros, nao no fim real dos dados — o comportamento eh
// consistente com truncamento do lado da API, nao com um bug daqui.
//
// A saida: quebrar o periodo pedido em janelas menores (15 dias por
// padrao) e consultar uma de cada vez, acumulando o resultado — cada
// janela individual fica bem abaixo do limite que a API parece impor.
function buildDateWindows(start, end, windowDays = 15) {
	const windows = [];
	const windowMs = windowDays * 24 * 60 * 60 * 1000;
	let cursorMs = start.getTime();
	const endMs = end.getTime();
	while (cursorMs <= endMs) {
		const windowEndMs = Math.min(cursorMs + windowMs - 1, endMs);
		windows.push({
			start: new Date(cursorMs),
			end: new Date(windowEndMs),
		});
		cursorMs = windowEndMs + 1;
	}
	return windows;
}

module.exports = { buildDateWindows };

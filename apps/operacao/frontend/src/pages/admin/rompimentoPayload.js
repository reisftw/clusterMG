// Extraida do RompimentosPage.jsx (react-refresh/only-export-components
// nao permite exportar componente + funcao no mesmo arquivo) — usada
// dentro do fluxo persist() e testada isoladamente em
// rompimentoPayload.test.js.
export function buildRompimentoPayload({
	regionalId,
	ticketNumber,
	nextStatus,
	cidade,
	pontoALat,
	pontoALng,
	pontoB,
	materiais,
	outros,
	fibraTipo,
	fibraMetros,
}) {
	return {
		regionalId,
		ticketNumber: ticketNumber.trim(),
		status: nextStatus,
		clienteNome: "",
		cidade,
		pontoA: pontoALat !== "" && pontoALng !== "" ? { lat: Number(pontoALat), lng: Number(pontoALng) } : null,
		pontoB,
		materiais,
		outros,
		fibraTipo,
		fibraMetros,
	};
}

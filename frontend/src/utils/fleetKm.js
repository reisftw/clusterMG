// Compartilhado entre a listagem e a Ficha 360 do veículo: todo
// endpoint que grava uma leitura de KM pode devolver 409
// KM_JUMP_CONFIRMATION_REQUIRED (salto grande, mas não bloqueante —
// secao 9 do pedido). Reaproveita o padrão já usado no resto do app
// (window.confirm, ver handleDeleteVehicle em FleetPage.jsx) em vez de
// criar um componente de confirmação novo só pra isso.
export async function submitKmAware(apiFn, payload) {
	try {
		return await apiFn(payload);
	} catch (err) {
		if (err?.data?.code === "KM_JUMP_CONFIRMATION_REQUIRED" && window.confirm(`${err.message}\n\nConfirmar mesmo assim?`)) {
			return apiFn({ ...payload, jumpConfirmed: true });
		}
		throw err;
	}
}

export const VEHICLE_STATUS_LABEL = {
	EM_OPERACAO: "Em operação",
	DISPONIVEL_BASE: "Disponível na base",
	AGUARDANDO_RECEBIMENTO: "Aguardando recebimento",
	AGUARDANDO_MANUTENCAO: "Aguardando manutenção",
	EM_MANUTENCAO: "Em manutenção",
	BLOQUEADO: "Bloqueado",
	SINISTRO: "Sinistro",
	RESERVA: "Reserva",
	INATIVO: "Inativo",
};

export const VEHICLE_STATUS_BADGE = {
	EM_OPERACAO: "bg-emerald-100 text-emerald-700",
	DISPONIVEL_BASE: "bg-amber-100 text-amber-700",
	AGUARDANDO_RECEBIMENTO: "bg-blue-100 text-blue-700",
	AGUARDANDO_MANUTENCAO: "bg-orange-100 text-orange-700",
	EM_MANUTENCAO: "bg-red-100 text-red-700",
	BLOQUEADO: "bg-slate-800 text-white",
	SINISTRO: "bg-red-600 text-white",
	RESERVA: "bg-purple-100 text-purple-700",
	INATIVO: "bg-slate-200 text-slate-500",
};

export function formatKm(km) {
	if (km === null || km === undefined) return "KM ainda não informado";
	return `${Number(km).toLocaleString("pt-BR")} km`;
}

export function formatDateTime(value) {
	if (!value) return "—";
	return new Date(value).toLocaleString("pt-BR");
}

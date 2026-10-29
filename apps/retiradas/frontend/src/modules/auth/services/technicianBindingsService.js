import { buscarAgendamentosDominio } from "../../agendamentos/services/agendamentosService";
import { buscarTodasMetas } from "../../metas/services/metasService";
import { buscarTecnicosSolicitacao } from "../../serviceOrders/requests/services/serviceOrderRequestsService";

function text(value) {
	return String(value || "").trim();
}

function uniqueSorted(values = []) {
	return [...new Set(values.map(text).filter(Boolean))].sort((left, right) =>
		left.localeCompare(right, "pt-BR"),
	);
}

export function collectMetasTechnicianNames(allData = {}) {
	const names = [];
	for (const month of Object.values(allData || {})) {
		for (const record of [month, month?.onnet, month?.onnetSempre]) {
			for (const technician of record?.technicians || []) {
				names.push(technician?.name || technician?.nome);
			}
		}
	}
	return uniqueSorted(names);
}

export function collectAppointmentTechnicianNames(appointments = []) {
	return uniqueSorted(
		appointments.map(
			(item) => item?.tecnico_nome || item?.tecnicoNome || item?.tecnico,
		),
	);
}

export async function listarVinculosTecnicosAdmin({ includeOperationalNames = true } = {}) {
	const [metas, appointments, hubsoft] = await Promise.all([
		includeOperationalNames
			? buscarTodasMetas(false, { preferLive: true }).catch(() => ({}))
			: {},
		includeOperationalNames
			? buscarAgendamentosDominio({ max: 10000 }).catch(() => [])
			: [],
		buscarTecnicosSolicitacao().catch(() => ({ items: [] })),
	]);
	return {
		metas: collectMetasTechnicianNames(metas),
		agendamentos: collectAppointmentTechnicianNames(appointments),
		hubsoft: Array.isArray(hubsoft?.items) ? hubsoft.items : [],
	};
}

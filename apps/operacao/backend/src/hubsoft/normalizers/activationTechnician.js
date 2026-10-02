const { normalizeText, text, toNumberOrNull } = require("../utils/text");

const UNASSIGNED_ALIASES = new Set(["fila", "sem tecnico", "sem tecnico definido", "aguardando atribuicao"]);

function firstTechnician(order = {}) {
	const direct = Array.isArray(order.tecnicos) ? order.tecnicos[0] : null;
	const relation = Array.isArray(order.ordem_servico_tecnico) ? order.ordem_servico_tecnico[0] : null;
	return direct || relation?.usuario || relation?.tecnico || relation || null;
}

function technicianName(technician = {}) {
	return text(
		technician.nome ||
		technician.name ||
		technician.display ||
		technician.descricao ||
		technician.usuario?.nome ||
		technician.usuario?.name ||
		technician.usuario?.display ||
		technician.tecnico?.nome ||
		technician.tecnico?.name ||
		technician.tecnico?.display,
	);
}

function technicianEmail(technician = {}) {
	return text(technician.email || technician.usuario?.email || technician.tecnico?.email).toLowerCase();
}

function technicianId(technician = {}) {
	return toNumberOrNull(
		technician.id ||
		technician.id_usuario ||
		technician.id_tecnico ||
		technician.usuario?.id ||
		technician.usuario?.id_usuario ||
		technician.tecnico?.id ||
		technician.tecnico?.id_tecnico,
	);
}

function resolveActivationTechnician(order = {}) {
	const technician = firstTechnician(order);
	const name = technicianName(technician);
	const normalizedName = normalizeText(name);
	if (!technician || UNASSIGNED_ALIASES.has(normalizedName)) {
		return {
			raw: technician || null,
			hubsoftTechnicianId: null,
			name: "",
			email: "",
			assignmentStatus: "UNASSIGNED",
		};
	}
	return {
		raw: technician,
		hubsoftTechnicianId: technicianId(technician),
		name,
		email: technicianEmail(technician),
		assignmentStatus: name || technicianId(technician) ? "ASSIGNED" : "UNASSIGNED",
	};
}

module.exports = {
	firstTechnician,
	resolveActivationTechnician,
	technicianEmail,
	technicianId,
	technicianName,
};

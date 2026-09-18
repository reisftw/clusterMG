import { COLLECTIONS } from "../constants/dataCollections";
import { resolveDataDate } from "./dataDate";
import {
	getInternalSnapshotSlice,
	SNAPSHOT_DOMAINS,
} from "./internalStaticDataService";
import { createVpsDocument } from "./vpsApiClient";

export const registrarAtividade = async ({
	usuarioId,
	nome,
	acao,
	modulo,
	entidadeId = null,
	detalhes = null,
}) => {
	try {
		await createVpsDocument(COLLECTIONS.ACTIVITY_LOG, {
			usuario_id: usuarioId,
			nome,
			acao,
			modulo,
			entidade_id: entidadeId,
			detalhes,
			timestamp: new Date().toISOString(),
		});
	} catch {
		// Falha silenciosa: log nao deve interromper o fluxo principal.
	}
};

export const buscarAtividades = async (quantidade = 20, force = false) => {
	const staticItems = await getInternalSnapshotSlice(
		SNAPSHOT_DOMAINS.OPERACIONAL,
		(payload) => payload?.auditoria?.atividades ?? null,
		{ force },
	);

	return Array.isArray(staticItems) ? staticItems.slice(0, quantidade) : [];
};

export const buscarAtividadesFiltradas = async ({
	modulo,
	usuario,
	dataInicio,
	dataFim,
	quantidade = 200,
	force = false,
} = {}) => {
	const staticItems = await getInternalSnapshotSlice(
		SNAPSHOT_DOMAINS.OPERACIONAL,
		(payload) => payload?.auditoria?.atividades ?? null,
		{ force },
	);

	if (!Array.isArray(staticItems)) {
		return [];
	}

	const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
	const fim = dataFim ? new Date(`${dataFim}T23:59:59`) : null;

	return staticItems
		.filter((item) => {
			if (modulo && item.modulo !== modulo) return false;
			if (usuario && item.nome !== usuario) return false;

			const date = resolveDataDate(item.timestamp);
			if (!date) return false;
			if (inicio && date < inicio) return false;
			if (fim && date > fim) return false;
			return true;
		})
		.slice(0, quantidade);
};

import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	getInternalSnapshotSlice,
	SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import { emitRealtimeUpdate } from "../../../services/realtimeEvents";
import {
	createVpsDocument,
	deleteVpsDocument,
	listVpsDocuments,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

export const buscarAgenda = async (
	force = false,
	{ allowFallback = true, preferStatic = false } = {},
) => {
	if (preferStatic && !force) {
		const staticEventos = await getInternalSnapshotSlice(
			SNAPSHOT_DOMAINS.DASHBOARD,
			(payload) => payload?.agenda?.eventos ?? null,
		);
		if (Array.isArray(staticEventos)) {
			return staticEventos;
		}
	}

	if (!allowFallback) {
		return [];
	}

	return (await listVpsDocuments(COLLECTIONS.AGENDA, { limit: 500 })).sort(
		(a, b) =>
			String(a.data_inicio || "").localeCompare(String(b.data_inicio || "")),
	);
};

export const criarAgenda = async (dados) => {
	const result = await createVpsDocument(COLLECTIONS.AGENDA, {
		...dados,
		criado_em: new Date().toISOString(),
	});
	emitRealtimeUpdate("acompanhamento", { collectionPath: COLLECTIONS.AGENDA });
	return result;
};

export const atualizarAgenda = async (id, dados) => {
	const result = await updateVpsDocument(`${COLLECTIONS.AGENDA}/${id}`, {
		...dados,
		atualizado_em: new Date().toISOString(),
	});
	emitRealtimeUpdate("acompanhamento", {
		collectionPath: COLLECTIONS.AGENDA,
		documentId: id,
	});
	return result;
};

export const excluirAgenda = async (id) => {
	await deleteVpsDocument(`${COLLECTIONS.AGENDA}/${id}`);
	emitRealtimeUpdate("acompanhamento", {
		collectionPath: COLLECTIONS.AGENDA,
		documentId: id,
	});
};

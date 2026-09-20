import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	createVpsDocument,
	deleteVpsDocument,
	getVpsDocument,
	listVpsDocuments,
	setVpsDocument,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

export const buscarVisitas = async () =>
	(await listVpsDocuments(COLLECTIONS.VISITAS, { limit: 1000 })).sort((a, b) =>
		String(b.data || "").localeCompare(String(a.data || "")),
	);

export const criarVisita = async (dados) => {
	const now = new Date().toISOString();
	return createVpsDocument(COLLECTIONS.VISITAS, {
		...dados,
		criado_em: now,
		atualizado_em: now,
	});
};

export const atualizarVisita = async (id, dados) =>
	updateVpsDocument(`${COLLECTIONS.VISITAS}/${id}`, {
		...dados,
		atualizado_em: new Date().toISOString(),
	});

export const excluirVisita = async (id) =>
	deleteVpsDocument(`${COLLECTIONS.VISITAS}/${id}`);

export const buscarTecnicosVisita = async () =>
	(await listVpsDocuments(COLLECTIONS.VISITAS_TECNICOS, { limit: 500 })).sort(
		(a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
	);

export const criarTecnicoVisita = async (dados) => {
	const now = new Date().toISOString();
	return createVpsDocument(COLLECTIONS.VISITAS_TECNICOS, {
		...dados,
		criado_em: now,
		atualizado_em: now,
	});
};

export const atualizarTecnicoVisita = async (id, dados) =>
	updateVpsDocument(`${COLLECTIONS.VISITAS_TECNICOS}/${id}`, {
		...dados,
		atualizado_em: new Date().toISOString(),
	});

export const excluirTecnicoVisita = async (id) =>
	deleteVpsDocument(`${COLLECTIONS.VISITAS_TECNICOS}/${id}`);

export const buscarConfigVisitas = async () =>
	(await getVpsDocument(`${COLLECTIONS.VISITAS_CONFIG}/global`)) || {
		valorVisita: 0,
	};

export const salvarConfigVisitas = async (dados) =>
	setVpsDocument(`${COLLECTIONS.VISITAS_CONFIG}/global`, {
		...dados,
		atualizado_em: new Date().toISOString(),
	});

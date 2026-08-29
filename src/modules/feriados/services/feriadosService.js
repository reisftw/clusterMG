import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	createVpsDocument,
	deleteVpsDocument,
	listVpsDocuments,
} from "../../../services/vpsApiClient";

export const buscarFeriados = async () =>
	listVpsDocuments(COLLECTIONS.FERIADOS, { limit: 200 });

export const cadastrarFeriado = async (dados) =>
	createVpsDocument(COLLECTIONS.FERIADOS, {
		...dados,
		criado_em: new Date().toISOString(),
	});

export const deletarFeriado = async (id) => {
	await deleteVpsDocument(`${COLLECTIONS.FERIADOS}/${id}`);
};

export const buscarFeriadosNacionais = async (ano) => {
	try {
		const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
		if (!res.ok) throw new Error("Falha na API");
		return await res.json();
	} catch {
		return [];
	}
};

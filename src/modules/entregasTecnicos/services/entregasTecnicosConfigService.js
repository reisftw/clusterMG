import { COLLECTIONS } from "../../../constants/dataCollections";
import { getVpsDocument, updateVpsDocument } from "../../../services/vpsApiClient";

export async function buscarConfigEntregasTecnicos() {
  return getVpsDocument(`${COLLECTIONS.ENTREGAS_TECNICOS_CONFIG}/global`).catch(() => null);
}

export async function salvarConfigEntregasTecnicos(dados) {
  await updateVpsDocument(`${COLLECTIONS.ENTREGAS_TECNICOS_CONFIG}/global`, {
    ...dados,
    atualizado_em: new Date().toISOString(),
  });
}


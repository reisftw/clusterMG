import { COLLECTIONS } from '../../../constants/dataCollections';
import {
  createVpsDocument,
  deleteVpsDocument,
  listVpsDocuments,
  updateVpsDocument,
} from '../../../services/vpsApiClient';

export const solicitarFerias = async (dados) => {
  return await createVpsDocument(COLLECTIONS.FERIAS, {
    ...dados,
    status: 'pendente',
    criado_em: new Date().toISOString(),
  });
};

export const cadastrarFerias = async (dados) => {
  return await createVpsDocument(COLLECTIONS.FERIAS, {
    ...dados,
    status: dados?.status || 'aprovado',
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  });
};

export const atualizarStatusFerias = async (id, status) => {
  await updateVpsDocument(`${COLLECTIONS.FERIAS}/${id}`, {
    status,
    atualizado_em: new Date().toISOString(),
  });
};

export const deletarFerias = async (id) => {
  await deleteVpsDocument(`${COLLECTIONS.FERIAS}/${id}`);
};

export const buscarFeriasPorColaborador = async (colaboradorId) => {
  const items = await listVpsDocuments(COLLECTIONS.FERIAS, { limit: 1000 });
  return items.filter((item) => String(item.colaborador_id ?? '') === String(colaboradorId ?? ''));
};

export const buscarTodasFerias = async () => {
  return await listVpsDocuments(COLLECTIONS.FERIAS, { limit: 1000 });
};


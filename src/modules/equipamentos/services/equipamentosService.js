import { COLLECTIONS } from '../../../constants/dataCollections';
import {
  createVpsDocument,
  deleteVpsDocument,
  listVpsDocuments,
  updateVpsDocument,
} from '../../../services/vpsApiClient';

export const buscarEquipamentos = async () =>
  listVpsDocuments(COLLECTIONS.EQUIPAMENTOS, { limit: 500 });

export const criarEquipamento = async (dados) =>
  createVpsDocument(COLLECTIONS.EQUIPAMENTOS, {
    ...dados,
    criado_em: new Date().toISOString(),
  });

export const atualizarEquipamento = async (id, dados) =>
  updateVpsDocument(`${COLLECTIONS.EQUIPAMENTOS}/${id}`, {
    ...dados,
    atualizado_em: new Date().toISOString(),
  });

export const excluirEquipamento = async (id) =>
  deleteVpsDocument(`${COLLECTIONS.EQUIPAMENTOS}/${id}`);


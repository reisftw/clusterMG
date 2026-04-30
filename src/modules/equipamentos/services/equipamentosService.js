import {
  collection, addDoc, updateDoc, deleteDoc,
  getDocs, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';

const col = () => collection(db, COLLECTIONS.EQUIPAMENTOS);

export const buscarEquipamentos = async () => {
  const snap = await getDocs(col());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const criarEquipamento = async (dados) => {
  return await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
};

export const atualizarEquipamento = async (id, dados) => {
  return await updateDoc(doc(db, COLLECTIONS.EQUIPAMENTOS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const excluirEquipamento = async (id) => {
  return await deleteDoc(doc(db, COLLECTIONS.EQUIPAMENTOS, id));
};

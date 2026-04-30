import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';

const col = () => collection(db, COLLECTIONS.PRESENCAS);

export const buscarPresencasPorData = async (data) => {
  const q = query(col(), where('data', '==', data));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const buscarPresencasPorPeriodo = async (dataInicio, dataFim) => {
  const q = query(col(), where('data', '>=', dataInicio), where('data', '<=', dataFim));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const salvarPresenca = async (dados) => {
  return await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
};

export const atualizarPresenca = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.PRESENCAS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const deletarPresenca = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.PRESENCAS, id));
};

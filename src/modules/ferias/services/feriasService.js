import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';

const col = () => collection(db, COLLECTIONS.FERIAS);

export const solicitarFerias = async (dados) => {
  return await addDoc(col(), {
    ...dados,
    status: 'pendente',
    criado_em: serverTimestamp(),
  });
};

export const cadastrarFerias = async (dados) => {
  return await addDoc(col(), {
    ...dados,
    status: dados?.status || 'aprovado',
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  });
};

export const atualizarStatusFerias = async (id, status) => {
  const ref = doc(db, COLLECTIONS.FERIAS, id);
  await updateDoc(ref, { status, atualizado_em: serverTimestamp() });
};

export const deletarFerias = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.FERIAS, id));
};

export const buscarFeriasPorColaborador = async (colaboradorId) => {
  const q = query(col(), where('colaborador_id', '==', colaboradorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const buscarTodasFerias = async () => {
  const snap = await getDocs(col());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

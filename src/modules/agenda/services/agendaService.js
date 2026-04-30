import {
  collection, addDoc, updateDoc, deleteDoc,
  getDocs, doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';
import { getInternalStaticDataSlice } from '../../../services/internalStaticDataService';

const col = () => collection(db, COLLECTIONS.AGENDA);

export const buscarAgenda = async (force = false) => {
  if (!force) {
    const staticEventos = await getInternalStaticDataSlice(
      (payload) => payload?.agenda?.eventos ?? null,
    );
    if (Array.isArray(staticEventos)) {
      return staticEventos;
    }
  }

  const snap = await getDocs(query(col(), orderBy('data_inicio', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const criarAgenda = async (dados) =>
  await addDoc(col(), { ...dados, criado_em: serverTimestamp() });

export const atualizarAgenda = async (id, dados) =>
  await updateDoc(doc(db, COLLECTIONS.AGENDA, id), {
    ...dados, atualizado_em: serverTimestamp(),
  });

export const excluirAgenda = async (id) =>
  await deleteDoc(doc(db, COLLECTIONS.AGENDA, id));

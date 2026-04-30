import {
  collection, addDoc, deleteDoc,
  doc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';

const col = () => collection(db, COLLECTIONS.FERIADOS);

export const buscarFeriados = async () => {
  const snap = await getDocs(col());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const cadastrarFeriado = async (dados) => {
  return await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
};

export const deletarFeriado = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.FERIADOS, id));
};

export const buscarFeriadosNacionais = async (ano) => {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
    if (!res.ok) throw new Error('Falha na API');
    return await res.json();
  } catch {
    return [];
  }
};

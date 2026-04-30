import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';

const col = () => collection(db, COLLECTIONS.ATESTADOS);

export const buscarAtestados = async () => {
  const snap = await getDocs(col());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const buscarAtestadosPorColaborador = async (colaboradorId) => {
  const q = query(col(), where('colaborador_id', '==', colaboradorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const salvarAtestado = async (dados) => {
  return await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
};

export const atualizarAtestado = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.ATESTADOS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const deletarAtestado = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.ATESTADOS, id));
};

// Busca CID-10 via API pública
export const buscarCID = async (termo) => {
  if (!termo || termo.length < 2) return [];
  try {
    const res = await fetch(
      `https://cid10-api.vercel.app/api/cid?q=${encodeURIComponent(termo)}&limit=8`
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    return Array.isArray(data) ? data : data.results ?? [];
  } catch {
    // Fallback: lista local com CIDs comuns
    return CID_FALLBACK.filter(
      (c) =>
        c.codigo.toLowerCase().includes(termo.toLowerCase()) ||
        c.descricao.toLowerCase().includes(termo.toLowerCase())
    ).slice(0, 8);
  }
};

const CID_FALLBACK = [
  { codigo: 'Z76.0', descricao: 'Emissão de receita repetida' },
  { codigo: 'J00',   descricao: 'Nasofaringite aguda (resfriado comum)' },
  { codigo: 'J06.9', descricao: 'Infecção aguda das vias aéreas superiores' },
  { codigo: 'K21.0', descricao: 'Doença de refluxo gastroesofágico com esofagite' },
  { codigo: 'M54.5', descricao: 'Dor lombar baixa (lombalgia)' },
  { codigo: 'M54.4', descricao: 'Lumbago com ciática' },
  { codigo: 'G43.9', descricao: 'Enxaqueca sem outra especificação' },
  { codigo: 'R51',   descricao: 'Cefaleia (dor de cabeça)' },
  { codigo: 'A09',   descricao: 'Diarreia e gastroenterite de origem infecciosa' },
  { codigo: 'J18.9', descricao: 'Pneumonia não especificada' },
  { codigo: 'B34.9', descricao: 'Infecção viral não especificada' },
  { codigo: 'F32.0', descricao: 'Episódio depressivo leve' },
  { codigo: 'F41.1', descricao: 'Transtorno de ansiedade generalizada' },
  { codigo: 'S93.4', descricao: 'Entorse e distensão do tornozelo' },
  { codigo: 'I10',   descricao: 'Hipertensão essencial (primária)' },
];

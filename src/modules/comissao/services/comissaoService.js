import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';
import { getInternalStaticDataSlice } from '../../../services/internalStaticDataService';

const col = () => collection(db, COLLECTIONS.COMISSOES);

// ── Configuração global ───────────────────────────────────────────────────────
export const buscarConfig = async () => {
  const ref = doc(db, COLLECTIONS.COMISSAO_CONFIG, 'global');
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  return { meta_mensal: 110, valor_por_servico: 5.0 };
};

export const salvarConfig = async (dados) => {
  const ref = doc(db, COLLECTIONS.COMISSAO_CONFIG, 'global');
  await setDoc(ref, { ...dados, atualizado_em: serverTimestamp() }, { merge: true });
};

// ── Registros de comissão ─────────────────────────────────────────────────────
export const buscarComissoesPorAno = async (ano, force = false) => {
  const anoAtual = new Date().getFullYear();
  if (!force && Number(ano) === anoAtual) {
    const staticRegistros = await getInternalStaticDataSlice(
      (payload) => payload?.comissao?.registros ?? null,
    );
    if (Array.isArray(staticRegistros)) {
      return staticRegistros;
    }
  }

  const q = query(col(), where('ano', '==', ano));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const buscarComissaoPorTecnicoAno = async (colaboradorId, ano) => {
  const q = query(
    col(),
    where('colaborador_id', '==', colaboradorId),
    where('ano', '==', ano)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Salva ou atualiza registro de comissão (1 por técnico/mês/ano)
export const salvarComissao = async (dados) => {
  const q = query(
    col(),
    where('colaborador_id', '==', dados.colaborador_id),
    where('ano',  '==', dados.ano),
    where('mes',  '==', dados.mes)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, { ...dados, atualizado_em: serverTimestamp() });
    return snap.docs[0].id;
  }
  const ref = await addDoc(col(), { ...dados, criado_em: serverTimestamp() });
  return ref.id;
};

export const deletarComissao = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.COMISSOES, id));
};

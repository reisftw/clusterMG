import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { COLLECTIONS } from '../../../constants/firestoreCollections';

const colVeiculos   = () => collection(db, COLLECTIONS.VEICULOS);
const colChecklists = () => collection(db, COLLECTIONS.CHECKLISTS);
const colAbastecimentos = () => collection(db, COLLECTIONS.ABASTECIMENTOS);
const colMultas = () => collection(db, COLLECTIONS.FROTA_MULTAS);
const colSinistros = () => collection(db, COLLECTIONS.FROTA_SINISTROS);

export const buscarVeiculos = async () => {
  const snap = await getDocs(colVeiculos());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const cadastrarVeiculo = async (dados) => {
  return await addDoc(colVeiculos(), { ...dados, criado_em: serverTimestamp() });
};

export const atualizarVeiculo = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.VEICULOS, id), { ...dados, atualizado_em: serverTimestamp() });
};

export const deletarVeiculo = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.VEICULOS, id));
};

export const registrarChecklist = async (dados) => {
  return await addDoc(colChecklists(), { ...dados, data: serverTimestamp() });
};

export const buscarChecklists = async () => {
  const snap = await getDocs(colChecklists());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const buscarAbastecimentos = async () => {
  const snap = await getDocs(colAbastecimentos());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const cadastrarAbastecimento = async (dados) => {
  return await addDoc(colAbastecimentos(), {
    ...dados,
    criado_em: serverTimestamp(),
  });
};

export const atualizarAbastecimento = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.ABASTECIMENTOS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const deletarAbastecimento = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.ABASTECIMENTOS, id));
};

export const buscarMultas = async () => {
  const snap = await getDocs(colMultas());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const cadastrarMulta = async (dados) => {
  return await addDoc(colMultas(), {
    ...dados,
    criado_em: serverTimestamp(),
  });
};

export const atualizarMulta = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.FROTA_MULTAS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const deletarMulta = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.FROTA_MULTAS, id));
};

export const buscarSinistros = async () => {
  const snap = await getDocs(colSinistros());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const cadastrarSinistro = async (dados) => {
  return await addDoc(colSinistros(), {
    ...dados,
    criado_em: serverTimestamp(),
  });
};

export const atualizarSinistro = async (id, dados) => {
  await updateDoc(doc(db, COLLECTIONS.FROTA_SINISTROS, id), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const deletarSinistro = async (id) => {
  await deleteDoc(doc(db, COLLECTIONS.FROTA_SINISTROS, id));
};

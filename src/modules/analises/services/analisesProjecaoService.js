import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";

export function buildAnaliseId(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export async function buscarAnalisesProjecao(force = false) {
  const staticRows = await getInternalStaticDataSlice(
    (payload) => payload?.analises?.projecao ?? null,
    { force },
  );

  return Array.isArray(staticRows) ? staticRows : [];
}

export async function salvarAnaliseProjecao(dados) {
  const ref = doc(db, COLLECTIONS.ANALISES_PROJECAO, buildAnaliseId(dados.ano, dados.mes));
  await setDoc(
    ref,
    {
      ...dados,
      atualizado_em: serverTimestamp(),
    },
    { merge: true },
  );

  return ref;
}

export async function excluirAnaliseProjecao(id) {
  await deleteDoc(doc(db, COLLECTIONS.ANALISES_PROJECAO, id));
}

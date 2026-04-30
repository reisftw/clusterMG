import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";
import { regenerateStaticData } from "../../../services/staticDataService";

const BINDINGS_COLLECTION = COLLECTIONS.MAPEAMENTO_REGIONAIS;

export const CAPACITY_PER_TECHNICIAN = 110;

export async function carregarMapeamento(force = false) {
  const staticPayload = await getInternalStaticDataSlice(
    (payload) => payload?.mapeamento ?? null,
    { force },
  );

  if (!staticPayload) {
    throw new Error("JSON interno indisponivel para o mapeamento.");
  }

  return staticPayload;
}

export async function salvarVinculoRegional(regionalId, tecnicoIds = []) {
  const normalizedIds = [...new Set((tecnicoIds || []).filter(Boolean))].sort();
  const ref = doc(db, BINDINGS_COLLECTION, regionalId);

  if (!normalizedIds.length) {
    await deleteDoc(ref).catch(() => {});
  } else {
    await setDoc(
      ref,
      {
        tecnico_ids: normalizedIds,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  }

  void regenerateStaticData().catch(() => null);
}

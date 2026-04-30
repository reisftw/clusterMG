import { useEffect, useState, useCallback } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";
import { regenerateStaticData } from "../../../services/staticDataService";

const toMap = (docs = []) =>
  docs.reduce((acc, item) => {
    acc[item.id] = item.data ?? item;
    return acc;
  }, {});

export function useRegionais() {
  const [regionais, setRegionais] = useState({});

  const carregar = useCallback(async (force = false) => {
    const staticRegionais = await getInternalStaticDataSlice(
      (payload) => payload?.tecnicos?.regionais ?? null,
      { force },
    );

    setRegionais(toMap(Array.isArray(staticRegionais) ? staticRegionais : []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregar();
    }, 0);

    return () => clearTimeout(timer);
  }, [carregar]);

  async function salvarRegional(id, dados) {
    const payload = { ...dados, updatedAt: new Date().toISOString() };
    if (id) await setDoc(doc(db, "regionais", id), payload, { merge: true });
    else {
      const ref = await addDoc(collection(db, "regionais"), payload);
      id = ref.id;
    }

    setRegionais((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...payload } }));
    void regenerateStaticData().catch(() => null);
  }

  async function excluirRegional(id) {
    await deleteDoc(doc(db, "regionais", id));
    setRegionais((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void regenerateStaticData().catch(() => null);
  }

  return { regionais, salvarRegional, excluirRegional, recarregar: () => carregar(true) };
}

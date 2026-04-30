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

export function useTecnicos() {
  const [tecnicos, setTecnicos] = useState({});
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);

    const staticTecnicos = await getInternalStaticDataSlice(
      (payload) => payload?.tecnicos?.tecnicos ?? null,
      { force },
    );

    setTecnicos(toMap(Array.isArray(staticTecnicos) ? staticTecnicos : []));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregar();
    }, 0);

    return () => clearTimeout(timer);
  }, [carregar]);

  async function salvarTecnico(id, dados) {
    const escala = dados.jornada >= 12 ? "12x36" : "seg-sex";
    const payload = { ...dados, escala, updatedAt: new Date().toISOString() };
    if (id) {
      await setDoc(doc(db, "tecnicos", id), payload, { merge: true });
    } else {
      const ref = await addDoc(collection(db, "tecnicos"), payload);
      id = ref.id;
    }

    setTecnicos((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...payload } }));
    void regenerateStaticData().catch(() => null);
  }

  async function excluirTecnico(id) {
    await deleteDoc(doc(db, "tecnicos", id));
    setTecnicos((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    void regenerateStaticData().catch(() => null);
  }

  return { tecnicos, loading, salvarTecnico, excluirTecnico, recarregar: () => carregar(true) };
}

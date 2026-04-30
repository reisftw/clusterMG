import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import {
  getOrLoadCachedValue,
  invalidateCache,
} from '../../../services/firestoreCache';
import { logFirestoreRead } from '../../../services/firestoreMonitoring';

const CACHE_KEYS = {
  veiculos: 'fs-frota:veiculos',
  manutencoes: 'fs-frota:manutencoes',
  sinistros: 'fs-frota:sinistros',
};

const CACHE_TTL = 5 * 60 * 1000;

const sortByModelo = (items = []) =>
  [...items].sort((a, b) => (a?.modelo ?? '').localeCompare(b?.modelo ?? ''));

const sortByDataDesc = (items = []) =>
  [...items].sort((a, b) => {
    const dataA = String(a?.data ?? a?.criado_em ?? '');
    const dataB = String(b?.data ?? b?.criado_em ?? '');
    return dataB.localeCompare(dataA);
  });

const carregarColecao = async ({
  cacheKey,
  collectionName,
  queryFactory,
  sortFn,
  force = false,
}) => {
  const { data } = await getOrLoadCachedValue(
    cacheKey,
    async () => {
      const snapshot = await getDocs(queryFactory());
      const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

      logFirestoreRead({
        source: `useFSFrota:${collectionName}`,
        type: 'getDocs',
        path: collectionName,
        count: snapshot.size,
      });

      return sortFn(docs);
    },
    { ttlMs: CACHE_TTL, force },
  );

  return sortFn(data || []);
};

export const useFSFrota = () => {
  const [veiculos, setVeiculos] = useState([]);
  const [manutencoes, setManutencoes] = useState([]);
  const [sinistros, setSinistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const [veiculosData, manutencoesData, sinistrosData] = await Promise.all([
        carregarColecao({
          cacheKey: CACHE_KEYS.veiculos,
          collectionName: 'fs_veiculos',
          queryFactory: () => query(collection(db, 'fs_veiculos'), orderBy('modelo')),
          sortFn: sortByModelo,
          force,
        }),
        carregarColecao({
          cacheKey: CACHE_KEYS.manutencoes,
          collectionName: 'fs_manutencoes',
          queryFactory: () => query(collection(db, 'fs_manutencoes'), orderBy('data', 'desc')),
          sortFn: sortByDataDesc,
          force,
        }),
        carregarColecao({
          cacheKey: CACHE_KEYS.sinistros,
          collectionName: 'fs_sinistros',
          queryFactory: () => query(collection(db, 'fs_sinistros'), orderBy('data', 'desc')),
          sortFn: sortByDataDesc,
          force,
        }),
      ]);

      setVeiculos(veiculosData);
      setManutencoes(manutencoesData);
      setSinistros(sinistrosData);
    } catch (e) {
      setError('Erro ao carregar frota: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criarVeiculo = async (dados) => {
    const ref = await addDoc(collection(db, 'fs_veiculos'), {
      ...dados,
      historico_responsaveis: [],
      criado_em: serverTimestamp(),
    });

    invalidateCache(CACHE_KEYS.veiculos);

    setVeiculos((prev) =>
      sortByModelo([
        ...prev,
        { id: ref.id, ...dados, historico_responsaveis: [] },
      ]),
    );
  };

  const atualizarVeiculo = async (id, dados) => {
    await updateDoc(doc(db, 'fs_veiculos', id), {
      ...dados,
      atualizado_em: serverTimestamp(),
    });

    invalidateCache(CACHE_KEYS.veiculos);

    setVeiculos((prev) =>
      sortByModelo(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  };

  const atualizarResponsavel = async (id, responsavelId, responsavelNome) => {
    const veiculo = veiculos.find((item) => item.id === id);
    const hist = veiculo?.historico_responsaveis ?? [];
    const novoHist = responsavelId
      ? [
          ...hist,
          {
            id: responsavelId,
            nome: responsavelNome,
            desde: new Date().toISOString().split('T')[0],
          },
        ]
      : hist;

    await updateDoc(doc(db, 'fs_veiculos', id), {
      responsavel_id: responsavelId ?? null,
      responsavel_nome: responsavelNome ?? null,
      parado_na_base: !responsavelId,
      historico_responsaveis: novoHist,
      atualizado_em: serverTimestamp(),
    });

    invalidateCache(CACHE_KEYS.veiculos);

    setVeiculos((prev) =>
      sortByModelo(
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                responsavel_id: responsavelId ?? null,
                responsavel_nome: responsavelNome ?? null,
                parado_na_base: !responsavelId,
                historico_responsaveis: novoHist,
              }
            : item,
        ),
      ),
    );
  };

  const deletarVeiculo = async (id) => {
    await deleteDoc(doc(db, 'fs_veiculos', id));
    invalidateCache(CACHE_KEYS.veiculos);
    setVeiculos((prev) => prev.filter((item) => item.id !== id));
  };

  const criarManutencao = async (dados) => {
    const ref = await addDoc(collection(db, 'fs_manutencoes'), {
      ...dados,
      criado_em: serverTimestamp(),
    });

    let kmAtualizado = false;
    const veiculo = veiculos.find((item) => item.id === dados.veiculo_id);
    if (dados.km && (!veiculo?.km_atual || dados.km > veiculo.km_atual)) {
      await updateDoc(doc(db, 'fs_veiculos', dados.veiculo_id), {
        km_atual: dados.km,
        atualizado_em: serverTimestamp(),
      });
      kmAtualizado = true;
    }

    invalidateCache(CACHE_KEYS.manutencoes);
    setManutencoes((prev) =>
      sortByDataDesc([...prev, { id: ref.id, ...dados }]),
    );

    if (kmAtualizado) {
      invalidateCache(CACHE_KEYS.veiculos);
      setVeiculos((prev) =>
        sortByModelo(
          prev.map((item) =>
            item.id === dados.veiculo_id ? { ...item, km_atual: dados.km } : item,
          ),
        ),
      );
    }
  };

  const atualizarManutencao = async (id, dados) => {
    await updateDoc(doc(db, 'fs_manutencoes', id), {
      ...dados,
      atualizado_em: serverTimestamp(),
    });

    invalidateCache(CACHE_KEYS.manutencoes);
    setManutencoes((prev) =>
      sortByDataDesc(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  };

  const deletarManutencao = async (id) => {
    await deleteDoc(doc(db, 'fs_manutencoes', id));
    invalidateCache(CACHE_KEYS.manutencoes);
    setManutencoes((prev) => prev.filter((item) => item.id !== id));
  };

  const criarSinistro = async (dados) => {
    const ref = await addDoc(collection(db, 'fs_sinistros'), {
      ...dados,
      criado_em: serverTimestamp(),
    });

    invalidateCache(CACHE_KEYS.sinistros);
    setSinistros((prev) => sortByDataDesc([...prev, { id: ref.id, ...dados }]));
  };

  const atualizarSinistro = async (id, dados) => {
    await updateDoc(doc(db, 'fs_sinistros', id), {
      ...dados,
      atualizado_em: serverTimestamp(),
    });

    invalidateCache(CACHE_KEYS.sinistros);
    setSinistros((prev) =>
      sortByDataDesc(prev.map((item) => (item.id === id ? { ...item, ...dados } : item))),
    );
  };

  const deletarSinistro = async (id) => {
    await deleteDoc(doc(db, 'fs_sinistros', id));
    invalidateCache(CACHE_KEYS.sinistros);
    setSinistros((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    veiculos,
    manutencoes,
    sinistros,
    loading,
    error,
    criarVeiculo,
    atualizarVeiculo,
    atualizarResponsavel,
    deletarVeiculo,
    criarManutencao,
    atualizarManutencao,
    deletarManutencao,
    criarSinistro,
    atualizarSinistro,
    deletarSinistro,
    carregar: () => carregar(true),
  };
};

import { useState, useEffect, useCallback } from 'react';
import {
  getRegionais, addRegional, updateRegional, deleteRegional,
  getConfig, saveConfig,
} from '../services/ferramentasService';

export const useFerramentasRegionais = () => {
  const [regionais, setRegionais] = useState([]);
  const [config, setConfig] = useState({ tecnicos: [], metaAtiva: 110, metaRetirada: 110 });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [regs, cfg] = await Promise.all([getRegionais(), getConfig()]);
      setRegionais(regs);
      setConfig(cfg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const criar = async (nome) => {
    const ref = await addRegional({ nome, cidades: [] });
    setRegionais((prev) =>
      [...prev, { id: ref.id, nome, cidades: [] }].sort((a, b) =>
        String(a?.nome ?? "").localeCompare(String(b?.nome ?? "")),
      ),
    );
  };

  const atualizar = async (id, data) => {
    await updateRegional(id, data);
    setRegionais((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, ...data } : item))
        .sort((a, b) =>
          String(a?.nome ?? "").localeCompare(String(b?.nome ?? "")),
        ),
    );
  };

  const remover = async (id) => {
    await deleteRegional(id);
    setRegionais((prev) => prev.filter((item) => item.id !== id));
  };

  const salvarConfig = async (data) => {
    await saveConfig(data);
    setConfig(prev => ({ ...prev, ...data }));
  };

  return { regionais, config, loading, criar, atualizar, remover, salvarConfig, reload: fetch };
};


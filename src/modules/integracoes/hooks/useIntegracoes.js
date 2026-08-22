import { useCallback, useEffect, useState } from "react";
import {
  atualizarIntegracao,
  buscarIntegracoes,
  criarIntegracao,
  excluirIntegracao,
  testarIntegracao,
} from "../services/integracoesService";

export function useIntegracoes() {
  const [integracoes, setIntegracoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await buscarIntegracoes();
      setIntegracoes(items);
      setIntegracoes(
        await Promise.all(
          items.map((item) =>
            item.active && item.healthcheckPath
              ? testarIntegracao(item)
              : Promise.resolve(item),
          ),
        ),
      );
    } catch (err) {
      setError(err?.message || "Não foi possível carregar as integrações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = async (dados) => {
    await criarIntegracao(dados);
    await carregar();
  };

  const atualizar = async (id, dados) => {
    await atualizarIntegracao(id, dados);
    await carregar();
  };

  const excluir = async (id) => {
    await excluirIntegracao(id);
    await carregar();
  };

  return {
    integracoes,
    loading,
    error,
    carregar,
    criar,
    atualizar,
    excluir,
  };
}


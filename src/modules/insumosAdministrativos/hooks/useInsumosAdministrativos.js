import { useCallback, useEffect, useMemo, useState } from "react";
import {
  atualizarStatusProdutoAdministrativo,
  DEFAULT_INSUMOS_CONFIG,
  listarInsumosAdministrativos,
  registrarRetiradaAdministrativa,
  salvarConfigInsumosAdministrativos,
  salvarProdutoAdministrativo,
} from "../services/insumosAdministrativosService";

const sortProdutos = (items = []) =>
  [...items].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

const sortRetiradas = (items = []) =>
  [...items].sort((a, b) =>
    String(b.retirado_em || b.criado_em || "").localeCompare(String(a.retirado_em || a.criado_em || "")),
  );

const sortReposicoes = (items = []) =>
  [...items].sort((a, b) =>
    String(b.reposto_em || b.criado_em || "").localeCompare(String(a.reposto_em || a.criado_em || "")),
  );

export function useInsumosAdministrativos(usuario) {
  const [produtos, setProdutos] = useState([]);
  const [retiradas, setRetiradas] = useState([]);
  const [reposicoes, setReposicoes] = useState([]);
  const [config, setConfig] = useState(DEFAULT_INSUMOS_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listarInsumosAdministrativos();
      setProdutos(sortProdutos(data.produtos));
      setRetiradas(sortRetiradas(data.retiradas));
      setReposicoes(sortReposicoes(data.reposicoes));
      setConfig(data.config || DEFAULT_INSUMOS_CONFIG);
    } catch (err) {
      setError(err?.message || "Erro ao carregar insumos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarProduto = useCallback(
    async (dados) => {
      setSaving(true);
      setError("");
      try {
        const produto = await salvarProdutoAdministrativo(dados, usuario);
        setProdutos((current) => {
          const exists = current.some((item) => item.id === produto.id);
          return sortProdutos(exists ? current.map((item) => (item.id === produto.id ? { ...item, ...produto } : item)) : [...current, produto]);
        });
        if (produto.reposicao) {
          setReposicoes((current) => sortReposicoes([produto.reposicao, ...current]));
        }
        return produto;
      } catch (err) {
        setError(err?.message || "Erro ao salvar produto.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [usuario],
  );

  const registrarRetirada = useCallback(
    async (dados) => {
      setSaving(true);
      setError("");
      try {
        const retirada = await registrarRetiradaAdministrativa(dados, usuario);
        setRetiradas((current) => sortRetiradas([retirada, ...current]));
        setProdutos((current) =>
          sortProdutos(
            current.map((produto) =>
              produto.id === retirada.produto_id
                ? { ...produto, estoque_atual: retirada.estoque_depois }
                : produto,
            ),
          ),
        );
        return retirada;
      } catch (err) {
        setError(err?.message || "Erro ao registrar retirada.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [usuario],
  );

  const atualizarStatusProduto = useCallback(
    async (id, status) => {
      setSaving(true);
      setError("");
      try {
        const updated = await atualizarStatusProdutoAdministrativo(id, status, usuario);
        setProdutos((current) => {
          if (updated.status === "excluido") {
            return sortProdutos(current.filter((produto) => produto.id !== id));
          }
          return sortProdutos(current.map((produto) => (produto.id === id ? { ...produto, ...updated } : produto)));
        });
        return updated;
      } catch (err) {
        setError(err?.message || "Erro ao atualizar produto.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [usuario],
  );

  const salvarConfig = useCallback(
    async (dados) => {
      setSaving(true);
      setError("");
      try {
        const saved = await salvarConfigInsumosAdministrativos(dados, usuario);
        setConfig(saved);
        return saved;
      } catch (err) {
        setError(err?.message || "Erro ao salvar configuracao.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [usuario],
  );

  const resumo = useMemo(() => {
    const totalProdutos = produtos.length;
    const itensEstoque = produtos.reduce((sum, produto) => sum + Number(produto.estoque_atual || 0), 0);
    const semEstoque = produtos.filter((produto) => Number(produto.estoque_atual || 0) <= 0).length;
    const estoqueBaixo = produtos.filter((produto) => {
      const atual = Number(produto.estoque_atual || 0);
      const minimo = Number(produto.estoque_minimo || 0);
      return minimo > 0 && atual <= minimo;
    }).length;
    const retiradasMes = retiradas.filter((retirada) => {
      const date = new Date(retirada.retirado_em || retirada.criado_em || "");
      const now = new Date();
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length;
    const setoresAtendidos = new Set(
      retiradas
        .filter((retirada) => {
          const date = new Date(retirada.retirado_em || retirada.criado_em || "");
          const now = new Date();
          return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
        })
        .map((retirada) => retirada.setor)
        .filter(Boolean),
    ).size;
    return { totalProdutos, itensEstoque, semEstoque, estoqueBaixo, retiradas: retiradas.length, retiradasMes, setoresAtendidos };
  }, [produtos, retiradas]);

  return {
    produtos,
    retiradas,
    reposicoes,
    config,
    resumo,
    loading,
    saving,
    error,
    carregar,
    salvarProduto,
    registrarRetirada,
    salvarConfig,
    atualizarStatusProduto,
  };
}

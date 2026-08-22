import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteRetiradaRequest,
  estimateRetiradaCorreios,
  listenRetiradaRequests,
  sendRetiradaReceiptEmail,
  updateRetiradaRequest,
} from "../services/retiradasService";

export function useRetiradas() {
  const [retiradas, setRetiradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [quotingId, setQuotingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [receiptSendingId, setReceiptSendingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = listenRetiradaRequests(
      (items) => {
        setRetiradas(items);
        setLoading(false);
        setError("");
      },
      (err) => {
        setError(err?.message || "Erro ao carregar retiradas.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const quoteRetirada = useCallback(async (id) => {
    setQuotingId(id);
    setError("");
    try {
      return await estimateRetiradaCorreios(id);
    } catch (err) {
      setError(err?.message || "Erro ao calcular frete Correios.");
      throw err;
    } finally {
      setQuotingId(null);
    }
  }, []);

  const removeRetirada = useCallback(async (id) => {
    setDeletingId(id);
    setError("");
    try {
      await deleteRetiradaRequest(id);
    } catch (err) {
      setError(err?.message || "Erro ao excluir retirada.");
      throw err;
    } finally {
      setDeletingId(null);
    }
  }, []);

  const updateRetirada = useCallback(async (id, payload) => {
    setSavingId(id);
    setError("");
    try {
      await updateRetiradaRequest(id, payload);
      setRetiradas((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...payload,
                concluidoEm:
                  payload.status === "concluido" && item.status !== "concluido"
                    ? new Date()
                    : item.concluidoEm,
                updatedAt: new Date(),
                tratativaAtualizadaEm: new Date(),
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err?.message || "Erro ao atualizar retirada.");
      throw err;
    } finally {
      setSavingId(null);
    }
  }, []);

  const sendReceipt = useCallback(async (id) => {
    setReceiptSendingId(id);
    setError("");
    try {
      const result = await sendRetiradaReceiptEmail(id);
      setRetiradas((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                reciboEmailStatus: result?.status || "enviado",
                reciboEmailErro: "",
                reciboEmailEnviadoEm: new Date(),
              }
            : item,
        ),
      );
      return result;
    } catch (err) {
      setError(err?.message || "Erro ao enviar comprovante por e-mail.");
      throw err;
    } finally {
      setReceiptSendingId(null);
    }
  }, []);

  const summary = useMemo(() => {
    const totals = {
      total: retiradas.length,
      novo: 0,
      em_tratativa: 0,
      agendado: 0,
      concluido: 0,
      cancelado: 0,
      coleta: 0,
      ponto: 0,
    };

    retiradas.forEach((item) => {
      totals[item.status] = (totals[item.status] || 0) + 1;
      totals[item.metodo] = (totals[item.metodo] || 0) + 1;
    });

    return totals;
  }, [retiradas]);

  return {
    retiradas,
    loading,
    savingId,
    quotingId,
    deletingId,
    receiptSendingId,
    error,
    summary,
    updateRetirada,
    sendReceipt,
    quoteRetirada,
    removeRetirada,
  };
}


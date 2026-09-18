import { useCallback, useEffect, useMemo, useState } from "react";
import {
	createAcertoEstoqueLancamento,
	deleteAcertoEstoqueEntity,
	deleteAcertoEstoqueLancamento,
	fetchAcertoEstoqueData,
	saveAcertoEstoqueEntity,
	updateAcertoEstoqueLancamento,
} from "../services/acertoEstoqueService";
import { buildDashboardMetrics } from "../utils/acertoEstoqueUtils";

const EMPTY_STORE = Object.freeze({
	empresas: [],
	tecnicos: [],
	agendas: [],
	produtos: [],
	acertos: [],
});

function getErrorMessage(error, fallbackMessage) {
	return error?.message || fallbackMessage;
}

export function useAcertoEstoque() {
	const [store, setStore] = useState(EMPTY_STORE);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [lastCreatedAcerto, setLastCreatedAcerto] = useState(null);

	const carregar = useCallback(async () => {
		setLoading(true);
		setError("");

		try {
			const nextStore = await fetchAcertoEstoqueData();
			setStore(nextStore);
		} catch (error) {
			setError(getErrorMessage(error, "Erro ao carregar o modulo."));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const salvarEntidade = useCallback(async (entity, item, successLabel) => {
		setSaving(true);
		setError("");
		setSuccessMessage("");

		try {
			const nextStore = await saveAcertoEstoqueEntity(entity, item);
			setStore(nextStore);
			setSuccessMessage(successLabel);
			return true;
		} catch (error) {
			setError(getErrorMessage(error, "Erro ao salvar cadastro."));
			return false;
		} finally {
			setSaving(false);
		}
	}, []);

	const excluirEntidade = useCallback(async (entity, id, successLabel) => {
		setSaving(true);
		setError("");
		setSuccessMessage("");

		try {
			const nextStore = await deleteAcertoEstoqueEntity(entity, id);
			setStore(nextStore);
			setSuccessMessage(successLabel);
			return true;
		} catch (error) {
			setError(getErrorMessage(error, "Erro ao excluir cadastro."));
			return false;
		} finally {
			setSaving(false);
		}
	}, []);

	const lancarAcerto = useCallback(async (payload) => {
		setSaving(true);
		setError("");
		setSuccessMessage("");

		try {
			const response = await createAcertoEstoqueLancamento(payload);
			setStore(response.store);
			setLastCreatedAcerto(response.acerto);
			setSuccessMessage("Acerto registrado com sucesso.");
			return response.acerto;
		} catch (error) {
			setError(getErrorMessage(error, "Erro ao registrar acerto."));
			return null;
		} finally {
			setSaving(false);
		}
	}, []);

	const atualizarAcerto = useCallback(async (id, payload) => {
		setSaving(true);
		setError("");
		setSuccessMessage("");

		try {
			const response = await updateAcertoEstoqueLancamento(id, payload);
			setStore(response.store);
			setLastCreatedAcerto(response.acerto);
			setSuccessMessage("Acerto atualizado com sucesso.");
			return response.acerto;
		} catch (error) {
			setError(getErrorMessage(error, "Erro ao atualizar acerto."));
			return null;
		} finally {
			setSaving(false);
		}
	}, []);

	const excluirAcerto = useCallback(async (id) => {
		setSaving(true);
		setError("");
		setSuccessMessage("");

		try {
			const nextStore = await deleteAcertoEstoqueLancamento(id);
			setStore(nextStore);
			setLastCreatedAcerto(null);
			setSuccessMessage("Acerto removido com sucesso.");
			return true;
		} catch (error) {
			setError(getErrorMessage(error, "Erro ao excluir acerto."));
			return false;
		} finally {
			setSaving(false);
		}
	}, []);

	const metrics = useMemo(() => buildDashboardMetrics(store), [store]);

	return {
		store,
		metrics,
		loading,
		saving,
		error,
		successMessage,
		lastCreatedAcerto,
		carregar,
		salvarEntidade,
		excluirEntidade,
		lancarAcerto,
		atualizarAcerto,
		excluirAcerto,
		setError,
		setSuccessMessage,
		setLastCreatedAcerto,
	};
}

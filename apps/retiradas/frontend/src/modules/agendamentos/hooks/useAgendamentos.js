import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getOrLoadCachedValue,
	setCachedValue,
} from "../../../services/dataCache";
import { useAuthContext } from "../../../context/AuthContext";
import {
	atualizarAgendamento,
	buscarAgendamentos,
	buscarAgendamentosTecnicoDashboard,
	criarAgendamento,
	excluirAgendamento,
} from "../services/agendamentosService";

const CACHE_KEY = "agendamentos:lista:v2";
const CACHE_TTL = 30 * 1000;

const sortByData = (items = []) =>
	[...items].sort((a, b) => {
		const dataCompare = String(a?.data ?? "").localeCompare(
			String(b?.data ?? ""),
		);
		if (dataCompare !== 0) return dataCompare;
		return String(a?.tecnico_nome ?? "").localeCompare(
			String(b?.tecnico_nome ?? ""),
			"pt-BR",
		);
	});

const getTodayKey = () => {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

export const useAgendamentos = ({ technicianDashboardOnly = false } = {}) => {
	const { currentUser } = useAuthContext();
	const [agendamentos, setAgendamentos] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const cacheKey = technicianDashboardOnly
		? `${CACHE_KEY}:tecnico:${currentUser?.uid || currentUser?.id || "anonimo"}`
		: CACHE_KEY;

	const carregar = useCallback(async (force = false) => {
		setLoading(true);
		setError("");
		try {
			const { data } = await getOrLoadCachedValue(
				cacheKey,
				async () => {
					const items = technicianDashboardOnly
						? await buscarAgendamentosTecnicoDashboard()
						: await buscarAgendamentos();
					return sortByData(items);
				},
				{ ttlMs: CACHE_TTL, force },
			);
			setAgendamentos(sortByData(data || []));
		} catch {
			setError("Erro ao carregar agendamentos.");
		} finally {
			setLoading(false);
		}
	}, [cacheKey, technicianDashboardOnly]);

	useEffect(() => {
		carregar(true);
	}, [carregar]);

	const criar = useCallback(async (dados) => {
		const ref = await criarAgendamento(dados);
		setAgendamentos((prev) => {
			const next = sortByData([...prev, { id: ref.id, ...dados }]);
			setCachedValue(cacheKey, next);
			return next;
		});
		return ref;
	}, [cacheKey]);

	const atualizar = useCallback(async (id, dados) => {
		await atualizarAgendamento(id, dados);
		setAgendamentos((prev) => {
			const next = sortByData(
				prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
			);
			setCachedValue(cacheKey, next);
			return next;
		});
	}, [cacheKey]);

	const excluir = useCallback(async (id) => {
		await excluirAgendamento(id);
		setAgendamentos((prev) => {
			const next = prev.filter((item) => item.id !== id);
			setCachedValue(cacheKey, next);
			return next;
		});
	}, [cacheKey]);

	const hoje = useMemo(() => getTodayKey(), []);
	const agendamentosHoje = useMemo(
		() => agendamentos.filter((item) => item.data === hoje),
		[agendamentos, hoje],
	);

	const aplicarAtualizacaoLocal = useCallback((id, dados) => {
		setAgendamentos((prev) => {
			const next = sortByData(
				prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
			);
			setCachedValue(cacheKey, next);
			return next;
		});
	}, [cacheKey]);

	return {
		agendamentos,
		agendamentosHoje,
		loading,
		error,
		carregar,
		criar,
		atualizar,
		excluir,
		aplicarAtualizacaoLocal,
	};
};

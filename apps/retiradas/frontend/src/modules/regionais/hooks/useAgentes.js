import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../../context/AuthContext";
import { registrarAtividade } from "../../../services/activityLogService";
import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import { logDataRead } from "../../../services/dataMonitoring";
import {
	atualizarAgente,
	buscarAgentes,
	criarAgente,
	excluirAgente,
} from "../services/agentesService";

const CACHE_KEY = "agentes:lista:v2";
const CACHE_TTL = 10 * 60 * 1000;

const sortAgentes = (items = []) =>
	[...items].sort((a, b) =>
		(a?.cidade ?? a?.nome ?? "").localeCompare(b?.cidade ?? b?.nome ?? ""),
	);

export const useAgentes = () => {
	const { currentUser } = useAuthContext();
	const [agentes, setAgentes] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const carregar = useCallback(async (force = false) => {
		setLoading(true);
		setError(null);
		try {
			const { data } = await getOrLoadCachedValue(
				CACHE_KEY,
				async () => {
					const items = await buscarAgentes();
					logDataRead({
						source: "useAgentes",
						operation: "sql-list",
						count: items.length,
					});
					return sortAgentes(items);
				},
				{ ttlMs: CACHE_TTL, force },
			);
			setAgentes(sortAgentes(data || []));
		} catch {
			setError("Erro ao carregar agentes.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const criar = useCallback(
		async (dados) => {
			const ref = await criarAgente(dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "criou agente autorizado",
				modulo: "agentes",
				detalhes: { nome: dados?.nome || null, cidade: dados?.cidade || null },
			});
			invalidateCache(CACHE_KEY);
			setAgentes((prev) => sortAgentes([...prev, { id: ref.id, ...dados }]));
		},
		[currentUser?.id, currentUser?.nome],
	);

	const atualizar = useCallback(
		async (id, dados) => {
			await atualizarAgente(id, dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "atualizou agente autorizado",
				modulo: "agentes",
				entidadeId: id,
				detalhes: { nome: dados?.nome || null, cidade: dados?.cidade || null },
			});
			invalidateCache(CACHE_KEY);
			setAgentes((prev) =>
				sortAgentes(
					prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
				),
			);
		},
		[currentUser?.id, currentUser?.nome],
	);

	const excluir = useCallback(
		async (id) => {
			await excluirAgente(id);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "removeu agente autorizado",
				modulo: "agentes",
				entidadeId: id,
			});
			invalidateCache(CACHE_KEY);
			setAgentes((prev) => prev.filter((item) => item.id !== id));
		},
		[currentUser?.id, currentUser?.nome],
	);

	return {
		agentes,
		loading,
		error,
		carregar: () => carregar(true),
		criar,
		atualizar,
		excluir,
	};
};

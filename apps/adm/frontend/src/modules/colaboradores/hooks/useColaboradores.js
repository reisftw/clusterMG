import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../../context/useAuthContext";
import { registrarAtividade } from "../../../services/activityLogService";
import {
	buildCacheKey,
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import { logDataRead } from "../../../services/dataMonitoring";
import { regenerateStaticData } from "../../../services/staticDataService";
import {
	atualizarColaborador,
	buscarColaboradores,
	cadastrarColaborador,
	deletarColaborador,
} from "../services/colaboradoresService";

const CACHE_KEY = buildCacheKey(["colaboradores", "lista"]);
const CACHE_TTL_MS = 5 * 60 * 1000;

export const useColaboradores = ({ preferStatic = false } = {}) => {
	const { currentUser } = useAuthContext();
	const [colaboradores, setColaboradores] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const carregar = useCallback(
		async (force = false) => {
			setLoading(true);
			try {
				if (preferStatic) {
					const itens = await buscarColaboradores(force, {
						allowFallback: false,
					});
					setColaboradores(Array.isArray(itens) ? itens : []);
					setError(null);
					setLoading(false);
					return;
				}

				const { data, fromCache } = await getOrLoadCachedValue(
					CACHE_KEY,
					async () => {
						const itens = await buscarColaboradores(force);
						logDataRead({
							source: "useColaboradores",
							operation: "sql-list",
							count: itens.length,
						});
						return itens;
					},
					{ ttlMs: CACHE_TTL_MS, force },
				);

				if (fromCache) {
					logDataRead({
						source: "useColaboradores",
						operation: "cache-hit",
						cacheHit: true,
					});
				}

				setColaboradores(data || []);
			} catch {
				setError("Erro ao carregar colaboradores.");
			} finally {
				setLoading(false);
			}
		},
		[preferStatic],
	);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const cadastrar = useCallback(
		async (dados) => {
			try {
				const ref = await cadastrarColaborador(dados);
				await registrarAtividade({
					usuarioId: currentUser?.id,
					nome: currentUser?.nome || "Sistema",
					acao: "cadastrou colaborador",
					modulo: "colaboradores",
					detalhes: { nome: dados?.nome || null, cargo: dados?.cargo || null },
				});

				invalidateCache(CACHE_KEY);
				setColaboradores((current) => [
					{ id: ref.id, ...dados, criado_em: new Date() },
					...current,
				]);
				void regenerateStaticData().catch(() => null);
			} catch {
				setError("Erro ao cadastrar colaborador.");
			}
		},
		[currentUser?.id, currentUser?.nome],
	);

	const atualizar = useCallback(
		async (id, dados) => {
			try {
				await atualizarColaborador(id, dados);
				await registrarAtividade({
					usuarioId: currentUser?.id,
					nome: currentUser?.nome || "Sistema",
					acao: "atualizou colaborador",
					modulo: "colaboradores",
					entidadeId: id,
					detalhes: { nome: dados?.nome || null, cargo: dados?.cargo || null },
				});

				invalidateCache(CACHE_KEY);
				setColaboradores((current) =>
					current.map((item) =>
						item.id === id
							? { ...item, ...dados, atualizado_em: new Date() }
							: item,
					),
				);
				void regenerateStaticData().catch(() => null);
			} catch {
				setError("Erro ao atualizar colaborador.");
			}
		},
		[currentUser?.id, currentUser?.nome],
	);

	const deletar = useCallback(
		async (id) => {
			try {
				await deletarColaborador(id);
				await registrarAtividade({
					usuarioId: currentUser?.id,
					nome: currentUser?.nome || "Sistema",
					acao: "removeu colaborador",
					modulo: "colaboradores",
					entidadeId: id,
				});

				invalidateCache(CACHE_KEY);
				setColaboradores((current) => current.filter((item) => item.id !== id));
				void regenerateStaticData().catch(() => null);
			} catch {
				setError("Erro ao deletar colaborador.");
			}
		},
		[currentUser?.id, currentUser?.nome],
	);

	return {
		colaboradores,
		loading,
		error,
		cadastrar,
		atualizar,
		deletar,
		carregar,
	};
};

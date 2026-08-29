import { useCallback, useEffect, useState } from "react";
import { useAuthContext } from "../../../context/AuthContext";
import { registrarAtividade } from "../../../services/activityLogService";
import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import { logDataRead } from "../../../services/dataMonitoring";
import { regenerateStaticData } from "../../../services/staticDataService";
import {
	atualizarAgenda,
	buscarAgenda,
	criarAgenda,
	excluirAgenda,
} from "../services/agendaService";

const CACHE_KEY = "agenda:eventos";
const CACHE_TTL = 5 * 60 * 1000;

const sortByDataInicio = (items = []) =>
	[...items].sort((a, b) =>
		String(a?.data_inicio ?? "").localeCompare(String(b?.data_inicio ?? "")),
	);

export const useAgenda = ({ preferStatic = false } = {}) => {
	const { currentUser } = useAuthContext();
	const [eventos, setEventos] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const carregar = useCallback(
		async (force = false) => {
			setLoading(true);
			setError(null);
			try {
				if (preferStatic) {
					const items = await buscarAgenda(force, {
						allowFallback: false,
						preferStatic: true,
					});
					setEventos(sortByDataInicio(items || []));
					setLoading(false);
					return;
				}

				const { data } = await getOrLoadCachedValue(
					CACHE_KEY,
					async () => {
						const items = await buscarAgenda(force);
						logDataRead({
							source: "useAgenda",
							operation: "sql-list",
							count: items.length,
						});
						return sortByDataInicio(items);
					},
					{ ttlMs: CACHE_TTL, force },
				);
				setEventos(sortByDataInicio(data || []));
			} catch {
				setError("Erro ao carregar agenda.");
			} finally {
				setLoading(false);
			}
		},
		[preferStatic],
	);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const criar = useCallback(
		async (dados) => {
			const ref = await criarAgenda(dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "criou evento na agenda",
				modulo: "agenda",
				detalhes: {
					titulo: dados?.titulo || null,
					data_inicio: dados?.data_inicio || null,
				},
			});
			invalidateCache(CACHE_KEY);
			setEventos((prev) =>
				sortByDataInicio([...prev, { id: ref.id, ...dados }]),
			);
			void regenerateStaticData().catch(() => null);
		},
		[currentUser?.id, currentUser?.nome],
	);

	const atualizar = useCallback(
		async (id, dados) => {
			await atualizarAgenda(id, dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "atualizou evento da agenda",
				modulo: "agenda",
				entidadeId: id,
				detalhes: {
					titulo: dados?.titulo || null,
					data_inicio: dados?.data_inicio || null,
				},
			});
			invalidateCache(CACHE_KEY);
			setEventos((prev) =>
				sortByDataInicio(
					prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
				),
			);
			void regenerateStaticData().catch(() => null);
		},
		[currentUser?.id, currentUser?.nome],
	);

	const excluir = useCallback(
		async (id) => {
			await excluirAgenda(id);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "removeu evento da agenda",
				modulo: "agenda",
				entidadeId: id,
			});
			invalidateCache(CACHE_KEY);
			setEventos((prev) => prev.filter((item) => item.id !== id));
			void regenerateStaticData().catch(() => null);
		},
		[currentUser?.id, currentUser?.nome],
	);

	return {
		eventos,
		loading,
		error,
		carregar: () => carregar(true),
		criar,
		atualizar,
		excluir,
	};
};

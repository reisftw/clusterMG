import { useCallback, useEffect, useState } from "react";
import {
	getOrLoadCachedValue,
	invalidateCache,
} from "../../../services/dataCache";
import { logDataRead } from "../../../services/dataMonitoring";
import { regenerateStaticData } from "../../../services/staticDataService";
import {
	buscarFeriados,
	buscarFeriadosNacionais,
	cadastrarFeriado,
	deletarFeriado,
} from "../services/feriadosService";

const CACHE_KEYS = {
	manuais: "feriados:manuais",
	nacionais: (ano) => `feriados:nacionais:${ano}`,
};

const CACHE_TTL = 24 * 60 * 60 * 1000;

const sortByDate = (items = []) =>
	[...items].sort((a, b) =>
		String(a?.date ?? a?.data ?? "").localeCompare(
			String(b?.date ?? b?.data ?? ""),
		),
	);

export const useFeriados = () => {
	const [feriados, setFeriados] = useState([]);
	const [feriadosApi, setFeriadosApi] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const anoAtual = new Date().getFullYear();

	const carregar = useCallback(
		async (force = false) => {
			setLoading(true);
			setError(null);
			try {
				const [{ data: manuais }, { data: nacionais }] = await Promise.all([
					getOrLoadCachedValue(
						CACHE_KEYS.manuais,
						async () => {
							const items = await buscarFeriados();
							logDataRead({
								source: "useFeriados:manuais",
								operation: "sql-list",
								count: items.length,
							});
							return sortByDate(items);
						},
						{ ttlMs: CACHE_TTL, force },
					),
					getOrLoadCachedValue(
						CACHE_KEYS.nacionais(anoAtual),
						() => buscarFeriadosNacionais(anoAtual),
						{ ttlMs: CACHE_TTL, force },
					),
				]);

				setFeriados(sortByDate(manuais || []));
				setFeriadosApi(sortByDate(nacionais || []));
			} catch {
				setError("Erro ao carregar feriados.");
			} finally {
				setLoading(false);
			}
		},
		[anoAtual],
	);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const cadastrar = useCallback(async (dados) => {
		try {
			const ref = await cadastrarFeriado(dados);
			invalidateCache(CACHE_KEYS.manuais);
			setFeriados((prev) => sortByDate([...prev, { id: ref.id, ...dados }]));
		} catch {
			setError("Erro ao cadastrar feriado.");
			return;
		}

		try {
			await regenerateStaticData({ scope: "metas" });
		} catch {
			setError(
				"Feriado salvo, mas o calendario dos paineis nao foi atualizado.",
			);
		}
	}, []);

	const deletar = useCallback(async (id) => {
		try {
			await deletarFeriado(id);
			invalidateCache(CACHE_KEYS.manuais);
			setFeriados((prev) => prev.filter((item) => item.id !== id));
		} catch {
			setError("Erro ao deletar feriado.");
			return;
		}

		try {
			await regenerateStaticData({ scope: "metas" });
		} catch {
			setError(
				"Feriado excluido, mas o calendario dos paineis nao foi atualizado.",
			);
		}
	}, []);

	return {
		feriados,
		feriadosApi,
		loading,
		error,
		cadastrar,
		deletar,
		carregar: () => carregar(true),
	};
};

import { useCallback, useEffect, useState } from "react";
import {
	atualizarRegional,
	buscarRegionais,
	criarRegional,
	excluirRegional,
} from "../services/regionaisService";

export const TIPOS_CIDADE = ["Comum", "Agente Aut."];

export function useRegionais() {
	const [regionais, setRegionais] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const carregar = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setRegionais(await buscarRegionais());
		} catch (err) {
			setError(err?.message || "Erro ao carregar regionais.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const criar = useCallback(
		async (dados) => {
			const result = await criarRegional(dados);
			await carregar();
			return result;
		},
		[carregar],
	);

	const atualizar = useCallback(
		async (id, dados) => {
			const result = await atualizarRegional(id, dados);
			await carregar();
			return result;
		},
		[carregar],
	);

	const excluir = useCallback(
		async (id) => {
			const result = await excluirRegional(id);
			await carregar();
			return result;
		},
		[carregar],
	);

	return { regionais, loading, error, carregar, criar, atualizar, excluir };
}

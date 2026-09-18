import { useCallback, useEffect, useState } from "react";
import {
	atualizarAgente,
	buscarAgentes,
	criarAgente,
	excluirAgente,
} from "../services/agentesService";

export function useAgentes() {
	const [agentes, setAgentes] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const carregar = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setAgentes(await buscarAgentes());
		} catch (err) {
			setError(err?.message || "Erro ao carregar agentes.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const criar = useCallback(
		async (dados) => {
			const result = await criarAgente(dados);
			await carregar();
			return result;
		},
		[carregar],
	);

	const atualizar = useCallback(
		async (id, dados) => {
			const result = await atualizarAgente(id, dados);
			await carregar();
			return result;
		},
		[carregar],
	);

	const excluir = useCallback(
		async (id) => {
			const result = await excluirAgente(id);
			await carregar();
			return result;
		},
		[carregar],
	);

	return { agentes, loading, error, carregar, criar, atualizar, excluir };
}

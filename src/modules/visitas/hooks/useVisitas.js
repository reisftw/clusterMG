import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../../../context/AuthContext";
import { registrarAtividade } from "../../../services/activityLogService";
import {
	atualizarTecnicoVisita,
	atualizarVisita,
	buscarConfigVisitas,
	buscarTecnicosVisita,
	buscarVisitas,
	criarTecnicoVisita,
	criarVisita,
	excluirTecnicoVisita,
	excluirVisita,
	salvarConfigVisitas,
} from "../services/visitasService";

const sortVisitas = (items = []) =>
	[...items].sort((a, b) =>
		String(b?.data || "").localeCompare(String(a?.data || "")),
	);

const sortTecnicos = (items = []) =>
	[...items].sort((a, b) =>
		String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR"),
	);

export const useVisitas = () => {
	const { currentUser } = useAuthContext();
	const [visitas, setVisitas] = useState([]);
	const [tecnicos, setTecnicos] = useState([]);
	const [config, setConfig] = useState({ valorVisita: 0 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const carregar = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [visitasData, tecnicosData, configData] = await Promise.all([
				buscarVisitas(),
				buscarTecnicosVisita(),
				buscarConfigVisitas(),
			]);
			setVisitas(sortVisitas(visitasData));
			setTecnicos(sortTecnicos(tecnicosData));
			setConfig({ valorVisita: Number(configData?.valorVisita || 0) });
		} catch {
			setError("Erro ao carregar a central de visitas.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const criar = useCallback(
		async (dados) => {
			const ref = await criarVisita(dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "criou visita",
				modulo: "visitas",
				detalhes: {
					codigo_cliente: dados?.codigo_cliente || null,
					tecnico_nome: dados?.tecnico_nome || null,
					regional: dados?.regional || null,
					data: dados?.data || null,
				},
			});
			setVisitas((prev) => sortVisitas([{ id: ref.id, ...dados }, ...prev]));
		},
		[currentUser?.id, currentUser?.nome],
	);

	const atualizar = useCallback(
		async (id, dados) => {
			await atualizarVisita(id, dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "atualizou visita",
				modulo: "visitas",
				entidadeId: id,
				detalhes: {
					codigo_cliente: dados?.codigo_cliente || null,
					status: dados?.status || null,
				},
			});
			setVisitas((prev) =>
				sortVisitas(
					prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
				),
			);
		},
		[currentUser?.id, currentUser?.nome],
	);

	const excluir = useCallback(
		async (id) => {
			await excluirVisita(id);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "removeu visita",
				modulo: "visitas",
				entidadeId: id,
			});
			setVisitas((prev) => prev.filter((item) => item.id !== id));
		},
		[currentUser?.id, currentUser?.nome],
	);

	const criarTecnico = useCallback(
		async (dados) => {
			const ref = await criarTecnicoVisita(dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "criou tecnico de visitas",
				modulo: "visitas",
				detalhes: {
					nome: dados?.nome || null,
					regional: dados?.regional || null,
				},
			});
			setTecnicos((prev) => sortTecnicos([...prev, { id: ref.id, ...dados }]));
		},
		[currentUser?.id, currentUser?.nome],
	);

	const atualizarTecnico = useCallback(
		async (id, dados) => {
			await atualizarTecnicoVisita(id, dados);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "atualizou tecnico de visitas",
				modulo: "visitas",
				entidadeId: id,
			});
			setTecnicos((prev) =>
				sortTecnicos(
					prev.map((item) => (item.id === id ? { ...item, ...dados } : item)),
				),
			);
		},
		[currentUser?.id, currentUser?.nome],
	);

	const excluirTecnico = useCallback(
		async (id) => {
			await excluirTecnicoVisita(id);
			await registrarAtividade({
				usuarioId: currentUser?.id,
				nome: currentUser?.nome || "Sistema",
				acao: "removeu tecnico de visitas",
				modulo: "visitas",
				entidadeId: id,
			});
			setTecnicos((prev) => prev.filter((item) => item.id !== id));
		},
		[currentUser?.id, currentUser?.nome],
	);

	const salvarConfig = useCallback(async (dados) => {
		await salvarConfigVisitas(dados);
		setConfig((prev) => ({ ...prev, ...dados }));
	}, []);

	const regionais = useMemo(
		() =>
			[...new Set(tecnicos.map((item) => item.regional).filter(Boolean))].sort(
				(a, b) => a.localeCompare(b, "pt-BR"),
			),
		[tecnicos],
	);

	return {
		visitas,
		tecnicos,
		regionais,
		config,
		loading,
		error,
		carregar,
		criar,
		atualizar,
		excluir,
		criarTecnico,
		atualizarTecnico,
		excluirTecnico,
		salvarConfig,
	};
};

import { useCallback, useEffect, useState } from "react";
import {
	buscarAcertosDaEmpresa,
	buscarEmpresasTecnicos,
	buscarSupervisores,
	buscarUsuariosAdmCadastrados,
	buscarUsuariosEmpresa,
	excluirEmpresaTecnicos,
	salvarEmpresaTecnicos,
} from "../services/empresasTecnicosService";

export function useEmpresasTecnicos() {
	const [empresas, setEmpresas] = useState([]);
	const [supervisores, setSupervisores] = useState([]);
	const [usuariosEmpresa, setUsuariosEmpresa] = useState([]);
	const [acertos, setAcertos] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadingAcertos, setLoadingAcertos] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const carregar = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [empresasData, supervisoresData, usuariosData] = await Promise.all([
				buscarEmpresasTecnicos(),
				buscarSupervisores().catch(() => []),
				buscarUsuariosAdmCadastrados().catch(() => buscarUsuariosEmpresa().catch(() => [])),
			]);
			setEmpresas(empresasData);
			setSupervisores(supervisoresData);
			setUsuariosEmpresa(usuariosData);
		} catch (err) {
			setError(
				err?.message || "Nao foi possivel carregar empresas e tecnicos.",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	const carregarAcertos = useCallback(async (empresa) => {
		setLoadingAcertos(true);
		try {
			setAcertos(await buscarAcertosDaEmpresa(empresa));
		} catch {
			setAcertos([]);
		} finally {
			setLoadingAcertos(false);
		}
	}, []);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const salvar = useCallback(
		async (form) => {
			setSaving(true);
			setError("");
			try {
				await salvarEmpresaTecnicos(form);
				await carregar();
				return true;
			} catch (err) {
				setError(err?.message || "Nao foi possivel salvar a empresa.");
				return false;
			} finally {
				setSaving(false);
			}
		},
		[carregar],
	);

	const excluir = useCallback(
		async (id) => {
			setSaving(true);
			setError("");
			try {
				await excluirEmpresaTecnicos(id);
				await carregar();
				return true;
			} catch (err) {
				setError(err?.message || "Nao foi possivel excluir a empresa.");
				return false;
			} finally {
				setSaving(false);
			}
		},
		[carregar],
	);

	return {
		empresas,
		supervisores,
		usuariosEmpresa,
		acertos,
		loading,
		loadingAcertos,
		saving,
		error,
		carregar,
		carregarAcertos,
		salvar,
		excluir,
	};
}

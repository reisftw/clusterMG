// Roteiro Finan #30 (Fase 4A — Sistema de anexos centralizado): biblioteca
// de documentos com hash (deteção de duplicado), versionamento e vínculo
// opcional com fornecedor/contrato/nota fiscal.
import { AlertTriangle, Download, FileStack, Loader2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	deleteFinanAnexo,
	fetchFinanAnexoConteudo,
	fetchFinanAnexoVersoes,
	fetchFinanAnexos,
	uploadFinanAnexo,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/useFinanAuth";

function hasManage(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.anexos.manage");
}

const CATEGORIAS = [
	{ value: "", label: "Todas as categorias" },
	{ value: "contrato", label: "Contrato" },
	{ value: "nota_fiscal", label: "Nota fiscal" },
	{ value: "comprovante", label: "Comprovante" },
	{ value: "outro", label: "Outro" },
];

const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS.filter((c) => c.value).map((c) => [c.value, c.label]));

const VINCULO_TIPOS = [
	{ value: "", label: "Sem vínculo" },
	{ value: "fornecedor", label: "Fornecedor" },
	{ value: "contrato", label: "Contrato" },
	{ value: "nota_fiscal", label: "Nota fiscal" },
];

function formatBytes(bytes) {
	const value = Number(bytes || 0);
	if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
	if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
	return `${value} B`;
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function UploadModal({ onClose, onUpload, uploading, substituindo }) {
	const fileRef = useRef(null);
	const [categoria, setCategoria] = useState("outro");
	const [vinculoTipo, setVinculoTipo] = useState("");
	const [vinculoId, setVinculoId] = useState("");
	const [descricao, setDescricao] = useState("");

	const handleSubmit = (event) => {
		event.preventDefault();
		const file = fileRef.current?.files?.[0];
		if (!file) return;
		onUpload(file, { categoria, vinculoTipo: vinculoTipo || undefined, vinculoId: vinculoId || undefined, descricao, substituindoId: substituindo?.id });
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
				<div className="flex items-center justify-between border-b border-slate-100 p-5">
					<h2 className="text-lg font-black text-slate-950">
						{substituindo ? `Nova versão de "${substituindo.nomeArquivo}"` : "Enviar anexo"}
					</h2>
					<button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
						<X size={18} />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4 p-5">
					<label className="block space-y-1.5">
						<span className="text-xs font-black uppercase text-slate-500">Arquivo</span>
						<input ref={fileRef} type="file" required className="block w-full text-sm font-semibold text-slate-700" />
					</label>
					{!substituindo ? (
						<>
							<label className="block space-y-1.5">
								<span className="text-xs font-black uppercase text-slate-500">Categoria</span>
								<select
									value={categoria}
									onChange={(event) => setCategoria(event.target.value)}
									className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800"
								>
									{CATEGORIAS.filter((c) => c.value).map((c) => (
										<option key={c.value} value={c.value}>{c.label}</option>
									))}
								</select>
							</label>
							<div className="grid grid-cols-2 gap-3">
								<label className="block space-y-1.5">
									<span className="text-xs font-black uppercase text-slate-500">Vínculo</span>
									<select
										value={vinculoTipo}
										onChange={(event) => setVinculoTipo(event.target.value)}
										className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800"
									>
										{VINCULO_TIPOS.map((v) => (
											<option key={v.value} value={v.value}>{v.label}</option>
										))}
									</select>
								</label>
								<label className="block space-y-1.5">
									<span className="text-xs font-black uppercase text-slate-500">ID do vínculo</span>
									<input
										value={vinculoId}
										onChange={(event) => setVinculoId(event.target.value)}
										disabled={!vinculoTipo}
										placeholder="opcional"
										className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 disabled:bg-slate-50"
									/>
								</label>
							</div>
						</>
					) : null}
					<label className="block space-y-1.5">
						<span className="text-xs font-black uppercase text-slate-500">Descrição (opcional)</span>
						<input
							value={descricao}
							onChange={(event) => setDescricao(event.target.value)}
							maxLength={500}
							className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800"
						/>
					</label>
					<div className="flex justify-end gap-2 pt-2">
						<button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							Cancelar
						</button>
						<button type="submit" disabled={uploading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
							{uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
							Enviar
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

export default function FinanAnexosPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasManage(currentUser);
	const [anexos, setAnexos] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [aviso, setAviso] = useState(null);
	const [categoriaFiltro, setCategoriaFiltro] = useState("");
	const [modalState, setModalState] = useState(null); // null | { substituindo: anexo|null }
	const [uploading, setUploading] = useState(false);
	const [versoesAberto, setVersoesAberto] = useState(null); // { anexo, versoes }
	const [abrindo, setAbrindo] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setAnexos(await fetchFinanAnexos({ categoria: categoriaFiltro || undefined }));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os anexos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [categoriaFiltro]);

	const handleUpload = async (file, options) => {
		setUploading(true);
		setAviso(null);
		try {
			const { anexo, duplicadoDe } = await uploadFinanAnexo(file, options);
			if (duplicadoDe && duplicadoDe.id !== anexo?.id) {
				setAviso(`Já existe um arquivo idêntico: "${duplicadoDe.nomeArquivo}" (enviado em ${formatDate(duplicadoDe.createdAt)}). Este novo envio foi salvo mesmo assim.`);
			}
			setModalState(null);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o anexo.");
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = (anexo) => setConfirmTarget(anexo);

	const closeConfirm = () => {
		setConfirmTarget(null);
		setConfirmError("");
	};

	const handleConfirmDelete = async () => {
		if (!confirmTarget) return;
		setConfirming(true);
		setConfirmError("");
		try {
			await deleteFinanAnexo(confirmTarget.id);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível excluir o anexo.");
		} finally {
			setConfirming(false);
		}
	};

	const handleVer = async (anexo) => {
		setAbrindo(true);
		setError("");
		try {
			const { tipoMime, conteudoBase64 } = await fetchFinanAnexoConteudo(anexo.id);
			const byteChars = atob(conteudoBase64);
			const bytes = new Uint8Array(byteChars.length);
			for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
			const blob = new Blob([bytes], { type: tipoMime || "application/octet-stream" });
			const url = URL.createObjectURL(blob);
			window.open(url, "_blank", "noopener,noreferrer");
			setTimeout(() => URL.revokeObjectURL(url), 60000);
		} catch (err) {
			setError(err?.message || "Não foi possível abrir o anexo.");
		} finally {
			setAbrindo(false);
		}
	};

	const handleVerVersoes = async (anexo) => {
		try {
			const versoes = await fetchFinanAnexoVersoes(anexo.id);
			setVersoesAberto({ anexo, versoes });
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as versões.");
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Paperclip size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Biblioteca de Documentos</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Anexos centralizados com detecção de duplicado e versionamento — {anexos.length} documento(s) na visão atual.
							</p>
						</div>
					</div>
					{canManage ? (
						<button
							type="button"
							onClick={() => setModalState({ substituindo: null })}
							className="inline-flex h-11 items-center gap-2 self-start rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
						>
							<Upload size={17} />
							Enviar anexo
						</button>
					) : null}
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}
			{aviso ? (
				<div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					<AlertTriangle size={16} className="mt-0.5 shrink-0" />
					<span>{aviso}</span>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{CATEGORIAS.map((c) => (
					<button
						key={c.value || "todas"}
						type="button"
						onClick={() => setCategoriaFiltro(c.value)}
						className={`rounded-full border px-3 py-1.5 text-xs font-black ${
							categoriaFiltro === c.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
						}`}
					>
						{c.label}
					</button>
				))}
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">Carregando anexos...</p>
				) : anexos.length ? (
					<ul className="divide-y divide-slate-100">
						{anexos.map((anexo) => (
							<li key={anexo.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<p className="truncate text-sm font-black text-slate-950" title={anexo.nomeArquivo}>{anexo.nomeArquivo}</p>
										<span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">
											{CATEGORIA_LABEL[anexo.categoria] || anexo.categoria}
										</span>
										{anexo.versao > 1 ? (
											<button
												type="button"
												onClick={() => handleVerVersoes(anexo)}
												className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-100"
											>
												<FileStack size={11} /> v{anexo.versao}
											</button>
										) : null}
									</div>
									<p className="mt-0.5 text-xs font-medium text-slate-500">
										{formatBytes(anexo.tamanhoBytes)} · {formatDate(anexo.createdAt)} · {anexo.uploadedByNome || "-"}
										{anexo.vinculoTipo ? ` · vinculado a ${anexo.vinculoTipo} (${anexo.vinculoId})` : ""}
									</p>
									{anexo.descricao ? <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{anexo.descricao}</p> : null}
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<button
										type="button"
										onClick={() => handleVer(anexo)}
										disabled={abrindo}
										className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
									>
										<Download size={14} /> Ver
									</button>
									{canManage ? (
										<>
											<button
												type="button"
												onClick={() => setModalState({ substituindo: anexo })}
												className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
											>
												Nova versão
											</button>
											<button
												type="button"
												onClick={() => handleDelete(anexo)}
												aria-label={`Excluir anexo ${anexo.nomeArquivo}`}
												className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-black text-red-700 hover:bg-red-100"
											>
												<Trash2 size={14} />
											</button>
										</>
									) : null}
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhum anexo encontrado.</p>
				)}
			</div>

			{modalState ? (
				<UploadModal
					substituindo={modalState.substituindo}
					uploading={uploading}
					onClose={() => setModalState(null)}
					onUpload={handleUpload}
				/>
			) : null}

			{versoesAberto ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
					<div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
						<div className="flex items-center justify-between border-b border-slate-100 p-5">
							<h2 className="text-lg font-black text-slate-950">Versões de "{versoesAberto.anexo.nomeArquivo}"</h2>
							<button type="button" onClick={() => setVersoesAberto(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
								<X size={18} />
							</button>
						</div>
						<ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto p-2">
							{versoesAberto.versoes.map((versao) => (
								<li key={versao.id} className="flex items-center justify-between gap-3 px-3 py-3">
									<div className="min-w-0">
										<p className="text-sm font-black text-slate-950">v{versao.versao} — {versao.nomeArquivo}</p>
										<p className="text-xs font-medium text-slate-500">{formatBytes(versao.tamanhoBytes)} · {formatDate(versao.createdAt)} · {versao.uploadedByNome || "-"}</p>
									</div>
									<button
										type="button"
										onClick={() => handleVer(versao)}
										disabled={abrindo}
										className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
									>
										<Download size={14} /> Ver
									</button>
								</li>
							))}
						</ul>
					</div>
				</div>
			) : null}

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Excluir este anexo?"
				description="Isso não apaga outras versões dele — só remove esta cópia."
				items={confirmTarget ? [{ label: "Arquivo", value: confirmTarget.nomeArquivo }] : []}
				confirmLabel="Excluir anexo"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

// Roteiro Finan #16 (Caixa de Entrada financeira) + #15 (OCR
// inteligente, 100% nativo na VPS via Tesseract+Poppler — ver
// apps/finan/backend/src/documentos/ocrExtraction.js): upload de
// documento com pipeline Recebidos → Processando → Conferir →
// Importados. O OCR roda automaticamente no upload e sugere campos;
// "Conferir" é sempre um passo humano antes de virar Nota Fiscal.
import { AlertTriangle, CheckCircle2, FileUp, Inbox, Layers, Loader2, ShieldAlert, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	deleteFinanDocumentoEntrada,
	fetchFinanCnpj,
	fetchFinanDocumentosEntrada,
	gerarNotaDeDocumento,
	gerarNotasEmLote,
	updateFinanDocumentoStatus,
	uploadFinanDocumentoEntrada,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/useFinanAuth";

function hasManage(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.notas.manage");
}

const COLUNAS = [
	{ status: "recebido", label: "Recebidos" },
	{ status: "processando", label: "Processando" },
	{ status: "conferir", label: "Conferir" },
	{ status: "importado", label: "Importados" },
];

function formatBytes(bytes) {
	const value = Number(bytes || 0);
	if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
	if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
	return `${value} B`;
}

export default function FinanCaixaEntradaPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasManage(currentUser);
	const [documentos, setDocumentos] = useState([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");
	const [conferindo, setConferindo] = useState(null);
	const [loteAberto, setLoteAberto] = useState(false);
	const [selecionados, setSelecionados] = useState(() => new Set());
	const [movendoLote, setMovendoLote] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");
	const fileInputRef = useRef(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setDocumentos(await fetchFinanDocumentosEntrada());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os documentos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleUpload = async (event) => {
		const files = Array.from(event.target.files || []);
		event.target.value = "";
		if (!files.length) return;
		setUploading(true);
		setError("");
		try {
			for (const file of files) {
				// eslint-disable-next-line no-await-in-loop
				await uploadFinanDocumentoEntrada(file);
			}
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o arquivo.");
		} finally {
			setUploading(false);
		}
	};

	const moveStatus = async (id, status) => {
		await updateFinanDocumentoStatus(id, status);
		await load();
	};

	const handleDelete = (doc) => setConfirmTarget(doc);

	const closeConfirm = () => {
		setConfirmTarget(null);
		setConfirmError("");
	};

	const handleConfirmDelete = async () => {
		if (!confirmTarget) return;
		setConfirming(true);
		setConfirmError("");
		try {
			await deleteFinanDocumentoEntrada(confirmTarget.id);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível remover o documento.");
		} finally {
			setConfirming(false);
		}
	};

	const toggleSelecionado = (id) => {
		setSelecionados((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	// "Mover em massa entre colunas" (pedido do usuário): move todos os
	// documentos selecionados de UMA coluna pra próxima de uma vez — cada
	// coluna tem seu próprio botão de ação em massa, então nunca mistura
	// documentos de status diferentes numa mesma chamada.
	const moveStatusEmLote = async (ids, status) => {
		setMovendoLote(true);
		try {
			await Promise.all(ids.map((id) => updateFinanDocumentoStatus(id, status)));
			setSelecionados((current) => {
				const next = new Set(current);
				ids.forEach((id) => next.delete(id));
				return next;
			});
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível mover os documentos selecionados.");
		} finally {
			setMovendoLote(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Inbox size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Fase 3 — Documentos</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Caixa de Entrada</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Suba PDFs ou imagens de notas — o OCR (leitura automática, 100% nativo na nossa VPS) tenta achar CNPJ,
								valor, número e datas sozinho e o documento já cai em "Conferir". Você sempre confere e confirma antes
								de virar Nota Fiscal.
							</p>
						</div>
					</div>
					{canManage ? (
						<div className="flex flex-wrap gap-2">
							{documentos.filter((d) => d.status === "conferir").length > 1 ? (
								<button
									type="button"
									onClick={() => setLoteAberto(true)}
									className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-black text-emerald-700 hover:bg-emerald-100"
								>
									<Layers size={17} />
									Conferir em lote ({documentos.filter((d) => d.status === "conferir").length})
								</button>
							) : null}
							<label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700">
								{uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
								{uploading ? "Enviando..." : "Enviar documentos"}
								<input ref={fileInputRef} type="file" accept=".pdf,image/png,image/jpeg,image/webp" multiple disabled={uploading} onChange={handleUpload} className="hidden" />
							</label>
						</div>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Carregando...</p>
			) : (
				<div className="grid gap-4 lg:grid-cols-4">
					{COLUNAS.map((coluna) => {
						const items = documentos.filter((doc) => doc.status === coluna.status);
						const idx = COLUNAS.findIndex((c) => c.status === coluna.status);
						const proximo = COLUNAS[idx + 1];
						// Lote geral (pedido do usuário): mover vários documentos de
						// uma coluna pra próxima de uma vez. A coluna "conferir" já
						// tem seu próprio fluxo de lote dedicado (LoteConferirModal,
						// com OCR/CNPJ), então esse botão só faz sentido em colunas
						// com "próximo" simples (recebido/processando).
						const selecionadosDaColuna = items.filter((doc) => selecionados.has(doc.id)).map((doc) => doc.id);
						return (
							<div key={coluna.status} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
								<div className="flex items-center justify-between">
									<p className="text-xs font-black uppercase text-slate-500">{coluna.label}</p>
									<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">{items.length}</span>
								</div>
								{canManage && proximo && coluna.status !== "conferir" && selecionadosDaColuna.length > 0 ? (
									<button
										type="button"
										disabled={movendoLote}
										onClick={() => moveStatusEmLote(selecionadosDaColuna, proximo.status)}
										className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-black text-white hover:bg-blue-700 disabled:opacity-60"
									>
										{movendoLote ? <Loader2 size={12} className="animate-spin" /> : null}
										Mover {selecionadosDaColuna.length} → {proximo.label}
									</button>
								) : null}
								<div className="mt-3 space-y-2">
									{items.map((doc) => {
										return (
											<div key={doc.id} className="rounded-xl border border-slate-200 p-3">
												<div className="flex items-start gap-2">
													{canManage && proximo && coluna.status !== "conferir" ? (
														<input
															type="checkbox"
															checked={selecionados.has(doc.id)}
															onChange={() => toggleSelecionado(doc.id)}
															className="mt-0.5 shrink-0"
															aria-label={`Selecionar ${doc.nomeArquivo}`}
														/>
													) : null}
													<FileUp size={14} className="mt-0.5 shrink-0 text-slate-400" />
													<div className="min-w-0 flex-1">
														<p className="truncate text-xs font-black text-slate-900">{doc.nomeArquivo}</p>
														<p className="text-[10px] font-semibold text-slate-500">{formatBytes(doc.tamanhoBytes)}</p>
													</div>
												</div>
												{doc.ocrStatus === "ok" ? (
													<span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
														<CheckCircle2 size={10} /> OCR encontrou dados
													</span>
												) : doc.ocrStatus === "erro" ? (
													<span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
														<AlertTriangle size={10} /> OCR falhou
													</span>
												) : null}
												{canManage ? (
													<div className="mt-2 flex flex-wrap gap-1.5">
														{coluna.status === "conferir" ? (
															<button type="button" onClick={() => setConferindo(doc)} className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 hover:bg-emerald-100">
																Conferir e gerar nota
															</button>
														) : proximo ? (
															<button type="button" onClick={() => moveStatus(doc.id, proximo.status)} className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700 hover:bg-blue-100">
																→ {proximo.label}
															</button>
														) : null}
														<button
															type="button"
															onClick={() => handleDelete(doc)}
															aria-label={`Remover documento ${doc.nomeArquivo}`}
															className="flex items-center justify-center rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
														>
															<Trash2 size={13} />
														</button>
													</div>
												) : null}
											</div>
										);
									})}
									{!items.length ? <p className="text-xs font-semibold text-slate-400">Nada aqui.</p> : null}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{conferindo ? (
				<ConferirModal
					documento={conferindo}
					onClose={() => setConferindo(null)}
					onGerado={async () => {
						setConferindo(null);
						await load();
					}}
				/>
			) : null}
			{loteAberto ? (
				<LoteConferirModal
					documentos={documentos.filter((d) => d.status === "conferir")}
					onClose={() => setLoteAberto(false)}
					onConcluido={async () => {
						setLoteAberto(false);
						await load();
					}}
				/>
			) : null}

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Remover este documento da caixa de entrada?"
				description="O arquivo e o resultado do OCR são apagados. Se ainda não foi baixado/gerado como nota, essa pode ser a única cópia digital dele."
				items={confirmTarget ? [{ label: "Arquivo", value: confirmTarget.nomeArquivo }] : []}
				confirmLabel="Remover documento"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

// "Grupo de 50 notas de uma vez" (pedido do usuário) — tabela editável com
// TODOS os documentos em "Conferir" ao mesmo tempo, em vez de abrir um
// modal por documento. Cada linha pode ser desmarcada (ex.: um item com
// dado ruim que precisa de conferência individual depois) — best-effort:
// um item com erro não trava os outros (ver POST /gerar-notas-lote).
function LoteConferirModal({ documentos, onClose, onConcluido }) {
	const [linhas, setLinhas] = useState(() =>
		documentos.map((doc) => {
			const campos = doc.camposExtraidos || {};
			return {
				documentoId: doc.id,
				nomeArquivo: doc.nomeArquivo,
				selecionado: doc.ocrStatus === "ok" && Boolean(campos.valorEncontrado),
				numero: campos.numeroEncontrado || "",
				cnpjEmissor: campos.cnpjEmissor || "",
				fornecedorNome: campos.fornecedorNome || "",
				valor: campos.valorEncontrado || "",
				dataVencimento: campos.datasEncontradas?.[1] || campos.datasEncontradas?.[0] || "",
			};
		}),
	);
	const [saving, setSaving] = useState(false);
	const [resultado, setResultado] = useState(null);
	const [error, setError] = useState("");
	const [situacaoReceita, setSituacaoReceita] = useState({}); // { [documentoId]: { checando, ativa, razaoSocial } }
	const [verificandoCnpjs, setVerificandoCnpjs] = useState(false);

	const setLinha = (documentoId, field, value) => {
		setLinhas((current) => current.map((linha) => (linha.documentoId === documentoId ? { ...linha, [field]: value } : linha)));
	};

	const selecionadas = linhas.filter((linha) => linha.selecionado);

	// Item "CNPJ ativo automático na conferência em lote": verifica todos os
	// CNPJs preenchidos de uma vez (o backend já tem cache de 1h por CNPJ,
	// então repetir a verificação depois de editar um campo é barato).
	const handleVerificarCnpjs = async () => {
		const alvos = linhas.filter((linha) => linha.cnpjEmissor?.replace(/\D/g, "").length === 14);
		if (!alvos.length) return;
		setVerificandoCnpjs(true);
		await Promise.all(
			alvos.map(async (linha) => {
				setSituacaoReceita((current) => ({ ...current, [linha.documentoId]: { checando: true } }));
				try {
					const empresa = await fetchFinanCnpj(linha.cnpjEmissor);
					setSituacaoReceita((current) => ({
						...current,
						[linha.documentoId]: { checando: false, ativa: empresa.ativa, razaoSocial: empresa.razaoSocial },
					}));
				} catch {
					setSituacaoReceita((current) => ({ ...current, [linha.documentoId]: { checando: false, erro: true } }));
				}
			}),
		);
		setVerificandoCnpjs(false);
	};

	const handleGerar = async () => {
		const semValor = selecionadas.find((linha) => !linha.valor || Number(linha.valor) <= 0);
		if (semValor) {
			setError(`Informe o valor de "${semValor.nomeArquivo}" antes de gerar (ou desmarque essa linha).`);
			return;
		}
		if (!selecionadas.length) {
			setError("Selecione ao menos 1 documento.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const data = await gerarNotasEmLote(
				selecionadas.map((linha) => ({
					documentoId: linha.documentoId,
					numero: linha.numero || undefined,
					cnpjEmissor: linha.cnpjEmissor || undefined,
					fornecedorNome: linha.fornecedorNome || undefined,
					descricao: linha.fornecedorNome ? `Nota - ${linha.fornecedorNome}` : undefined,
					valor: Number(linha.valor),
					dataVencimento: linha.dataVencimento || undefined,
					nomeArquivo: linha.nomeArquivo,
				})),
			);
			setResultado(data);
			if (data.sucesso === data.total) {
				await onConcluido();
			}
		} catch (err) {
			setError(err?.message || "Não foi possível gerar as notas em lote.");
		} finally {
			setSaving(false);
		}
	};

	// Indice por documentoId construido uma unica vez por render — evita
	// `linhas.map(linha => resultado.resultados.find(...))` (O(linhas x
	// resultados) dentro do map da tabela). Volume de hoje e pequeno (lote
	// selecionado manualmente), mas o padrao e o mesmo que deixou a Gestao
	// Orcamentaria lenta — corrigido aqui tambem antes de virar problema.
	const resultadosPorDocumentoId = new Map(
		(resultado?.resultados || []).map((item) => [item.documentoId, item]),
	);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
				<div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
					<div>
						<h2 className="text-xl font-black text-slate-950">Conferir em lote</h2>
						<p className="text-xs font-semibold text-slate-500">
							{selecionadas.length} de {linhas.length} documento(s) selecionado(s) para virar Nota Fiscal
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleVerificarCnpjs}
							disabled={verificandoCnpjs}
							className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
						>
							{verificandoCnpjs ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
							Verificar CNPJs na Receita
						</button>
						<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X size={18} /></button>
					</div>
				</div>

				{error ? <p className="mx-5 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

				{resultado ? (
					<div className="mx-5 mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
						{resultado.sucesso} de {resultado.total} nota(s) gerada(s) com sucesso.
						{resultado.sucesso < resultado.total ? " Alguns itens falharam — confira abaixo e tente de novo individualmente." : ""}
					</div>
				) : null}

				<div className="flex-1 overflow-auto p-5">
					<table className="w-full min-w-[900px] text-xs">
						<thead>
							<tr className="border-b border-slate-100 text-left">
								<th scope="col" className="w-8 px-2 py-2"></th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Arquivo</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Número</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">CNPJ</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Receita</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Fornecedor</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Valor</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Vencimento</th>
								<th scope="col" className="px-2 py-2 font-black uppercase text-slate-500">Resultado</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{linhas.map((linha) => {
								const resultadoLinha = resultadosPorDocumentoId.get(linha.documentoId);
								return (
									<tr key={linha.documentoId} className={linha.selecionado ? "" : "opacity-50"}>
										<td className="px-2 py-1.5">
											<input type="checkbox" checked={linha.selecionado} onChange={(e) => setLinha(linha.documentoId, "selecionado", e.target.checked)} />
										</td>
										<td className="max-w-[140px] truncate px-2 py-1.5 font-bold text-slate-700" title={linha.nomeArquivo}>{linha.nomeArquivo}</td>
										<td className="px-2 py-1.5">
											<input value={linha.numero} onChange={(e) => setLinha(linha.documentoId, "numero", e.target.value)} className="h-8 w-24 rounded-lg border border-slate-200 px-2 font-semibold" />
										</td>
										<td className="px-2 py-1.5">
											<input value={linha.cnpjEmissor} onChange={(e) => setLinha(linha.documentoId, "cnpjEmissor", e.target.value)} className="h-8 w-32 rounded-lg border border-slate-200 px-2 font-semibold" />
										</td>
										<td className="px-2 py-1.5">
											{(() => {
												const situacao = situacaoReceita[linha.documentoId];
												if (!situacao) return <span className="text-slate-300">—</span>;
												if (situacao.checando) return <Loader2 size={13} className="animate-spin text-slate-400" />;
												if (situacao.erro) return <span className="text-[10px] font-bold text-slate-400">Falhou</span>;
												return situacao.ativa ? (
													<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700" title={situacao.razaoSocial}>
														<ShieldCheck size={11} /> Ativa
													</span>
												) : (
													<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700" title={situacao.razaoSocial}>
														<ShieldAlert size={11} /> Inativa
													</span>
												);
											})()}
										</td>
										<td className="px-2 py-1.5">
											<input value={linha.fornecedorNome} onChange={(e) => setLinha(linha.documentoId, "fornecedorNome", e.target.value)} className="h-8 w-32 rounded-lg border border-slate-200 px-2 font-semibold" />
										</td>
										<td className="px-2 py-1.5">
											<input type="number" step="0.01" value={linha.valor} onChange={(e) => setLinha(linha.documentoId, "valor", e.target.value)} className="h-8 w-24 rounded-lg border border-slate-200 px-2 font-semibold" />
										</td>
										<td className="px-2 py-1.5">
											<input type="date" value={linha.dataVencimento} onChange={(e) => setLinha(linha.documentoId, "dataVencimento", e.target.value)} className="h-8 w-32 rounded-lg border border-slate-200 px-2 font-semibold" />
										</td>
										<td className="px-2 py-1.5">
											{resultadoLinha ? (
												resultadoLinha.ok ? (
													<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-black text-emerald-700"><CheckCircle2 size={11} /> Gerada</span>
												) : (
													<span className="text-[11px] font-bold text-red-600" title={resultadoLinha.erro}>Falhou</span>
												)
											) : null}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				<div className="flex justify-end gap-2 border-t border-slate-100 p-5">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
						{resultado ? "Fechar" : "Cancelar"}
					</button>
					{!resultado || resultado.sucesso < resultado.total ? (
						<button type="button" onClick={handleGerar} disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
							{saving ? "Gerando..." : `Gerar ${selecionadas.length} nota(s)`}
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}

// Etapa "Conferir": mostra o que o OCR sugeriu, sempre editável, e só
// vira Nota Fiscal quando o usuário confirma explicitamente aqui.
function ConferirModal({ documento, onClose, onGerado }) {
	const campos = documento.camposExtraidos || {};
	const [form, setForm] = useState({
		numero: campos.numeroEncontrado || "",
		cnpjEmissor: campos.cnpjEmissor || "",
		fornecedorNome: campos.fornecedorNome || "",
		descricao: "",
		valor: campos.valorEncontrado || "",
		dataEmissao: campos.datasEncontradas?.[0] || "",
		dataVencimento: campos.datasEncontradas?.[1] || campos.datasEncontradas?.[0] || "",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleGerar = async () => {
		if (!form.valor) {
			setError("Informe o valor da nota.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await gerarNotaDeDocumento(documento.id, { ...form, valor: Number(form.valor), nomeArquivo: documento.nomeArquivo });
			await onGerado();
		} catch (err) {
			setError(err?.message || "Não foi possível gerar a nota.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">Conferir dados</h2>
						<p className="text-xs font-semibold text-slate-500">{documento.nomeArquivo}</p>
					</div>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X size={18} /></button>
				</div>
				{documento.ocrStatus === "ok" ? (
					<p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
						Sugestão automática do OCR — confira e corrija antes de confirmar.
					</p>
				) : (
					<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
						O OCR não conseguiu ler este documento. Preencha os dados manualmente.
					</p>
				)}
				{error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
				<div className="mt-4 grid gap-3">
					<div className="grid grid-cols-2 gap-3">
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Número</span>
							<input value={form.numero} onChange={(e) => set("numero", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
						</label>
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">CNPJ emissor</span>
							<input value={form.cnpjEmissor} onChange={(e) => set("cnpjEmissor", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
						</label>
					</div>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Fornecedor</span>
						<input value={form.fornecedorNome} onChange={(e) => set("fornecedorNome", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Valor</span>
						<input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<div className="grid grid-cols-2 gap-3">
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Emissão</span>
							<input type="date" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
						</label>
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Vencimento</span>
							<input type="date" value={form.dataVencimento} onChange={(e) => set("dataVencimento", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
						</label>
					</div>
				</div>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
					<button type="button" onClick={handleGerar} disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
						{saving ? "Gerando..." : "Confirmar e gerar nota"}
					</button>
				</div>
			</div>
		</div>
	);
}

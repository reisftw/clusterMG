// Roteiro Finan Fase 3 (pré-requisito) — Notas Fiscais: cadastro
// independente (não gera Conta a Pagar automaticamente).
import { CheckCircle2, Eye, ExternalLink, FileText, Landmark, Loader2, Plus, RefreshCw, ShieldCheck, ShieldX, Trash2, X } from "lucide-react";
import { useState, useEffect } from "react";
import {
	createFinanContaPagar,
	createFinanNota,
	deleteFinanNota,
	fetchFinanCnpj,
	fetchFinanDocumentoConteudo,
	fetchFinanNotas,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/useFinanAuth";

function hasManage(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.notas.manage");
}

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

const STATUS_LABEL = { pendente: "Pendente", paga: "Paga", cancelada: "Cancelada" };

export default function FinanNotasPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasManage(currentUser);
	const [notas, setNotas] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modalOpen, setModalOpen] = useState(false);
	const [gerandoContaPara, setGerandoContaPara] = useState(null);
	const [visualizando, setVisualizando] = useState(null);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setNotas(await fetchFinanNotas());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as notas.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleDelete = (item) => setConfirmTarget(item);

	const closeConfirm = () => {
		setConfirmTarget(null);
		setConfirmError("");
	};

	const handleConfirmDelete = async () => {
		if (!confirmTarget) return;
		setConfirming(true);
		setConfirmError("");
		try {
			await deleteFinanNota(confirmTarget.id);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível cancelar a nota.");
		} finally {
			setConfirming(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<FileText size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Operação</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Notas</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Cadastro de notas fiscais recebidas, independente de contas a pagar.</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							<RefreshCw size={17} />
							Atualizar
						</button>
						{canManage ? (
							<button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700">
								<Plus size={17} />
								Nova nota
							</button>
						) : null}
					</div>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">Carregando...</p>
				) : (
					<>
						{/* UX_AUDIT.md, Fase 5 (Responsividade): abaixo de `sm`, cards
						empilhados no lugar da tabela com min-w — mesmo padrão de
						FinanContasPagarPage.jsx. */}
						<div className="divide-y divide-slate-100 sm:hidden">
							{notas.map((item) => (
								<div key={item.id} className="p-4">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<p className="truncate font-black text-slate-950">{item.numero || "-"}</p>
											<p className="truncate text-xs font-semibold text-slate-500">{item.fornecedorNome || item.descricao || "-"}</p>
										</div>
										<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{STATUS_LABEL[item.status] || item.status}</span>
									</div>
									<div className="mt-2 flex items-center justify-between text-sm">
										<span className="font-semibold text-slate-700">{formatMoney(item.valor)}</span>
										<span className="font-semibold text-slate-500">{formatDate(item.dataVencimento)}</span>
									</div>
									<div className="mt-3 flex gap-2">
										<button
											type="button"
											onClick={() => setVisualizando(item)}
											className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-black text-blue-700"
										>
											<Eye size={14} /> Detalhes
										</button>
										{!item.contaPagarId && item.status === "pendente" && canManage ? (
											<button
												type="button"
												onClick={() => setGerandoContaPara(item)}
												className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700"
											>
												<Landmark size={14} /> Gerar conta
											</button>
										) : null}
										{canManage ? (
											<button
												type="button"
												onClick={() => handleDelete(item)}
												aria-label={`Cancelar nota ${item.numero || item.fornecedorNome || ""}`}
												className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-black text-red-700"
											>
												<Trash2 size={14} /> Cancelar
											</button>
										) : null}
									</div>
								</div>
							))}
							{!notas.length ? (
								<p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma nota cadastrada.</p>
							) : null}
						</div>

						<div className="hidden overflow-x-auto sm:block">
						<table className="w-full min-w-[960px] text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left">
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Número</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Fornecedor / CNPJ</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Valor</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Vencimento</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Status</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Conta a pagar</th>
									<th scope="col" className="px-5 py-3 text-right text-xs font-black uppercase text-slate-500">Ações</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{notas.map((item) => (
									<tr key={item.id}>
										<td className="px-5 py-3 font-black text-slate-950">{item.numero || "-"}</td>
										<td className="px-5 py-3 font-semibold text-slate-700">
											<p className="truncate">{item.fornecedorNome || item.descricao || "-"}</p>
											{item.cnpjEmissor ? <p className="text-[11px] font-semibold text-slate-400">{item.cnpjEmissor}</p> : null}
										</td>
										<td className="px-5 py-3 font-semibold text-slate-700">{formatMoney(item.valor)}</td>
										<td className="px-5 py-3 font-semibold text-slate-700">{formatDate(item.dataVencimento)}</td>
										<td className="px-5 py-3">
											<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{STATUS_LABEL[item.status] || item.status}</span>
										</td>
										<td className="px-5 py-3">
											{item.contaPagarId ? (
												<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
													<Landmark size={12} /> Gerada
												</span>
											) : item.status === "pendente" && canManage ? (
												<button
													type="button"
													onClick={() => setGerandoContaPara(item)}
													className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 hover:bg-blue-100"
												>
													<Landmark size={12} /> Gerar Conta a Pagar
												</button>
											) : (
												<span className="text-xs font-semibold text-slate-400">-</span>
											)}
										</td>
										<td className="px-5 py-3">
											<div className="flex justify-end gap-1">
												<button type="button" onClick={() => setVisualizando(item)} title="Ver detalhes" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
													<Eye size={16} />
												</button>
												{canManage ? (
													<button
														type="button"
														onClick={() => handleDelete(item)}
														title="Cancelar"
														aria-label={`Cancelar nota ${item.numero || item.fornecedorNome || ""}`}
														className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
													>
														<Trash2 size={16} />
													</button>
												) : null}
											</div>
										</td>
									</tr>
								))}
								{!notas.length ? (
									<tr>
										<td colSpan={7} className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhuma nota cadastrada.</td>
									</tr>
								) : null}
							</tbody>
						</table>
						</div>
					</>
				)}
			</div>

			{modalOpen ? <NovaNotaModal onClose={() => setModalOpen(false)} onSaved={async () => { setModalOpen(false); await load(); }} /> : null}
			{gerandoContaPara ? (
				<GerarContaPagarModal
					nota={gerandoContaPara}
					onClose={() => setGerandoContaPara(null)}
					onSaved={async () => {
						setGerandoContaPara(null);
						await load();
					}}
				/>
			) : null}
			{visualizando ? <VisualizarNotaModal nota={visualizando} onClose={() => setVisualizando(null)} /> : null}

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Cancelar esta nota?"
				description="A nota passa para o status cancelada. Ela continua visível no histórico, mas não conta mais como pendente."
				items={confirmTarget ? [{ label: "Nota", value: confirmTarget.numero || confirmTarget.fornecedorNome || "-" }] : []}
				confirmLabel="Cancelar nota"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

// "Ver a nota antes de pagar" (pedido do usuário): todos os dados da nota
// + verificação do CNPJ ativo na Receita (BrasilAPI) + abrir o documento
// original (PDF/imagem), quando a nota veio da Caixa de Entrada.
function VisualizarNotaModal({ nota, onClose }) {
	const [cnpjInfo, setCnpjInfo] = useState(null);
	const [checkingCnpj, setCheckingCnpj] = useState(false);
	const [cnpjError, setCnpjError] = useState("");
	const [openingDoc, setOpeningDoc] = useState(false);
	const [docError, setDocError] = useState("");

	const handleVerificarCnpj = async () => {
		if (!nota.cnpjEmissor) return;
		setCheckingCnpj(true);
		setCnpjError("");
		setCnpjInfo(null);
		try {
			setCnpjInfo(await fetchFinanCnpj(nota.cnpjEmissor));
		} catch (err) {
			setCnpjError(err?.message || "Não foi possível verificar o CNPJ.");
		} finally {
			setCheckingCnpj(false);
		}
	};

	const handleVerDocumento = async () => {
		if (!nota.documentoId) return;
		setOpeningDoc(true);
		setDocError("");
		try {
			const { tipoMime, conteudoBase64 } = await fetchFinanDocumentoConteudo(nota.documentoId);
			const byteChars = atob(conteudoBase64);
			const bytes = new Uint8Array(byteChars.length);
			for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
			const blob = new Blob([bytes], { type: tipoMime || "application/octet-stream" });
			const url = URL.createObjectURL(blob);
			window.open(url, "_blank", "noopener,noreferrer");
			setTimeout(() => URL.revokeObjectURL(url), 60000);
		} catch (err) {
			setDocError(err?.message || "Não foi possível abrir o documento.");
		} finally {
			setOpeningDoc(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">Nota {nota.numero || nota.id}</h2>
						<p className="text-xs font-semibold text-slate-500">{STATUS_LABEL[nota.status] || nota.status}</p>
					</div>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X size={18} /></button>
				</div>

				<div className="mt-4 grid grid-cols-2 gap-3 text-sm">
					<div>
						<p className="text-[11px] font-black uppercase text-slate-400">Fornecedor</p>
						<p className="font-bold text-slate-900">{nota.fornecedorNome || "Não informado"}</p>
					</div>
					<div>
						<p className="text-[11px] font-black uppercase text-slate-400">CNPJ</p>
						<p className="font-bold text-slate-900">{nota.cnpjEmissor || "Não informado"}</p>
					</div>
					<div>
						<p className="text-[11px] font-black uppercase text-slate-400">Valor</p>
						<p className="font-bold text-slate-900">{formatMoney(nota.valor)}</p>
					</div>
					<div>
						<p className="text-[11px] font-black uppercase text-slate-400">Vencimento</p>
						<p className="font-bold text-slate-900">{formatDate(nota.dataVencimento)}</p>
					</div>
					<div className="col-span-2">
						<p className="text-[11px] font-black uppercase text-slate-400">Descrição</p>
						<p className="font-semibold text-slate-700">{nota.descricao || "-"}</p>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap gap-2">
					{nota.cnpjEmissor ? (
						<button
							type="button"
							onClick={handleVerificarCnpj}
							disabled={checkingCnpj}
							className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
						>
							{checkingCnpj ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
							Verificar CNPJ na Receita
						</button>
					) : null}
					{nota.documentoId ? (
						<button
							type="button"
							onClick={handleVerDocumento}
							disabled={openingDoc}
							className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
						>
							{openingDoc ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
							Ver documento original
						</button>
					) : null}
				</div>

				{cnpjError ? <p className="mt-2 text-xs font-bold text-red-600">{cnpjError}</p> : null}
				{docError ? <p className="mt-2 text-xs font-bold text-red-600">{docError}</p> : null}

				{cnpjInfo ? (
					<div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
						<div className="flex items-center justify-between gap-2">
							<p className="text-sm font-black text-slate-900">{cnpjInfo.razaoSocial}</p>
							{cnpjInfo.ativa ? (
								<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
									<CheckCircle2 size={12} /> Ativa
								</span>
							) : (
								<span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-700">
									<ShieldX size={12} /> {cnpjInfo.situacaoCadastral}
								</span>
							)}
						</div>
						<p className="mt-1 text-xs font-semibold text-slate-500">{cnpjInfo.municipio} - {cnpjInfo.uf}</p>
						{nota.fornecedorNome && cnpjInfo.razaoSocial && !cnpjInfo.razaoSocial.toUpperCase().includes(nota.fornecedorNome.toUpperCase().slice(0, 8)) ? (
							<p className="mt-1.5 text-[11px] font-bold text-amber-700">⚠ O nome na nota é diferente do registrado na Receita — confira antes de pagar.</p>
						) : null}
					</div>
				) : null}

				<div className="mt-5 flex justify-end">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Fechar</button>
				</div>
			</div>
		</div>
	);
}

// Fecha o gap "nota pendente sem próximo passo": gera uma Conta a Pagar
// vinculada (finan_contas_pagar.nota_id) a partir dos dados da própria
// nota — mesmo padrão de "conferir antes de confirmar" do OCR na Caixa de
// Entrada, os campos vêm pré-preenchidos mas sempre editáveis.
function GerarContaPagarModal({ nota, onClose, onSaved }) {
	const [form, setForm] = useState({
		descricao: nota.descricao || `Nota ${nota.numero || nota.id}`,
		valor: nota.valor || "",
		dataVencimento: nota.dataVencimento || "",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleGerar = async () => {
		if (!form.descricao.trim()) {
			setError("Informe a descrição.");
			return;
		}
		if (!form.valor) {
			setError("Informe o valor.");
			return;
		}
		if (!form.dataVencimento) {
			setError("Informe a data de vencimento.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createFinanContaPagar({
				descricao: form.descricao.trim(),
				valor: Number(form.valor),
				dataVencimento: form.dataVencimento,
				fornecedorId: nota.fornecedorId || undefined,
				notaId: nota.id,
			});
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível gerar a conta a pagar.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-xl font-black text-slate-950">Gerar Conta a Pagar</h2>
						<p className="text-xs font-semibold text-slate-500">A partir da nota {nota.numero || nota.id}</p>
					</div>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X size={18} /></button>
				</div>
				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
				<div className="mt-4 grid gap-3">
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Descrição</span>
						<input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Valor</span>
						<input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Vencimento</span>
						<input type="date" value={form.dataVencimento} onChange={(e) => set("dataVencimento", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
				</div>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
					<button type="button" onClick={handleGerar} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Gerando..." : "Gerar Conta a Pagar"}
					</button>
				</div>
			</div>
		</div>
	);
}

function NovaNotaModal({ onClose, onSaved }) {
	const [form, setForm] = useState({ numero: "", cnpjEmissor: "", fornecedorNome: "", descricao: "", valor: "", dataEmissao: "", dataVencimento: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleSave = async () => {
		if (!form.valor) {
			setError("Informe ao menos o valor da nota.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createFinanNota({ ...form, valor: Number(form.valor) });
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível criar a nota.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<h2 className="text-xl font-black text-slate-950">Nova nota</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X size={18} /></button>
				</div>
				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
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
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome do fornecedor</span>
						<input value={form.fornecedorNome} onChange={(e) => set("fornecedorNome", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Descrição</span>
						<input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
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
					<button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : "Criar"}
					</button>
				</div>
			</div>
		</div>
	);
}

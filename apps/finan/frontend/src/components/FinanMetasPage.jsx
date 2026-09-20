// Metas financeiras (roteiro Finan #18) — meta de redução contra um
// valor base, com barra de progresso e projeção simples de quando deve
// ser atingida no ritmo atual.
import { Plus, RefreshCw, Target, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createFinanMeta, deleteFinanMeta, fetchFinanMetas, updateFinanMeta } from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/useFinanAuth";
import { useFinanToast } from "../state/useFinanToast";

function hasFinanBudgetManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.gestao_orcamentaria.manage");
}

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

export default function FinanMetasPage() {
	const { user: currentUser } = useFinanAuth();
	const toast = useFinanToast();
	const canManage = hasFinanBudgetManagePermission(currentUser);
	const [metas, setMetas] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modalOpen, setModalOpen] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setMetas(await fetchFinanMetas());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as metas.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleDelete = (meta) => setConfirmTarget(meta);

	const closeConfirm = () => {
		setConfirmTarget(null);
		setConfirmError("");
	};

	const handleConfirmDelete = async () => {
		if (!confirmTarget) return;
		setConfirming(true);
		setConfirmError("");
		try {
			await deleteFinanMeta(confirmTarget.id);
			toast.success(`Meta "${confirmTarget.titulo}" excluída.`);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível excluir a meta.");
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
							<Target size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Gestão Orçamentária</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Metas Financeiras</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Acompanhe metas de redução de custo com projeção de quando devem ser atingidas.
							</p>
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
								Nova meta
							</button>
						) : null}
					</div>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Carregando metas...</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					{metas.map((meta) => (
						<article key={meta.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<div className="flex items-start justify-between gap-3">
								<div>
									<h2 className="text-base font-black text-slate-950">{meta.titulo}</h2>
									{meta.descricao ? <p className="mt-1 text-xs font-medium text-slate-500">{meta.descricao}</p> : null}
								</div>
								{canManage ? (
									<button
										type="button"
										onClick={() => handleDelete(meta)}
										aria-label={`Excluir meta ${meta.titulo}`}
										className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
									>
										<Trash2 size={16} />
									</button>
								) : null}
							</div>
							<div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
								<div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${meta.progresso}%` }} />
							</div>
							<p className="mt-2 text-sm font-black text-slate-900">{meta.progresso.toFixed(0)}% concluído</p>
							<div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold text-slate-500">
								<div>
									<p className="uppercase">Base</p>
									<p className="text-slate-900">{formatMoney(meta.valorBase)}</p>
								</div>
								<div>
									<p className="uppercase">Atual</p>
									<p className="text-slate-900">{formatMoney(meta.valorAtual)}</p>
								</div>
								<div>
									<p className="uppercase">Alvo</p>
									<p className="text-slate-900">{formatMoney(meta.valorAlvo)}</p>
								</div>
							</div>
							{meta.dataProjetada ? (
								<p className="mt-3 text-xs font-bold text-blue-700">
									No ritmo atual, a meta deve ser atingida em {formatDate(meta.dataProjetada)}.
								</p>
							) : null}
							{canManage ? <UpdateAtualInline meta={meta} onSaved={load} /> : null}
						</article>
					))}
					{!metas.length ? (
						<p className="text-sm font-semibold text-slate-500">Nenhuma meta cadastrada ainda.</p>
					) : null}
				</div>
			)}

			{modalOpen ? (
				<NovaMetaModal
					onClose={() => setModalOpen(false)}
					onSaved={async () => {
						setModalOpen(false);
						toast.success("Meta criada.");
						await load();
					}}
				/>
			) : null}

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Excluir esta meta?"
				description="A meta some do painel. Essa ação não pode ser desfeita."
				items={confirmTarget ? [{ label: "Meta", value: confirmTarget.titulo }] : []}
				confirmLabel="Excluir meta"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

function UpdateAtualInline({ meta, onSaved }) {
	const [value, setValue] = useState(meta.valorAtual);
	const [saving, setSaving] = useState(false);

	const handleSave = async () => {
		setSaving(true);
		try {
			await updateFinanMeta(meta.id, { valorAtual: Number(value) });
			await onSaved();
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
			<label className="flex-1">
				<span className="mb-1 block text-[11px] font-black uppercase text-slate-500">Atualizar valor atual</span>
				<input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-blue-400" />
			</label>
			<button type="button" onClick={handleSave} disabled={saving} className="mt-5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60">
				{saving ? "..." : "Salvar"}
			</button>
		</div>
	);
}

function NovaMetaModal({ onClose, onSaved }) {
	const [form, setForm] = useState({ titulo: "", descricao: "", valorBase: "", valorAlvo: "", dataAlvo: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleSave = async () => {
		if (!form.titulo.trim() || !form.valorBase || !form.valorAlvo) {
			setError("Preencha título, valor base e valor alvo.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createFinanMeta({
				titulo: form.titulo,
				descricao: form.descricao || undefined,
				valorBase: Number(form.valorBase),
				valorAlvo: Number(form.valorAlvo),
				dataAlvo: form.dataAlvo || undefined,
			});
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível criar a meta.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<h2 className="text-xl font-black text-slate-950">Nova meta</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
						<X size={18} />
					</button>
				</div>
				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
				<div className="mt-4 grid gap-3">
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Título</span>
						<input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Reduzir despesas operacionais em 5%" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Descrição</span>
						<input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<div className="grid grid-cols-2 gap-3">
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Valor base (hoje)</span>
							<input type="number" step="0.01" value={form.valorBase} onChange={(e) => set("valorBase", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
						</label>
						<label>
							<span className="mb-1 block text-xs font-black uppercase text-slate-500">Valor alvo</span>
							<input type="number" step="0.01" value={form.valorAlvo} onChange={(e) => set("valorAlvo", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
						</label>
					</div>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Data alvo</span>
						<input type="date" value={form.dataAlvo} onChange={(e) => set("dataAlvo", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
				</div>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
					<button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : "Criar meta"}
					</button>
				</div>
			</div>
		</div>
	);
}

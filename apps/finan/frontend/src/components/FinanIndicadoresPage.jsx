// Central de indicadores (roteiro Finan #25) — KPI customizado como
// "métrica A operador métrica B", escolhido a partir de um catálogo fixo
// (sem fórmula livre).
import { Gauge, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createFinanIndicador,
	deleteFinanIndicador,
	fetchFinanIndicadores,
	fetchFinanIndicadoresCatalogo,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/FinanAuthContext";
import { useFinanToast } from "../state/FinanToastContext";

function hasFinanBudgetManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.gestao_orcamentaria.manage");
}

export default function FinanIndicadoresPage() {
	const { user: currentUser } = useFinanAuth();
	const toast = useFinanToast();
	const canManage = hasFinanBudgetManagePermission(currentUser);
	const [indicadores, setIndicadores] = useState([]);
	const [catalogo, setCatalogo] = useState({ metricas: [], operadores: [] });
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
			const [ind, cat] = await Promise.all([fetchFinanIndicadores(), fetchFinanIndicadoresCatalogo()]);
			setIndicadores(ind);
			setCatalogo(cat);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os indicadores.");
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
			await deleteFinanIndicador(confirmTarget.id);
			toast.success(`Indicador "${confirmTarget.nome}" excluído.`);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível excluir o indicador.");
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
							<Gauge size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Gestão Orçamentária</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Central de Indicadores</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Crie KPIs combinando duas métricas do Finan.</p>
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
								Novo indicador
							</button>
						) : null}
					</div>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Carregando indicadores...</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{indicadores.map((item) => (
						<article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<div className="flex items-start justify-between gap-3">
								<p className="text-xs font-black uppercase text-slate-500">{item.nome}</p>
								{canManage ? (
									<button
										type="button"
										onClick={() => handleDelete(item)}
										aria-label={`Excluir indicador ${item.nome}`}
										className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
									>
										<Trash2 size={14} />
									</button>
								) : null}
							</div>
							<p className="mt-2 text-3xl font-black text-slate-950">
								{Number(item.valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
							</p>
							<p className="mt-1 text-xs font-semibold text-slate-500">
								{item.metricaALabel} {item.operador} {item.metricaBLabel}
							</p>
						</article>
					))}
					{!indicadores.length ? <p className="text-sm font-semibold text-slate-500">Nenhum indicador criado ainda.</p> : null}
				</div>
			)}

			{modalOpen ? (
				<NovoIndicadorModal
					catalogo={catalogo}
					onClose={() => setModalOpen(false)}
					onSaved={async () => {
						setModalOpen(false);
						toast.success("Indicador criado.");
						await load();
					}}
				/>
			) : null}

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Excluir este indicador?"
				description="O indicador some do painel. Essa ação não pode ser desfeita."
				items={confirmTarget ? [{ label: "Indicador", value: confirmTarget.nome }] : []}
				confirmLabel="Excluir indicador"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

function NovoIndicadorModal({ catalogo, onClose, onSaved }) {
	const [nome, setNome] = useState("");
	const [metricaA, setMetricaA] = useState(catalogo.metricas[0]?.key || "");
	const [operador, setOperador] = useState("/");
	const [metricaB, setMetricaB] = useState(catalogo.metricas[1]?.key || catalogo.metricas[0]?.key || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const handleSave = async () => {
		if (!nome.trim()) {
			setError("Informe o nome do indicador.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createFinanIndicador({ nome, metricaA, operador, metricaB });
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível criar o indicador.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<h2 className="text-xl font-black text-slate-950">Novo indicador</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
						<X size={18} />
					</button>
				</div>
				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
				<div className="mt-4 grid gap-3">
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome</span>
						<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Custo médio por fornecedor" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Métrica A</span>
						<select value={metricaA} onChange={(e) => setMetricaA(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400">
							{catalogo.metricas.map((m) => (
								<option key={m.key} value={m.key}>{m.label}</option>
							))}
						</select>
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Operador</span>
						<select value={operador} onChange={(e) => setOperador(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400">
							{catalogo.operadores.map((op) => (
								<option key={op} value={op}>{op}</option>
							))}
						</select>
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Métrica B</span>
						<select value={metricaB} onChange={(e) => setMetricaB(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400">
							{catalogo.metricas.map((m) => (
								<option key={m.key} value={m.key}>{m.label}</option>
							))}
						</select>
					</label>
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

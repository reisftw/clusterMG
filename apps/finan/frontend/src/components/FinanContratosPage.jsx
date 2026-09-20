// Contratos recorrentes (roteiro Finan #6) + Controle de reajustes
// (roteiro Finan #7) — cadastro proprio, nao deriva de orçamento.
import { AlertTriangle, FileSignature, Pencil, Plus, RefreshCw, TrendingUp, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createFinanContrato,
	deleteFinanContrato,
	fetchFinanContratos,
	registrarFinanReajuste,
	updateFinanContrato,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/useFinanAuth";

const PERIODICIDADES = [
	{ value: "mensal", label: "Mensal" },
	{ value: "bimestral", label: "Bimestral" },
	{ value: "trimestral", label: "Trimestral" },
	{ value: "semestral", label: "Semestral" },
	{ value: "anual", label: "Anual" },
];

function hasFinanContratosManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.contratos.manage");
}

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

const DEFAULT_FORM = {
	nome: "",
	valor: "",
	periodicidade: "mensal",
	dataInicio: "",
	dataRenovacao: "",
	indiceReajuste: "",
	responsavelNome: "",
	observacoes: "",
};

export default function FinanContratosPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasFinanContratosManagePermission(currentUser);
	const [contratos, setContratos] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState(null);
	const [reajustando, setReajustando] = useState(null);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setContratos(await fetchFinanContratos());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os contratos.");
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
			await deleteFinanContrato(confirmTarget.id);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível desativar o contrato.");
		} finally {
			setConfirming(false);
		}
	};

	const vencendoEm30 = contratos.filter((item) => item.diasParaVencer !== null && item.diasParaVencer <= 30);

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<FileSignature size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Operação</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Contratos e Compromissos Recorrentes</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Aluguel, softwares, links, seguros e outros compromissos com valor e periodicidade fixos.
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={load}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw size={17} />
							Atualizar
						</button>
						{canManage ? (
							<button
								type="button"
								onClick={() => {
									setEditing(null);
									setModalOpen(true);
								}}
								className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700"
							>
								<Plus size={17} />
								Novo contrato
							</button>
						) : null}
					</div>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			{vencendoEm30.length ? (
				<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
					<div className="flex items-center gap-2 text-sm font-black text-amber-900">
						<AlertTriangle size={18} />
						{vencendoEm30.length} contrato(s) vencem nos próximos 30 dias
					</div>
					<div className="mt-2 space-y-1">
						{vencendoEm30.map((item) => (
							<p key={item.id} className="text-xs font-semibold text-amber-800">
								{item.nome} · vence em {formatDate(item.dataRenovacao)} ({item.diasParaVencer} dia(s))
							</p>
						))}
					</div>
				</div>
			) : null}

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">Carregando contratos...</p>
				) : (
					<>
						{/* UX_AUDIT.md, Fase 5 (Responsividade): abaixo de `sm`, cards
						empilhados no lugar da tabela com min-w — mesmo padrão de
						FinanContasPagarPage.jsx. */}
						<div className="divide-y divide-slate-100 sm:hidden">
							{contratos.map((item) => (
								<div key={item.id} className="p-4">
									<div className="flex items-start justify-between gap-3">
										<p className="min-w-0 flex-1 truncate font-black text-slate-950">{item.nome}</p>
										<span className="whitespace-nowrap font-black text-slate-700">{formatMoney(item.valor)}</span>
									</div>
									<div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
										<span>{PERIODICIDADES.find((p) => p.value === item.periodicidade)?.label || item.periodicidade}</span>
										<span className={item.diasParaVencer !== null && item.diasParaVencer <= 30 ? "text-amber-700" : ""}>
											Renova {formatDate(item.dataRenovacao)}
										</span>
									</div>
									{item.responsavelNome ? (
										<p className="mt-1 text-xs font-semibold text-slate-500">Responsável: {item.responsavelNome}</p>
									) : null}
									{canManage ? (
										<div className="mt-3 flex gap-2">
											<button
												type="button"
												onClick={() => setReajustando(item)}
												className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700"
											>
												<TrendingUp size={14} /> Reajuste
											</button>
											<button
												type="button"
												onClick={() => {
													setEditing(item);
													setModalOpen(true);
												}}
												className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-black text-blue-700"
											>
												<Pencil size={14} /> Editar
											</button>
											<button
												type="button"
												onClick={() => handleDelete(item)}
												aria-label={`Desativar contrato ${item.nome}`}
												className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-black text-red-700"
											>
												<Trash2 size={14} /> Desativar
											</button>
										</div>
									) : null}
								</div>
							))}
							{!contratos.length ? (
								<p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Nenhum contrato cadastrado ainda.</p>
							) : null}
						</div>

						<div className="hidden overflow-x-auto sm:block">
						<table className="w-full min-w-[860px] text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left">
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Contrato</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Valor</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Periodicidade</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Renovação</th>
									<th scope="col" className="px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">Responsável</th>
									{canManage ? <th scope="col" className="px-5 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-500">Ações</th> : null}
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{contratos.map((item) => (
									<tr key={item.id}>
										<td className="px-5 py-3 font-black text-slate-950">{item.nome}</td>
										<td className="px-5 py-3 font-semibold text-slate-700">{formatMoney(item.valor)}</td>
										<td className="px-5 py-3 font-semibold text-slate-700">
											{PERIODICIDADES.find((p) => p.value === item.periodicidade)?.label || item.periodicidade}
										</td>
										<td className="px-5 py-3">
											<span className={`font-semibold ${item.diasParaVencer !== null && item.diasParaVencer <= 30 ? "text-amber-700" : "text-slate-700"}`}>
												{formatDate(item.dataRenovacao)}
											</span>
										</td>
										<td className="px-5 py-3 font-semibold text-slate-700">{item.responsavelNome || "-"}</td>
										{canManage ? (
											<td className="px-5 py-3">
												<div className="flex justify-end gap-1">
													<button
														type="button"
														onClick={() => setReajustando(item)}
														title="Registrar reajuste"
														className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
													>
														<TrendingUp size={16} />
													</button>
													<button
														type="button"
														onClick={() => {
															setEditing(item);
															setModalOpen(true);
														}}
														title="Editar"
														className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
													>
														<Pencil size={16} />
													</button>
													<button
														type="button"
														onClick={() => handleDelete(item)}
														title="Desativar"
														aria-label={`Desativar contrato ${item.nome}`}
														className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
													>
														<Trash2 size={16} />
													</button>
												</div>
											</td>
										) : null}
									</tr>
								))}
								{!contratos.length ? (
									<tr>
										<td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
											Nenhum contrato cadastrado ainda.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
						</div>
					</>
				)}
			</div>

			{modalOpen ? (
				<ContratoModal
					contrato={editing}
					onClose={() => setModalOpen(false)}
					onSaved={async () => {
						setModalOpen(false);
						await load();
					}}
				/>
			) : null}

			{reajustando ? (
				<ReajusteModal contrato={reajustando} onClose={() => setReajustando(null)} onSaved={async () => {
					setReajustando(null);
					await load();
				}} />
			) : null}

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Desativar este contrato?"
				description="O contrato para de contar em renovações/reajustes futuros. Pode ser reativado depois, editando o registro."
				items={confirmTarget ? [{ label: "Contrato", value: confirmTarget.nome }] : []}
				confirmLabel="Desativar contrato"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

function ContratoModal({ contrato, onClose, onSaved }) {
	const [form, setForm] = useState(() =>
		contrato
			? {
					nome: contrato.nome || "",
					valor: contrato.valor || "",
					periodicidade: contrato.periodicidade || "mensal",
					dataInicio: contrato.dataInicio ? String(contrato.dataInicio).slice(0, 10) : "",
					dataRenovacao: contrato.dataRenovacao ? String(contrato.dataRenovacao).slice(0, 10) : "",
					indiceReajuste: contrato.indiceReajuste || "",
					responsavelNome: contrato.responsavelNome || "",
					observacoes: contrato.observacoes || "",
				}
			: DEFAULT_FORM,
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleSave = async () => {
		if (!form.nome.trim() || !form.valor) {
			setError("Preencha nome e valor.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = {
				...form,
				valor: Number(form.valor),
				dataInicio: form.dataInicio || undefined,
				dataRenovacao: form.dataRenovacao || undefined,
			};
			if (contrato) await updateFinanContrato(contrato.id, payload);
			else await createFinanContrato(payload);
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o contrato.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<h2 className="text-xl font-black text-slate-950">{contrato ? "Editar contrato" : "Novo contrato"}</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
						<X size={18} />
					</button>
				</div>

				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

				<div className="mt-5 grid gap-4 sm:grid-cols-2">
					<label className="sm:col-span-2">
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Nome do contrato</span>
						<input value={form.nome} onChange={(e) => set("nome", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Valor</span>
						<input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Periodicidade</span>
						<select value={form.periodicidade} onChange={(e) => set("periodicidade", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400">
							{PERIODICIDADES.map((p) => (
								<option key={p.value} value={p.value}>{p.label}</option>
							))}
						</select>
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Início</span>
						<input type="date" value={form.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Próxima renovação</span>
						<input type="date" value={form.dataRenovacao} onChange={(e) => set("dataRenovacao", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Índice de reajuste</span>
						<input value={form.indiceReajuste} onChange={(e) => set("indiceReajuste", e.target.value)} placeholder="IGPM, IPCA..." className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Responsável</span>
						<input value={form.responsavelNome} onChange={(e) => set("responsavelNome", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
					<label className="sm:col-span-2">
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Observações</span>
						<textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400" />
					</label>
				</div>

				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
					<button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : "Salvar"}
					</button>
				</div>
			</div>
		</div>
	);
}

function ReajusteModal({ contrato, onClose, onSaved }) {
	const [valorNovo, setValorNovo] = useState(contrato.valor || "");
	const [indice, setIndice] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [result, setResult] = useState(null);

	const handleSave = async () => {
		if (!valorNovo) {
			setError("Informe o novo valor.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const reajuste = await registrarFinanReajuste(contrato.id, { valorNovo: Number(valorNovo), indice: indice || undefined });
			setResult(reajuste);
		} catch (err) {
			setError(err?.message || "Não foi possível registrar o reajuste.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
			<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-3">
					<h2 className="text-xl font-black text-slate-950">Reajuste — {contrato.nome}</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
						<X size={18} />
					</button>
				</div>

				{error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

				{result ? (
					<div className="mt-5 space-y-3">
						<p className="text-sm font-semibold text-slate-700">
							{formatMoney(result.valorAnterior)} → {formatMoney(result.valorNovo)} ({result.percentual.toFixed(1)}%)
						</p>
						{result.acimaDoHistorico ? (
							<div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
								<AlertTriangle size={16} />
								Reajuste acima do histórico deste contrato (anterior: {result.percentualAnterior.toFixed(1)}%).
							</div>
						) : null}
						<button type="button" onClick={onSaved} className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
							Fechar
						</button>
					</div>
				) : (
					<>
						<p className="mt-2 text-sm text-slate-500">Valor atual: {formatMoney(contrato.valor)}</p>
						<div className="mt-4 grid gap-3">
							<label>
								<span className="mb-1 block text-xs font-black uppercase text-slate-500">Novo valor</span>
								<input type="number" step="0.01" value={valorNovo} onChange={(e) => setValorNovo(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
							</label>
							<label>
								<span className="mb-1 block text-xs font-black uppercase text-slate-500">Índice aplicado</span>
								<input value={indice} onChange={(e) => setIndice(e.target.value)} placeholder="IGPM, IPCA..." className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" />
							</label>
						</div>
						<div className="mt-5 flex justify-end gap-2">
							<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Cancelar</button>
							<button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
								{saving ? "Registrando..." : "Registrar reajuste"}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

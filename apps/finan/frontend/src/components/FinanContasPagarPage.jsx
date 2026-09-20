// Roteiro Finan Fase 3 (pré-requisito) — Contas a Pagar.
//
// UX_AUDIT.md, Fase 1 (correção crítica #1): marcar uma conta como paga
// era um clique direto no ícone, sem nenhuma confirmação — clique errado
// distorcia o fluxo de caixa sem ninguém perceber até o fechamento do mês.
// Agora os dois ícones (pagar/cancelar) passam por ConfirmDialog.jsx, com
// resumo da conta (descrição/valor/vencimento) e o botão nomeando a
// consequência real, em vez de window.confirm() genérico.
//
// UX_AUDIT.md, seção 22 (Produtividade): seleção múltipla + ação em massa
// (mesmo ConfirmDialog reaproveitado pra 1 ou N contas) e edição inline
// (descrição/valor/vencimento direto na linha, sem abrir modal) — usando
// o PUT /contas-pagar/:id que já existia no backend mas não estava
// exposto no client. Atalho "n" abre "Nova conta" (Ctrl+K/"/" pra busca
// global já existem via FinanCommandPalette, não duplicado aqui).
import { Check, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFinanContaPagar, deleteFinanContaPagar, fetchFinanContasPagar, pagarFinanContaPagar, updateFinanContaPagar } from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import ModalShell from "./ModalShell";
import PageLoading from "./PageLoading";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";
import { useFinanAuth } from "../state/FinanAuthContext";
import { useFinanToast } from "../state/FinanToastContext";

function hasManage(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.contas_pagar.manage");
}

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

const STATUS_LABEL = { pendente: "Pendente", pago: "Pago", cancelado: "Cancelado" };

export default function FinanContasPagarPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasManage(currentUser);
	const toast = useFinanToast();
	const [contas, setContas] = useState([]);
	const [resumo, setResumo] = useState({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modalOpen, setModalOpen] = useState(false);
	// { action: "pagar" | "cancelar", contas: [conta, ...] } — mesmo shape
	// pra 1 conta (ícone da linha) ou N contas (barra de ação em massa).
	const [confirmState, setConfirmState] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");
	const [selectedIds, setSelectedIds] = useState(() => new Set());
	const [editingId, setEditingId] = useState(null);
	const [editForm, setEditForm] = useState(null);
	const [savingEdit, setSavingEdit] = useState(false);
	const searchRef = useRef(null);
	const editDescricaoRef = useRef(null);

	// Foco vai pro campo de descrição ao entrar em modo de edição — igual
	// ModalShell.jsx faz com o primeiro elemento focável de um modal: foco
	// programático depois de uma ação do usuário (clicar em "Editar"), não
	// autoFocus no mount (que o jsx-a11y sinaliza com razão: focus surpresa
	// e incondicional é o problema, não mover foco em resposta a um clique).
	useEffect(() => {
		if (editingId) editDescricaoRef.current?.focus();
	}, [editingId]);
	// UX_AUDIT.md, Fase 2 (Quick Win): cards de resumo agora funcionam como
	// filtro rápido da tabela abaixo — clicar em "Vencidas" já mostra só as
	// vencidas, sem precisar de uma barra de filtro separada.
	const [quickFilter, setQuickFilter] = useState("todos");
	// UX_AUDIT.md, Fase 4 (Otimização de fluxos): busca + paginação — a
	// tabela inteira (até 300 linhas, limite do backend) renderizava de
	// uma vez, sem jeito de achar "a conta da Vivo" sem rolar a página.
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const PAGE_SIZE = 20;

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchFinanContasPagar();
			setContas(data.contas || []);
			setResumo(data.resumo || {});
		} catch (err) {
			setError(err?.message || "Não foi possível carregar contas a pagar.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	// Atalho "n" abre "Nova conta" de qualquer lugar da tela (fora de campo
	// de texto, pra não atrapalhar digitação normal) — mesmo critério já
	// usado pelo "/" do FinanCommandPalette.
	useEffect(() => {
		if (!canManage) return undefined;
		function onKeyDown(event) {
			const isTypingTarget =
				["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) ||
				document.activeElement?.isContentEditable;
			if (event.key.toLowerCase() === "n" && !isTypingTarget && !modalOpen) {
				event.preventDefault();
				setModalOpen(true);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [canManage, modalOpen]);

	const handleConfirm = async () => {
		if (!confirmState) return;
		setConfirming(true);
		setConfirmError("");
		const alvo = confirmState.contas;
		const results = await Promise.allSettled(
			alvo.map((conta) =>
				confirmState.action === "pagar" ? pagarFinanContaPagar(conta.id) : deleteFinanContaPagar(conta.id),
			),
		);
		const falhas = results.filter((result) => result.status === "rejected").length;
		const sucessos = alvo.length - falhas;
		if (sucessos > 0) {
			const verbo = confirmState.action === "pagar" ? "marcada(s) como paga(s)" : "cancelada(s)";
			toast.success(
				alvo.length === 1
					? `"${alvo[0].descricao}" ${verbo}.`
					: `${sucessos} conta(s) ${verbo}.`,
			);
		}
		if (falhas > 0) {
			toast.error(`${falhas} conta(s) não puderam ser processadas. Tente novamente.`);
		}
		if (falhas === 0) {
			setConfirmState(null);
			setSelectedIds(new Set());
		} else {
			setConfirmError(`${falhas} de ${alvo.length} falharam.`);
		}
		setConfirming(false);
		await load();
	};

	const closeConfirm = () => {
		if (confirming) return;
		setConfirmState(null);
		setConfirmError("");
	};

	const startEdit = (conta) => {
		setEditingId(conta.id);
		setEditForm({ descricao: conta.descricao, valor: String(conta.valor), dataVencimento: conta.dataVencimento || "" });
	};

	const cancelEdit = () => {
		setEditingId(null);
		setEditForm(null);
	};

	const saveEdit = async () => {
		if (!editingId || !editForm) return;
		if (!editForm.descricao.trim() || !editForm.valor || !editForm.dataVencimento) {
			toast.error("Descrição, valor e vencimento são obrigatórios.");
			return;
		}
		setSavingEdit(true);
		try {
			await updateFinanContaPagar(editingId, {
				descricao: editForm.descricao.trim(),
				valor: Number(editForm.valor),
				dataVencimento: editForm.dataVencimento,
			});
			toast.success("Conta atualizada.");
			cancelEdit();
			await load();
		} catch (err) {
			toast.error(err?.message || "Não foi possível salvar a alteração.");
		} finally {
			setSavingEdit(false);
		}
	};

	const todayIso = new Date().toISOString().slice(0, 10);
	const weekAheadIso = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
	const filteredContas = contas.filter((item) => {
		if (quickFilter === "vencidas" && !item.vencida) return false;
		if (quickFilter === "hoje" && !(item.status === "pendente" && item.dataVencimento === todayIso)) return false;
		if (
			quickFilter === "semana" &&
			!(item.status === "pendente" && item.dataVencimento >= todayIso && item.dataVencimento <= weekAheadIso)
		)
			return false;
		if (quickFilter === "pagas" && !(item.status === "pago" && (item.dataPagamento || "").slice(0, 7) === todayIso.slice(0, 7)))
			return false;
		if (search.trim() && !String(item.descricao || "").toLowerCase().includes(search.trim().toLowerCase())) return false;
		return true;
	});
	const totalPages = Math.max(1, Math.ceil(filteredContas.length / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	const paginatedContas = filteredContas.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
	const resetPage = (fn) => (value) => {
		fn(value);
		setPage(1);
	};

	const selectedContas = useMemo(
		() => paginatedContas.filter((item) => selectedIds.has(item.id)),
		[paginatedContas, selectedIds],
	);
	const allPageSelected = paginatedContas.length > 0 && paginatedContas.every((item) => selectedIds.has(item.id));
	const somePageSelected = paginatedContas.some((item) => selectedIds.has(item.id));

	const toggleSelectAll = () => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (allPageSelected) {
				paginatedContas.forEach((item) => next.delete(item.id));
			} else {
				paginatedContas.forEach((item) => next.add(item.id));
			}
			return next;
		});
	};

	const toggleSelect = (id) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const selectAllSelectRef = useRef(null);
	useEffect(() => {
		if (selectAllSelectRef.current) {
			selectAllSelectRef.current.indeterminate = somePageSelected && !allPageSelected;
		}
	}, [somePageSelected, allPageSelected]);

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<CreditCard size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Operação</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Contas a Pagar</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">Controle de vencimentos, pagamentos e pendências.</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							<RefreshCw size={17} />
							Atualizar
						</button>
						{canManage ? (
							<button
								type="button"
								onClick={() => setModalOpen(true)}
								title="Atalho: N"
								className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700"
							>
								<Plus size={17} />
								Nova conta
								<kbd className="ml-1 hidden rounded-md border border-white/30 bg-white/10 px-1.5 py-0.5 text-[10px] font-black sm:inline">N</kbd>
							</button>
						) : null}
					</div>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				{[
					["todos", "Total a pagar", resumo.totalAPagar],
					["hoje", "Vence hoje", resumo.venceHoje],
					["semana", "Vence esta semana", resumo.venceSemana],
					["vencidas", "Vencidas", resumo.vencidas],
					["pagas", "Pagas no mês", resumo.pagasNoMes],
				].map(([filterKey, label, value]) => (
					<StatCard
						key={filterKey}
						label={label}
						value={formatMoney(value)}
						active={quickFilter === filterKey}
						onClick={() => resetPage(setQuickFilter)(quickFilter === filterKey ? "todos" : filterKey)}
					/>
				))}
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<label className="relative block flex-1 sm:max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
					<input
						ref={searchRef}
						value={search}
						onChange={(event) => resetPage(setSearch)(event.target.value)}
						placeholder="Buscar por descrição..."
						className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				{quickFilter !== "todos" ? (
					<button
						type="button"
						onClick={() => resetPage(setQuickFilter)("todos")}
						className="text-xs font-black text-blue-700 underline hover:text-blue-800"
					>
						Limpar filtro e ver todas as contas
					</button>
				) : null}
			</div>

			{canManage && selectedContas.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
					<p className="text-sm font-black text-blue-900">{selectedContas.length} selecionada(s)</p>
					{selectedContas.some((item) => item.status === "pendente") ? (
						<button
							type="button"
							onClick={() =>
								setConfirmState({
									action: "pagar",
									contas: selectedContas.filter((item) => item.status === "pendente"),
								})
							}
							className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100"
						>
							<CheckCircle2 size={14} /> Marcar como pagas
						</button>
					) : null}
					<button
						type="button"
						onClick={() => setConfirmState({ action: "cancelar", contas: selectedContas })}
						className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100"
					>
						<Trash2 size={14} /> Cancelar selecionadas
					</button>
					<button
						type="button"
						onClick={() => setSelectedIds(new Set())}
						className="ml-auto text-xs font-black text-blue-700 underline hover:text-blue-800"
					>
						Limpar seleção
					</button>
				</div>
			) : null}

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<PageLoading label="Carregando contas a pagar..." />
				) : !filteredContas.length ? (
					<EmptyState
						icon={CreditCard}
						title={contas.length ? "Nenhuma conta neste filtro" : "Nenhuma conta a pagar cadastrada"}
						description={
							contas.length
								? "Tente limpar a busca, ou o filtro do card ativo acima."
								: canManage
									? "Clique em \"Nova conta\" para lançar a primeira conta a pagar."
									: "Ainda não há contas a pagar cadastradas."
						}
					/>
				) : (
					<>
						{/* UX_AUDIT.md, Fase 5 (Responsividade): tabela com min-w
						forçava scroll horizontal em qualquer tela abaixo de ~820px
						(tablet retrato/celular). Abaixo de `sm`, mostra cards
						empilhados com a mesma informação em vez da tabela — mesmo
						padrão já usado em FinanOrcamentoCentrosCustoPage.jsx. */}
						<div className="divide-y divide-slate-100 sm:hidden">
							{paginatedContas.map((item) => (
								<div key={item.id} className="p-4">
									<div className="flex items-start gap-3">
										{canManage ? (
											<input
												type="checkbox"
												checked={selectedIds.has(item.id)}
												onChange={() => toggleSelect(item.id)}
												aria-label={`Selecionar "${item.descricao}"`}
												className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
											/>
										) : null}
										<p className="min-w-0 flex-1 truncate font-black text-slate-950">{item.descricao}</p>
										<StatusBadge
											label={item.vencida ? "Vencida" : STATUS_LABEL[item.status] || item.status}
											tone={item.vencida ? "danger" : item.status === "pago" ? "success" : item.status === "cancelado" ? "canceled" : "neutral"}
										/>
									</div>
									<div className="mt-2 flex items-center justify-between text-sm">
										<span className="font-semibold text-slate-700">{formatMoney(item.valor)}</span>
										<span className={`font-semibold ${item.vencida ? "text-red-600" : "text-slate-500"}`}>{formatDate(item.dataVencimento)}</span>
									</div>
									{canManage ? (
										<div className="mt-3 flex gap-2">
											{item.status === "pendente" ? (
												<button
													type="button"
													onClick={() => setConfirmState({ action: "pagar", contas: [item] })}
													className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700"
												>
													<CheckCircle2 size={14} /> Marcar paga
												</button>
											) : null}
											<button
												type="button"
												onClick={() => startEdit(item)}
												className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
											>
												<Pencil size={14} />
											</button>
											<button
												type="button"
												onClick={() => setConfirmState({ action: "cancelar", contas: [item] })}
												className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-black text-red-700"
											>
												<Trash2 size={14} /> Cancelar
											</button>
										</div>
									) : null}
								</div>
							))}
						</div>

						<div className="hidden overflow-x-auto sm:block">
							<table className="w-full min-w-[860px] text-sm">
								<thead>
									<tr className="border-b border-slate-100 text-left">
										{canManage ? (
											<th scope="col" className="w-10 px-5 py-3">
												<input
													ref={selectAllSelectRef}
													type="checkbox"
													checked={allPageSelected}
													onChange={toggleSelectAll}
													aria-label="Selecionar todas as contas desta página"
													className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
												/>
											</th>
										) : null}
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Descrição</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Valor</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Vencimento</th>
										<th scope="col" className="px-5 py-3 text-xs font-black uppercase text-slate-500">Status</th>
										{canManage ? <th scope="col" className="px-5 py-3 text-right text-xs font-black uppercase text-slate-500">Ações</th> : null}
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{paginatedContas.map((item) => {
										const isEditing = editingId === item.id;
										return (
											<tr key={item.id} className={isEditing ? "bg-blue-50/60" : undefined}>
												{canManage ? (
													<td className="px-5 py-3">
														<input
															type="checkbox"
															checked={selectedIds.has(item.id)}
															onChange={() => toggleSelect(item.id)}
															aria-label={`Selecionar "${item.descricao}"`}
															className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
														/>
													</td>
												) : null}
												{isEditing ? (
													<>
														<td className="px-5 py-2">
															<input
																ref={editDescricaoRef}
																value={editForm.descricao}
																onChange={(event) => setEditForm((current) => ({ ...current, descricao: event.target.value }))}
																onKeyDown={(event) => {
																	if (event.key === "Enter") saveEdit();
																	if (event.key === "Escape") cancelEdit();
																}}
																className="h-9 w-full min-w-[160px] rounded-lg border border-blue-300 px-2 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
															/>
														</td>
														<td className="px-5 py-2">
															<input
																type="number"
																step="0.01"
																value={editForm.valor}
																onChange={(event) => setEditForm((current) => ({ ...current, valor: event.target.value }))}
																onKeyDown={(event) => {
																	if (event.key === "Enter") saveEdit();
																	if (event.key === "Escape") cancelEdit();
																}}
																className="h-9 w-28 rounded-lg border border-blue-300 px-2 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
															/>
														</td>
														<td className="px-5 py-2">
															<input
																type="date"
																value={editForm.dataVencimento}
																onChange={(event) => setEditForm((current) => ({ ...current, dataVencimento: event.target.value }))}
																onKeyDown={(event) => {
																	if (event.key === "Enter") saveEdit();
																	if (event.key === "Escape") cancelEdit();
																}}
																className="h-9 rounded-lg border border-blue-300 px-2 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
															/>
														</td>
														<td className="px-5 py-3">
															<StatusBadge
																label={item.vencida ? "Vencida" : STATUS_LABEL[item.status] || item.status}
																tone={item.vencida ? "danger" : item.status === "pago" ? "success" : item.status === "cancelado" ? "canceled" : "neutral"}
															/>
														</td>
														<td className="px-5 py-3">
															<div className="flex justify-end gap-1">
																<button
																	type="button"
																	onClick={saveEdit}
																	disabled={savingEdit}
																	aria-label="Salvar alteração"
																	className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
																>
																	<Check size={16} />
																</button>
																<button
																	type="button"
																	onClick={cancelEdit}
																	disabled={savingEdit}
																	aria-label="Cancelar edição"
																	className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"
																>
																	<X size={16} />
																</button>
															</div>
														</td>
													</>
												) : (
													<>
														<td className="px-5 py-3 font-black text-slate-950">{item.descricao}</td>
														<td className="px-5 py-3 font-semibold text-slate-700">{formatMoney(item.valor)}</td>
														<td className={`px-5 py-3 font-semibold ${item.vencida ? "text-red-600" : "text-slate-700"}`}>{formatDate(item.dataVencimento)}</td>
														<td className="px-5 py-3">
															<StatusBadge
																label={item.vencida ? "Vencida" : STATUS_LABEL[item.status] || item.status}
																tone={item.vencida ? "danger" : item.status === "pago" ? "success" : item.status === "cancelado" ? "canceled" : "neutral"}
															/>
														</td>
														{canManage ? (
															<td className="px-5 py-3">
																<div className="flex justify-end gap-1">
																	{item.status === "pendente" ? (
																		<button
																			type="button"
																			onClick={() => setConfirmState({ action: "pagar", contas: [item] })}
																			title="Marcar como paga"
																			aria-label={`Marcar "${item.descricao}" como paga`}
																			className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
																		>
																			<CheckCircle2 size={16} />
																		</button>
																	) : null}
																	<button
																		type="button"
																		onClick={() => startEdit(item)}
																		title="Editar"
																		aria-label={`Editar "${item.descricao}"`}
																		className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
																	>
																		<Pencil size={16} />
																	</button>
																	<button
																		type="button"
																		onClick={() => setConfirmState({ action: "cancelar", contas: [item] })}
																		title="Cancelar conta"
																		aria-label={`Cancelar a conta "${item.descricao}"`}
																		className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
																	>
																		<Trash2 size={16} />
																	</button>
																</div>
															</td>
														) : null}
													</>
												)}
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			{!loading && filteredContas.length > PAGE_SIZE ? (
				<div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
					<p className="text-xs font-bold text-slate-500">
						{filteredContas.length} conta(s) · página {safePage} de {totalPages}
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							disabled={safePage <= 1}
							className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
						>
							<ChevronLeft size={14} /> Anterior
						</button>
						<button
							type="button"
							onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
							disabled={safePage >= totalPages}
							className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
						>
							Próxima <ChevronRight size={14} />
						</button>
					</div>
				</div>
			) : null}

			{modalOpen ? (
				<NovaContaModal
					onClose={() => setModalOpen(false)}
					onSaved={async () => {
						setModalOpen(false);
						toast.success("Conta a pagar criada.");
						await load();
					}}
				/>
			) : null}

			<ConfirmDialog
				open={Boolean(confirmState)}
				tone={confirmState?.action === "pagar" ? "success" : "danger"}
				title={
					confirmState?.action === "pagar"
						? confirmState.contas.length === 1
							? "Marcar conta como paga?"
							: `Marcar ${confirmState.contas.length} contas como pagas?`
						: confirmState?.contas.length === 1
							? "Cancelar esta conta a pagar?"
							: `Cancelar ${confirmState?.contas.length || 0} contas a pagar?`
				}
				description={
					confirmState?.action === "pagar"
						? "A(s) conta(s) sai(em) da lista de pendentes e passa(m) a contar como paga(s) no resumo do mês."
						: "A(s) conta(s) é(são) marcada(s) como cancelada(s) e some(m) da lista de pendentes. Continua(m) no histórico."
				}
				items={
					confirmState
						? confirmState.contas.length === 1
							? [
									{ label: "Descrição", value: confirmState.contas[0].descricao },
									{ label: "Valor", value: formatMoney(confirmState.contas[0].valor) },
									{ label: "Vencimento", value: formatDate(confirmState.contas[0].dataVencimento) },
								]
							: [
									{ label: "Contas selecionadas", value: String(confirmState.contas.length) },
									{
										label: "Valor total",
										value: formatMoney(confirmState.contas.reduce((sum, item) => sum + Number(item.valor || 0), 0)),
									},
								]
						: []
				}
				confirmLabel={confirmState?.action === "pagar" ? "Marcar como paga(s)" : "Cancelar conta(s)"}
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirm}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

function NovaContaModal({ onClose, onSaved }) {
	const [form, setForm] = useState({ descricao: "", valor: "", dataVencimento: "", formaPagamento: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

	const handleSave = async () => {
		if (!form.descricao.trim() || !form.valor || !form.dataVencimento) {
			setError("Preencha descrição, valor e vencimento.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await createFinanContaPagar({ ...form, valor: Number(form.valor) });
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível criar a conta.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell
			open
			onClose={saving ? undefined : onClose}
			size="md"
			title="Nova conta a pagar"
			footer={
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
						Cancelar
					</button>
					<button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : "Criar"}
					</button>
				</div>
			}
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<div className="grid gap-3">
				<label>
					<span className="mb-1 block text-xs font-black uppercase text-slate-500">Descrição</span>
					<input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<label>
					<span className="mb-1 block text-xs font-black uppercase text-slate-500">Valor</span>
					<input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<label>
					<span className="mb-1 block text-xs font-black uppercase text-slate-500">Vencimento</span>
					<input type="date" value={form.dataVencimento} onChange={(e) => set("dataVencimento", e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
				<label>
					<span className="mb-1 block text-xs font-black uppercase text-slate-500">Forma de pagamento</span>
					<input value={form.formaPagamento} onChange={(e) => set("formaPagamento", e.target.value)} placeholder="Boleto, Pix, transferência..." className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				</label>
			</div>
		</ModalShell>
	);
}

// Fechamento Mensal (roteiro Finan #12) — checklist do período +
// fechar/reabrir. Reabrir um período fechado exige justificativa
// registrada (fica na auditoria). Enquanto fechado, a importação de
// planilhas do orçamento pra esse período é bloqueada
// (financeiroBudgetImportJobs.js).
//
// UX_AUDIT.md, Fase 1 (item #4 — checagem manual do fluxo): "Reabrir"
// já tinha barreira adequada (justificativa obrigatória + auditoria), mas
// "Fechar período" era um clique único e sem nenhuma confirmação — mesmo
// com itens do checklist pendentes, o botão fechava o mês direto (e fechar
// bloqueia importação de planilha pra esse período). Adicionada
// confirmação via ConfirmDialog, com o score e a contagem de pendências
// visíveis antes de confirmar.
import { CheckCircle2, Circle, Lock, LockOpen, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { fecharFinanPeriodo, fetchFinanFechamento, reabrirFinanPeriodo } from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";
import { useFinanAuth } from "../state/useFinanAuth";
import { useFinanToast } from "../state/useFinanToast";

function hasFinanBudgetManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.gestao_orcamentaria.manage");
}

function currentPeriod() {
	const now = new Date();
	return { ano: now.getFullYear(), mes: now.getMonth() + 1 };
}

export default function FinanFechamentoPage() {
	const { user: currentUser } = useFinanAuth();
	const canManage = hasFinanBudgetManagePermission(currentUser);
	const toast = useFinanToast();
	const [period] = useState(currentPeriod());
	const [fechamento, setFechamento] = useState(null);
	const [checklist, setChecklist] = useState([]);
	const [scoreFechamento, setScoreFechamento] = useState(100);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [motivo, setMotivo] = useState("");
	const [showReopen, setShowReopen] = useState(false);
	const [confirmFechar, setConfirmFechar] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchFinanFechamento(period.ano, period.mes);
			setFechamento(data.fechamento);
			setChecklist(data.checklist || []);
			setScoreFechamento(Number.isFinite(data.scoreFechamento) ? data.scoreFechamento : 100);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o fechamento.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const isFechado = fechamento?.status === "fechado";
	const pendingCount = checklist.filter((item) => !item.ok).length;

	const handleFechar = async () => {
		setSaving(true);
		setError("");
		try {
			setFechamento(await fecharFinanPeriodo(period.ano, period.mes));
			setConfirmFechar(false);
			toast.success(`Período ${String(period.mes).padStart(2, "0")}/${period.ano} fechado.`);
		} catch (err) {
			setError(err?.message || "Não foi possível fechar o período.");
		} finally {
			setSaving(false);
		}
	};

	const handleReabrir = async () => {
		if (!motivo.trim()) {
			setError("Informe o motivo da reabertura.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			setFechamento(await reabrirFinanPeriodo(period.ano, period.mes, motivo.trim()));
			setShowReopen(false);
			setMotivo("");
			toast.success(`Período ${String(period.mes).padStart(2, "0")}/${period.ano} reaberto.`);
		} catch (err) {
			setError(err?.message || "Não foi possível reabrir o período.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isFechado ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-600"}`}>
							{isFechado ? <Lock size={24} /> : <LockOpen size={24} />}
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Gestão Orçamentária</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">
								Fechamento Mensal — {String(period.mes).padStart(2, "0")}/{period.ano}
							</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								{isFechado
									? "Período fechado. Importações de orçamento para este mês ficam bloqueadas até reabrir."
									: "Período aberto. Revise o checklist antes de fechar o mês."}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			{loading ? (
				<p className="text-sm font-semibold text-slate-500">Carregando...</p>
			) : (
				<>
					{/* Roteiro Finan #42 (Motor de Fechamento Financeiro Inteligente,
					estende #12, usa #40): Score de Fechamento — % de itens do
					checklist em dia, mesmo criterio de nota usado em Qualidade de
					Dados (#29). */}
					<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs font-black uppercase text-slate-500">Score de Fechamento</p>
								<p
									className={`mt-1 text-3xl font-black ${
										scoreFechamento >= 95 ? "text-emerald-600" : scoreFechamento >= 80 ? "text-amber-600" : "text-red-600"
									}`}
								>
									{scoreFechamento.toFixed(1)}%
								</p>
							</div>
							<div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
								<div
									className={`h-full rounded-full ${scoreFechamento >= 95 ? "bg-emerald-500" : scoreFechamento >= 80 ? "bg-amber-500" : "bg-red-500"}`}
									style={{ width: `${Math.max(4, Math.min(100, scoreFechamento))}%` }}
								/>
							</div>
						</div>
					</section>

					<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Checklist do período</h2>
						<ul className="mt-4 space-y-3">
							{checklist.map((item) => (
								<li key={item.id} className="flex items-center gap-3">
									{item.ok ? (
										<CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
									) : (
										<XCircle size={20} className="shrink-0 text-amber-600" />
									)}
									<div>
										<p className="text-sm font-bold text-slate-900">{item.label}</p>
										{!item.ok && item.pendentes ? (
											<p className="text-xs text-slate-500">{item.pendentes} pendente(s)</p>
										) : null}
									</div>
								</li>
							))}
						</ul>
						{pendingCount > 0 ? (
							<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
								{pendingCount} item(ns) do checklist ainda pendente(s). Você pode fechar mesmo assim, mas fica registrado.
							</div>
						) : (
							<div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
								<Circle size={16} />
								Tudo em dia para fechar o período.
							</div>
						)}
					</section>

					{canManage ? (
						<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							{isFechado ? (
								<div className="space-y-3">
									<p className="text-sm font-semibold text-slate-600">
										Fechado por {fechamento?.fechado_por_nome || "-"} em{" "}
										{fechamento?.fechado_em ? new Date(fechamento.fechado_em).toLocaleString("pt-BR") : "-"}.
									</p>
									{!showReopen ? (
										<button
											type="button"
											onClick={() => setShowReopen(true)}
											className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-700 hover:bg-amber-100"
										>
											<LockOpen size={17} />
											Reabrir período
										</button>
									) : (
										<div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
											<label className="block text-xs font-black uppercase text-amber-700">
												Motivo da reabertura (obrigatório, fica auditado)
												<textarea
													value={motivo}
													onChange={(event) => setMotivo(event.target.value)}
													rows={3}
													className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
												/>
											</label>
											<div className="flex gap-2">
												<button
													type="button"
													onClick={() => setShowReopen(false)}
													className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
												>
													Cancelar
												</button>
												<button
													type="button"
													onClick={handleReabrir}
													disabled={saving}
													className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-60"
												>
													<LockOpen size={16} />
													{saving ? "Reabrindo..." : "Confirmar reabertura"}
												</button>
											</div>
										</div>
									)}
								</div>
							) : (
								<button
									type="button"
									onClick={() => {
										setError("");
										setConfirmFechar(true);
									}}
									disabled={saving}
									className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
								>
									<Lock size={17} />
									{saving ? "Fechando..." : "Fechar período"}
								</button>
							)}
						</section>
					) : (
						<p className="text-xs font-semibold text-slate-400">
							Fechar/reabrir período exige a permissão finan.gestao_orcamentaria.manage.
						</p>
					)}
				</>
			)}

			<ConfirmDialog
				open={confirmFechar}
				tone={pendingCount > 0 ? "danger" : "default"}
				title="Fechar este período?"
				description={
					pendingCount > 0
						? "Existem itens do checklist pendentes. Você ainda pode fechar, mas isso fica registrado na auditoria."
						: "A partir do fechamento, a importação de planilhas de orçamento para este mês fica bloqueada até reabrir."
				}
				items={[
					{ label: "Período", value: `${String(period.mes).padStart(2, "0")}/${period.ano}` },
					{ label: "Score de fechamento", value: `${scoreFechamento.toFixed(1)}%` },
					{ label: "Itens pendentes", value: pendingCount > 0 ? `${pendingCount} pendente(s)` : "Nenhum" },
				]}
				confirmLabel="Fechar período"
				cancelLabel="Voltar"
				loading={saving}
				error={error}
				onConfirm={handleFechar}
				onCancel={() => {
					if (saving) return;
					setConfirmFechar(false);
					setError("");
				}}
			/>
		</div>
	);
}

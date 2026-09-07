import {
	AlertTriangle,
	CheckCircle2,
	ClipboardCheck,
	Mail,
	Pencil,
	X,
} from "lucide-react";
import ModalShell from "../../../../components/ui/ModalShell";
import FinancialKpiCard from "../kpi/FinancialKpiCard";

export default function BudgetApprovalsView({
	BudgetApprovalDecisionModal,
	BudgetApprovalEmailModal,
	EmptyState,
	FeedbackModal,
	approvalDecision,
	approvalEmail,
	approvalListDetail,
	brl,
	budgetApprovalStatusMeta,
	canManage,
	decimal,
	feedback,
	insights,
	integer,
	saving,
	setApprovalDecision,
	setApprovalEmail,
	setApprovalListDetail,
	setFeedback,
	updateApprovalStatus,
}) {
	const approvalsToShow = insights.approvalsAll || insights.approvals;
	const statusKey = (value) => String(value || "pendente").toLowerCase();
	const acceptedApprovals = approvalsToShow.filter(
		(item) => statusKey(item.status) === "aprovado",
	);
	const pendingApprovals = approvalsToShow.filter(
		(item) => statusKey(item.status) === "pendente",
	);
	const refusedApprovals = approvalsToShow.filter((item) =>
		["reprovado", "recusado", "ajuste_solicitado"].includes(
			statusKey(item.status),
		),
	);
	const approvalSummaryCards = [
		{
			id: "accepted",
			title: "Aprovações aceitas",
			value: acceptedApprovals.length,
			type: "integer",
			helper: "Solicitações aprovadas",
			icon: "CheckCircle2",
			color: "emerald",
			hideTrend: true,
		},
		{
			id: "pending",
			title: "Aprovações pendentes",
			value: pendingApprovals.length,
			type: "integer",
			helper: "Aguardando decisão",
			icon: "ClipboardCheck",
			color: pendingApprovals.length ? "amber" : "blue",
			hideTrend: true,
		},
		{
			id: "refused",
			title: "Aprovações recusadas",
			value: refusedApprovals.length,
			type: "integer",
			helper: "Reprovadas ou com ajuste solicitado",
			icon: "AlertTriangle",
			color: refusedApprovals.length ? "rose" : "slate",
			hideTrend: true,
		},
	];
	const renderApprovalCard = (item) => {
		const status = budgetApprovalStatusMeta(item.status);
		return (
			<article
				key={item.id}
				className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			>
				<div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<p className="text-xs font-black uppercase tracking-wide text-amber-700">
								{item.id}
							</p>
							<span
								className={`rounded-full border px-3 py-1 text-xs font-black ${status.className}`}
							>
								{status.label}
							</span>
						</div>
						<h3 className="mt-2 text-base font-black text-slate-950">
							{item.center?.nome || item.centerId}
						</h3>
						<p className="text-xs font-bold text-slate-600">
							Responsável: {item.center?.responsavel || "Não informado"} ·
							Motivo: {item.reason || "Estouro de orçamento"}
						</p>
					</div>
					<div className="text-right text-sm font-black text-slate-950">
						<p>
							{brl.format(item.used || 0)} /{" "}
							{brl.format(item.centerPlanned || item.budgeted || 0)}
						</p>
						<p className="text-xs text-red-600">
							Estouro: {brl.format(item.overflow || 0)} ·{" "}
							{decimal.format(item.percent || 0)}%
						</p>
					</div>
				</div>
				{item.note ? (
					<p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
						Motivo/observação: {item.note}
					</p>
				) : null}
				<div className="mt-4 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() =>
							setApprovalDecision({ approval: item, action: "aprovado" })
						}
						disabled={!canManage || saving || item.status !== "pendente"}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
					>
						<CheckCircle2 size={14} /> Aprovar
					</button>
					<button
						type="button"
						onClick={() =>
							setApprovalDecision({ approval: item, action: "reprovado" })
						}
						disabled={!canManage || saving || item.status !== "pendente"}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
					>
						<X size={14} /> Reprovar
					</button>
					<button
						type="button"
						onClick={() =>
							setApprovalDecision({
								approval: item,
								action: "ajuste_solicitado",
							})
						}
						disabled={!canManage || saving || item.status !== "pendente"}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
					>
						<Pencil size={14} /> Solicitar ajuste
					</button>
					{item.status === "reprovado" ? (
						<button
							type="button"
							onClick={() => setApprovalEmail(item)}
							className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
						>
							<Mail size={14} /> Enviar e-mail
						</button>
					) : null}
				</div>
			</article>
		);
	};
	const approvalListSections = [
		{
			id: "pending",
			title: "Aprovações geradas pelo orçamento",
			description:
				"Quando o realizado/comprometido atinge o alerta ou ultrapassa o limite do centro de custo, aparece aqui para aprovação.",
			items: pendingApprovals,
			empty: "Nenhuma aprovação pendente com os dados atuais.",
		},
		{
			id: "accepted",
			title: "Aprovações aceitas",
			description: "Solicitações já aprovadas pelo financeiro.",
			items: acceptedApprovals,
			empty: "Nenhuma aprovação aceita no período.",
		},
		{
			id: "refused",
			title: "Aprovações recusadas",
			description: "Solicitações reprovadas ou devolvidas para ajuste.",
			items: refusedApprovals,
			empty: "Nenhuma aprovação recusada no período.",
		},
	];

	return (
		<section className="space-y-4">
			<section className="grid gap-4 md:grid-cols-3">
				{approvalSummaryCards.map((item) => (
					<FinancialKpiCard key={item.id} item={item} />
				))}
			</section>
			{approvalListSections.map((section) => (
				<section
					key={section.id}
					className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
				>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 className="text-lg font-black text-slate-950">
								{section.title}
							</h2>
							<p className="mt-1 text-sm font-bold text-slate-500">
								{section.description}
							</p>
						</div>
						{section.items.length > 5 ? (
							<button
								type="button"
								onClick={() => setApprovalListDetail(section)}
								className="inline-flex min-h-10 items-center rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50"
							>
								Ver mais
							</button>
						) : null}
					</div>
					<div className="mt-4 grid gap-3">
						{section.items.length ? (
							section.items.slice(0, 5).map(renderApprovalCard)
						) : (
							<EmptyState text={section.empty} />
						)}
					</div>
				</section>
			))}
			{approvalListDetail ? (
				<ModalShell
					title={approvalListDetail.title}
					description={`${integer.format(approvalListDetail.items.length)} aprovação(ões) nesta lista.`}
					icon={<ClipboardCheck size={20} />}
					onClose={() => setApprovalListDetail(null)}
					size="5xl"
				>
					<div className="grid gap-3">
						{approvalListDetail.items.map(renderApprovalCard)}
					</div>
				</ModalShell>
			) : null}
			{approvalDecision ? (
				<BudgetApprovalDecisionModal
					approval={approvalDecision.approval}
					action={approvalDecision.action}
					onClose={() => setApprovalDecision(null)}
					onConfirm={(note) =>
						updateApprovalStatus(
							approvalDecision.approval,
							approvalDecision.action,
							note,
						)
					}
				/>
			) : null}
			{approvalEmail ? (
				<BudgetApprovalEmailModal
					approval={approvalEmail}
					onClose={() => setApprovalEmail(null)}
					onFakeSend={() => {
						setApprovalEmail(null);
						setFeedback({
							type: "error",
							title: "E-mail não enviado",
							message: "Email não enviado devido ao sistema estar em testes.",
						});
					}}
				/>
			) : null}
			<FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
		</section>
	);
}

import { useEffect, useState } from "react";
import { useAuthContext } from "../financeiroAuthContext";
import {
	atualizarAprovacaoOrcamentoFinanceiro,
	salvarCentrosCustoOrcamentoFinanceiro,
} from "../services/financeiroService";

export function useBudgetOperationalActions({
	config,
	onConfigUpdated,
	getVisibleError,
}) {
	const { currentUser } = useAuthContext();
	const [modalState, setModalState] = useState(null);
	const [approvalDecision, setApprovalDecision] = useState(null);
	const [approvalEmail, setApprovalEmail] = useState(null);
	const [approvalListDetail, setApprovalListDetail] = useState(null);
	const [pendenciesState, setPendenciesState] = useState(null);
	const [analyticChildrenModal, setAnalyticChildrenModal] = useState(null);
	const [dashboardDetail, setDashboardDetail] = useState(null);
	const [dashboardDetailPage, setDashboardDetailPage] = useState(1);
	const [centerPage, setCenterPage] = useState(1);
	const [dreAccountDetail, setDreAccountDetail] = useState(null);
	const [dreDrawer, setDreDrawer] = useState(null);
	const [transferRequest, setTransferRequest] = useState(null);
	const [deviationJustification, setDeviationJustification] = useState(null);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState(null);
	const [centerDeleteConfirm, setCenterDeleteConfirm] = useState(null); // { id, label }

	useEffect(() => {
		setDashboardDetailPage(1);
	}, [dashboardDetail]);

	const saveOperationalConfig = async (nextConfig) => {
		setSaving(true);
		try {
			const response = await salvarCentrosCustoOrcamentoFinanceiro(nextConfig);
			onConfigUpdated?.(response.config || nextConfig);
			setModalState(null);
			return response.config || nextConfig;
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Falha ao salvar centro de custo.",
			);
			setFeedback({
				type: "error",
				title: "Erro ao salvar centro",
				...visibleError,
			});
			return null;
		} finally {
			setSaving(false);
		}
	};

	const upsertOperationalCenter = (center) => {
		const currentCenters = config.centers || [];
		const existingIndex = currentCenters.findIndex(
			(item) => item.id === center.id || item.codigo === center.codigo,
		);
		const nextCenters =
			existingIndex >= 0
				? currentCenters.map((item, index) =>
						index === existingIndex ? center : item,
					)
				: [...currentCenters, center];
		saveOperationalConfig({ ...config, centers: nextCenters });
	};

	// Só abre o diálogo de confirmação — a exclusão real acontece em
	// confirmRemoveOperationalCenter, disparada pelo ConfirmDialog (ver
	// BudgetCostCentersView.jsx, que renderiza o diálogo usando este
	// estado). Substituiu window.confirm() (UX_AUDIT.md, item #1).
	const removeOperationalCenter = (center) => {
		setCenterDeleteConfirm({ id: center?.id, label: center?.nome || center?.codigo || "-" });
	};

	const cancelRemoveOperationalCenter = () => setCenterDeleteConfirm(null);

	const confirmRemoveOperationalCenter = async () => {
		if (!centerDeleteConfirm) return;
		await saveOperationalConfig({
			...config,
			centers: (config.centers || []).filter(
				(center) => center.id !== centerDeleteConfirm.id,
			),
		});
		setCenterDeleteConfirm(null);
	};

	const updateApprovalStatus = async (approval, nextStatus, note = "") => {
		setSaving(true);
		try {
			const response = await atualizarAprovacaoOrcamentoFinanceiro(
				approval.id,
				{ status: nextStatus, action: nextStatus, note, approval },
			);
			const saved = response.config || config;
			onConfigUpdated?.(saved);
			setApprovalDecision(null);
			setFeedback({
				type: "success",
				title: "Aprovação atualizada",
				message:
					nextStatus === "aprovado"
						? "Solicitação aprovada com sucesso."
						: nextStatus === "reprovado"
							? "Solicitação reprovada com sucesso."
							: "Ajuste solicitado com sucesso.",
			});
			if (nextStatus === "reprovado") {
				const savedApproval =
					(saved.approvals || []).find((item) => item.id === approval.id) ||
					response.approval ||
					approval;
				setApprovalEmail({ ...savedApproval, center: approval.center });
			}
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível atualizar a aprovação.",
			);
			setFeedback({
				type: "error",
				title: "Erro na aprovação",
				...visibleError,
			});
		} finally {
			setSaving(false);
		}
	};

	const resendApprovalAdjustment = async (approval, note = "") => {
		setSaving(true);
		try {
			const response = await atualizarAprovacaoOrcamentoFinanceiro(
				approval.id,
				{ status: "pendente", action: "ajuste_reenviado", note, approval },
			);
			onConfigUpdated?.(response.config || config);
			setPendenciesState(null);
			setFeedback({
				type: "success",
				title: "Pendência reenviada",
				message: "O ajuste voltou para análise do financeiro.",
			});
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível reenviar a pendência.",
			);
			setFeedback({
				type: "error",
				title: "Erro ao reenviar pendência",
				...visibleError,
			});
		} finally {
			setSaving(false);
		}
	};

	return {
		currentUser,
		modalState,
		setModalState,
		approvalDecision,
		setApprovalDecision,
		approvalEmail,
		setApprovalEmail,
		approvalListDetail,
		setApprovalListDetail,
		pendenciesState,
		setPendenciesState,
		analyticChildrenModal,
		setAnalyticChildrenModal,
		dashboardDetail,
		setDashboardDetail,
		dashboardDetailPage,
		setDashboardDetailPage,
		centerPage,
		setCenterPage,
		dreAccountDetail,
		setDreAccountDetail,
		dreDrawer,
		setDreDrawer,
		transferRequest,
		setTransferRequest,
		deviationJustification,
		setDeviationJustification,
		saving,
		feedback,
		setFeedback,
		upsertOperationalCenter,
		removeOperationalCenter,
		centerDeleteConfirm,
		cancelRemoveOperationalCenter,
		confirmRemoveOperationalCenter,
		updateApprovalStatus,
		resendApprovalAdjustment,
	};
}

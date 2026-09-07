import { useCallback, useEffect, useRef, useState } from "react";
import {
	buscarCentrosCustoOrcamentoFinanceiro,
	salvarCentrosCustoOrcamentoFinanceiro,
} from "../services/financeiroService";

export function useBudgetConfig({
	defaultSettings,
	getBudgetSettings,
	getVisibleError,
	normalizeDirectorates,
	normalizeFinancialAccountCategories,
	normalizeList,
}) {
	const [config, setConfig] = useState({
		clusters: [],
		accounts: [],
		centers: [],
		partners: [],
		companies: [],
		branches: [],
		matrix: [],
		versions: [],
		allocationRules: [],
		settings: defaultSettings,
	});
	const configRef = useRef(config);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [feedback, setFeedback] = useState(null);
	const [accountModal, setAccountModal] = useState(null);
	const [accountViewModal, setAccountViewModal] = useState(null);
	const [accountChildrenModal, setAccountChildrenModal] = useState(null);
	const [accountSearch, setAccountSearch] = useState("");
	const [accountStatusFilter, setAccountStatusFilter] = useState("ativos");
	const [accountPage, setAccountPage] = useState(1);
	const [companyBranchModal, setCompanyBranchModal] = useState(null);
	const [partnerModal, setPartnerModal] = useState(null);
	const [partnerViewModal, setPartnerViewModal] = useState(null);
	const [modalState, setModalState] = useState(null);
	const [analyticChildrenModal, setAnalyticChildrenModal] = useState(null);
	const [matrixCenterFilter, setMatrixCenterFilter] = useState("");
	const [partnerSearch, setPartnerSearch] = useState("");
	const [centerSearch, setCenterSearch] = useState("");
	const [centerStatusFilter, setCenterStatusFilter] = useState("ativos");
	const [centerPage, setCenterPage] = useState(1);
	const [parametersOpen, setParametersOpen] = useState(false);

	const applyConfigState = useCallback(
		(nextConfig) => {
			const sanitized = {
				clusters: [],
				accounts: [],
				centers: [],
				partners: [],
				companies: [],
				branches: [],
				matrix: [],
				versions: [],
				allocationRules: [],
				...(nextConfig || {}),
				settings: getBudgetSettings(nextConfig?.settings),
			};
			configRef.current = sanitized;
			setConfig(sanitized);
			return sanitized;
		},
		[getBudgetSettings],
	);

	const loadCostCenters = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarCentrosCustoOrcamentoFinanceiro();
			applyConfigState(response.config || {});
		} catch (error) {
			const visibleError = getVisibleError(
				error,
				"Não foi possível carregar os centros de custo.",
			);
			setMessage(visibleError.message);
			setFeedback({
				type: "error",
				title: "Erro ao carregar configurações",
				...visibleError,
			});
		} finally {
			setLoading(false);
		}
	}, [applyConfigState, getVisibleError]);

	useEffect(() => {
		loadCostCenters();
	}, [loadCostCenters]);

	const saveConfig = useCallback(
		async (nextConfig, successMessage = "Centros de custo salvos.") => {
			setSaving(true);
			setMessage("");
			try {
				const sanitizedConfig = {
					...(nextConfig || {}),
					settings: getBudgetSettings(nextConfig?.settings),
				};
				const response =
					await salvarCentrosCustoOrcamentoFinanceiro(sanitizedConfig);
				const savedConfig = response.config || sanitizedConfig;
				const isSettingsSave =
					successMessage === "Parâmetros configuráveis salvos.";
				applyConfigState({
					...savedConfig,
					settings: isSettingsSave
						? sanitizedConfig.settings
						: savedConfig.settings,
				});
				setMessage(successMessage);
				setModalState(null);
			} catch (error) {
				const visibleError = getVisibleError(
					error,
					"Falha ao salvar centros de custo.",
				);
				setMessage(visibleError.message);
				setFeedback({
					type: "error",
					title: "Erro ao salvar configuração",
					...visibleError,
				});
			} finally {
				setSaving(false);
			}
		},
		[applyConfigState, getBudgetSettings, getVisibleError],
	);

	const updateSettings = useCallback(
		async (field, value) => {
			const normalizedValue =
				field === "directorates"
					? normalizeDirectorates(value, [])
					: field === "financialAccountCategories"
						? normalizeFinancialAccountCategories(value, [])
					: normalizeList(value, []);
			const nextConfig = {
				...configRef.current,
				settings: {
					...getBudgetSettings(configRef.current?.settings),
					[field]: normalizedValue,
				},
			};
			applyConfigState(nextConfig);
			setSaving(true);
			setMessage("");
			try {
				const response = await salvarCentrosCustoOrcamentoFinanceiro(nextConfig);
				const savedConfig = response.config || {
					...configRef.current,
					settings: response.settings || nextConfig.settings,
				};
				applyConfigState({
					...savedConfig,
					settings: {
						...getBudgetSettings(savedConfig.settings),
						[field]: normalizedValue,
					},
				});
				setMessage("Parâmetros configuráveis salvos.");
			} catch (error) {
				const visibleError = getVisibleError(
					error,
					"Falha ao salvar parâmetros configuráveis.",
				);
				setMessage(visibleError.message);
				setFeedback({
					type: "error",
					title: "Erro ao salvar parâmetros",
					...visibleError,
				});
			} finally {
				setSaving(false);
			}
		},
		[
			applyConfigState,
			getBudgetSettings,
			getVisibleError,
			normalizeDirectorates,
			normalizeFinancialAccountCategories,
			normalizeList,
		],
	);

	return {
		config,
		configRef,
		loading,
		saving,
		message,
		feedback,
		accountModal,
		accountViewModal,
		accountChildrenModal,
		accountSearch,
		accountStatusFilter,
		accountPage,
		companyBranchModal,
		partnerModal,
		partnerViewModal,
		modalState,
		analyticChildrenModal,
		matrixCenterFilter,
		partnerSearch,
		centerSearch,
		centerStatusFilter,
		centerPage,
		parametersOpen,
		applyConfigState,
		loadCostCenters,
		saveConfig,
		updateSettings,
		setFeedback,
		setAccountModal,
		setAccountViewModal,
		setAccountChildrenModal,
		setAccountSearch,
		setAccountStatusFilter,
		setAccountPage,
		setCompanyBranchModal,
		setPartnerModal,
		setPartnerViewModal,
		setModalState,
		setAnalyticChildrenModal,
		setMatrixCenterFilter,
		setPartnerSearch,
		setCenterSearch,
		setCenterStatusFilter,
		setCenterPage,
		setParametersOpen,
	};
}

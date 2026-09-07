import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buscarSerasaReportFinanceiro,
	buscarTarifasReportFinanceiro,
} from "../../modules/financeiro/services/financeiroService";
import { getTariffsAvailableYears } from "../../modules/financeiro/utils/tariffsViewModels";
import { buildAcompanhamentoFinanceiroViewModel } from "./painelFinanceiroViewModel";

const REFRESH_INTERVAL_MS = 30 * 1000;

function nowReference() {
	const now = new Date();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
}

export function useAcompanhamentoFinanceiroData() {
	const [serasaReport, setSerasaReport] = useState({});
	const [tarifasReport, setTarifasReport] = useState({});
	const [reference, setReference] = useState(nowReference);
	const [lastRefresh, setLastRefresh] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = useCallback(async () => {
		try {
			const [serasa, tarifas] = await Promise.all([
				buscarSerasaReportFinanceiro().catch((requestError) => ({
					data: {},
					error: requestError,
				})),
				buscarTarifasReportFinanceiro().catch((requestError) => ({
					data: {},
					error: requestError,
				})),
			]);
			setSerasaReport(serasa?.data || {});
			setTarifasReport(tarifas?.data || {});
			setLastRefresh(new Date());
			setError(serasa?.error || tarifas?.error ? "Alguns dados não carregaram." : "");
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível carregar o painel.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
		const timer = window.setInterval(load, REFRESH_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [load]);

	const availableYears = useMemo(() => {
		const tariffYears = getTariffsAvailableYears(tarifasReport);
		const serasaYears = (serasaReport.rows || [])
			.map((row) => Number(row.year || 0))
			.filter(Boolean);
		return [...new Set([...tariffYears, ...serasaYears, reference.year])]
			.filter(Boolean)
			.sort((a, b) => b - a);
	}, [reference.year, serasaReport.rows, tarifasReport]);

	const viewModel = useMemo(
		() =>
			buildAcompanhamentoFinanceiroViewModel({
				serasaReport,
				tarifasReport,
				reference,
			}),
		[reference, serasaReport, tarifasReport],
	);

	return {
		availableYears,
		error,
		lastRefresh,
		loading,
		reference,
		refresh: load,
		setReference,
		viewModel,
	};
}

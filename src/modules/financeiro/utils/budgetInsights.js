import { brl, decimal, integer } from "./financeiroFormatters";

function dateFromInput(value) {
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function budgetMonthName(month) {
	return (
		[
			"",
			"Janeiro",
			"Fevereiro",
			"Marco",
			"Abril",
			"Maio",
			"Junho",
			"Julho",
			"Agosto",
			"Setembro",
			"Outubro",
			"Novembro",
			"Dezembro",
		][Number(month) || 0] || ""
	);
}

function formatBudgetMonthYear({ year, month } = {}) {
	const safeYear = Number(year) || new Date().getFullYear();
	const safeMonth = Number(month) || new Date().getMonth() + 1;
	return `${safeYear} - ${budgetMonthName(safeMonth)}`;
}

function formatBudgetPeriodDisplay(
	months = [],
	fallbackYear = new Date().getFullYear(),
) {
	const validMonths = months.filter(
		(item) => Number(item?.year) && Number(item?.month),
	);
	if (!validMonths.length) {
		return formatBudgetMonthYear({
			year: fallbackYear,
			month: new Date().getMonth() + 1,
		});
	}
	if (validMonths.length === 1) {
		return formatBudgetMonthYear(validMonths[0]);
	}
	const first = validMonths[0];
	const last = validMonths[validMonths.length - 1];
	return `${formatBudgetMonthYear(first)} até ${formatBudgetMonthYear(last)}`;
}

export function buildBudgetPeriod(selectedPeriod = {}) {
	const now = new Date();
	const currentYear = Number(selectedPeriod.referenceYear) || now.getFullYear();
	const currentMonth =
		Number(selectedPeriod.referenceMonth) || now.getMonth() + 1;
	if (selectedPeriod.mode === "year") {
		const months = Array.from({ length: 12 }, (_, index) => ({
			year: currentYear,
			month: index + 1,
		}));
		return {
			label: "ano",
			displayLabel: `${currentYear} - Ano`,
			months,
		};
	}
	if (selectedPeriod.mode === "custom") {
		const start = dateFromInput(selectedPeriod.startDate);
		const end = dateFromInput(selectedPeriod.endDate);
		if (start && end && start <= end) {
			const months = [];
			const startIndex = start.getFullYear() * 12 + start.getMonth();
			const endIndex = end.getFullYear() * 12 + end.getMonth();
			for (
				let monthIndex = startIndex;
				monthIndex <= endIndex;
				monthIndex += 1
			) {
				months.push({
					year: Math.trunc(monthIndex / 12),
					month: (monthIndex % 12) + 1,
				});
			}
			return {
				label: "período",
				displayLabel: formatBudgetPeriodDisplay(months, currentYear),
				months,
			};
		}
	}
	const months = [{ year: currentYear, month: currentMonth }];
	return {
		label: "mês",
		displayLabel: formatBudgetPeriodDisplay(months, currentYear),
		months,
	};
}

export function getBudgetPeriodKey(item = {}) {
	const year = Number(item.year || item.ano || 0);
	const month = Number(item.month || item.numMes || item.mesNumero || 0);
	return year && month ? `${year}-${month}` : "";
}

export function budgetPeriodMatches(item = {}, periodKeys = new Set()) {
	return periodKeys.has(getBudgetPeriodKey(item));
}

export function movementValue(movement = {}) {
	return (
		Number(
			movement.value ??
				movement.valor ??
				movement.realized ??
				movement.realizado ??
				movement.total ??
				0,
		) || 0
	);
}

export function movementSupplierName(movement = {}, fallback = "") {
	return (
		String(
			movement.supplier ||
				movement.fornecedor ||
				movement.partnerName ||
				movement.nomeFornecedor ||
				fallback ||
				"",
		).trim() || "Fornecedor não informado"
	);
}

export function getConfiguredCenterBudget(
	center = {},
	selectedPeriod = {},
	periodMonthCount = 1,
) {
	const monthly = Number(center.valorMensal || center.orcamentoMensal || 0);
	if (selectedPeriod.mode === "year") return monthly * 12;
	return monthly * Math.max(1, periodMonthCount);
}

function centerParentKey(center = {}) {
	return (
		String(center.parentId || center.parentCodigo || "").replace(/\D+/g, "") ||
		String(center.parentId || center.parentCodigo || "")
	);
}

function centerCodeKey(center = {}) {
	return (
		String(center.codigo || center.id || "").replace(/\D+/g, "") ||
		String(center.codigo || center.id || "")
	);
}

export function getBudgetInsights(config = {}, selectedPeriod = {}) {
	const accounts = config.accounts || [];
	const centers = config.centers || [];
	const matrix = config.matrix || [];
	const now = new Date();
	const period = buildBudgetPeriod(selectedPeriod);
	const referenceYear = Number(period.months[0]?.year) || now.getFullYear();
	const periodKeys = new Set(
		period.months.map((item) => `${item.year}-${item.month}`),
	);
	const isCurrentSingleMonth =
		period.months.length === 1 &&
		Number(period.months[0]?.year) === now.getFullYear() &&
		Number(period.months[0]?.month) === now.getMonth() + 1;
	const activeMonth = period.months[0] || {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
	const daysInMonth = new Date(
		Number(activeMonth.year),
		Number(activeMonth.month),
		0,
	).getDate();
	const dayOfMonth = isCurrentSingleMonth ? now.getDate() : daysInMonth;
	const rowPeriodTotal = (row) =>
		period.months.reduce((sum, item) => {
			if (Number(row.year || item.year) !== item.year) return sum;
			return sum + Number(row.months?.[item.month - 1] || 0);
		}, 0);
	const periodMonthCount = Math.max(1, period.months.length);
	const realizedForCenter = (center) => {
		const breakdowns =
			center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
		const matchingBreakdowns = breakdowns.filter((item) =>
			periodKeys.has(getBudgetPeriodKey(item)),
		);
		const breakdownTotal = matchingBreakdowns.reduce(
			(sum, item) => sum + Number(item.realized ?? item.realizado ?? 0),
			0,
		);
		if (breakdowns.length) return breakdownTotal;
		return 0;
	};
	const childrenByParentKey = new Map();
	centers
		.filter((center) => center.tipoPlano === "A")
		.forEach((center) => {
			const parentKey = centerParentKey(center);
			if (!parentKey) return;
			const current = childrenByParentKey.get(parentKey) || [];
			current.push(center);
			childrenByParentKey.set(parentKey, current);
		});
	const analyticChildrenForCenter = (center = {}) => {
		if (center.tipoPlano !== "S") return [];
		const key = centerCodeKey(center);
		const byId = childrenByParentKey.get(center.id) || [];
		const byCode = key ? childrenByParentKey.get(key) || [] : [];
		return [...byId, ...byCode].filter(
			(child, index, items) =>
				items.findIndex((item) => item.id === child.id) === index,
		);
	};
	const centersForTotals = centers.filter((center) => center.tipoPlano !== "S");
	const configuredBudgetForCenter = (center) => {
		if (center?.tipoPlano === "S") {
			return analyticChildrenForCenter(center).reduce(
				(sum, child) =>
					sum +
					getConfiguredCenterBudget(child, selectedPeriod, periodMonthCount),
				0,
			);
		}
		return getConfiguredCenterBudget(center, selectedPeriod, periodMonthCount);
	};
	const realizedTotalForCenter = (center) => {
		if (center?.tipoPlano === "S") {
			return analyticChildrenForCenter(center).reduce(
				(sum, child) =>
					sum + realizedForCenter(child) + Number(child.comprometidoMes || 0),
				0,
			);
		}
		return realizedForCenter(center) + Number(center?.comprometidoMes || 0);
	};
	const plannedMonthFromMatrix = matrix.reduce((sum, row) => {
		const center = centers.find((item) => item.id === row.costCenterId);
		if (center?.tipoPlano === "S") return sum;
		return sum + rowPeriodTotal(row);
	}, 0);
	const plannedMonthFromCenters = centersForTotals.reduce((sum, center) => {
		return (
			sum + getConfiguredCenterBudget(center, selectedPeriod, periodMonthCount)
		);
	}, 0);
	const currentYearMatrix = matrix.filter(
		(row) => Number(row.year || referenceYear) === referenceYear,
	);
	const plannedYearFromMatrix = currentYearMatrix.reduce((sum, row) => {
		const center = centers.find((item) => item.id === row.costCenterId);
		if (center?.tipoPlano === "S") return sum;
		return (
			sum +
			(row.months || []).reduce(
				(monthSum, value) => monthSum + Number(value || 0),
				0,
			)
		);
	}, 0);
	const plannedYearFromCenters = centersForTotals.reduce(
		(sum, center) =>
			sum + getConfiguredCenterBudget(center, { mode: "year" }, 12),
		0,
	);
	const plannedMonth = plannedMonthFromCenters || plannedMonthFromMatrix;
	const plannedYear = plannedYearFromCenters || plannedYearFromMatrix;
	const realizedMonth = centersForTotals.reduce(
		(sum, center) => sum + realizedForCenter(center),
		0,
	);
	const committedMonth = centersForTotals.reduce(
		(sum, center) => sum + Number(center.comprometidoMes || 0),
		0,
	);
	const availableMonth = plannedMonth - realizedMonth - committedMonth;
	const idealBurn = plannedMonth
		? (plannedMonth / daysInMonth) * dayOfMonth
		: 0;
	const usedPercent = plannedMonth
		? ((realizedMonth + committedMonth) / plannedMonth) * 100
		: 0;
	const idealPercent = plannedMonth ? (idealBurn / plannedMonth) * 100 : 0;
	const computedApprovals = centers
		.filter((center) => center.tipoPlano !== "S")
		.map((center) => {
			const centerPlanned =
				configuredBudgetForCenter(center) ||
				matrix
					.filter((row) => row.costCenterId === center.id)
					.reduce((sum, row) => sum + rowPeriodTotal(row), 0);
			const used = realizedTotalForCenter(center);
			const percent = centerPlanned ? (used / centerPlanned) * 100 : 0;
			return {
				id: `orcamento-estouro-${center.id}-${period.months[0]?.year || now.getFullYear()}-${period.months[0]?.month || now.getMonth() + 1}`,
				type: "estouro_orcamento",
				center,
				centerPlanned,
				budgeted: centerPlanned,
				used,
				realized: realizedForCenter(center),
				committed: Number(center.comprometidoMes || 0),
				percent,
				overflow: used - centerPlanned,
				reason: `Centro de custo consumiu ${decimal.format(percent)}% do orçamento.`,
				status: "pendente",
				source: "calculado",
			};
		})
		.filter((item) => item.centerPlanned && item.percent > 100);
	const approvalMap = new Map(
		computedApprovals.map((approval) => [approval.id, approval]),
	);
	(config.approvals || []).forEach((approval) => {
		const center = centers.find((item) => item.id === approval.centerId);
		const used =
			Number(approval.realized || 0) + Number(approval.committed || 0);
		approvalMap.set(approval.id, {
			...approvalMap.get(approval.id),
			...approval,
			center,
			centerPlanned: Number(
				approval.budgeted || approvalMap.get(approval.id)?.centerPlanned || 0,
			),
			budgeted: Number(
				approval.budgeted || approvalMap.get(approval.id)?.budgeted || 0,
			),
			used: used || approvalMap.get(approval.id)?.used || 0,
			overflow: Number(
				approval.overflow || approvalMap.get(approval.id)?.overflow || 0,
			),
			percent: Number(
				approval.percent || approvalMap.get(approval.id)?.percent || 0,
			),
		});
	});
	const approvalsAll = Array.from(approvalMap.values()).sort((left, right) => {
		const leftPending = left.status === "pendente" ? 1 : 0;
		const rightPending = right.status === "pendente" ? 1 : 0;
		if (leftPending !== rightPending) return rightPending - leftPending;
		return String(right.updatedAt || right.createdAt || "").localeCompare(
			String(left.updatedAt || left.createdAt || ""),
		);
	});
	const approvals = approvalsAll.filter(
		(approval) => approval.status === "pendente",
	);
	const accountRows = matrix
		.map((row) => {
			const account = accounts.find((item) => item.id === row.accountId);
			const center = centers.find((item) => item.id === row.costCenterId);
			if (center?.tipoPlano === "S") return null;
			const rawPlanned = rowPeriodTotal(row);
			const breakdownRealized = (
				center?.realizedByCompanyBranch ||
				center?.realizadoPorEmpresaFilial ||
				[]
			)
				.filter(
					(item) =>
						item.accountId === row.accountId &&
						periodKeys.has(getBudgetPeriodKey(item)),
				)
				.reduce(
					(sum, item) => sum + Number(item.realized ?? item.realizado ?? 0),
					0,
				);
			const centerTotalPlanned = matrix
				.filter((item) => item.costCenterId === row.costCenterId)
				.reduce((sum, item) => sum + rowPeriodTotal(item), 0);
			const configuredCenterPlanned = center
				? configuredBudgetForCenter(center)
				: 0;
			const planned =
				configuredCenterPlanned && centerTotalPlanned
					? (rawPlanned / centerTotalPlanned) * configuredCenterPlanned
					: rawPlanned;
			const centerRealized = realizedTotalForCenter(center || {});
			const realized =
				breakdownRealized ||
				(configuredCenterPlanned && planned
					? (planned / configuredCenterPlanned) * centerRealized
					: centerTotalPlanned
						? (rawPlanned / centerTotalPlanned) * centerRealized
						: centerRealized);
			return {
				row,
				account,
				center,
				planned,
				realized,
				deviation: realized - planned,
			};
		})
		.filter((item) => item && (item.planned || item.realized));
	const centerRows = centers.map((center) => {
		const plannedFromCenter = configuredBudgetForCenter(center);
		const planned =
			plannedFromCenter ||
			matrix
				.filter((row) => row.costCenterId === center.id)
				.reduce((sum, row) => sum + rowPeriodTotal(row), 0);
		const realized = realizedTotalForCenter(center);
		return {
			center,
			planned,
			realized,
			deviation: realized - planned,
			percent: planned ? (realized / planned) * 100 : 0,
		};
	});
	const movements = [];
	centersForTotals.forEach((center) => {
		const breakdowns =
			center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
		breakdowns
			.filter((breakdown) => budgetPeriodMatches(breakdown, periodKeys))
			.forEach((breakdown) => {
				const breakdownMovements = Array.isArray(
					breakdown.movements || breakdown.movimentacoes,
				)
					? breakdown.movements || breakdown.movimentacoes
					: [];
				if (breakdownMovements.length) {
					breakdownMovements.forEach((movement, index) => {
						movements.push({
							...movement,
							id:
								movement.id ||
								`${center.id}-${breakdown.year || breakdown.ano}-${breakdown.month || breakdown.numMes}-${index}`,
							centerId: center.id,
							centerName: center.nome,
							accountId: movement.accountId || breakdown.accountId,
							companyId: movement.companyId || breakdown.companyId,
							branchId: movement.branchId || breakdown.branchId,
							supplier: movementSupplierName(
								movement,
								(breakdown.suppliers || breakdown.fornecedores || [])[0],
							),
							value: movementValue(movement),
							year: Number(breakdown.year || breakdown.ano || 0),
							month: Number(breakdown.month || breakdown.numMes || 0),
						});
					});
					return;
				}
				const value =
					Number(breakdown.realized ?? breakdown.realizado ?? 0) || 0;
				movements.push({
					id: `${center.id}-${breakdown.year || breakdown.ano}-${breakdown.month || breakdown.numMes}-${breakdown.accountId || "sem-conta"}`,
					centerId: center.id,
					centerName: center.nome,
					accountId: breakdown.accountId,
					companyId: breakdown.companyId,
					branchId: breakdown.branchId,
					supplier:
						(breakdown.suppliers || breakdown.fornecedores || [])[0] ||
						"Fornecedor não informado",
					value,
					year: Number(breakdown.year || breakdown.ano || 0),
					month: Number(breakdown.month || breakdown.numMes || 0),
				});
			});
	});
	const monthlyEvolution = Array.from({ length: 12 }, (_, index) => {
		const month = index + 1;
		const planned = centersForTotals.reduce(
			(sum, center) =>
				sum + getConfiguredCenterBudget(center, { mode: "month" }, 1),
			0,
		);
		const realized = centersForTotals.reduce((sum, center) => {
			const breakdowns =
				center.realizedByCompanyBranch ||
				center.realizadoPorEmpresaFilial ||
				[];
			return (
				sum +
				breakdowns
					.filter(
						(item) =>
							Number(item.year || item.ano || referenceYear) ===
								referenceYear &&
							Number(item.month || item.numMes || 0) === month,
					)
					.reduce(
						(monthSum, item) =>
							monthSum + Number(item.realized ?? item.realizado ?? 0),
						0,
					)
			);
		}, 0);
		return {
			month,
			label: budgetMonthName(month).slice(0, 3),
			planned,
			realized,
			percent: planned ? (realized / planned) * 100 : 0,
		};
	});
	let cumulativeRealized = 0;
	const forecastRows = monthlyEvolution.map((row, index) => {
		cumulativeRealized += row.realized;
		const elapsedWithData =
			monthlyEvolution.slice(0, index + 1).filter((item) => item.realized > 0)
				.length || index + 1;
		const average = cumulativeRealized / Math.max(1, elapsedWithData);
		return {
			...row,
			cumulativeRealized,
			forecast: row.realized ? cumulativeRealized : average * (index + 1),
		};
	});
	const accountSummaryMap = new Map();
	accountRows.forEach((item) => {
		const key = item.account?.id || item.row.accountId || "sem-conta";
		const current = accountSummaryMap.get(key) || {
			account: item.account,
			id: key,
			planned: 0,
			realized: 0,
		};
		current.planned += Number(item.planned || 0);
		current.realized += Number(item.realized || 0);
		accountSummaryMap.set(key, current);
	});
	const accountSummary = Array.from(accountSummaryMap.values())
		.map((item) => ({
			...item,
			deviation: item.realized - item.planned,
			percent: item.planned ? (item.realized / item.planned) * 100 : 0,
		}))
		.sort((left, right) => right.realized - left.realized);
	const centerSummary = centerRows
		.filter(({ center }) => center?.tipoPlano === "A")
		.map((item) => ({ ...item, id: item.center?.id }))
		.sort((left, right) => right.realized - left.realized);
	const supplierSummaryMap = new Map();
	movements.forEach((movement) => {
		const supplier = movementSupplierName(movement);
		const current = supplierSummaryMap.get(supplier) || {
			supplier,
			value: 0,
			rows: 0,
			centers: new Set(),
			accounts: new Set(),
		};
		current.value += movementValue(movement);
		current.rows += 1;
		if (movement.centerId) current.centers.add(movement.centerId);
		if (movement.accountId) current.accounts.add(movement.accountId);
		supplierSummaryMap.set(supplier, current);
	});
	const supplierSummary = Array.from(supplierSummaryMap.values())
		.map((item) => ({
			...item,
			centers: Array.from(item.centers),
			accounts: Array.from(item.accounts),
			share: realizedMonth ? (item.value / realizedMonth) * 100 : 0,
		}))
		.sort((left, right) => right.value - left.value);
	return {
		accounts,
		centers,
		matrix,
		plannedMonth,
		plannedYear,
		realizedMonth,
		committedMonth,
		availableMonth,
		usedPercent,
		idealPercent,
		approvals,
		approvalsAll,
		accountRows,
		centerRows,
		movements,
		monthlyEvolution,
		forecastRows,
		accountSummary,
		centerSummary,
		supplierSummary,
		periodLabel: period.label,
		periodDisplayLabel: period.displayLabel,
	};
}

export function budgetConsumptionStatus(percent = 0) {
	if (percent > 100) {
		return {
			label: "Estourado",
			textClass: "text-red-600",
			barClass: "bg-red-500",
		};
	}
	if (percent >= 80) {
		return {
			label: "Atenção",
			textClass: "text-amber-600",
			barClass: "bg-amber-400",
		};
	}
	return {
		label: "Positivo",
		textClass: "text-emerald-600",
		barClass: "bg-emerald-500",
	};
}

export function budgetVarianceMeta(planned = 0, realized = 0) {
	const variance = Number(planned || 0) - Number(realized || 0);
	const percent = Number(planned || 0)
		? (variance / Number(planned || 0)) * 100
		: 0;
	const favorable = variance >= 0;
	return {
		variance,
		percent,
		favorable,
		textClass: favorable ? "text-emerald-600" : "text-red-600",
	};
}

function normalizeBudgetEmail(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

function getCurrentUserBudgetEmail(user = {}) {
	return normalizeBudgetEmail(
		user.email || user.profile?.email || user.user?.email,
	);
}

export function isBudgetCenterResponsible(user, center = {}) {
	const userEmail = getCurrentUserBudgetEmail(user);
	return Boolean(
		userEmail && normalizeBudgetEmail(center.emailResponsavel) === userEmail,
	);
}

export function buildBudgetOperationalKpis(insights = {}, config = {}) {
	return [
		{
			id: "orcado",
			title:
				insights.periodLabel === "ano"
					? "Orçado no ano"
					: insights.periodLabel === "período"
						? "Orçado no período"
						: "Orçado no mês",
			value: insights.plannedMonth,
			type: "currency",
			helper: `${insights.periodDisplayLabel} · ${integer.format(insights.matrix?.length || 0)} linha(s) na matriz`,
			icon: "BadgeDollarSign",
		},
		{
			id: "realizado",
			title: "Realizado + comprometido",
			value: Number(insights.realizedMonth || 0) + Number(insights.committedMonth || 0),
			type: "currency",
			helper: `${insights.periodDisplayLabel} · ${decimal.format(insights.usedPercent || 0)}% consumido`,
			icon: "Wallet",
		},
		{
			id: "saldo",
			title: "Saldo disponível",
			value: insights.availableMonth,
			type: "currency",
			helper:
				Number(insights.availableMonth || 0) < 0
					? "Estourado"
					: "Dentro do orçamento",
			icon: "CircleDollarSign",
		},
		{
			id: "aprovacoes",
			title: "Aprovações pendentes",
			value: insights.approvals?.length || 0,
			type: "integer",
			helper: "Geradas por estouro/alerta",
			icon: "ClipboardCheck",
		},
		{
			id: "ano",
			title: "Budget anual",
			value: insights.plannedYear,
			type: "currency",
			helper: `${integer.format((config.versions || []).length)} versão(ões)`,
			icon: "Landmark",
		},
	];
}

export function calculateBudgetReference(selectedPeriod = {}, now = new Date()) {
	const budgetPeriod = buildBudgetPeriod(selectedPeriod);
	const budgetPeriodMonths = budgetPeriod.months || [];
	const firstBudgetMonth = budgetPeriodMonths[0] || {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
	const budgetReferenceYear = Number(firstBudgetMonth.year || now.getFullYear());
	const budgetReferenceMonth = Math.max(
		1,
		Math.min(12, ...budgetPeriodMonths.map((item) => Number(item.month || 1))),
	);
	const isCurrentBudgetMonth =
		budgetPeriodMonths.length === 1 &&
		budgetReferenceYear === now.getFullYear() &&
		budgetReferenceMonth === now.getMonth() + 1;
	const daysInBudgetMonth = new Date(
		budgetReferenceYear,
		budgetReferenceMonth,
		0,
	).getDate();
	const elapsedBudgetDays = isCurrentBudgetMonth
		? now.getDate()
		: daysInBudgetMonth;
	return {
		budgetPeriod,
		budgetPeriodMonths,
		budgetReferenceYear,
		budgetReferenceMonth,
		isCurrentBudgetMonth,
		daysInBudgetMonth,
		elapsedBudgetDays,
	};
}

export function buildCostCenterTopCards({
	insights = {},
	config = {},
	selectedPeriod = {},
	now = new Date(),
	expiringContracts = 0,
} = {}) {
	const reference = calculateBudgetReference(selectedPeriod, now);
	const budgetYtd = (insights.monthlyEvolution || [])
		.filter((item) => Number(item.month || 0) <= reference.budgetReferenceMonth)
		.reduce((sum, item) => sum + Number(item.planned || 0), 0);
	const realizedCommitted =
		Number(insights.realizedMonth || 0) + Number(insights.committedMonth || 0);
	const forecastClosing =
		reference.isCurrentBudgetMonth && reference.elapsedBudgetDays
			? (realizedCommitted / reference.elapsedBudgetDays) *
				reference.daysInBudgetMonth
			: realizedCommitted;
	const forecastBalance = Number(insights.plannedMonth || 0) - forecastClosing;
	const ytdMonthLabel =
		budgetMonthName(reference.budgetReferenceMonth).slice(0, 3) || "Atual";
	return [
		{
			id: "cc-orcado",
			title: "Orçado no Mês",
			value: insights.plannedMonth,
			type: "currency",
			helper: insights.periodDisplayLabel,
			icon: "BadgeDollarSign",
			color: "blue",
		},
		{
			id: "cc-realizado",
			title: "Realizado + Comprometido",
			value: realizedCommitted,
			type: "currency",
			helper: `${decimal.format(insights.usedPercent || 0)}% vs. ${decimal.format(insights.idealPercent || 0)}% do mês decorrido`,
			icon: "Wallet",
			color: "violet",
		},
		{
			id: "cc-saldo",
			title: "Saldo Disponível Mês",
			value: insights.availableMonth,
			type: "currency",
			helper:
				Number(insights.availableMonth || 0) < 0
					? "Orçamento estourado"
					: "Dentro do orçamento",
			icon: "CircleDollarSign",
			color: Number(insights.availableMonth || 0) < 0 ? "amber" : "emerald",
		},
		{
			id: "cc-ytd",
			title: `Orçamento Jan-${ytdMonthLabel}`,
			value: budgetYtd,
			type: "currency",
			helper: `${brl.format(insights.plannedYear || 0)} total anual`,
			icon: "Landmark",
			color: "slate",
		},
		{
			id: "cc-forecast",
			title: "Forecast de Fechamento",
			value: forecastClosing,
			type: "currency",
			helper:
				forecastBalance >= 0
					? `Sobram ${brl.format(forecastBalance)}`
					: `Estoura ${brl.format(Math.abs(forecastBalance))}`,
			icon: "Repeat2",
			color: forecastBalance < 0 ? "rose" : "emerald",
			trend: {
				status: forecastBalance < 0 ? "negative" : "positive",
				direction: forecastBalance < 0 ? "down" : "up",
				percent: insights.plannedMonth
					? Math.abs(forecastBalance / insights.plannedMonth) * 100
					: 0,
			},
			trendLabel: forecastBalance < 0 ? "risco" : "previsto",
		},
		{
			id: "cc-alertas",
			title: "Pendências & Alertas",
			value: insights.approvals?.length || 0,
			type: "integer",
			helper: `${integer.format(insights.approvals?.length || 0)} aprovações / ${integer.format(expiringContracts)} contratos a vencer`,
			icon: "AlertTriangle",
			color:
				insights.approvals?.length || expiringContracts ? "amber" : "emerald",
			trend: {
				status:
					insights.approvals?.length || expiringContracts
						? "negative"
						: "positive",
				direction:
					insights.approvals?.length || expiringContracts ? "up" : "down",
				percent: (insights.approvals?.length || 0) + expiringContracts,
			},
			trendLabel:
				insights.approvals?.length || expiringContracts
					? "atenção"
					: "sem riscos",
		},
	];
}

function isCenterInactive(center) {
	return (
		String(center?.status || "")
			.toLowerCase()
			.includes("inativo") ||
		String(center?.nome || "")
			.toUpperCase()
			.includes("INATIVO")
	);
}

function sortBudgetCenters(left, right) {
	const leftInactive = isCenterInactive(left) ? 1 : 0;
	const rightInactive = isCenterInactive(right) ? 1 : 0;
	if (leftInactive !== rightInactive) return leftInactive - rightInactive;
	return String(left.classificacao || left.codigo || left.nome).localeCompare(
		String(right.classificacao || right.codigo || right.nome),
		"pt-BR",
		{ numeric: true },
	);
}

function metricForCenter(center, sourceMap) {
	const row = sourceMap.get(center?.id);
	if (row) return row;
	const planned = Number(center?.valorMensal || center?.orcamentoMensal || 0);
	const realized = Number(center?.realizadoImportado || center?.realizadoMes || 0);
	const deviation = realized - planned;
	return {
		center,
		planned,
		realized,
		deviation,
		percent: planned ? (realized / planned) * 100 : 0,
	};
}

export function buildOperationalCenterGroups({
	config = {},
	insights = {},
	currentUser = {},
	responsibleOnly = false,
} = {}) {
	const visibleCenterRows = responsibleOnly
		? (insights.centerRows || []).filter(({ center }) =>
				isBudgetCenterResponsible(currentUser, center),
			)
		: insights.centerRows || [];
	const rowByCenterId = new Map(
		visibleCenterRows.map((row) => [row.center?.id, row]),
	);
	const allRowByCenterId = new Map(
		(insights.centerRows || []).map((row) => [row.center?.id, row]),
	);
	const sortedOperationalCenters = [...(config.centers || [])].sort(
		sortBudgetCenters,
	);
	const operationalCenterByKey = new Map();
	sortedOperationalCenters.forEach((center) => {
		if (center.id) operationalCenterByKey.set(center.id, center);
		if (center.codigo) operationalCenterByKey.set(center.codigo, center);
		if (center.reduzida) {
			operationalCenterByKey.set(
				String(center.reduzida).replace(/\D+/g, ""),
				center,
			);
		}
	});
	const operationalCategoriesByCode = new Map(
		sortedOperationalCenters
			.filter((center) => Number(center.nivel || 0) === 2)
			.map((center) => [center.codigo || center.id, center]),
	);
	const operationalChildrenByParent = new Map();
	sortedOperationalCenters
		.filter((center) => center.tipoPlano === "A")
		.forEach((center) => {
			const parentKey = center.parentId || center.parentCodigo;
			if (!parentKey) return;
			const currentChildren = operationalChildrenByParent.get(parentKey) || [];
			currentChildren.push(center);
			operationalChildrenByParent.set(parentKey, currentChildren);
		});
	const visibleCenterIdSet = new Set(
		visibleCenterRows.map(({ center }) => center?.id).filter(Boolean),
	);
	const operationalCenterGroups = sortedOperationalCenters
		.filter(
			(center) => center.tipoPlano === "S" && Number(center.nivel || 0) > 2,
		)
		.map((center) => {
			const category =
				operationalCategoriesByCode.get(center.categoriaCodigo) ||
				operationalCenterByKey.get(center.categoriaCodigo);
			const rawChildren = [
				...(operationalChildrenByParent.get(center.id) || []),
				...(center.codigo && center.codigo !== center.id
					? operationalChildrenByParent.get(center.codigo) || []
					: []),
			]
				.filter(
					(child, index, items) =>
						items.findIndex((item) => item.id === child.id) === index,
				)
				.sort(sortBudgetCenters);
			const children = responsibleOnly
				? rawChildren.filter((child) => visibleCenterIdSet.has(child.id))
				: rawChildren;
			const parentVisible =
				!responsibleOnly ||
				visibleCenterIdSet.has(center.id) ||
				children.length > 0;
			if (!parentVisible) return null;
			const aggregateSource = responsibleOnly ? children : rawChildren;
			const aggregate = aggregateSource.reduce(
				(acc, child) => {
					const metric = metricForCenter(
						child,
						responsibleOnly ? rowByCenterId : allRowByCenterId,
					);
					acc.planned += Number(metric.planned || 0);
					acc.realized += Number(metric.realized || 0);
					return acc;
				},
				{ planned: 0, realized: 0 },
			);
			aggregate.deviation = aggregate.realized - aggregate.planned;
			aggregate.percent = aggregate.planned
				? (aggregate.realized / aggregate.planned) * 100
				: 0;
			return {
				center,
				category,
				children,
				aggregateChildren: rawChildren,
				totalChildren: rawChildren.length,
				aggregate,
			};
		})
		.filter(Boolean);
	return {
		visibleCenterRows,
		rowByCenterId,
		allRowByCenterId,
		sortedOperationalCenters,
		operationalCenterGroups,
		metricForCenter: (center, sourceMap = allRowByCenterId) =>
			metricForCenter(center, sourceMap),
	};
}

export function paginateBudgetGroups(groups = [], page = 1, pageSize = 12) {
	const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
	const safePage = Math.min(page, totalPages);
	return {
		totalPages,
		safePage,
		rows: groups.slice((safePage - 1) * pageSize, safePage * pageSize),
	};
}

export function buildDirectorateRows(insights = {}, config = {}) {
	const directorateByName = new Map(
		(config.settings?.directorates || []).map((item) => [
			String(item.nome || item.name || "")
				.trim()
				.toLowerCase(),
			item,
		]),
	);
	const directorateSummary = (insights.centerSummary || []).reduce((map, item) => {
		const rawName = String(
			item.center?.diretoria || item.center?.directorate || "",
		).trim();
		const key = rawName.toLowerCase() || "sem-diretoria";
		const directorate = directorateByName.get(key);
		const current = map.get(key) || {
			id: key,
			nome: rawName || "Diretoria não informada",
			diretor: directorate?.diretor || directorate?.director || "",
			email: directorate?.emailDiretor || directorate?.directorEmail || "",
			planned: 0,
			realized: 0,
			centers: 0,
		};
		current.planned += Number(item.planned || 0);
		current.realized += Number(item.realized || 0);
		current.centers += 1;
		map.set(key, current);
		return map;
	}, new Map());
	return Array.from(directorateSummary.values())
		.map((item) => ({
			...item,
			available: Number(item.planned || 0) - Number(item.realized || 0),
			percent: item.planned ? (item.realized / item.planned) * 100 : 0,
		}))
		.sort((left, right) => right.realized - left.realized);
}

export function findBudgetParetoRows(insights = {}, limit = 8) {
	const rows = (insights.centerRows || [])
		.filter(({ center }) => center?.tipoPlano === "A")
		.sort((a, b) => b.percent - a.percent);
	return Number.isFinite(limit) ? rows.slice(0, limit) : rows;
}

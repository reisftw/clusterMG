const MONTH_NAMES = [
	"",
	"Janeiro",
	"Fevereiro",
	"Março",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

export function costCenterMovementMonthName(month) {
	return MONTH_NAMES[Number(month) || 0] || "";
}

export function getCostCenterMovementBreakdowns(center = {}) {
	return center.realizedByCompanyBranch || center.realizadoPorEmpresaFilial || [];
}

export function getCostCenterMovementGroupKey(breakdown = {}) {
	const year = Number(breakdown.year || breakdown.ano || 0) || "";
	const month = Number(breakdown.month || breakdown.numMes || 0) || "";

	return {
		key:
			year && month
				? `${year}-${String(month).padStart(2, "0")}`
				: "sem-periodo",
		label:
			year && month
				? `${year} - ${costCenterMovementMonthName(month)}`
				: "Sem período",
	};
}

export function normalizeCostCenterMovement(movement = {}, breakdown = {}) {
	const value = Number(
		movement.value ??
			movement.valor ??
			movement.realized ??
			movement.realizado ??
			0,
	);

	return {
		...movement,
		value,
		accountId: movement.accountId || breakdown.accountId,
		companyId: movement.companyId || breakdown.companyId,
		branchId: movement.branchId || breakdown.branchId,
	};
}

export function movementFromBreakdown(breakdown = {}) {
	const value = Number(breakdown.realized ?? breakdown.realizado ?? 0);

	return {
		id: breakdown.id,
		date: "",
		supplier: (breakdown.suppliers || breakdown.fornecedores || []).join(", "),
		accountId: breakdown.accountId,
		companyId: breakdown.companyId,
		branchId: breakdown.branchId,
		document: "",
		type: "",
		notes: "",
		value,
	};
}

export function buildCostCenterMovementsByMonth(center = {}) {
	const groups = new Map();

	getCostCenterMovementBreakdowns(center).forEach((breakdown) => {
		const { key, label } = getCostCenterMovementGroupKey(breakdown);
		const group = groups.get(key) || { key, label, total: 0, rows: [] };
		const movements = Array.isArray(
			breakdown.movements || breakdown.movimentacoes,
		)
			? breakdown.movements || breakdown.movimentacoes
			: [];
		const rows = movements.length
			? movements.map((movement) =>
					normalizeCostCenterMovement(movement, breakdown),
				)
			: [movementFromBreakdown(breakdown)];

		rows.forEach((row) => {
			group.total += row.value;
			group.rows.push(row);
		});
		groups.set(key, group);
	});

	return Array.from(groups.values()).sort((left, right) =>
		String(right.key).localeCompare(String(left.key)),
	);
}

export function getSelectedCostCenterMovementMonth(groups = [], activeKey = "") {
	return groups.find((group) => group.key === activeKey) || groups[0];
}

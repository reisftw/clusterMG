export const brl = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export const integer = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 0,
});

export const decimal = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 2,
});

export function parseBudgetCurrency(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const text = String(value || "").trim();
	if (!text) return 0;
	const withoutCurrency = text.replace(/[R$\s]/g, "");
	const normalized = withoutCurrency.includes(",")
		? withoutCurrency.replace(/\./g, "").replace(",", ".")
		: withoutCurrency;
	const number = Number(normalized || 0);
	return Number.isFinite(number) ? number : 0;
}

export function formatBudgetCurrency(value) {
	return brl.format(parseBudgetCurrency(value));
}

export function parseMoneyInput(value) {
	const text = String(value || "")
		.replace(/[^\d,.-]/g, "")
		.trim();
	const normalized = text.includes(",")
		? text.replace(/\./g, "").replace(",", ".")
		: text;
	const number = Number(normalized || 0);
	return Number.isFinite(number) ? number : 0;
}

export function formatValue(value, type = "number") {
	if (type === "text") return value || "-";
	if (type === "currency") return brl.format(Number(value || 0));
	if (type === "percent") return `${decimal.format(Number(value || 0))}%`;
	return integer.format(Number(value || 0));
}

// Roteiro UX_AUDIT.md (Fase 5 — extracao incremental de FinanceiroPage.jsx,
// continuacao): helpers e modais genericos usados por 2+ paginas do
// modulo financeiro (Serasa, Tarifas, Orcamento, Configuracoes) —
// extraidos aqui pra cada pagina poder ser seu proprio arquivo sem
// duplicar esse codigo. Comportamento identico ao que estava no
// arquivao — so mudou de arquivo.
import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import ModalShell from "../../../../components/ModalShell";

// Usado tanto pelos utils de Serasa (parse de datas de linhas
// importadas) quanto por buildBudgetPeriod (filtro de datas customizado
// do Orcamento).
export function dateFromInput(value) {
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Usado pelo dominio de Orcamento (BudgetOrcamentoDomain.jsx) e pelo
// modal de diretorias que mora no shell (FinanceiroPage.jsx) — precisa
// estar aqui pra nao duplicar a normalizacao entre os dois arquivos.
export function normalizeImportHeader(value) {
	return String(value || "")
		.trim()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "");
}

export function budgetEntityId(value, fallback = "item") {
	return (
		String(value || "")
			.trim()
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || fallback
	);
}

export function parseLegacyDirectorate(value = "") {
	const text = String(value || "").trim();
	if (!text || text.toLowerCase() === "[object object]")
		return { nome: "", diretor: "", emailDiretor: "", numeroDiretor: "" };
	const [nome = "", diretor = "", emailDiretor = "", numeroDiretor = ""] = text
		.split("|")
		.map((item) => item.trim());
	return { nome, diretor, emailDiretor, numeroDiretor };
}

export function normalizeDirectorates(value, fallback = []) {
	const source = value === undefined || value === null ? fallback : value;
	const rawItems = Array.isArray(source)
		? source
		: String(source || "").split(/[,;\n]+/);
	const seen = new Set();
	return rawItems
		.map((item) => {
			const parsed =
				typeof item === "object" && item !== null
					? {
							id: String(item.id || item.nome || item.name || "").trim(),
							nome: String(
								item.nome || item.name || item.diretoria || "",
							).trim(),
							diretor: String(
								item.diretor || item.director || item.responsavel || "",
							).trim(),
							emailDiretor: String(
								item.emailDiretor || item.directorEmail || item.email || "",
							).trim(),
							numeroDiretor: String(
								item.numeroDiretor ||
									item.telefoneDiretor ||
									item.directorPhone ||
									item.telefone ||
									item.numero ||
									"",
							).trim(),
						}
					: parseLegacyDirectorate(item);
			const nome = String(parsed.nome || "").trim();
			if (!nome || nome.toLowerCase() === "[object object]") return null;
			const id = budgetEntityId(parsed.id || nome, `diretoria-${nome}`);
			return {
				id,
				nome,
				diretor: String(parsed.diretor || "").trim(),
				emailDiretor: String(parsed.emailDiretor || "").trim(),
				numeroDiretor: String(parsed.numeroDiretor || "").trim(),
			};
		})
		.filter(Boolean)
		.filter((item) => {
			const key = normalizeImportHeader(item.nome);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export function findDirectorateByName(directorates = [], name = "") {
	const key = normalizeImportHeader(name);
	return (
		normalizeDirectorates(directorates).find(
			(item) => normalizeImportHeader(item.nome) === key,
		) || null
	);
}

export function budgetMonthName(month) {
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

export function formatBudgetMonthYear({ year, month } = {}) {
	const safeYear = Number(year) || new Date().getFullYear();
	const safeMonth = Number(month) || new Date().getMonth() + 1;
	return `${safeYear} - ${budgetMonthName(safeMonth)}`;
}

export function formatBudgetPeriodDisplay(
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

export const DEFAULT_SHEETS_CONFIG = {
	enabled: false,
	intervalMinutes: 30,
	serviceAccountConfigured: false,
	serviceAccountEmail: "",
	serviceAccountProjectId: "",
	serviceAccountError: "",
	lastRunAt: "",
	lastRunStatus: "",
	lastRunMessage: "",
	nextRunAt: "",
	sources: [
		{
			id: "contas_pagar",
			label: "Contas a pagar",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "contas_receber",
			label: "Contas a receber",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "faturamento",
			label: "Faturamento",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "notas",
			label: "Notas",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
		},
		{
			id: "serasa",
			label: "Serasa",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "MOVIMENTAÇÃO SERASA",
			range: "A:ZZ",
			headerRow: 1,
			intervalMinutes: 60,
		},
		{
			id: "tarifas",
			label: "Tarifas",
			enabled: false,
			spreadsheetId: "",
			spreadsheetUrl: "",
			sheetName: "",
			range: "A:ZZ",
			headerRow: 1,
			intervalMinutes: 60,
		},
	],
};

export function formatUpdatedAt(value) {
	if (!value) return "Sem atualização";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Sem atualização";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function sanitizeFileName(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
}

let cachedSempreLogoDataUrl = "";

export async function getSempreLogoDataUrl() {
	if (cachedSempreLogoDataUrl) return cachedSempreLogoDataUrl;
	const response = await fetch("/sempre-logo-azul.png", {
		cache: "force-cache",
	});
	if (!response.ok) return "";
	const blob = await response.blob();
	cachedSempreLogoDataUrl = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
	return cachedSempreLogoDataUrl;
}

export function getVisibleError(
	error,
	fallback = "Não foi possível concluir a ação.",
) {
	const message = error?.message || fallback;
	const detailParts = [
		error?.status ? `HTTP ${error.status}` : "",
		error?.details,
		error?.data && typeof error.data === "object"
			? JSON.stringify(error.data, null, 2)
			: "",
	].filter(Boolean);
	return {
		message,
		details: detailParts.join("\n\n"),
	};
}

export function FeedbackModal({ feedback, onClose }) {
	if (!feedback) return null;
	const isError = feedback.type === "error";
	return (
		<ModalShell
			title={feedback.title || (isError ? "Erro na operação" : "Aviso")}
			description={feedback.description}
			icon={isError ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
			onClose={onClose}
			size="lg"
			footer={
				<button
					type="button"
					onClick={onClose}
					className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
				>
					Entendi
				</button>
			}
		>
			<div
				className={`rounded-2xl border p-4 text-sm font-bold ${isError ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
			>
				{feedback.message}
			</div>
			{feedback.details ? (
				<pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs font-semibold text-slate-100">
					{feedback.details}
				</pre>
			) : null}
		</ModalShell>
	);
}

export function BudgetDateRangeModal({ value, onClose, onApply }) {
	const today = new Date();
	const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
		.toISOString()
		.slice(0, 10);
	const currentDay = today.toISOString().slice(0, 10);
	const [form, setForm] = useState({
		startDate: value?.startDate || firstDay,
		endDate: value?.endDate || currentDay,
	});
	const [error, setError] = useState("");

	const updateField = (field, fieldValue) => {
		setError("");
		setForm((current) => ({ ...current, [field]: fieldValue }));
	};

	const submit = () => {
		if (!form.startDate || !form.endDate) {
			setError("Informe a data inicial e a data final.");
			return;
		}
		if (form.startDate > form.endDate) {
			setError("A data inicial não pode ser maior que a data final.");
			return;
		}
		onApply(form);
	};

	return (
		<ModalShell
			title="Selecionar datas"
			description="Filtre a gestão orçamentária por um intervalo específico."
			icon={<CalendarClock size={20} />}
			onClose={onClose}
			size="md"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={submit}
						className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
					>
						Aplicar
					</button>
				</div>
			}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Data inicial
					<input
						type="date"
						value={form.startDate}
						onChange={(event) => updateField("startDate", event.target.value)}
						className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					/>
				</label>
				<label className="space-y-2 text-xs font-black uppercase text-slate-500">
					Data final
					<input
						type="date"
						value={form.endDate}
						onChange={(event) => updateField("endDate", event.target.value)}
						className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
					/>
				</label>
			</div>
			{error ? (
				<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}
		</ModalShell>
	);
}

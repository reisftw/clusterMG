import {
	Boxes,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Edit3,
	FileSpreadsheet,
	FileText,
	Loader2,
	MapPin,
	PackagePlus,
	RefreshCw,
	Search,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import {
	formatOnnetMac,
	inferOnnetManufacturer,
	atualizarEstoqueOnnet,
	conciliarEstoqueOnnet,
	excluirEstoqueOnnet,
	listarEstoqueOnnet,
	normalizeOnnetMac,
	obterContabilizacaoEstoqueOnnet,
	salvarEstoqueOnnet,
} from "../services/estoqueOnnetService";

function getTodayInputValue() {
	const parts = new Intl.DateTimeFormat("en-CA", {
		day: "2-digit",
		month: "2-digit",
		timeZone: "America/Sao_Paulo",
		year: "numeric",
	}).formatToParts(new Date());
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

function getCurrentTimeInputValue() {
	return new Intl.DateTimeFormat("pt-BR", {
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		timeZone: "America/Sao_Paulo",
	}).format(new Date());
}

function formatDateTime(date, time) {
	if (!date) return "-";
	const [year, month, day] = String(date).slice(0, 10).split("-");
	return `${day}/${month}/${year}${time ? `, ${time}` : ""}`;
}

const initialForm = () => ({
	cidade: "",
	dataEntrega: getTodayInputValue(),
	fabricante: "",
	horaEntrega: getCurrentTimeInputValue(),
	mac: "",
	observacao: "",
	tecnicoNome: "",
});

function getCurrentMonthInputValue() {
	return getTodayInputValue().slice(0, 7);
}

function getMonthRange(monthValue) {
	const [year, month] = String(monthValue || "").split("-").map(Number);
	if (!year || !month) return { startDate: "", endDate: "" };
	const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		startDate: `${year}-${String(month).padStart(2, "0")}-01`,
		endDate: `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
	};
}

function buildFileName(extension, filters) {
	const range =
		filters.startDate || filters.endDate
			? `${filters.startDate || "inicio"}_${filters.endDate || "fim"}`
			: "todos";
	return `estoque-onnet-${range}.${extension}`;
}

function downloadBlob(content, fileName, type) {
	const blob = content instanceof Blob ? content : new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function StatCard({ icon: Icon, label, value, helper }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center gap-3">
				<div className="rounded-xl bg-blue-50 p-3 text-blue-600">
					<Icon className="h-5 w-5" />
				</div>
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-400">
						{label}
					</p>
					<p className="text-2xl font-black text-slate-950">{value}</p>
					{helper ? (
						<p className="text-xs font-semibold text-slate-500">{helper}</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

export default function EstoqueOnnetPage() {
	const { currentUser } = useAuthContext();
	const { regionais } = useRegionais();
	const [form, setForm] = useState(initialForm);
	const [records, setRecords] = useState([]);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [query, setQuery] = useState("");
	const [periodType, setPeriodType] = useState("month");
	const [monthFilter, setMonthFilter] = useState(getCurrentMonthInputValue);
	const [customStartDate, setCustomStartDate] = useState("");
	const [customEndDate, setCustomEndDate] = useState("");
	const [editingId, setEditingId] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [deletingId, setDeletingId] = useState("");
	const [exporting, setExporting] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [accounting, setAccounting] = useState(null);
	const [reconciling, setReconciling] = useState(false);
	const canReconcile =
		hasPermission(currentUser, "estoque.equipamentos.manage") ||
		hasPermission(currentUser, "manage_equipamentos");

	const cidades = useMemo(
		() =>
			[
				...new Set(
					(regionais || []).flatMap((regional) =>
						(regional.cidades || []).map((cidade) => cidade.nome).filter(Boolean),
					),
				),
			].sort((left, right) => left.localeCompare(right, "pt-BR")),
		[regionais],
	);

	const normalizedMac = normalizeOnnetMac(form.mac);
	const fabricanteSugerido = inferOnnetManufacturer(normalizedMac);
	const fabricante = form.fabricante || fabricanteSugerido;
	const macValido = normalizedMac.length === 12;
	const filters = useMemo(() => {
		if (periodType === "month") return getMonthRange(monthFilter);
		if (periodType === "custom") {
			return {
				startDate: customStartDate,
				endDate: customEndDate,
			};
		}
		return { startDate: "", endDate: "" };
	}, [customEndDate, customStartDate, monthFilter, periodType]);

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const [response, accountingStatus] = await Promise.all([
				listarEstoqueOnnet({
					...filters,
					page,
					limit: 50,
					query,
				}),
				obterContabilizacaoEstoqueOnnet().catch(() => null),
			]);
			setRecords(response.items || []);
			setTotal(Number(response.total || 0));
			setTotalPages(Number(response.totalPages || 1));
			if (accountingStatus) setAccounting(accountingStatus);
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível carregar o estoque Onnet.");
		} finally {
			setLoading(false);
		}
	}, [filters, page, query]);

	const handleReconcile = async () => {
		setReconciling(true);
		setError("");
		setMessage("");
		try {
			const response = await conciliarEstoqueOnnet(true);
			setAccounting(response);
			setMessage(
				`${Number(response.eligible || 0)} equipamento(s) conferido(s) nas metas Onnet.`,
			);
		} catch (requestError) {
			setError(
				requestError?.message ||
					"Não foi possível conciliar o estoque com as metas Onnet.",
			);
		} finally {
			setReconciling(false);
		}
	};

	useEffect(() => {
		load();
	}, [load]);

	const updateForm = (field, value) => {
		setForm((current) => ({ ...current, [field]: value }));
	};

	const resetForm = () => {
		setForm(initialForm());
		setEditingId("");
	};

	const startEdit = (item) => {
		setEditingId(item.id);
		setForm({
			cidade: item.cidade || "",
			dataEntrega: item.dataEntrega || getTodayInputValue(),
			fabricante: item.fabricante || "",
			horaEntrega: item.horaEntrega || getCurrentTimeInputValue(),
			mac: item.macFormatado || item.mac || "",
			observacao: item.observacao || "",
			tecnicoNome: item.tecnicoNome || "",
		});
		setMessage("");
		setError("");
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const payload = {
				...form,
				fabricante,
				mac: normalizedMac,
			};
			const response = editingId
				? await atualizarEstoqueOnnet(editingId, payload)
				: await salvarEstoqueOnnet(payload);
			setMessage(
				`${response.item?.macFormatado || formatOnnetMac(normalizedMac)} ${editingId ? "atualizado" : "salvo"} e contabilizado nas metas Onnet.`,
			);
			resetForm();
			setPage(1);
			await load();
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível salvar o registro Onnet.");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (item) => {
		if (!window.confirm(`Excluir ${item.macFormatado || formatOnnetMac(item.mac)} do estoque Onnet?`)) return;
		setDeletingId(item.id);
		setError("");
		setMessage("");
		try {
			await excluirEstoqueOnnet(item.id);
			setMessage(`${item.macFormatado || formatOnnetMac(item.mac)} excluído e metas recalculadas.`);
			if (editingId === item.id) resetForm();
			await load();
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível excluir o registro Onnet.");
		} finally {
			setDeletingId("");
		}
	};

	const fetchExportRows = async () => {
		const response = await listarEstoqueOnnet({
			...filters,
			page: 1,
			limit: 5000,
			query,
		});
		return response.items || [];
	};

	const exportXlsx = async () => {
		setExporting("xlsx");
		setError("");
		try {
			const rows = await fetchExportRows();
			const XLSX = await import("xlsx");
			const worksheet = XLSX.utils.json_to_sheet(
				rows.map((item) => ({
					MAC: item.macFormatado || formatOnnetMac(item.mac),
					Fabricante: item.fabricante || "Fabricante não identificado",
					Cidade: item.cidade || "",
					Técnico: item.tecnicoNome || "",
					Data: formatDateTime(item.dataEntrega, item.horaEntrega),
					Observação: item.observacao || "",
				})),
			);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, "Estoque Onnet");
			const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
			downloadBlob(
				buffer,
				buildFileName("xlsx", filters),
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			);
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível exportar XLSX.");
		} finally {
			setExporting("");
		}
	};

	const exportPdf = async () => {
		setExporting("pdf");
		setError("");
		try {
			const rows = await fetchExportRows();
			const { default: jsPDF } = await import("jspdf");
			const { default: autoTable } = await import("jspdf-autotable");
			const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
			pdf.setFontSize(16);
			pdf.text("Estoque Onnet sem O.S.", 40, 42);
			pdf.setFontSize(10);
			pdf.text(`Total: ${rows.length} registro(s)`, 40, 60);
			autoTable(pdf, {
				startY: 78,
				head: [["MAC", "Fabricante", "Cidade", "Técnico", "Data", "Observação"]],
				body: rows.map((item) => [
					item.macFormatado || formatOnnetMac(item.mac),
					item.fabricante || "Fabricante não identificado",
					item.cidade || "",
					item.tecnicoNome || "",
					formatDateTime(item.dataEntrega, item.horaEntrega),
					item.observacao || "",
				]),
				styles: { fontSize: 8, cellPadding: 4 },
				headStyles: { fillColor: [37, 99, 235] },
			});
			pdf.save(buildFileName("pdf", filters));
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível exportar PDF.");
		} finally {
			setExporting("");
		}
	};

	return (
		<div className="space-y-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p className="text-sm font-black uppercase tracking-wide text-blue-600">
							Estoque
						</p>
						<h1 className="text-2xl font-black text-slate-950">
							Onnet sem O.S.
						</h1>
						<p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
							Registre equipamentos Onnet recebidos no estoque sem ordem de serviço.
							O lançamento entra automaticamente na contabilidade normal de
							retiradas da base Onnet.
						</p>
					</div>
					<button
						type="button"
						onClick={load}
						disabled={loading}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
					>
						<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
						Atualizar
					</button>
				</div>
			</section>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<StatCard icon={Boxes} label="Equipamentos registrados" value={total} helper="Histórico Onnet" />
				<StatCard
					icon={CheckCircle2}
					label="Contabilizados nas metas"
					value={Number(accounting?.eligible || 0)}
					helper={
						accounting?.reconciledAt
							? `Última conciliação: ${new Date(accounting.reconciledAt).toLocaleString("pt-BR")}`
							: "Aguardando primeira conciliação"
					}
				/>
				<StatCard icon={CheckCircle2} label="Fabricante" value={fabricante} helper={macValido ? formatOnnetMac(normalizedMac) : "Digite o MAC"} />
				<StatCard icon={CalendarDays} label="Data do lançamento" value={formatDateTime(form.dataEntrega, form.horaEntrega)} helper="Contabiliza neste dia" />
			</div>

			{canReconcile ? (
				<div className="flex justify-end">
					<button
						type="button"
						onClick={handleReconcile}
						disabled={reconciling}
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
					>
						<RefreshCw
							className={`h-4 w-4 ${reconciling ? "animate-spin" : ""}`}
						/>
						{reconciling ? "Conferindo histórico..." : "Conciliar histórico com as metas"}
					</button>
				</div>
			) : null}

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<form className="grid gap-4 lg:grid-cols-12" onSubmit={handleSubmit}>
					<label className="lg:col-span-3">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							MAC ou identificador do equipamento
						</span>
						<input
							value={form.mac}
							onChange={(event) => updateForm("mac", event.target.value)}
							placeholder="A8:32:9A:00:00:00 ou FHTT99F06B30"
							className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black uppercase text-slate-900 outline-none focus:border-blue-400"
							required
						/>
						<p className="mt-1 text-xs font-semibold text-slate-500">
							{macValido
								? formatOnnetMac(normalizedMac)
								: "Informe os 12 caracteres do MAC ou identificador Onnet."}
						</p>
					</label>

					<label className="lg:col-span-3">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Fabricante
						</span>
						<input
							value={form.fabricante || fabricanteSugerido}
							onChange={(event) => updateForm("fabricante", event.target.value)}
							placeholder="Huawei, FiberHome, ZTE..."
							className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
						/>
						<p className="mt-1 text-xs font-semibold text-slate-500">
							Prefixo detectado: {fabricanteSugerido}
						</p>
					</label>

					<label className="lg:col-span-3">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Cidade
						</span>
						<input
							list="estoque-onnet-cidades"
							value={form.cidade}
							onChange={(event) => updateForm("cidade", event.target.value)}
							placeholder="Digite a cidade"
							className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
							required
						/>
						<datalist id="estoque-onnet-cidades">
							{cidades.map((cidade) => (
								<option key={cidade} value={cidade} />
							))}
						</datalist>
					</label>

					<label className="lg:col-span-3">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Técnico que entregou
						</span>
						<input
							value={form.tecnicoNome}
							onChange={(event) => updateForm("tecnicoNome", event.target.value)}
							placeholder="Nome do técnico"
							className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
							required
						/>
					</label>

					<div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
						<label>
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Data
							</span>
							<input
								type="date"
								value={form.dataEntrega}
								onChange={(event) => updateForm("dataEntrega", event.target.value)}
								className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
								required
							/>
						</label>
						<label>
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Hora
							</span>
							<input
								type="time"
								value={form.horaEntrega}
								onChange={(event) => updateForm("horaEntrega", event.target.value)}
								className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
								required
							/>
						</label>
					</div>

					<label className="lg:col-span-6">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Observação
						</span>
						<input
							value={form.observacao}
							onChange={(event) => updateForm("observacao", event.target.value)}
							placeholder="Opcional"
							className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
						/>
					</label>

					<div className="flex items-end lg:col-span-3">
						<button
							type="submit"
							disabled={saving || !macValido}
							className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
						>
							{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
							{editingId ? "Atualizar registro" : "Salvar e contabilizar"}
						</button>
					</div>
					{editingId ? (
						<div className="flex items-end lg:col-span-3">
							<button
								type="button"
								onClick={resetForm}
								className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
							>
								<X className="h-4 w-4" />
								Cancelar edição
							</button>
						</div>
					) : null}
				</form>

				{message ? (
					<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
						{message}
					</div>
				) : null}
				{error ? (
					<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						{error}
					</div>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-lg font-black text-slate-950">Histórico Onnet</h2>
						<p className="text-sm font-semibold text-slate-500">
							Registros sem O.S contabilizados nas metas.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={exportPdf}
							disabled={exporting === "pdf"}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 disabled:opacity-60"
						>
							{exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
							PDF
						</button>
						<button
							type="button"
							onClick={exportXlsx}
							disabled={exporting === "xlsx"}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 disabled:opacity-60"
						>
							{exporting === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
							XLSX
						</button>
					</div>
				</div>

				<div className="mb-4 grid gap-3 lg:grid-cols-12">
					<label className="lg:col-span-3">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Período
						</span>
						<select
							value={periodType}
							onChange={(event) => {
								setPeriodType(event.target.value);
								setPage(1);
							}}
							className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
						>
							<option value="month">Mês</option>
							<option value="custom">Personalizado</option>
							<option value="all">Total</option>
						</select>
					</label>
					{periodType === "month" ? (
						<label className="lg:col-span-3">
							<span className="text-xs font-black uppercase tracking-wide text-slate-500">
								Mês
							</span>
							<input
								type="month"
								value={monthFilter}
								onChange={(event) => {
									setMonthFilter(event.target.value);
									setPage(1);
								}}
								className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
							/>
						</label>
					) : null}
					{periodType === "custom" ? (
						<>
							<label className="lg:col-span-2">
								<span className="text-xs font-black uppercase tracking-wide text-slate-500">
									Início
								</span>
								<input
									type="date"
									value={customStartDate}
									onChange={(event) => {
										setCustomStartDate(event.target.value);
										setPage(1);
									}}
									className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
								/>
							</label>
							<label className="lg:col-span-2">
								<span className="text-xs font-black uppercase tracking-wide text-slate-500">
									Fim
								</span>
								<input
									type="date"
									value={customEndDate}
									onChange={(event) => {
										setCustomEndDate(event.target.value);
										setPage(1);
									}}
									className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400"
								/>
							</label>
						</>
					) : null}
					<label className="lg:col-span-4">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							Busca
						</span>
						<div className="mt-1 flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
							<Search className="h-4 w-4 text-slate-400" />
							<input
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setPage(1);
								}}
								placeholder="MAC, cidade, técnico ou fabricante"
								className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
							/>
						</div>
					</label>
				</div>

				<div className="space-y-3">
					{loading ? (
						<div className="rounded-2xl border border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
							Carregando registros...
						</div>
					) : null}
					{!loading && !records.length ? (
						<div className="rounded-2xl border border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
							Nenhum MAC Onnet registrado ainda.
						</div>
					) : null}
					{records.map((item) => (
						<article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div className="min-w-0">
									<p className="text-base font-black text-slate-950">
										{item.macFormatado || formatOnnetMac(item.mac)}
									</p>
									<p className="mt-1 text-sm font-bold text-slate-500">
										{item.fabricante || "Fabricante não identificado"} · ONNET sem O.S
									</p>
								</div>
								<div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[520px]">
									<span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-bold text-slate-700">
										<MapPin className="h-4 w-4 text-blue-500" />
										{item.cidade || "-"}
									</span>
									<span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-bold text-slate-700">
										<UserRound className="h-4 w-4 text-blue-500" />
										{item.tecnicoNome || "-"}
									</span>
									<span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-bold text-slate-700">
										<Clock3 className="h-4 w-4 text-blue-500" />
										{formatDateTime(item.dataEntrega, item.horaEntrega)}
									</span>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => startEdit(item)}
										className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
									>
										<Edit3 className="h-4 w-4" />
										Editar
									</button>
									<button
										type="button"
										onClick={() => handleDelete(item)}
										disabled={deletingId === item.id}
										className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-60"
									>
										{deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
										Excluir
									</button>
								</div>
							</div>
							{item.observacao ? (
								<p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600">
									{item.observacao}
								</p>
							) : null}
						</article>
					))}
				</div>

				<div className="mt-4 flex flex-col gap-3 text-sm font-bold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
					<span>
						Página {page} de {totalPages} · {total} registro(s)
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => setPage((current) => Math.max(1, current - 1))}
							className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-50"
						>
							Anterior
						</button>
						<button
							type="button"
							disabled={page >= totalPages}
							onClick={() => setPage((current) => current + 1)}
							className="rounded-xl border border-slate-200 px-4 py-2 disabled:opacity-50"
						>
							Próxima
						</button>
					</div>
				</div>
			</section>
		</div>
	);
}

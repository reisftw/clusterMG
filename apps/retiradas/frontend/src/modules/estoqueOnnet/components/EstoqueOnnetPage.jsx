import {
	Boxes,
	CalendarDays,
	CheckCircle2,
	Clock3,
	Loader2,
	MapPin,
	PackagePlus,
	RefreshCw,
	Search,
	UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import {
	formatOnnetMac,
	inferOnnetManufacturer,
	listarEstoqueOnnet,
	normalizeOnnetMac,
	salvarEstoqueOnnet,
} from "../services/estoqueOnnetService";

function getTodayInputValue() {
	return new Intl.DateTimeFormat("en-CA", {
		day: "2-digit",
		month: "2-digit",
		timeZone: "America/Sao_Paulo",
		year: "numeric",
	}).format(new Date());
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
	horaEntrega: getCurrentTimeInputValue(),
	mac: "",
	observacao: "",
	tecnicoNome: "",
});

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
	const { regionais } = useRegionais();
	const [form, setForm] = useState(initialForm);
	const [records, setRecords] = useState([]);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

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
	const fabricante = inferOnnetManufacturer(normalizedMac);
	const macValido = normalizedMac.length === 12;

	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const response = await listarEstoqueOnnet({ page, limit: 50, query });
			setRecords(response.items || []);
			setTotal(Number(response.total || 0));
			setTotalPages(Number(response.totalPages || 1));
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível carregar o estoque Onnet.");
		} finally {
			setLoading(false);
		}
	}, [page, query]);

	useEffect(() => {
		load();
	}, [load]);

	const updateForm = (field, value) => {
		setForm((current) => ({ ...current, [field]: value }));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setMessage("");
		try {
			const response = await salvarEstoqueOnnet({
				...form,
				mac: normalizedMac,
			});
			setMessage(
				`${response.item?.macFormatado || formatOnnetMac(normalizedMac)} salvo e contabilizado nas metas Onnet.`,
			);
			setForm(initialForm());
			setPage(1);
			await load();
		} catch (requestError) {
			setError(requestError?.message || "Não foi possível salvar o MAC Onnet.");
		} finally {
			setSaving(false);
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

			<div className="grid gap-3 md:grid-cols-3">
				<StatCard icon={Boxes} label="MACs registrados" value={total} helper="Histórico Onnet" />
				<StatCard icon={CheckCircle2} label="Fabricante" value={fabricante} helper={macValido ? formatOnnetMac(normalizedMac) : "Digite o MAC"} />
				<StatCard icon={CalendarDays} label="Data do lançamento" value={formatDateTime(form.dataEntrega, form.horaEntrega)} helper="Contabiliza neste dia" />
			</div>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<form className="grid gap-4 lg:grid-cols-12" onSubmit={handleSubmit}>
					<label className="lg:col-span-3">
						<span className="text-xs font-black uppercase tracking-wide text-slate-500">
							MAC do equipamento
						</span>
						<input
							value={form.mac}
							onChange={(event) => updateForm("mac", event.target.value)}
							placeholder="A8:32:9A:00:00:00"
							className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black uppercase text-slate-900 outline-none focus:border-blue-400"
							required
						/>
						<p className="mt-1 text-xs font-semibold text-slate-500">
							{macValido ? formatOnnetMac(normalizedMac) : "Informe os 12 caracteres do MAC."}
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

					<label className="lg:col-span-9">
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
							Salvar e contabilizar
						</button>
					</div>
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
					<label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
						<Search className="h-4 w-4 text-slate-400" />
						<input
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
								setPage(1);
							}}
							placeholder="Buscar MAC, cidade ou técnico"
							className="min-w-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
						/>
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
								<div>
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

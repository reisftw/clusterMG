import {
	AlertCircle,
	Boxes,
	CheckCircle2,
	History,
	Loader2,
	PackageSearch,
	Search,
	UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	consultarEquipamentoSempre,
	consultarHistoricoSempre,
	normalizeMacInput,
} from "../services/sempreEstoqueService";

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function InfoCard({ icon: Icon, label, value, helper, tone = "slate" }) {
	const tones = {
		slate: "border-slate-200 bg-white text-slate-800",
		green: "border-emerald-200 bg-emerald-50 text-emerald-900",
		blue: "border-blue-200 bg-blue-50 text-blue-900",
		orange: "border-orange-200 bg-orange-50 text-orange-900",
	};

	return (
		<div
			className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.slate}`}
		>
			<div className="flex items-start gap-3">
				<span className="rounded-xl bg-white/80 p-2 shadow-sm">
					<Icon size={18} />
				</span>
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide opacity-70">
						{label}
					</p>
					<p className="mt-1 break-words text-base font-black">
						{value || "-"}
					</p>
					{helper ? (
						<p className="mt-1 text-xs font-semibold opacity-70">{helper}</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

function HistoryItem({ note }) {
	const firstItem = note.itens?.[0] || {};
	const origem =
		firstItem.estoqueOrigem?.display ||
		firstItem.estoqueOrigem?.descricao ||
		"-";
	const destino =
		firstItem.estoqueDestino?.display ||
		firstItem.estoqueDestino?.descricao ||
		"-";

	return (
		<article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-sm font-black text-slate-900">
						Nota {note.numero || note.id || "-"}
					</p>
					<p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
						{note.tipoOperacao?.descricao ||
							note.status ||
							note.situacao ||
							"Movimentacao"}
					</p>
				</div>
				<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
					{formatDate(note.atualizadoEm || note.criadoEm || note.emitidoEm)}
				</span>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				<div className="rounded-xl bg-slate-50 p-3">
					<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
						Origem
					</p>
					<p className="mt-1 text-sm font-bold text-slate-700">{origem}</p>
				</div>
				<div className="rounded-xl bg-slate-50 p-3">
					<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
						Destino
					</p>
					<p className="mt-1 text-sm font-bold text-slate-700">{destino}</p>
				</div>
			</div>

			{firstItem.produto?.descricao ? (
				<p className="mt-3 text-sm font-semibold text-slate-600">
					{firstItem.produto.descricao}
				</p>
			) : null}
			{note.observacao ? (
				<p className="mt-2 text-xs font-semibold text-slate-500">
					{note.observacao}
				</p>
			) : null}
		</article>
	);
}

function validateMacForSearch(normalizedMac) {
	if (normalizedMac.length !== 12 || normalizedMac === "FFFFFFFFFFFF") {
		return "Informe um MAC valido com 12 caracteres.";
	}
	return "";
}

function EquipmentSummary({ equipment }) {
	if (!equipment) return null;

	const primary = equipment.primary || null;
	const stockLocal = equipment.stockLocal || null;

	return (
		<section className="grid gap-4 lg:grid-cols-4">
			<InfoCard
				icon={equipment.found ? CheckCircle2 : AlertCircle}
				label="Status"
				value={
					equipment.found ? primary?.status || "Encontrado" : "Nao encontrado"
				}
				helper={
					primary?.vinculadoTipo ? `Vinculo: ${primary.vinculadoTipo}` : ""
				}
				tone={equipment.found ? "green" : "orange"}
			/>
			<InfoCard
				icon={Boxes}
				label="Estoque atual"
				value={stockLocal?.descricao || primary?.estoqueLocal}
				helper={stockLocal?.seniorId || primary?.estoqueLocalId}
				tone="blue"
			/>
			<InfoCard
				icon={PackageSearch}
				label="Produto"
				value={primary?.produtoNome}
				helper={primary?.produtoId}
			/>
			<InfoCard
				icon={UserRound}
				label="Vinculado em"
				value={primary?.vinculadoEm || primary?.origemStatus}
				helper={
					primary?.cpfCnpjMascarado ? `Doc: ${primary.cpfCnpjMascarado}` : ""
				}
			/>
		</section>
	);
}

function HistorySection({ history }) {
	if (!history) return null;

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="rounded-xl bg-blue-50 p-2 text-blue-700">
						<History size={18} />
					</span>
					<div>
						<h2 className="text-lg font-black text-slate-950">
							Historico de Movimentacoes
						</h2>
						<p className="text-xs font-semibold text-slate-500">
							{history.meta?.totalItems ?? history.notes?.length ?? 0}{" "}
							registro(s) encontrados para {history.mac}
						</p>
					</div>
				</div>
			</div>

			{history.notes?.length ? (
				<div className="grid gap-3">
					{history.notes.map((note) => (
						<HistoryItem key={note.id || note.numero} note={note} />
					))}
				</div>
			) : (
				<div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
					Nenhuma movimentacao encontrada para este MAC.
				</div>
			)}
		</section>
	);
}

export default function EstoqueConsultaPage() {
	const [mac, setMac] = useState("");
	const [equipment, setEquipment] = useState(null);
	const [history, setHistory] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const normalizedMac = useMemo(() => normalizeMacInput(mac), [mac]);

	async function handleSubmit(event) {
		event.preventDefault();
		setError("");
		setEquipment(null);
		setHistory(null);

		const validationError = validateMacForSearch(normalizedMac);
		if (validationError) {
			setError(validationError);
			return;
		}

		setLoading(true);
		try {
			const [equipmentResult, historyResult] = await Promise.all([
				consultarEquipamentoSempre(normalizedMac),
				consultarHistoricoSempre(normalizedMac, { limit: 20 }),
			]);
			setEquipment(equipmentResult);
			setHistory(historyResult);
		} catch (err) {
			setError(err?.message || "Nao foi possivel consultar a API Sempre.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
							INTEGRACAO SEMPRE
						</p>
						<h1 className="mt-2 text-2xl font-black text-slate-950">
							Consulta de Estoque
						</h1>
						<p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
							Consulte um MAC especifico para ver vinculo atual, estoque/local e
							historico de movimentacoes.
						</p>
					</div>
					<span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
						<PackageSearch size={14} />
						Senior / Playground
					</span>
				</div>

				<form
					onSubmit={handleSubmit}
					className="mt-6 flex flex-col gap-3 sm:flex-row"
				>
					<div className="relative flex-1">
						<Search
							size={18}
							className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
						/>
						<input
							value={mac}
							onChange={(event) =>
								setMac(normalizeMacInput(event.target.value))
							}
							placeholder="Digite ou cole o MAC. Ex: 544B542C68E0"
							className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-black uppercase tracking-wide text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
						/>
					</div>
					<button
						type="submit"
						disabled={loading}
						className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
					>
						{loading ? (
							<Loader2 size={18} className="animate-spin" />
						) : (
							<Search size={18} />
						)}
						Consultar
					</button>
				</form>

				{error ? (
					<div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
						<AlertCircle size={18} />
						{error}
					</div>
				) : null}
			</section>

			<EquipmentSummary equipment={equipment} />
			<HistorySection history={history} />
		</div>
	);
}

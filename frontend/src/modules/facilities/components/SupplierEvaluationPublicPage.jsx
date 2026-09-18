import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Star } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
	enviarAvaliacaoPublicaFornecedor,
	obterAvaliacaoPublicaFornecedor,
} from "../services/facilitiesService";

function StarField({ label, value, onChange, disabled }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="mb-3 flex items-center justify-between gap-3">
				<p className="text-sm font-black text-slate-900">{label}</p>
				<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
					{value || 0}/5
				</span>
			</div>
			<div className="flex flex-wrap gap-2">
				{[1, 2, 3, 4, 5].map((rating) => (
					<button
						key={rating}
						type="button"
						disabled={disabled}
						onClick={() => onChange(rating)}
						className={`flex h-11 w-11 items-center justify-center rounded-xl border transition ${
							rating <= value
								? "border-amber-300 bg-amber-100 text-amber-600"
								: "border-slate-200 bg-slate-50 text-slate-300 hover:border-amber-200 hover:text-amber-500"
						} disabled:cursor-not-allowed disabled:opacity-60`}
						aria-label={`${rating} estrela${rating > 1 ? "s" : ""} em ${label}`}
					>
						<Star size={20} fill="currentColor" aria-hidden="true" />
					</button>
				))}
			</div>
		</div>
	);
}

export default function SupplierEvaluationPublicPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token") || "";
	const fornecedorId = searchParams.get("fornecedor") || "";
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [data, setData] = useState(null);
	const [form, setForm] = useState({
		contratoId: "",
		responsavelNome: "",
		responsavelEmail: "",
		feedback: "",
		criteria: [],
	});

	useEffect(() => {
		let active = true;
		async function load() {
			setLoading(true);
			setError("");
			try {
				const result = await obterAvaliacaoPublicaFornecedor(token, fornecedorId);
				if (!active) return;
				const fields = result?.fornecedor?.campos?.length
					? result.fornecedor.campos
					: ["Atendimento", "Prazo", "Qualidade", "Comunicação", "Documentação"];
				setData(result);
				setSuccess(Boolean(result?.respondido));
				setForm({
					contratoId: result?.contracts?.[0]?.id || "",
					responsavelNome: result?.fornecedor?.contato || "",
					responsavelEmail: result?.fornecedor?.email || "",
					feedback: "",
					criteria: fields.map((label) => ({ label, rating: 5 })),
				});
			} catch (err) {
				if (active) setError(err?.message || "Não foi possível abrir esta avaliação.");
			} finally {
				if (active) setLoading(false);
			}
		}
		load();
		return () => {
			active = false;
		};
	}, [fornecedorId, token]);

	const average = useMemo(() => {
		const ratings = form.criteria.map((item) => Number(item.rating) || 0).filter(Boolean);
		return ratings.length
			? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
			: "0.0";
	}, [form.criteria]);

	function updateCriteria(index, rating) {
		setForm((current) => ({
			...current,
			criteria: current.criteria.map((item, itemIndex) =>
				itemIndex === index ? { ...item, rating } : item,
			),
		}));
	}

	async function submit(event) {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			await enviarAvaliacaoPublicaFornecedor(token, {
				...form,
				fornecedorId: data?.fornecedor?.id,
				link: window.location.href,
			});
			setSuccess(true);
		} catch (err) {
			setError(err?.message || "Não foi possível enviar a avaliação.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 px-4 py-8 text-slate-900">
			<section className="mx-auto max-w-4xl">
				<div className="mb-6 flex items-center gap-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
						<ClipboardCheck size={26} aria-hidden="true" />
					</div>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
							Administrativo | Cluster MG
						</p>
						<h1 className="text-2xl font-black text-slate-950">Avaliação de fornecedor</h1>
						<p className="text-sm font-semibold text-slate-600">
							Registre sua percepção sobre o atendimento prestado.
						</p>
					</div>
				</div>

				{loading ? (
					<div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm font-black text-slate-600 shadow-sm">
						Carregando avaliação...
					</div>
				) : error && !data ? (
					<div className="flex gap-3 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
						<AlertTriangle size={22} aria-hidden="true" />
						<div>
							<p className="font-black">Não foi possível abrir o link.</p>
							<p className="text-sm font-semibold">{error}</p>
						</div>
					</div>
				) : success ? (
					<div className="flex gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800 shadow-sm">
						<CheckCircle2 size={24} aria-hidden="true" />
						<div>
							<p className="font-black">Avaliação enviada com sucesso.</p>
							<p className="text-sm font-semibold">
								{data?.respondido
									? "Esta avaliação já foi registrada para a competência atual."
									: "Obrigado pelo retorno. A equipe administrativa já pode acompanhar o histórico."}
							</p>
						</div>
					</div>
				) : (
					<form onSubmit={submit} className="space-y-5">
						<div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div>
									<p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
										Fornecedor
									</p>
									<h2 className="mt-1 text-2xl font-black text-slate-950">
										{data?.fornecedor?.nome}
									</h2>
									<p className="text-sm font-semibold text-slate-600">
										{data?.fornecedor?.categoria || "Categoria não informada"}
									</p>
								</div>
								<div className={`rounded-2xl px-5 py-3 text-center ${Number(average) < 3 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
									<p className="text-xs font-black uppercase">Média</p>
									<p className="text-2xl font-black">{average} ★</p>
								</div>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<input
								value={form.responsavelNome}
								onChange={(event) => setForm((current) => ({ ...current, responsavelNome: event.target.value }))}
								className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-blue-400"
								placeholder="Seu nome"
								required
							/>
							<input
								type="email"
								value={form.responsavelEmail}
								onChange={(event) => setForm((current) => ({ ...current, responsavelEmail: event.target.value }))}
								className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-blue-400"
								placeholder="Seu e-mail"
								required
							/>
							<select
								value={form.contratoId}
								onChange={(event) => setForm((current) => ({ ...current, contratoId: event.target.value }))}
								className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-blue-400 md:col-span-2"
							>
								<option value="">Avaliação geral do fornecedor</option>
								{(data?.contracts || []).map((contract) => (
									<option key={contract.id} value={contract.id}>
										{contract.codigo || contract.servico || contract.id}
									</option>
								))}
							</select>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							{form.criteria.map((item, index) => (
								<StarField
									key={`${item.label}-${index}`}
									label={item.label}
									value={item.rating}
									onChange={(rating) => updateCriteria(index, rating)}
									disabled={saving}
								/>
							))}
						</div>

						<textarea
							value={form.feedback}
							onChange={(event) => setForm((current) => ({ ...current, feedback: event.target.value }))}
							className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
							placeholder="Comentário ou sugestão para melhoria"
						/>

						{error ? (
							<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
								{error}
							</div>
						) : null}

						<button
							type="submit"
							disabled={saving}
							className="h-12 w-full rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saving ? "Enviando avaliação..." : "Enviar avaliação"}
						</button>
					</form>
				)}
			</section>
		</main>
	);
}

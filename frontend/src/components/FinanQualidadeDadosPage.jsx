// Qualidade de Dados (roteiro Finan #29, Fase 4A) — painel de saude do
// cadastro/lançamento, so leitura: mede e aponta onde corrigir, nao
// corrige nada sozinho. Reaproveita o mesmo espirito visual da Central
// de Pendências (FinanPendenciasPage.jsx).
import { AlertTriangle, Gauge, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFinanQualidadeDados } from "../api/finanApi";

const SEVERITY_META = {
	critico: { label: "Crítico", className: "border-red-200 bg-red-50 text-red-700", bar: "bg-red-500" },
	atencao: { label: "Atenção", className: "border-amber-200 bg-amber-50 text-amber-700", bar: "bg-amber-500" },
};

function scoreTone(score) {
	if (score >= 95) return { text: "text-emerald-600", ring: "from-emerald-500 to-emerald-400", label: "Saudável" };
	if (score >= 80) return { text: "text-amber-600", ring: "from-amber-500 to-amber-400", label: "Requer atenção" };
	return { text: "text-red-600", ring: "from-red-500 to-red-400", label: "Crítico" };
}

export default function FinanQualidadeDadosPage() {
	const [score, setScore] = useState(100);
	const [checks, setChecks] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchFinanQualidadeDados();
			setScore(data.score);
			setChecks(data.checks);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a qualidade de dados.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const tone = scoreTone(score);
	const totalProblemas = checks.reduce((sum, check) => sum + (check.comProblema || 0), 0);

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Gauge size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Qualidade de Dados</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Saúde do cadastro e dos lançamentos — só leitura, nenhuma checagem corrige nada sozinha.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={load}
						className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={17} />
						Atualizar
					</button>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			<div className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-1">
					<p className="text-xs font-black uppercase text-slate-500">Data Quality Score</p>
					<div className="mt-2 flex items-baseline gap-2">
						<p className={`text-4xl font-black ${tone.text}`}>{loading ? "--" : score.toFixed(1)}</p>
						<span className="text-lg font-black text-slate-300">%</span>
					</div>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
						<div
							className={`h-2 rounded-full bg-gradient-to-r transition-all ${tone.ring}`}
							style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
						/>
					</div>
					<p className={`mt-2 text-xs font-black ${tone.text}`}>{tone.label}</p>
				</div>
				<div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
							<AlertTriangle size={20} />
						</span>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">Registros com problema</p>
							<p className="text-2xl font-black text-slate-950">{totalProblemas}</p>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
							<ShieldCheck size={20} />
						</span>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">Checagens ativas</p>
							<p className="text-2xl font-black text-slate-950">{checks.length}</p>
						</div>
					</div>
				</div>
			</div>

			<div className="space-y-3">
				{loading ? (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Carregando checagens...
					</p>
				) : checks.length ? (
					checks.map((check) => {
						const severity = SEVERITY_META[check.severidade] || SEVERITY_META.atencao;
						const semProblema = check.comProblema === 0;
						return (
							<div key={check.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<p className="text-sm font-black text-slate-950">{check.titulo}</p>
											{semProblema ? (
												<span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black text-emerald-700">
													Tudo certo
												</span>
											) : (
												<span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-black ${severity.className}`}>
													{severity.label}
												</span>
											)}
										</div>
										<p className="mt-1 max-w-2xl text-xs font-medium text-slate-500">{check.descricao}</p>
										{check.amostra?.length ? (
											<p className="mt-1.5 truncate text-[11px] font-semibold text-slate-400">
												Exemplos: {check.amostra.join(", ")}
											</p>
										) : null}
									</div>
									<div className="flex shrink-0 items-center gap-3">
										<div className="text-right">
											<p className="text-lg font-black text-slate-950">
												{check.comProblema}
												<span className="text-xs font-bold text-slate-400"> / {check.total}</span>
											</p>
											<p className="text-[11px] font-bold text-slate-400">{check.percentualOk}% ok</p>
										</div>
										{check.link ? (
											<Link
												to={check.link}
												className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
											>
												Conferir
											</Link>
										) : null}
									</div>
								</div>
								<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
									<div
										className={`h-1.5 rounded-full ${semProblema ? "bg-emerald-500" : severity.bar}`}
										style={{ width: `${Math.max(2, check.percentualOk)}%` }}
									/>
								</div>
							</div>
						);
					})
				) : (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Nenhuma checagem disponível.
					</p>
				)}
			</div>
		</div>
	);
}

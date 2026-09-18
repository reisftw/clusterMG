// Central de Pendências (roteiro Finan #13) — lista o que precisa de
// atenção hoje, agregando sinais que ja existem em outras tabelas
// (lançamentos sem categoria, integrações com erro, falhas de importação,
// possíveis duplicidades). So leitura: nada aqui resolve nada sozinho.
import { AlertTriangle, ClipboardList, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFinanPendencias } from "../api/finanApi";

const SEVERITY_META = {
	critico: { label: "Crítico", className: "border-red-200 bg-red-50 text-red-700" },
	atencao: { label: "Atenção", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

export default function FinanPendenciasPage() {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchFinanPendencias());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as pendências.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const criticos = items.filter((item) => item.severidade === "critico").length;
	const atencao = items.filter((item) => item.severidade === "atencao").length;

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<ClipboardList size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Central de Pendências</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								{items.length} item(ns) precisam de atenção neste mês.
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

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
							<ShieldAlert size={20} />
						</span>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">Críticos</p>
							<p className="text-2xl font-black text-slate-950">{criticos}</p>
						</div>
					</div>
				</div>
				<div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-3">
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
							<AlertTriangle size={20} />
						</span>
						<div>
							<p className="text-xs font-black uppercase text-slate-500">Em atenção</p>
							<p className="text-2xl font-black text-slate-950">{atencao}</p>
						</div>
					</div>
				</div>
			</div>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{loading ? (
					<p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">Carregando pendências...</p>
				) : items.length ? (
					<ul className="divide-y divide-slate-100">
						{items.map((item) => {
							const severity = SEVERITY_META[item.severidade] || SEVERITY_META.atencao;
							return (
								<li key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0">
										<p className="text-sm font-black text-slate-950">{item.titulo}</p>
										<p className="mt-0.5 text-xs font-medium text-slate-500">{item.descricao}</p>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${severity.className}`}>
											{severity.label}
										</span>
										{item.link ? (
											<Link
												to={item.link}
												className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
											>
												Resolver
											</Link>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
						Nenhuma pendência encontrada. Tudo em dia por aqui.
					</p>
				)}
			</div>
		</div>
	);
}

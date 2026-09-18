// Conciliação Bancária (Roteiro Finan #48, Fase 4F) — sugestão
// automática de correspondência entre extrato bancário importado (via
// Central de Importações, entidade-alvo "extrato_bancario") e títulos
// em aberto, com % de confiança e confirmação manual.
import { CheckCircle2, Landmark, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmarFinanConciliacao, fetchFinanConciliacaoSugestoes } from "../api/finanApi";

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanConciliacaoPage() {
	const [sugestoes, setSugestoes] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [confirming, setConfirming] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setSugestoes(await fetchFinanConciliacaoSugestoes());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as sugestões de conciliação.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleConfirmar = async (extratoId, candidato) => {
		setConfirming(extratoId);
		try {
			await confirmarFinanConciliacao(extratoId, { tipo: candidato.tipo, id: candidato.id });
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível confirmar a conciliação.");
		} finally {
			setConfirming("");
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Landmark size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Conciliação Bancária</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Importe o extrato bancário pela Central de Importações (entidade "Extrato Bancário") — as
								correspondências prováveis com contas a pagar/receber aparecem aqui, sempre com confirmação manual.
							</p>
						</div>
					</div>
					<button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
						<RefreshCw size={17} /> Atualizar
					</button>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="space-y-3">
				{loading ? (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Carregando sugestões...
					</p>
				) : sugestoes.length ? (
					sugestoes.map((sugestao) => (
						<div key={sugestao.extratoId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-black text-slate-950">{sugestao.descricao}</p>
									<p className="text-xs font-bold text-slate-500">{sugestao.data} · {formatMoney(sugestao.valor)}</p>
								</div>
							</div>
							<div className="mt-3 space-y-2">
								{sugestao.candidatos.map((candidato) => (
									<div key={`${candidato.tipo}-${candidato.id}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
										<div>
											<p className="text-sm font-bold text-slate-800">{candidato.titulo}</p>
											<p className="text-xs text-slate-500">
												{candidato.tipo === "contas_pagar" ? "Conta a pagar" : "Conta a receber"} · {candidato.confianca}% de confiança
												{candidato.diasDiferenca ? ` · ${candidato.diasDiferenca}d de diferença` : ""}
											</p>
										</div>
										<button
											type="button"
											onClick={() => handleConfirmar(sugestao.extratoId, candidato)}
											disabled={confirming === sugestao.extratoId}
											className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
										>
											<CheckCircle2 size={13} /> Confirmar
										</button>
									</div>
								))}
							</div>
						</div>
					))
				) : (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Nenhuma sugestão de conciliação no momento — importe um extrato bancário na Central de Importações.
					</p>
				)}
			</section>
		</div>
	);
}

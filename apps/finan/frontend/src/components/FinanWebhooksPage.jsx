// Webhooks (Roteiro Finan #47, Fase 4F) — eventos para automações
// externas: supplier.updated, budget.threshold_reached, month.closed,
// invoice.created.
import { Plus, Trash2, Webhook } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createFinanWebhook,
	deleteFinanWebhook,
	fetchFinanWebhookEventos,
	fetchFinanWebhooks,
	updateFinanWebhook,
} from "../api/finanApi";

export default function FinanWebhooksPage() {
	const [eventos, setEventos] = useState([]);
	const [webhooks, setWebhooks] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [novoSecreto, setNovoSecreto] = useState(null);
	const [formOpen, setFormOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [eventosSelecionados, setEventosSelecionados] = useState([]);

	const load = async () => {
		setLoading(true);
		try {
			const [eventosResp, webhooksResp] = await Promise.all([fetchFinanWebhookEventos(), fetchFinanWebhooks()]);
			setEventos(eventosResp);
			setWebhooks(webhooksResp);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os webhooks.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleCreate = async () => {
		if (!url.trim() || !eventosSelecionados.length) {
			setError("Informe a URL e selecione ao menos um evento.");
			return;
		}
		try {
			const webhook = await createFinanWebhook({ url: url.trim(), eventos: eventosSelecionados });
			setNovoSecreto(webhook.secreto);
			setUrl("");
			setEventosSelecionados([]);
			setFormOpen(false);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível criar o webhook.");
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Webhook size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Webhooks</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Eventos do Finan para automações externas: fornecedor atualizado, limiar orçamentário atingido,
								período fechado, nota fiscal criada.
							</p>
						</div>
					</div>
					<button type="button" onClick={() => setFormOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700">
						<Plus size={16} /> Novo webhook
					</button>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			{novoSecreto ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Secreto (guarde agora — não aparece de novo): <code className="rounded bg-white px-2 py-0.5">{novoSecreto}</code>
				</div>
			) : null}

			{formOpen ? (
				<div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<label className="block text-xs font-black uppercase text-slate-500">
						URL de destino
						<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900" />
					</label>
					<div>
						<p className="text-xs font-black uppercase text-slate-500">Eventos</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{eventos.map((evento) => (
								<label key={evento} className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold ${eventosSelecionados.includes(evento) ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
									<input
										type="checkbox"
										className="mr-1.5"
										checked={eventosSelecionados.includes(evento)}
										onChange={(e) =>
											setEventosSelecionados((prev) => (e.target.checked ? [...prev, evento] : prev.filter((item) => item !== evento)))
										}
									/>
									{evento}
								</label>
							))}
						</div>
					</div>
					<div className="flex justify-end gap-2">
						<button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
							Cancelar
						</button>
						<button type="button" onClick={handleCreate} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
							Criar
						</button>
					</div>
				</div>
			) : null}

			<section className="space-y-3">
				{loading ? (
					<p className="text-sm font-semibold text-slate-500">Carregando...</p>
				) : webhooks.length ? (
					webhooks.map((webhook) => (
						<div key={webhook.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-slate-950">{webhook.url}</p>
								<p className="text-xs font-bold text-slate-500">
									{webhook.eventos.join(", ")} · último status: {webhook.ultimoStatusCode || "nunca disparado"}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<button
									type="button"
									onClick={() => updateFinanWebhook(webhook.id, { ativo: !webhook.ativo }).then(load)}
									className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
								>
									{webhook.ativo ? "Desativar" : "Ativar"}
								</button>
								<button
									type="button"
									onClick={() => deleteFinanWebhook(webhook.id).then(load)}
									className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
								>
									<Trash2 size={14} />
								</button>
							</div>
						</div>
					))
				) : (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Nenhum webhook cadastrado.
					</p>
				)}
			</section>
		</div>
	);
}

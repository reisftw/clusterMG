// Regras financeiras configuráveis (Roteiro Finan #40, Fase 4D, v1
// restrito) — cadastrar limiares sem alterar código. Catálogo fixo de
// tipos (não um motor genérico); avaliação roda sob demanda pela
// Central de Jobs (job "regras_financeiras").
import { AlertTriangle, Plus, Power, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createFinanRegra,
	deleteFinanRegra,
	fetchFinanRegras,
	fetchFinanRegrasTipos,
	reprocessarFinanJob,
	updateFinanRegra,
} from "../api/finanApi";
import ConfirmDialog from "./ConfirmDialog";

export default function FinanRegrasFinanceirasPage() {
	const [tipos, setTipos] = useState([]);
	const [regras, setRegras] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [feedback, setFeedback] = useState("");
	const [formOpen, setFormOpen] = useState(false);
	const [running, setRunning] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState(null);
	const [confirming, setConfirming] = useState(false);
	const [confirmError, setConfirmError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [tiposResp, regrasResp] = await Promise.all([fetchFinanRegrasTipos(), fetchFinanRegras()]);
			setTipos(tiposResp);
			setRegras(regrasResp);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as regras financeiras.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleToggle = async (regra) => {
		try {
			await updateFinanRegra(regra.id, { ativa: !regra.ativa });
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível atualizar a regra.");
		}
	};

	const handleDelete = (regra) => setConfirmTarget(regra);

	const closeConfirm = () => {
		setConfirmTarget(null);
		setConfirmError("");
	};

	const handleConfirmDelete = async () => {
		if (!confirmTarget) return;
		setConfirming(true);
		setConfirmError("");
		try {
			await deleteFinanRegra(confirmTarget.id);
			setFeedback(`Regra "${confirmTarget.nome}" excluída.`);
			closeConfirm();
			await load();
		} catch (err) {
			setConfirmError(err?.message || "Não foi possível excluir a regra.");
		} finally {
			setConfirming(false);
		}
	};

	const handleRunNow = async () => {
		setRunning(true);
		setError("");
		try {
			const result = await reprocessarFinanJob("regras_financeiras");
			const total = result?.summary?.recordsProcessed ?? 0;
			setFeedback(total ? `Avaliação concluída: ${total} violação(ões) encontrada(s) — notificações enviadas.` : "Avaliação concluída: nenhuma regra foi violada.");
		} catch (err) {
			setError(err?.message || "Falha ao rodar a avaliação.");
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<AlertTriangle size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Regras Financeiras</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Cadastre limiares sem alterar código ("despesa acima de R$ 50 mil gera alerta"). Avaliação sob
								demanda pela Central de Jobs.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={handleRunNow}
							disabled={running}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:opacity-50"
						>
							<Power size={16} className={running ? "animate-pulse" : ""} /> Avaliar agora
						</button>
						<button
							type="button"
							onClick={() => setFormOpen(true)}
							className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700"
						>
							<Plus size={16} /> Nova regra
						</button>
					</div>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}
			{feedback ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
					{feedback}
				</div>
			) : null}

			{formOpen ? (
				<NovaRegraForm
					tipos={tipos}
					onClose={() => setFormOpen(false)}
					onSaved={async () => {
						setFormOpen(false);
						await load();
					}}
				/>
			) : null}

			<section className="space-y-3">
				{loading ? (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Carregando...
					</p>
				) : regras.length ? (
					regras.map((regra) => (
						<div
							key={regra.id}
							className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<p className="truncate text-sm font-black text-slate-950">{regra.nome}</p>
									<span
										className={`rounded-full px-2 py-0.5 text-[11px] font-black ${regra.ativa ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
									>
										{regra.ativa ? "Ativa" : "Inativa"}
									</span>
								</div>
								<p className="text-xs font-bold text-slate-500">
									{tipos.find((t) => t.tipo === regra.tipo)?.label || regra.tipo} · limite R${" "}
									{Number(regra.parametros?.limiteValor || 0).toLocaleString("pt-BR")}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<button
									type="button"
									onClick={() => handleToggle(regra)}
									className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100"
								>
									{regra.ativa ? "Desativar" : "Ativar"}
								</button>
								<button
									type="button"
									onClick={() => handleDelete(regra)}
									aria-label={`Excluir regra ${regra.nome}`}
									className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-700 hover:bg-red-50"
								>
									<Trash2 size={13} />
								</button>
							</div>
						</div>
					))
				) : (
					<p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
						Nenhuma regra cadastrada ainda.
					</p>
				)}
			</section>

			<ConfirmDialog
				open={Boolean(confirmTarget)}
				tone="danger"
				title="Excluir esta regra?"
				description="A regra some da lista e para de ser avaliada. Essa ação não pode ser desfeita."
				items={confirmTarget ? [{ label: "Regra", value: confirmTarget.nome }] : []}
				confirmLabel="Excluir regra"
				cancelLabel="Voltar"
				loading={confirming}
				error={confirmError}
				onConfirm={handleConfirmDelete}
				onCancel={closeConfirm}
			/>
		</div>
	);
}

function NovaRegraForm({ tipos, onClose, onSaved }) {
	const [tipo, setTipo] = useState(tipos[0]?.tipo || "");
	const [nome, setNome] = useState("");
	const [limiteValor, setLimiteValor] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const handleSubmit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			await createFinanRegra({ tipo, nome, parametros: { limiteValor: Number(limiteValor) } });
			await onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a regra.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-base font-black text-slate-950">Nova regra</h2>
			{error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
			<div className="grid gap-3 sm:grid-cols-3">
				<label className="text-xs font-black uppercase text-slate-500">
					Tipo
					<select
						value={tipo}
						onChange={(event) => setTipo(event.target.value)}
						className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
					>
						{tipos.map((item) => (
							<option key={item.tipo} value={item.tipo}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Nome
					<input
						value={nome}
						onChange={(event) => setNome(event.target.value)}
						required
						className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Valor limite (R$)
					<input
						type="number"
						min="0"
						step="0.01"
						value={limiteValor}
						onChange={(event) => setLimiteValor(event.target.value)}
						required
						className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900"
					/>
				</label>
			</div>
			<div className="flex justify-end gap-2">
				<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
					Cancelar
				</button>
				<button
					type="submit"
					disabled={saving}
					className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
				>
					Salvar
				</button>
			</div>
		</form>
	);
}

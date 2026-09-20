import { useEffect, useState } from "react";
import { Plus, RefreshCw, Tags, Trash2 } from "lucide-react";
import { createRotServiceType, deleteRotServiceType, fetchRotServiceTypes, updateRotServiceType } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";

// Catalogo de Tipos de Servico usado pelos Chamados — cada tipo carrega
// uma pontuacao (usada no ranking de tecnicos no legado).
export default function ServiceTypesPage() {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [name, setName] = useState("");
	const [points, setPoints] = useState(1);
	const [saving, setSaving] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchRotServiceTypes());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os tipos de serviço.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const submit = async (event) => {
		event.preventDefault();
		if (!name.trim()) return;
		setSaving(true);
		setError("");
		try {
			const created = await createRotServiceType({ name: name.trim(), points: Number(points) || 0 });
			setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
			setName("");
			setPoints(1);
		} catch (err) {
			setError(err?.message || "Não foi possível criar o tipo de serviço.");
		} finally {
			setSaving(false);
		}
	};

	const toggleActive = async (item) => {
		const updated = await updateRotServiceType(item.id, { active: !item.active });
		setItems((current) => current.map((i) => (i.id === updated.id ? updated : i)));
	};

	const remove = async (item) => {
		if (!window.confirm(`Remover o tipo de serviço "${item.name}"?`)) return;
		try {
			await deleteRotServiceType(item.id);
			setItems((current) => current.filter((i) => i.id !== item.id));
		} catch (err) {
			setError(err?.message || "Não foi possível remover o item.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<Tags size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Tipos de Serviço</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} tipo(s) · usados nos Chamados e no ranking.</p>
					</div>
				</div>
				<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
					<RefreshCw size={16} /> Atualizar
				</button>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
					<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do tipo de serviço" className="h-11 min-w-[220px] flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					<input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Pontos" className="h-11 w-28 rounded-xl border border-slate-200 px-3 text-center text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					<button type="submit" disabled={saving} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						<Plus size={17} /> Adicionar
					</button>
				</form>

				<div className="space-y-1.5">
					{items.map((item) => (
						<div key={item.id} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${item.active ? "border-slate-200" : "border-slate-100 opacity-50"}`}>
							<span className="text-sm font-bold text-slate-800">{item.name} <span className="text-xs text-slate-400">({item.points} pts)</span></span>
							<div className="flex gap-2">
								<button type="button" onClick={() => toggleActive(item)} className="rot-btn-tactile rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50">
									{item.active ? "Desativar" : "Ativar"}
								</button>
								<button type="button" onClick={() => remove(item)} className="rot-btn-tactile flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
									<Trash2 size={14} />
								</button>
							</div>
						</div>
					))}
					{!items.length ? <p className="py-6 text-center text-sm font-bold text-slate-400">Nenhum tipo de serviço cadastrado.</p> : null}
				</div>
			</div>
		</div>
	);
}

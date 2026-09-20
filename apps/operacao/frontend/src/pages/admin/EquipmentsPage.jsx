import { useEffect, useState } from "react";
import { PackageCheck, RefreshCw, Undo2 } from "lucide-react";
import { fetchAssetsSecurityAssetsMine, fetchAssetsSecurityChecklistTemplates, fetchAssetsSecurityMeta } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { AssetActionModal } from "./AssetsSecurityPage";

// Antes era um cadastro de "equipamentos" (maquinas de fusao) proprio,
// solto do sistema de ativos. Substituido pela lista dos ativos
// (rot_assets) que estao sob a custodia da propria pessoa logada —
// mesma fonte de dados do card "Ativo(s) em sua posse" do Dashboard.
export default function EquipmentsPage() {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [returnState, setReturnState] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchAssetsSecurityAssetsMine();
			setItems(data);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar seus ativos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const startReturn = async (asset) => {
		try {
			const [meta, templates] = await Promise.all([fetchAssetsSecurityMeta(), fetchAssetsSecurityChecklistTemplates().catch(() => [])]);
			setReturnState({ asset, meta, templates });
		} catch (err) {
			window.alert(err?.message || "Não foi possível abrir a devolução agora.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-8">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<PackageCheck size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Meus ativos</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} ativo(s) sob sua custódia no momento.</p>
					</div>
				</div>
				<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
					<RefreshCw size={16} /> Atualizar
				</button>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{items.length ? (
				<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{items.map((asset) => (
						<article key={asset.id} className="rot-card-hover relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
							<div className="mb-4 flex items-start justify-between">
								<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow">
									<PackageCheck size={22} />
								</span>
								<div className="pr-2 text-right">
									<p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Código</p>
									<p className="font-mono text-xs font-bold uppercase text-slate-900">{asset.code || "—"}</p>
								</div>
							</div>
							<h3 className="text-lg font-black uppercase leading-tight text-slate-900">{asset.name}</h3>
							<p className="text-xs font-bold uppercase text-slate-400">{asset.categoryName || asset.typeName || "—"}</p>

							<div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
								<div className="min-w-0">
									<p className="truncate text-xs font-black uppercase leading-none text-slate-700">{asset.statusName || "Status n/d"}</p>
									{asset.lastMovementAt ? <span className="text-[10px] font-bold uppercase text-blue-600">Desde {new Date(asset.lastMovementAt).toLocaleDateString("pt-BR")}</span> : null}
								</div>
							</div>

							<div className="mt-4">
								<button type="button" onClick={() => startReturn(asset)} className="rot-btn-tactile flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-[10px] font-black uppercase text-white shadow hover:bg-blue-700">
									<Undo2 size={14} /> Devolver
								</button>
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum ativo sob sua custódia no momento.</div>
			)}

			{returnState ? (
				<AssetActionModal
					kind="return"
					asset={returnState.asset}
					meta={returnState.meta}
					templates={returnState.templates}
					onClose={() => setReturnState(null)}
					onSaved={() => {
						setReturnState(null);
						load();
					}}
				/>
			) : null}
		</div>
	);
}

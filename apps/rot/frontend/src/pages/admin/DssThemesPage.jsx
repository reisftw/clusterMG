import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Plus, Search } from "lucide-react";
import { createDssTheme, fetchDssThemes } from "../../api/rotApi";
import Field from "../../components/ui/Field";
import ModalShell from "../../components/ui/ModalShell";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";

export const CATEGORY_OPTIONS = [
	{ id: "epi", name: "EPI" },
	{ id: "epc", name: "EPC" },
	{ id: "direcao_segura", name: "Direção segura" },
	{ id: "trabalho_altura", name: "Trabalho em altura" },
	{ id: "seguranca_eletrica", name: "Segurança elétrica" },
	{ id: "acidentes", name: "Acidentes" },
	{ id: "ergonomia", name: "Ergonomia" },
	{ id: "saude_ocupacional", name: "Saúde ocupacional" },
	{ id: "prevencao", name: "Prevenção" },
	{ id: "procedimentos_operacionais", name: "Procedimentos operacionais" },
	{ id: "outros", name: "Outros" },
];

export const MODALITY_OPTIONS = [
	{ id: "semanal", name: "Semanal (um conteúdo por semana)" },
	{ id: "mensal", name: "Mensal (um tema com 4 desdobramentos semanais)" },
];

export const CONTENT_TYPE_OPTIONS = [
	{ id: "editor", name: "Escrever no sistema" },
	{ id: "pdf", name: "Anexar PDF pronto" },
];

export const THEME_STATUS_BADGE = {
	rascunho: "bg-slate-100 text-slate-600",
	publicado: "bg-emerald-50 text-emerald-700",
	arquivado: "bg-slate-100 text-slate-400",
};

export const THEME_STATUS_LABEL = { rascunho: "Rascunho", publicado: "Publicado", arquivado: "Arquivado" };

function categoryLabel(category) {
	return CATEGORY_OPTIONS.find((item) => item.id === category)?.name || category;
}

export default function DssThemesPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canCreate = hasPermission("dss.tema.criar");
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [filters, setFilters] = useState({ category: "", modality: "", status: "", q: "" });
	const [createOpen, setCreateOpen] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchDssThemes(filters));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os temas.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<BookOpen size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">DSS · Temas</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} tema(s) cadastrado(s).</p>
					</div>
				</div>
				{canCreate ? (
					<button type="button" onClick={() => setCreateOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
						<Plus size={17} /> Novo tema
					</button>
				) : null}
			</header>

			<div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:grid-cols-[1fr_160px_160px_160px_auto]">
				<div className="relative">
					<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input value={filters.q} onChange={(e) => setFilters((c) => ({ ...c, q: e.target.value }))} placeholder="Buscar por título..." className="h-11 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</div>
				<Select value={filters.category} onChange={(v) => setFilters((c) => ({ ...c, category: v }))} items={CATEGORY_OPTIONS} empty="Toda categoria" />
				<Select value={filters.modality} onChange={(v) => setFilters((c) => ({ ...c, modality: v }))} items={MODALITY_OPTIONS} empty="Toda modalidade" />
				<Select value={filters.status} onChange={(v) => setFilters((c) => ({ ...c, status: v }))} items={[{ id: "rascunho", name: "Rascunho" }, { id: "publicado", name: "Publicado" }, { id: "arquivado", name: "Arquivado" }]} empty="Todo status" />
				<button type="button" onClick={load} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
					<table className="w-full min-w-[720px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Título</th>
								<th className="px-4 py-3">Categoria</th>
								<th className="px-4 py-3">Modalidade</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Atualizado em</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{items.map((item) => (
								<tr key={item.id} onClick={() => navigate(`/seguranca-trabalho/dss/temas/${item.id}`)} className="cursor-pointer hover:bg-slate-50">
									<td className="px-4 py-3 font-bold text-slate-900">{item.title}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{categoryLabel(item.category)}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.modality === "mensal" ? "Mensal" : "Semanal"}</td>
									<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${THEME_STATUS_BADGE[item.status] || ""}`}>{THEME_STATUS_LABEL[item.status] || item.status}</span></td>
									<td className="px-4 py-3 font-bold text-slate-500">{new Date(item.updatedAt).toLocaleString("pt-BR")}</td>
								</tr>
							))}
						</tbody>
					</table>
					{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum tema encontrado.</p> : null}
				</div>
			)}

			{createOpen ? (
				<CreateThemeModal
					onClose={() => setCreateOpen(false)}
					onCreated={(theme) => {
						setCreateOpen(false);
						navigate(`/seguranca-trabalho/dss/temas/${theme.id}`);
					}}
				/>
			) : null}
		</div>
	);
}

function CreateThemeModal({ onClose, onCreated }) {
	const [form, setForm] = useState({ title: "", category: "outros", modality: "semanal", contentType: "editor", description: "", objective: "", notes: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const setField = (key, value) => setForm((c) => ({ ...c, [key]: value }));

	const submit = async (event) => {
		event.preventDefault();
		if (!form.title.trim()) {
			setError("Informe o título do tema.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const theme = await createDssTheme({ ...form, contentBlocks: [] });
			onCreated(theme);
		} catch (err) {
			setError(err?.message || "Não foi possível criar o tema.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Novo tema de DSS" description="O conteúdo (texto ou PDF) e os desdobramentos semanais são definidos depois de criar o tema." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><BookOpen size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<Field label="Título" required><input value={form.title} onChange={(e) => setField("title", e.target.value)} className="rot-input" placeholder="Ex.: Trabalho em altura" autoFocus /></Field>
				<Field label="Descrição resumida"><textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Categoria" required><Select value={form.category} onChange={(v) => setField("category", v)} items={CATEGORY_OPTIONS} /></Field>
					<Field label="Modalidade" required><Select value={form.modality} onChange={(v) => setField("modality", v)} items={MODALITY_OPTIONS} /></Field>
				</div>
				<Field label="Conteúdo" required hint="Depois de criado, escreva o conteúdo ou anexe o PDF na tela do tema."><Select value={form.contentType} onChange={(v) => setField("contentType", v)} items={CONTENT_TYPE_OPTIONS} /></Field>
				<Field label="Objetivo"><textarea value={form.objective} onChange={(e) => setField("objective", e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
				<Field label="Observações"><textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} className="rot-input min-h-16 py-2" /></Field>
				<div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-5 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Criando..." : "Criar tema"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

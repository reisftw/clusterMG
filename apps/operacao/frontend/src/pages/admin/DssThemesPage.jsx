import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, BookOpen, Pencil, Plus, Search, Settings, Trash2 } from "lucide-react";
import { archiveDssCategory, createDssCategory, createDssTheme, fetchDssCategories, fetchDssThemes, updateDssCategory } from "../../api/rotApi";
import Field from "../../components/ui/Field";
import ModalShell from "../../components/ui/ModalShell";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";
import { CONTENT_TYPE_OPTIONS, MODALITY_OPTIONS, THEME_STATUS_BADGE, THEME_STATUS_LABEL } from "./dssThemeConstants";

const PAGE_SIZE = 30;

export default function DssThemesPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canCreate = hasPermission("dss.tema.criar");
	const canManageCategories = hasPermission("dss.categoria.gerenciar");
	const [items, setItems] = useState([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [categories, setCategories] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [filters, setFilters] = useState({ category: "", modality: "", status: "", q: "" });
	const [createOpen, setCreateOpen] = useState(false);
	const [categoriesOpen, setCategoriesOpen] = useState(false);

	const loadCategories = async () => {
		try {
			// all=true traz tambem arquivadas — o modal de gerenciamento
			// precisa mostrar/reativar; os selects de filtro/criacao usam so
			// as ativas via categoryOptions abaixo.
			setCategories(await fetchDssCategories({ all: "true" }));
		} catch {
			setCategories([]);
		}
	};

	const load = async (targetPage = 1) => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchDssThemes({ ...filters, page: targetPage, pageSize: PAGE_SIZE });
			setItems(data.items || []);
			setTotal(data.total || 0);
			setPage(targetPage);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os temas.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load(1);
		loadCategories();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const categoryOptions = categories.filter((category) => category.active).map((category) => ({ id: category.id, name: category.label }));
	const categoryLabel = (id) => categories.find((item) => item.id === id)?.label || id;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<BookOpen size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">DSS · Temas</h1>
						<p className="text-sm font-semibold text-slate-500">{total} tema(s) cadastrado(s).</p>
					</div>
				</div>
				<div className="flex gap-2">
					{canManageCategories ? (
						<button type="button" onClick={() => setCategoriesOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							<Settings size={16} /> Categorias
						</button>
					) : null}
					{canCreate ? (
						<button type="button" onClick={() => setCreateOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
							<Plus size={17} /> Novo tema
						</button>
					) : null}
				</div>
			</header>

			<div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:grid-cols-[1fr_160px_160px_160px_auto]">
				<div className="relative">
					<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input value={filters.q} onChange={(e) => setFilters((c) => ({ ...c, q: e.target.value }))} placeholder="Buscar por título..." className="h-11 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</div>
				<Select value={filters.category} onChange={(v) => setFilters((c) => ({ ...c, category: v }))} items={categoryOptions} empty="Toda categoria" />
				<Select value={filters.modality} onChange={(v) => setFilters((c) => ({ ...c, modality: v }))} items={MODALITY_OPTIONS} empty="Toda modalidade" />
				<Select value={filters.status} onChange={(v) => setFilters((c) => ({ ...c, status: v }))} items={[{ id: "rascunho", name: "Rascunho" }, { id: "publicado", name: "Publicado" }, { id: "arquivado", name: "Arquivado" }]} empty="Todo status" />
				<button type="button" onClick={() => load(1)} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
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
					<Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={load} />
				</div>
			)}

			{createOpen ? (
				<CreateThemeModal
					categoryOptions={categoryOptions}
					onClose={() => setCreateOpen(false)}
					onCreated={(theme) => {
						setCreateOpen(false);
						navigate(`/seguranca-trabalho/dss/temas/${theme.id}`);
					}}
				/>
			) : null}

			{categoriesOpen ? (
				<CategoriesModal
					categories={categories}
					onClose={() => setCategoriesOpen(false)}
					onChanged={loadCategories}
				/>
			) : null}
		</div>
	);
}

function CreateThemeModal({ categoryOptions, onClose, onCreated }) {
	const [form, setForm] = useState({ title: "", category: categoryOptions[0]?.id || "", modality: "semanal", contentType: "editor", description: "", objective: "", notes: "" });
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const setField = (key, value) => setForm((c) => ({ ...c, [key]: value }));

	const submit = async (event) => {
		event.preventDefault();
		if (!form.title.trim()) {
			setError("Informe o título do tema.");
			return;
		}
		if (!form.category) {
			setError("Cadastre ao menos uma categoria antes de criar um tema.");
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
					<Field label="Categoria" required><Select value={form.category} onChange={(v) => setField("category", v)} items={categoryOptions} /></Field>
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

function CategoriesModal({ categories, onClose, onChanged }) {
	const [newLabel, setNewLabel] = useState("");
	const [editing, setEditing] = useState(null); // { id, label }
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const add = async (event) => {
		event.preventDefault();
		if (!newLabel.trim()) return;
		setSaving(true);
		setError("");
		try {
			await createDssCategory({ label: newLabel.trim() });
			setNewLabel("");
			await onChanged();
		} catch (err) {
			setError(err?.message || "Não foi possível criar a categoria.");
		} finally {
			setSaving(false);
		}
	};

	const saveEdit = async () => {
		if (!editing?.label?.trim()) return;
		setSaving(true);
		setError("");
		try {
			await updateDssCategory(editing.id, { label: editing.label.trim() });
			setEditing(null);
			await onChanged();
		} catch (err) {
			setError(err?.message || "Não foi possível renomear a categoria.");
		} finally {
			setSaving(false);
		}
	};

	const toggleActive = async (category) => {
		setSaving(true);
		setError("");
		try {
			if (category.active) await archiveDssCategory(category.id);
			else await updateDssCategory(category.id, { active: true });
			await onChanged();
		} catch (err) {
			setError(err?.message || "Não foi possível atualizar a categoria.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Categorias de tema" description="Categorias arquivadas somem dos filtros e da criação de novos temas, mas continuam valendo pros temas que já usam elas." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Settings size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={add} className="mb-4 flex gap-2">
				<input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nova categoria (ex.: Combate a incêndio)" className="rot-input flex-1" />
				<button type="submit" disabled={saving || !newLabel.trim()} className="rot-btn-tactile inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60"><Plus size={15} /> Adicionar</button>
			</form>
			<div className="space-y-1.5">
				{categories.map((category) => (
					<div key={category.id} className={`flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 ${category.active ? "bg-white" : "bg-slate-50 opacity-60"}`}>
						{editing?.id === category.id ? (
							<input value={editing.label} onChange={(e) => setEditing({ id: category.id, label: e.target.value })} className="rot-input h-9 flex-1" autoFocus onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
						) : (
							<span className="flex-1 text-sm font-bold text-slate-800">{category.label}{!category.active ? " (arquivada)" : ""}</span>
						)}
						{editing?.id === category.id ? (
							<button type="button" onClick={saveEdit} disabled={saving} className="rounded-lg px-2 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-50">Salvar</button>
						) : (
							<button type="button" onClick={() => setEditing({ id: category.id, label: category.label })} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Renomear"><Pencil size={13} /></button>
						)}
						<button type="button" onClick={() => toggleActive(category)} disabled={saving} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={category.active ? "Arquivar" : "Reativar"}>
							{category.active ? <Archive size={13} /> : <Trash2 size={13} className="rotate-180" />}
						</button>
					</div>
				))}
				{!categories.length ? <p className="text-sm font-semibold text-slate-400">Nenhuma categoria cadastrada ainda.</p> : null}
			</div>
		</ModalShell>
	);
}

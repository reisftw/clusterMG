import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Plus, Search, Trash2 } from "lucide-react";
import { createDssSchedule, fetchDssSchedules, fetchDssTheme, fetchDssThemes, fetchRotRegionals, fetchRotRoles, publishDssSchedule } from "../../api/rotApi";
import Field from "../../components/ui/Field";
import ModalShell from "../../components/ui/ModalShell";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const SCHEDULE_STATUS_BADGE = { rascunho: "bg-slate-100 text-slate-600", publicado: "bg-emerald-50 text-emerald-700", cancelado: "bg-red-50 text-red-700" };
const SCHEDULE_STATUS_LABEL = { rascunho: "Rascunho", publicado: "Publicado", cancelado: "Cancelado" };
const OPERATION_OPTIONS = [{ id: "ROT", name: "ROT" }, { id: "FIELD", name: "FIELD" }, { id: "DELIVERY", name: "DELIVERY" }];
const PAGE_SIZE = 30;

export default function DssSchedulesPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("dss.programacao.gerenciar");
	const canPublish = hasPermission("dss.programacao.publicar");
	const [items, setItems] = useState([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [filters, setFilters] = useState({ status: "", q: "" });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [publishingId, setPublishingId] = useState("");

	const load = async (targetPage = 1) => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchDssSchedules({ ...filters, page: targetPage, pageSize: PAGE_SIZE });
			setItems(data.items || []);
			setTotal(data.total || 0);
			setPage(targetPage);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as programações.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const publish = async (schedule) => {
		setPublishingId(schedule.id);
		setError("");
		try {
			await publishDssSchedule(schedule.id);
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível publicar a programação.");
		} finally {
			setPublishingId("");
		}
	};

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarClock size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">DSS · Programação</h1>
						<p className="text-sm font-semibold text-slate-500">{total} programação(ões).</p>
					</div>
				</div>
				{canManage ? (
					<button type="button" onClick={() => setCreateOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
						<Plus size={17} /> Nova programação
					</button>
				) : null}
			</header>

			<div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-card md:grid-cols-[1fr_180px_auto]">
				<div className="relative">
					<Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input value={filters.q} onChange={(e) => setFilters((c) => ({ ...c, q: e.target.value }))} placeholder="Buscar por semana ou tema..." className="h-11 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</div>
				<Select value={filters.status} onChange={(v) => setFilters((c) => ({ ...c, status: v }))} items={[{ id: "rascunho", name: "Rascunho" }, { id: "publicado", name: "Publicado" }, { id: "cancelado", name: "Cancelado" }]} empty="Todo status" />
				<button type="button" onClick={() => load(1)} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
					<table className="w-full min-w-[780px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr>
								<th className="px-4 py-3">Semana</th>
								<th className="px-4 py-3">Tema</th>
								<th className="px-4 py-3">Prazo</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3" />
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{items.map((item) => (
								<tr key={item.id} className="hover:bg-slate-50">
									<td className="px-4 py-3 font-bold text-slate-900 cursor-pointer" onClick={() => navigate(`/seguranca-trabalho/dss/programacao/${item.id}`)}>{item.weekLabel}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.themeTitle || "—"}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{new Date(item.dueDate).toLocaleDateString("pt-BR")}</td>
									<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${SCHEDULE_STATUS_BADGE[item.status] || ""}`}>{SCHEDULE_STATUS_LABEL[item.status] || item.status}</span></td>
									<td className="px-4 py-3 text-right">
										{canPublish && item.status === "rascunho" ? (
											<button type="button" onClick={() => publish(item)} disabled={publishingId === item.id} className="rot-btn-tactile rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-60">
												{publishingId === item.id ? "Publicando..." : "Publicar"}
											</button>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma programação encontrada.</p> : null}
					<Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={load} />
				</div>
			)}

			{createOpen ? (
				<CreateScheduleModal
					onClose={() => setCreateOpen(false)}
					onCreated={() => {
						setCreateOpen(false);
						load(1);
					}}
				/>
			) : null}
		</div>
	);
}

function ScopeRow({ scope, regionals, roles, onChange, onRemove }) {
	const regional = regionals.find((r) => r.id === scope.regionalId);
	const bases = regional?.cities || [];
	return (
		<div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
			<Select value={scope.operationType} onChange={(v) => onChange({ ...scope, operationType: v })} items={OPERATION_OPTIONS} empty="Operação" />
			<Select value={scope.regionalId} onChange={(v) => onChange({ ...scope, regionalId: v, baseId: "" })} items={regionals.map((r) => ({ id: r.id, name: r.nome || r.name }))} empty="Todas as regionais" />
			<Select value={scope.baseId} onChange={(v) => onChange({ ...scope, baseId: v })} items={bases.map((b) => ({ id: b.id, name: b.nome || b.name }))} empty={scope.regionalId ? "Todas as bases" : "—"} />
			<Select value={scope.roleId} onChange={(v) => onChange({ ...scope, roleId: v })} items={roles.map((r) => ({ id: r.id, name: r.name }))} empty="Todos os cargos" />
			<button type="button" onClick={onRemove} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Remover escopo"><Trash2 size={15} /></button>
		</div>
	);
}

function CreateScheduleModal({ onClose, onCreated }) {
	const [themes, setThemes] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [roles, setRoles] = useState([]);
	const [selectedTheme, setSelectedTheme] = useState(null);
	const [form, setForm] = useState({ themeId: "", themeWeekId: "", weekLabel: "", startDate: "", endDate: "", dueDate: "" });
	const [scopes, setScopes] = useState([{ operationType: "ROT", regionalId: "", baseId: "", roleId: "" }]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const setField = (key, value) => setForm((c) => ({ ...c, [key]: value }));

	useEffect(() => {
		(async () => {
			try {
				const [themeData, regionalItems, roleItems] = await Promise.all([
					fetchDssThemes({ status: "publicado", pageSize: 200 }),
					fetchRotRegionals(),
					fetchRotRoles(),
				]);
				setThemes(themeData.items || []);
				setRegionals(regionalItems || []);
				setRoles(roleItems || []);
			} catch (err) {
				setError(err?.message || "Não foi possível carregar temas/regionais.");
			}
		})();
	}, []);

	const onSelectTheme = async (themeId) => {
		setField("themeId", themeId);
		setField("themeWeekId", "");
		if (!themeId) {
			setSelectedTheme(null);
			return;
		}
		const theme = await fetchDssTheme(themeId);
		setSelectedTheme(theme);
	};

	const addScope = () => setScopes((c) => [...c, { operationType: "ROT", regionalId: "", baseId: "", roleId: "" }]);
	const updateScope = (index, next) => setScopes((c) => c.map((scope, i) => (i === index ? next : scope)));
	const removeScope = (index) => setScopes((c) => c.filter((_, i) => i !== index));

	const submit = async (event) => {
		event.preventDefault();
		setError("");
		if (!form.weekLabel.trim()) return setError("Informe o rótulo da semana (ex.: Semana 38).");
		if (!form.startDate || !form.endDate || !form.dueDate) return setError("Informe as datas de início, fim e prazo.");
		if (selectedTheme?.modality === "mensal" && !form.themeWeekId) return setError("Selecione a semana do tema mensal.");
		if (selectedTheme?.modality !== "mensal" && !form.themeId) return setError("Selecione um tema.");
		setSaving(true);
		try {
			await createDssSchedule({
				themeId: selectedTheme?.modality === "mensal" ? null : form.themeId || null,
				themeWeekId: selectedTheme?.modality === "mensal" ? form.themeWeekId : null,
				weekLabel: form.weekLabel,
				startDate: form.startDate,
				endDate: form.endDate,
				dueDate: form.dueDate,
				scopes: scopes.map((scope) => ({ operationType: scope.operationType, regionalId: scope.regionalId || null, baseId: scope.baseId || null, roleId: scope.roleId || null })),
			});
			onCreated();
		} catch (err) {
			setError(err?.message || "Não foi possível criar a programação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Nova programação de DSS" description="Define quando e para quem o tema vale. As execuções por equipe são geradas automaticamente ao publicar." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarClock size={22} /></span>} onClose={onClose} size="2xl">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<Field label="Tema" required><Select value={form.themeId} onChange={onSelectTheme} items={themes.map((t) => ({ id: t.id, name: t.title }))} empty="Selecione um tema publicado" /></Field>
				{selectedTheme?.modality === "mensal" ? (
					<Field label="Semana do tema mensal" required>
						<Select value={form.themeWeekId} onChange={(v) => setField("themeWeekId", v)} items={(selectedTheme.weeks || []).map((w) => ({ id: w.id, name: `Semana ${w.weekNumber} — ${w.title}` }))} empty="Selecione a semana" />
					</Field>
				) : null}
				<Field label="Rótulo da semana" required><input value={form.weekLabel} onChange={(e) => setField("weekLabel", e.target.value)} className="rot-input" placeholder="Ex.: Semana 38/2026" /></Field>
				<div className="grid gap-4 sm:grid-cols-3">
					<Field label="Data inicial" required><input type="date" value={form.startDate} onChange={(e) => setField("startDate", e.target.value)} className="rot-input" /></Field>
					<Field label="Data final" required><input type="date" value={form.endDate} onChange={(e) => setField("endDate", e.target.value)} className="rot-input" /></Field>
					<Field label="Prazo" required><input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} className="rot-input" /></Field>
				</div>
				<div>
					<span className="mb-1.5 flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-500">Público (escopo)<span className="text-red-500">*</span></span>
					<p className="mb-2 text-[11px] font-semibold text-slate-400">Deixe regional/base/cargo em branco para "todas". Cada linha adiciona um público.</p>
					<div className="space-y-2">
						{scopes.map((scope, index) => (
							<ScopeRow key={index} scope={scope} regionals={regionals} roles={roles} onChange={(next) => updateScope(index, next)} onRemove={() => removeScope(index)} />
						))}
					</div>
					<button type="button" onClick={addScope} className="rot-btn-tactile mt-2 inline-flex h-9 items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600">
						<Plus size={13} /> Adicionar público
					</button>
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-5 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar como rascunho"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

export { SCHEDULE_STATUS_BADGE, SCHEDULE_STATUS_LABEL };

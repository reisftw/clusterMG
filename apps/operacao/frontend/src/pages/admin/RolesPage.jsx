import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Eye, LockKeyhole, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { createRotRole, deleteRotRole, fetchRotRolesManaged, updateRotRole } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";

// Mesmo padrao visual de
// src/modules/auth/components/CargosPermissoesPage.jsx do Retiradas:
// lista de cargos a esquerda + editor com matriz Visualizar/Gerenciar a
// direita, agrupada por secao. Catalogo adaptado ao rot.* (o Retiradas
// usa configuracao.*).
const GROUPED_CATALOG = [
	{
		id: "geral",
		label: "Geral",
		features: [{ id: "dashboard", label: "Dashboard", permissions: { view: "rot.dashboard.view" } }],
	},
	{
		id: "operacao",
		label: "Operação",
		features: [
			{ id: "activities", label: "Atividades", permissions: { view: "rot.activities.view", manage: "rot.activities.manage" } },
			{ id: "apr", label: "APR — central da regional (preenchimento próprio disponível a todos)", permissions: { view: "rot.apr.view", manage: "rot.apr.manage" } },
			{ id: "tickets", label: "Chamados", permissions: { view: "rot.tickets.view", manage: "rot.tickets.manage" } },
			{ id: "shifts", label: "Turnos / Escala", permissions: { view: "rot.shifts.view", manage: "rot.shifts.manage" } },
		],
	},
	{
		id: "rh",
		label: "RH",
		features: [
			{ id: "absences", label: "Faltas", permissions: { view: "rot.absences.view", manage: "rot.absences.manage" } },
			{ id: "timeoff", label: "Folgas", permissions: { view: "rot.timeoff.view", manage: "rot.timeoff.approve" } },
			{ id: "vacations", label: "Férias", permissions: { view: "rot.vacations.view", manage: "rot.vacations.approve" } },
			{ id: "holidays", label: "Feriados", permissions: { manage: "rot.holidays.manage" } },
		],
	},
	{
		id: "frota_ativos",
		label: "Frota e Ativos",
		features: [
			{ id: "fleet", label: "Frota", permissions: { view: "rot.fleet.view", manage: "rot.fleet.manage" } },
			{ id: "equipments", label: "Equipamentos", permissions: { view: "rot.equipments.view", manage: "rot.equipments.manage" } },
			{ id: "keys", label: "Chaves", permissions: { view: "rot.keys.view", manage: "rot.keys.manage" } },
			{ id: "materials", label: "Materiais / Insumos", permissions: { view: "rot.materials.view", manage: "rot.materials.manage" } },
			{ id: "stock_adjustments", label: "Acerto de Estoque", permissions: { view: "rot.stock_adjustments.view", manage: "rot.stock_adjustments.manage" } },
			{ id: "tech_deliveries", label: "Entrega Técnicos", permissions: { view: "rot.tech_deliveries.view", manage: "rot.tech_deliveries.manage" } },
			{ id: "bag_audit", label: "Auditoria Bolsa", permissions: { view: "rot.bag_audit.view", manage: "rot.bag_audit.manage" } },
		],
	},
	{
		id: "ativos_seguranca",
		label: "Ativos & Segurança",
		features: [
			{ id: "asset_assets", label: "Ativos operacionais", permissions: { view: "ativos.visualizar", manage: "ativos.editar" } },
			{ id: "asset_create", label: "Cadastro de ativos", permissions: { manage: "ativos.criar" } },
			{ id: "asset_custody", label: "Transferência / Devolução", permissions: { view: "ativos.historico.visualizar", manage: "ativos.transferir" } },
			{ id: "asset_blocks", label: "Bloqueio / Liberação", permissions: { view: "ativos.bloquear", manage: "ativos.liberar" } },
			{ id: "asset_qr", label: "QR Code de ativo", permissions: { manage: "ativos.qrcode.gerar" } },
			{ id: "asset_values", label: "Valores de ativos", permissions: { view: "ativos.valor.visualizar" } },
			{ id: "asset_checklists", label: "Checklists", permissions: { view: "checklists.visualizar", manage: "checklists.configurar" } },
			{ id: "asset_checklist_execute", label: "Execução de checklists", permissions: { manage: "checklists.executar" } },
			{ id: "asset_occurrences", label: "Ocorrências", permissions: { view: "ocorrencias.visualizar", manage: "ocorrencias.tratar" } },
			{ id: "asset_occurrence_create", label: "Informar problema", permissions: { manage: "ocorrencias.criar" } },
			{ id: "asset_maintenance", label: "Manutenções", permissions: { view: "manutencoes.visualizar", manage: "manutencoes.tratar" } },
			{ id: "asset_maintenance_create", label: "Criar manutenção", permissions: { manage: "manutencoes.criar" } },
		],
	},
	{
		id: "diversos",
		label: "Diversos",
		features: [
			{ id: "audit_reports", label: "Relatórios Auditoria", permissions: { view: "rot.audit_reports.view" } },
			{ id: "notices", label: "Avisos", permissions: { manage: "rot.notices.manage" } },
			{ id: "ranking", label: "Ranking", permissions: { view: "rot.ranking.view" } },
			{ id: "weather", label: "Clima", permissions: { view: "rot.weather.view" } },
			{ id: "rain", label: "Alertas de Chuva", permissions: { view: "rot.rain.view", manage: "rot.rain.manage" } },
			{ id: "rompimentos", label: "Rompimentos", permissions: { view: "rot.rompimentos.view", manage: "rot.rompimentos.manage" } },
			{ id: "qrcodes", label: "QR Codes", permissions: { view: "rot.qrcodes.view", manage: "rot.qrcodes.manage" } },
		],
	},
	{
		id: "sistema",
		label: "Sistema",
		features: [
			{ id: "users", label: "Usuários, Cargos e Permissões", permissions: { manage: "rot.users.manage" } },
			{ id: "regionals", label: "Regionais / Cidades", permissions: { manage: "rot.regionals.manage" } },
			{ id: "agents", label: "Agentes", permissions: { view: "rot.agents.view", manage: "rot.agents.manage" } },
			{ id: "companies", label: "Empresas", permissions: { view: "rot.companies.view", manage: "rot.companies.manage" } },
			{ id: "technicians", label: "Técnicos", permissions: { view: "rot.technicians.view", manage: "rot.technicians.manage" } },
			{ id: "service_types", label: "Tipos de Serviço", permissions: { manage: "rot.service_types.manage" } },
			{ id: "settings", label: "Configurações / Integrações", permissions: { manage: "rot.settings.manage" } },
			{ id: "logs", label: "Logs de Auditoria", permissions: { view: "rot.logs.view" } },
		],
	},
];

function newDraft(role) {
	return {
		id: role?.id || "",
		name: role?.name || "",
		description: role?.description || "",
		level: role ? Number(role.level) : 10,
		isGlobal: role ? Boolean(role.isGlobal) : false,
		active: role ? role.active !== false : true,
		permissions: role ? [...(role.permissions || [])] : ["rot.dashboard.view"],
	};
}

function roleHasPermission(role, permission) {
	if (!permission) return true;
	if (!role) return false;
	const permissions = Array.isArray(role.permissions) ? role.permissions : [];
	if (permissions.includes("*")) return true;
	if (Array.isArray(permission)) return permission.some((item) => permissions.includes(item));
	return permissions.includes(permission);
}

function getPreviewSummary(role) {
	const features = GROUPED_CATALOG.flatMap((section) =>
		section.features.map((feature) => ({
			...feature,
			section: section.label,
			canView: roleHasPermission(role, feature.permissions.view),
			canManage: roleHasPermission(role, feature.permissions.manage),
			hasViewPermission: Boolean(feature.permissions.view),
			hasManagePermission: Boolean(feature.permissions.manage),
		})),
	);
	return {
		total: features.length,
		visible: features.filter((feature) => feature.canView || feature.canManage).length,
		managed: features.filter((feature) => feature.canManage).length,
		blocked: features.filter((feature) => !feature.canView && !feature.canManage).length,
	};
}

export default function RolesPage() {
	const [roles, setRoles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [selectedId, setSelectedId] = useState(null);
	const [previewRoleId, setPreviewRoleId] = useState(null);
	const [activeTab, setActiveTab] = useState("editor");
	const [draft, setDraft] = useState(null);
	const [isNew, setIsNew] = useState(false);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const load = async (keepSelection = true) => {
		setLoading(true);
		setError("");
		try {
			const items = await fetchRotRolesManaged();
			setRoles(items);
			if (keepSelection && selectedId) {
				const found = items.find((role) => role.id === selectedId);
				if (found) {
					setDraft(newDraft(found));
					setIsNew(false);
				}
			} else if (items[0]) {
				setSelectedId(items[0].id);
				setPreviewRoleId((current) => current || items[0].id);
				setDraft(newDraft(items[0]));
				setIsNew(false);
			}
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os cargos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const selectRole = (role) => {
		setSelectedId(role.id);
		setPreviewRoleId(role.id);
		setDraft(newDraft(role));
		setIsNew(false);
		setMessage("");
		setError("");
	};

	const handleNew = () => {
		setSelectedId(null);
		setDraft(newDraft(null));
		setIsNew(true);
		setMessage("");
		setError("");
	};

	const handleClone = () => {
		if (!draft) return;
		setDraft({ ...draft, id: "", name: `${draft.name} (cópia)` });
		setSelectedId(null);
		setIsNew(true);
	};

	const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

	const togglePermission = (permissionId, checked) => {
		setDraft((current) => {
			const set = new Set(current.permissions);
			if (checked) set.add(permissionId);
			else set.delete(permissionId);
			return { ...current, permissions: [...set].sort() };
		});
	};

	const handleSave = async () => {
		if (!draft) return;
		setSaving(true);
		setError("");
		setMessage("");
		try {
			if (isNew) {
				const created = await createRotRole(draft);
				setRoles((current) => [...current, created].sort((a, b) => b.level - a.level));
				setSelectedId(created.id);
				setDraft(newDraft(created));
				setIsNew(false);
			} else {
				const { id: _draftId, ...updatePayload } = draft;
				const updated = await updateRotRole(selectedId, updatePayload);
				setRoles((current) => current.map((role) => (role.id === selectedId ? updated : role)));
				setDraft(newDraft(updated));
			}
			setMessage("Cargo salvo com sucesso.");
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o cargo.");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!selectedId || draft?.systemRole) return;
		if (!window.confirm("Excluir este cargo?")) return;
		setDeleting(true);
		setError("");
		try {
			await deleteRotRole(selectedId);
			setSelectedId(null);
			setDraft(null);
			await load(false);
			setMessage("Cargo excluído.");
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o cargo.");
		} finally {
			setDeleting(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	const isSystemRole = !isNew && roles.find((role) => role.id === selectedId)?.systemRole;
	const previewRole = roles.find((role) => role.id === previewRoleId) || roles[0] || null;
	const previewSummary = getPreviewSummary(previewRole);
	const tabClass = (tab) =>
		`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-black transition ${
			activeTab === tab
				? "bg-blue-600 text-white shadow-sm"
				: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
		}`;

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<ShieldCheck size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Segurança e acesso</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">Cargos e Permissões</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Hierarquia por nível (maior = mais alto) e o que cada cargo pode visualizar ou gerenciar.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => load(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							<RefreshCw size={17} /> Atualizar
						</button>
						<button type="button" onClick={handleNew} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700">
							<Plus size={17} /> Novo cargo
						</button>
					</div>
				</div>
			</header>

			{message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="flex flex-wrap gap-2">
				<button type="button" onClick={() => setActiveTab("editor")} className={tabClass("editor")}>
					<SlidersHorizontal size={17} /> Editor de permissões
				</button>
				<button type="button" onClick={() => setActiveTab("preview")} className={tabClass("preview")}>
					<Eye size={17} /> Ver como
				</button>
			</div>

			{activeTab === "preview" ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Simulador de acesso</p>
							<h2 className="mt-1 text-xl font-black text-slate-950">Ver como um cargo específico</h2>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Escolha um cargo para conferir quais áreas aparecem liberadas, gerenciáveis ou bloqueadas com base no RBAC atual.
							</p>
						</div>
						<label className="min-w-[260px]">
							<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Cargo para visualizar</span>
							<select
								value={previewRole?.id || ""}
								onChange={(event) => setPreviewRoleId(event.target.value)}
								className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
							>
								{roles.map((role) => (
									<option key={role.id} value={role.id}>
										{role.name}
									</option>
								))}
							</select>
						</label>
					</div>

					{previewRole ? (
						<>
							<div className="mt-5 grid gap-3 md:grid-cols-4">
								<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
									<p className="text-xs font-black uppercase tracking-wide text-blue-600">Cargo</p>
									<p className="mt-1 text-lg font-black text-slate-950">{previewRole.name}</p>
									<p className="text-xs font-bold text-slate-500">Nível {previewRole.level}</p>
								</div>
								<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
									<p className="text-xs font-black uppercase tracking-wide text-emerald-700">Visíveis</p>
									<p className="mt-1 text-2xl font-black text-emerald-700">{previewSummary.visible}</p>
									<p className="text-xs font-bold text-emerald-700/70">de {previewSummary.total} funcionalidades</p>
								</div>
								<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
									<p className="text-xs font-black uppercase tracking-wide text-amber-700">Gerencia</p>
									<p className="mt-1 text-2xl font-black text-amber-700">{previewSummary.managed}</p>
									<p className="text-xs font-bold text-amber-700/70">com ação de gestão</p>
								</div>
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
									<p className="text-xs font-black uppercase tracking-wide text-slate-500">Bloqueadas</p>
									<p className="mt-1 text-2xl font-black text-slate-700">{previewSummary.blocked}</p>
									<p className="text-xs font-bold text-slate-500">sem visualizar/gerenciar</p>
								</div>
							</div>

							<div className="mt-5 space-y-4">
								{GROUPED_CATALOG.map((section) => (
									<div key={section.id} className="rounded-2xl border border-slate-200 p-4">
										<h3 className="font-black text-slate-900">{section.label}</h3>
										<div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
											{section.features.map((feature) => {
												const canView = roleHasPermission(previewRole, feature.permissions.view);
												const canManage = roleHasPermission(previewRole, feature.permissions.manage);
												const allowed = canView || canManage;
												return (
													<div
														key={feature.id}
														className={`rounded-xl border p-3 ${
															allowed ? "border-emerald-100 bg-emerald-50" : "border-slate-200 bg-slate-50"
														}`}
													>
														<div className="flex items-start justify-between gap-3">
															<p className="text-sm font-black text-slate-900">{feature.label}</p>
															{allowed ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <XCircle size={18} className="shrink-0 text-slate-400" />}
														</div>
														<div className="mt-3 flex flex-wrap gap-2">
															<span className={`rounded-lg px-2 py-1 text-[11px] font-black ${canView ? "bg-blue-100 text-blue-700" : "bg-white text-slate-400"}`}>
																Visualizar {canView ? "sim" : "não"}
															</span>
															<span className={`rounded-lg px-2 py-1 text-[11px] font-black ${canManage ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-400"}`}>
																Gerenciar {canManage ? "sim" : "não"}
															</span>
														</div>
													</div>
												);
											})}
										</div>
									</div>
								))}
							</div>

							<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<p className="text-sm font-black text-slate-900">Permissões brutas do cargo</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{previewRole.permissions?.length ? previewRole.permissions.map((permission) => (
										<span key={permission} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
											{permission}
										</span>
									)) : (
										<span className="text-sm font-semibold text-slate-500">Nenhuma permissão configurada.</span>
									)}
								</div>
							</div>
						</>
					) : (
						<div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
							Nenhum cargo disponível para simular.
						</div>
					)}
				</section>
			) : (
			<div className="grid gap-5 xl:grid-cols-[330px_1fr]">
				<aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
						<SlidersHorizontal size={18} className="text-blue-600" />
						Cargos cadastrados
					</div>
					<div className="space-y-2">
						{roles.map((role) => (
							<button
								key={role.id}
								type="button"
								onClick={() => selectRole(role)}
								className={`rot-btn-tactile w-full rounded-xl border px-4 py-3 text-left transition ${
									selectedId === role.id ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-black">{role.name}</span>
									{role.id === "site_admin" ? <LockKeyhole size={16} /> : null}
								</div>
								<p className="mt-1 text-xs font-semibold text-slate-500">
									Nível {role.level} · {role.permissions?.includes("*") ? "Acesso total" : `${role.permissions?.length || 0} permissão(ões)`}
									{!role.active ? " · Inativo" : ""}
								</p>
							</button>
						))}
					</div>
				</aside>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					{draft ? (
						<>
							<div className="grid gap-4 lg:grid-cols-[1fr_140px_140px_auto]">
								<label>
									<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Nome do cargo</span>
									<input
										value={draft.name}
										onChange={(event) => setField("name", event.target.value)}
										className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
									/>
								</label>
								<label>
									<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Nível</span>
									<input
										type="number"
										min={0}
										max={99}
										value={draft.level}
										onChange={(event) => setField("level", Number(event.target.value) || 0)}
										className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
									/>
								</label>
								<label className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
									<input type="checkbox" checked={draft.isGlobal} onChange={(event) => setField("isGlobal", event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
									<span className="text-sm font-black text-slate-700">Global</span>
								</label>
								<label className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
									<input type="checkbox" checked={draft.active} onChange={(event) => setField("active", event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
									<span className="text-sm font-black text-slate-700">Ativo</span>
								</label>
							</div>

							<label className="mt-4 block">
								<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Descrição</span>
								<textarea
									value={draft.description}
									onChange={(event) => setField("description", event.target.value)}
									rows={2}
									className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
								/>
							</label>

							{isSystemRole ? (
								<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
									Cargo do sistema — não pode ser excluído, apenas desativado.
								</div>
							) : null}

							<div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
								{draft.permissions.includes("*") ? "Acesso total (*)" : `${draft.permissions.length} permissão(ões) selecionada(s)`}
							</div>

							<div className="mt-5 space-y-4">
								{GROUPED_CATALOG.map((section) => (
									<div key={section.id} className="rounded-2xl border border-slate-200 p-4">
										<h3 className="font-black text-slate-900">{section.label}</h3>
										<div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
											<div className="grid grid-cols-[minmax(0,1fr)_110px_110px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
												<span>Funcionalidade</span>
												<span className="text-center">Visualizar</span>
												<span className="text-center">Gerenciar</span>
											</div>
											{section.features.map((feature) => {
												const hasAll = draft.permissions.includes("*");
												const viewPerm = feature.permissions.view;
												const managePerm = feature.permissions.manage;
												return (
													<div key={feature.id} className="grid grid-cols-[minmax(0,1fr)_110px_110px] items-center gap-2 border-t border-slate-100 px-4 py-3">
														<p className="text-sm font-black text-slate-900">{feature.label}</p>
														<label className="flex justify-center">
															{viewPerm ? (
																<input
																	type="checkbox"
																	checked={hasAll || draft.permissions.includes(viewPerm)}
																	disabled={hasAll}
																	onChange={(event) => togglePermission(viewPerm, event.target.checked)}
																	className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
																/>
															) : (
																<span className="text-xs font-bold text-slate-300">-</span>
															)}
														</label>
														<label className="flex justify-center">
															{managePerm ? (
																<input
																	type="checkbox"
																	checked={hasAll || draft.permissions.includes(managePerm)}
																	disabled={hasAll}
																	onChange={(event) => togglePermission(managePerm, event.target.checked)}
																	className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
																/>
															) : (
																<span className="text-xs font-bold text-slate-300">-</span>
															)}
														</label>
													</div>
												);
											})}
										</div>
									</div>
								))}
							</div>

							<div className="mt-5 flex flex-wrap justify-end gap-2">
								{!isNew && !isSystemRole ? (
									<button type="button" onClick={handleDelete} disabled={deleting} className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60">
										{deleting ? <RefreshCw size={17} className="animate-spin" /> : <Trash2 size={17} />}
										Excluir cargo
									</button>
								) : null}
								{!isNew ? (
									<button type="button" onClick={handleClone} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
										<Copy size={17} /> Clonar cargo
									</button>
								) : null}
								<button type="button" onClick={handleSave} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
									{saving ? <RefreshCw size={17} className="animate-spin" /> : <Save size={17} />}
									Salvar cargo
								</button>
							</div>
						</>
					) : (
						<div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-500">
							<ShieldCheck size={36} className="mb-3 text-blue-500" />
							<p className="font-bold">Selecione ou crie um cargo para configurar.</p>
						</div>
					)}
				</section>
			</div>
			)}
		</div>
	);
}

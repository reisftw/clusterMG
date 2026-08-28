import {
	CheckCircle2,
	Copy,
	Eye,
	LockKeyhole,
	Plus,
	RefreshCw,
	Save,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	CARGOS_RETIRADAS,
	getRoleLabel,
	hasPermission,
	ROLES,
} from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	listarCargosPermissoes,
	salvarCargoPermissoes,
} from "../services/rolesService";

const DEFAULT_ROLE_OPTIONS = CARGOS_RETIRADAS.map((role) => ({
	id: role.value,
	name: role.label,
	description: "",
	active: true,
	systemRole: true,
	permissions: [],
}));

const ACTION_LABELS = {
	view: "Visualizar",
	manage: "Gerenciar",
};

function normalizeId(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+/g, "")
		.replace(/_+$/g, "");
}

function normalizePermissions(permissions = []) {
	return [...new Set(permissions.filter(Boolean))].sort((a, b) =>
		a.localeCompare(b, "pt-BR"),
	);
}

function createEmptyRole(existingRoles) {
	let index = existingRoles.length + 1;
	let id = `novo_cargo_${index}`;
	while (existingRoles.some((role) => role.id === id)) {
		index += 1;
		id = `novo_cargo_${index}`;
	}
	return {
		id,
		name: "Novo cargo",
		description: "Descreva o objetivo deste cargo.",
		active: true,
		systemRole: false,
		permissions: ["destaque.dashboard.view"],
		isNew: true,
	};
}

function normalizeCatalog(items = []) {
	return items
		.map((item, index) => ({
			id: item.id,
			sectionId: item.sectionId || "geral",
			sectionLabel: item.sectionLabel || "Geral",
			featureId: item.featureId || item.id,
			featureLabel: item.featureLabel || item.id,
			action: item.action || "view",
			description: item.description || "",
			legacyPermission: item.legacyPermission || "",
			sortOrder: Number(item.sortOrder ?? index),
		}))
		.filter((item) => item.id && ["view", "manage"].includes(item.action))
		.sort(
			(a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id, "pt-BR"),
		);
}

function groupCatalog(catalog = []) {
	const sections = new Map();

	catalog.forEach((permission) => {
		if (!sections.has(permission.sectionId)) {
			sections.set(permission.sectionId, {
				id: permission.sectionId,
				label: permission.sectionLabel,
				sortOrder: permission.sortOrder,
				features: new Map(),
			});
		}

		const section = sections.get(permission.sectionId);
		section.sortOrder = Math.min(section.sortOrder, permission.sortOrder);

		if (!section.features.has(permission.featureId)) {
			section.features.set(permission.featureId, {
				id: permission.featureId,
				label: permission.featureLabel,
				description: permission.description,
				sortOrder: permission.sortOrder,
				permissions: {},
			});
		}

		const feature = section.features.get(permission.featureId);
		feature.sortOrder = Math.min(feature.sortOrder, permission.sortOrder);
		feature.description = feature.description || permission.description;
		feature.permissions[permission.action] = permission;
	});

	return [...sections.values()]
		.sort(
			(a, b) =>
				a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"),
		)
		.map((section) => ({
			...section,
			features: [...section.features.values()].sort(
				(a, b) =>
					a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"),
			),
		}));
}

function expandCatalogPermissions(rawPermissions = [], catalog = []) {
	if (rawPermissions.includes("*"))
		return catalog.map((permission) => permission.id);

	const raw = new Set(rawPermissions);
	const expanded = new Set();
	catalog.forEach((permission) => {
		if (
			raw.has(permission.id) ||
			(permission.legacyPermission && raw.has(permission.legacyPermission))
		) {
			expanded.add(permission.id);
		}
	});
	return normalizePermissions([...expanded]);
}

function withPermissionPairRules(
	permissionIds,
	permission,
	checked,
	catalogById,
) {
	const next = new Set(permissionIds);
	const target = catalogById.get(permission);

	if (!target) return normalizePermissions([...next]);

	if (checked) next.add(permission);
	else next.delete(permission);

	const pairAction = target.action === "manage" ? "view" : "manage";
	const pair = [...catalogById.values()].find(
		(item) =>
			item.sectionId === target.sectionId &&
			item.featureId === target.featureId &&
			item.action === pairAction,
	);

	if (target.action === "manage" && checked && pair) next.add(pair.id);
	if (target.action === "view" && !checked && pair) next.delete(pair.id);

	return normalizePermissions([...next]);
}

export default function CargosPermissoesPage() {
	const {
		currentUser,
		realUser,
		viewAsRole,
		viewAsRoles = [],
		setViewAsRole,
		isViewingAsRole,
	} = useAuthContext();
	const isAdmin = String(realUser?.role || "").toLowerCase() === ROLES.ADMIN;
	const canManage =
		hasPermission(currentUser, "configuracao.cargos_permissoes.manage") ||
		hasPermission(currentUser, "manage_roles");
	const [roles, setRoles] = useState([]);
	const [permissionCatalog, setPermissionCatalog] = useState([]);
	const [selectedId, setSelectedId] = useState("");
	const [draft, setDraft] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const catalogById = useMemo(
		() =>
			new Map(
				permissionCatalog.map((permission) => [permission.id, permission]),
			),
		[permissionCatalog],
	);

	const catalogIds = useMemo(
		() => new Set(permissionCatalog.map((permission) => permission.id)),
		[permissionCatalog],
	);

	const groupedCatalog = useMemo(
		() => groupCatalog(permissionCatalog),
		[permissionCatalog],
	);

	const selectedRole = useMemo(
		() => roles.find((role) => role.id === selectedId) || roles[0] || null,
		[roles, selectedId],
	);

	const loadRoles = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const data = await listarCargosPermissoes();
			const nextCatalog = normalizeCatalog(data.permissions || []);
			const nextRoles = data.roles?.length
				? data.roles
				: isAdmin
					? DEFAULT_ROLE_OPTIONS
					: [];
			setPermissionCatalog(nextCatalog);
			setRoles(nextRoles);
			setSelectedId((current) => current || nextRoles[0]?.id || "");
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os cargos.");
			setPermissionCatalog([]);
			const fallbackRoles = isAdmin ? DEFAULT_ROLE_OPTIONS : [];
			setRoles(fallbackRoles);
			setSelectedId((current) => current || fallbackRoles[0]?.id || "");
		} finally {
			setLoading(false);
		}
	}, [isAdmin]);

	useEffect(() => {
		loadRoles();
	}, [loadRoles]);

	useEffect(() => {
		if (!selectedRole) return;
		setDraft({
			...selectedRole,
			permissions: expandCatalogPermissions(
				selectedRole.permissions || [],
				permissionCatalog,
			),
		});
	}, [permissionCatalog, selectedRole]);

	const isAdminRole = draft?.id === ROLES.ADMIN;
	const canEditDraft = canManage && !isAdminRole;

	const selectedPermissions = useMemo(
		() => draft?.permissions || [],
		[draft?.permissions],
	);

	const selectedCount = useMemo(
		() =>
			selectedPermissions.filter((permission) => catalogIds.has(permission))
				.length,
		[catalogIds, selectedPermissions],
	);

	const setField = (field, value) => {
		if (!canEditDraft) return;
		setDraft((current) => ({ ...current, [field]: value }));
	};

	const togglePermission = (permission, checked) => {
		if (!canEditDraft) return;
		setDraft((current) => ({
			...current,
			permissions: withPermissionPairRules(
				current?.permissions || [],
				permission,
				checked,
				catalogById,
			),
		}));
	};

	const handleCreate = () => {
		if (!canManage) return;
		const next = createEmptyRole(roles);
		setRoles((current) => [...current, next]);
		setSelectedId(next.id);
		setDraft(next);
	};

	const handleClone = () => {
		if (!canManage || !draft) return;
		const clone = createEmptyRole(roles);
		const next = {
			...clone,
			name: `${draft.name} - cópia`,
			description: draft.description,
			permissions: normalizePermissions(
				(draft.permissions || []).filter((permission) =>
					catalogIds.has(permission),
				),
			),
		};
		setRoles((current) => [...current, next]);
		setSelectedId(next.id);
		setDraft(next);
	};

	const handleSave = async () => {
		if (!draft || !canEditDraft) return;
		const id = normalizeId(draft.id || draft.name);
		if (!id || !draft.name?.trim()) {
			setError("Informe o nome do cargo.");
			return;
		}
		setSaving(true);
		setError("");
		setMessage("");
		try {
			await salvarCargoPermissoes({
				...draft,
				id,
				permissions: normalizePermissions(
					(draft.permissions || []).filter((permission) =>
						catalogIds.has(permission),
					),
				),
			});
			setMessage("Cargo salvo com sucesso.");
			await loadRoles();
			setSelectedId(id);
			window.dispatchEvent(new Event("retiradas:roles-updated"));
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o cargo.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<ShieldCheck size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
								Segurança e acesso
							</p>
							<h1 className="mt-1 text-2xl font-black text-slate-950">
								Cargos e Permissões
							</h1>
							<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
								Configure por seção do menu o que cada cargo pode visualizar ou
								gerenciar.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={loadRoles}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw size={17} />
							Atualizar
						</button>
						<button
							type="button"
							onClick={handleCreate}
							disabled={!canManage}
							className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
						>
							<Plus size={17} />
							Novo cargo
						</button>
					</div>
				</div>
			</header>

			{!canManage ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Você está em modo somente leitura. Alterações de cargos exigem
					permissão de gerenciamento.
				</div>
			) : null}

			{message ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
					{message}
				</div>
			) : null}
			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{error}
				</div>
			) : null}

			{isAdmin ? (
				<section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
								<Eye size={20} />
							</div>
							<div>
								<h2 className="text-lg font-black text-slate-950">Ver Como</h2>
								<p className="text-sm font-semibold text-slate-500">
									Simule outro cargo para conferir menus, permissões e
									visualizações do sistema.
								</p>
								{isViewingAsRole ? (
									<p className="mt-2 text-xs font-black uppercase tracking-wide text-blue-700">
										Simulando: {getRoleLabel(viewAsRole)}
									</p>
								) : null}
							</div>
						</div>
						<select
							value={viewAsRole}
							onChange={(event) => setViewAsRole(event.target.value)}
							className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-950 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 lg:w-72"
						>
							<option value="">Admin real</option>
							{(viewAsRoles.length ? viewAsRoles : CARGOS_RETIRADAS)
								.filter((cargo) => cargo.value !== ROLES.ADMIN)
								.map((cargo) => (
									<option key={cargo.value} value={cargo.value}>
										{cargo.label}
									</option>
								))}
						</select>
					</div>
				</section>
			) : null}

			<div className="grid gap-5 xl:grid-cols-[330px_1fr]">
				<aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
						<SlidersHorizontal size={18} className="text-blue-600" />
						Cargos cadastrados
					</div>
					<div className="space-y-2">
						{roles.map((role) => {
							const expanded = expandCatalogPermissions(
								role.permissions || [],
								permissionCatalog,
							);
							return (
								<button
									type="button"
									key={role.id}
									onClick={() => setSelectedId(role.id)}
									className={`w-full rounded-xl border px-4 py-3 text-left transition ${
										selectedId === role.id
											? "border-blue-300 bg-blue-50 text-blue-900"
											: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
									}`}
								>
									<div className="flex items-center justify-between gap-2">
										<span className="font-black">
											{role.name || getRoleLabel(role.id)}
										</span>
										{role.id === ROLES.ADMIN ? <LockKeyhole size={16} /> : null}
									</div>
									<p className="mt-1 text-xs font-semibold text-slate-500">
										{role.permissions?.includes("*")
											? "Acesso total"
											: `${expanded.length} permissão(ões) novas`}
									</p>
								</button>
							);
						})}
					</div>
				</aside>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					{draft ? (
						<>
							<div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
								<label>
									<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
										Nome do cargo
									</span>
									<input
										value={draft.name || ""}
										onChange={(event) => setField("name", event.target.value)}
										disabled={!canEditDraft}
										className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
									/>
								</label>
								<label>
									<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
										Identificador
									</span>
									<input
										value={draft.id || ""}
										onChange={(event) =>
											setField("id", normalizeId(event.target.value))
										}
										disabled={!canEditDraft || draft.systemRole}
										className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
									/>
								</label>
								<label className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
									<input
										type="checkbox"
										checked={draft.active !== false}
										disabled={!canEditDraft}
										onChange={(event) =>
											setField("active", event.target.checked)
										}
										className="h-4 w-4 rounded border-slate-300"
									/>
									<span className="text-sm font-black text-slate-700">
										Ativo
									</span>
								</label>
							</div>

							<label className="mt-4 block">
								<span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
									Descrição
								</span>
								<textarea
									value={draft.description || ""}
									onChange={(event) =>
										setField("description", event.target.value)
									}
									disabled={!canEditDraft}
									rows={3}
									className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
								/>
							</label>

							{isAdminRole ? (
								<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
									O cargo Admin é protegido e mantém acesso total para evitar
									bloqueio do sistema.
								</div>
							) : null}

							<div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
								{selectedCount} permissão(ões) novas selecionadas. Gerenciar
								marca Visualizar automaticamente.
							</div>

							<div className="mt-5 space-y-4">
								{groupedCatalog.length ? (
									groupedCatalog.map((section) => (
										<div
											key={section.id}
											className="rounded-2xl border border-slate-200 p-4"
										>
											<h3 className="font-black text-slate-900">
												{section.label}
											</h3>
											<div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
												<div className="grid grid-cols-[minmax(0,1fr)_120px_120px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
													<span>Funcionalidade</span>
													<span className="text-center">Visualizar</span>
													<span className="text-center">Gerenciar</span>
												</div>
												{section.features.map((feature) => {
													const viewPermission = feature.permissions.view;
													const managePermission = feature.permissions.manage;
													const hasView = viewPermission
														? isAdminRole ||
															selectedPermissions.includes(viewPermission.id)
														: false;
													const hasManage = managePermission
														? isAdminRole ||
															selectedPermissions.includes(managePermission.id)
														: false;
													return (
														<div
															key={feature.id}
															className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-2 border-t border-slate-100 px-4 py-3"
														>
															<div className="min-w-0">
																<p className="break-anywhere text-sm font-black text-slate-900">
																	{feature.label}
																</p>
																{feature.description ? (
																	<p className="mt-1 break-anywhere text-xs font-semibold text-slate-500">
																		{feature.description}
																	</p>
																) : null}
															</div>
															<label className="flex justify-center">
																{viewPermission ? (
																	<input
																		type="checkbox"
																		checked={hasView}
																		disabled={!canEditDraft}
																		onChange={(event) =>
																			togglePermission(
																				viewPermission.id,
																				event.target.checked,
																			)
																		}
																		aria-label={`${ACTION_LABELS.view} ${feature.label}`}
																		className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
																	/>
																) : (
																	<span className="text-xs font-bold text-slate-300">
																		-
																	</span>
																)}
															</label>
															<label className="flex justify-center">
																{managePermission ? (
																	<input
																		type="checkbox"
																		checked={hasManage}
																		disabled={!canEditDraft}
																		onChange={(event) =>
																			togglePermission(
																				managePermission.id,
																				event.target.checked,
																			)
																		}
																		aria-label={`${ACTION_LABELS.manage} ${feature.label}`}
																		className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
																	/>
																) : (
																	<span className="text-xs font-bold text-slate-300">
																		-
																	</span>
																)}
															</label>
														</div>
													);
												})}
											</div>
										</div>
									))
								) : (
									<div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">
										Catálogo novo de permissões não carregado. Rode a migration
										017 antes de editar cargos.
									</div>
								)}
							</div>

							<div className="mt-5 flex flex-wrap justify-end gap-2">
								<button
									type="button"
									onClick={handleClone}
									disabled={!canManage || !draft || isAdminRole}
									className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
								>
									<Copy size={17} />
									Clonar cargo
								</button>
								<button
									type="button"
									onClick={handleSave}
									disabled={saving || !canEditDraft}
									className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
								>
									{saving ? (
										<RefreshCw size={17} className="animate-spin" />
									) : (
										<Save size={17} />
									)}
									Salvar cargo
								</button>
							</div>
						</>
					) : (
						<div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-500">
							<CheckCircle2 size={36} className="mb-3 text-blue-500" />
							<p className="font-bold">
								Selecione ou crie um cargo para configurar.
							</p>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

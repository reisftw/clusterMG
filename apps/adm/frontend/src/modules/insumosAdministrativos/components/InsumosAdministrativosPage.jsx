import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Tooltip as ChartTooltip,
	Legend,
	LinearScale,
} from "chart.js";
import {
	AlertTriangle,
	Archive,
	ArrowRight,
	Boxes,
	Building2,
	ClipboardList,
	Download,
	FileText,
	History,
	LayoutDashboard,
	PackageCheck,
	PackagePlus,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	Search,
	Settings,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import ModalShell from "../../../components/ui/ModalShell";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/useAuthContext";
import {
	canUseInsumosCategory,
	getAllowedInsumosCategories,
	getBaseName,
	getUserBaseId,
	isGlobalInsumosAdmin,
	normalizeId,
	normalizeList,
	text,
} from "../../../utils/insumosAccessControl";
import { addClusterLogo } from "../../../utils/pdfBranding";
import { useInsumosAdministrativos } from "../hooks/useInsumosAdministrativos";

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	ArcElement,
	ChartTooltip,
	Legend,
);

const VIEWS = [
	{ id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
];

const emptyProduto = {
	nome: "",
	unidade: "Unidade",
	categoria: "",
	base_id: "",
	base_nome: "",
	estoque_atual: "",
	estoque_minimo: "",
	estoque_ideal: "",
	fornecedor: "",
	observacao: "",
};

const emptyRetirada = {
	produto_id: "",
	responsavel: "",
	setor: "",
	quantidade: 1,
	observacao: "",
};

const emptyStockFilters = {
	busca: "",
	base: "todos",
	categoria: "todos",
	status: "todos",
};

const emptyLogFilters = {
	busca: "",
	categoria: "todos",
	setor: "todos",
	inicio: "",
	fim: "",
};

const chartColors = [
	"#4f46e5",
	"#10b981",
	"#f97316",
	"#8b5cf6",
	"#06b6d4",
	"#ef4444",
	"#64748b",
];
const numberFormatter = new Intl.NumberFormat("pt-BR");
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

const toNumber = (value) => Math.max(0, Number(value || 0));
const normalizeText = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");

const formatNumber = (value) => numberFormatter.format(Number(value || 0));

const formatDateTime = (value) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	});
};

const getNowLabel = () => formatDateTime(new Date().toISOString());

const isCurrentMonth = (value) => {
	const date = new Date(value || "");
	const now = new Date();
	return (
		!Number.isNaN(date.getTime()) &&
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth()
	);
};

const getMonthKey = (date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthLabel = (date) =>
	monthFormatter
		.format(date)
		.replace(".", "")
		.replace(/^\w/, (letter) => letter.toUpperCase());

const getStockStatus = (produto) => {
	if (produto.status === "inativo")
		return {
			key: "inativo",
			label: "Inativo",
			tone: "border-slate-200 bg-slate-100 text-slate-600",
		};
	const atual = toNumber(produto.estoque_atual);
	const minimo = toNumber(produto.estoque_minimo);
	if (atual <= 0)
		return {
			key: "zerado",
			label: "Crítico",
			tone: "border-red-200 bg-red-50 text-red-700",
		};
	if (minimo > 0 && atual <= minimo)
		return {
			key: "atencao",
			label: "Atenção",
			tone: "border-orange-200 bg-orange-50 text-orange-700",
		};
	return {
		key: "normal",
		label: "Normal",
		tone: "border-green-200 bg-green-50 text-green-700",
	};
};

function ConfigModal({ config, onClose, onSave, saving }) {
	const safeConfig = config || {};
	const initialDraft = useMemo(
		() => ({
			unidades: normalizeList(safeConfig.unidades),
			setores: normalizeList(safeConfig.setores),
			categorias: normalizeList(safeConfig.categorias),
			bases: (safeConfig.bases || [])
				.map((base) => ({
					id: text(base.id) || normalizeId(base.nome),
					nome: text(base.nome),
					ativo: base.ativo !== false,
				}))
				.filter((base) => base.nome),
			permissoesCategoria: {
				perfis: safeConfig.permissoesCategoria?.perfis || {},
				usuarios: safeConfig.permissoesCategoria?.usuarios || {},
			},
		}),
		[
			safeConfig.unidades,
			safeConfig.setores,
			safeConfig.categorias,
			safeConfig.bases,
			safeConfig.permissoesCategoria,
		],
	);
	const [draft, setDraft] = useState(initialDraft);
	const [newUnit, setNewUnit] = useState("");
	const [newSector, setNewSector] = useState("");
	const [newCategory, setNewCategory] = useState("");
	const [newBase, setNewBase] = useState("");
	const [editingBaseId, setEditingBaseId] = useState("");
	const [permissionDraft, setPermissionDraft] = useState({
		tipo: "usuarios",
		chave: "",
		ver: [],
		solicitar: [],
	});

	useEffect(() => {
		setDraft(initialDraft);
	}, [initialDraft]);

	const addValue = (key, value, clear) => {
		const next = text(value);
		if (!next) return;
		setDraft((current) => ({
			...current,
			[key]: normalizeList([...(current[key] || []), next]),
		}));
		clear("");
	};

	const removeValue = (key, value) => {
		setDraft((current) => ({
			...current,
			[key]: (current[key] || []).filter((item) => item !== value),
		}));
	};

	const addBase = () => {
		const nome = text(newBase);
		if (!nome) return;
		const id = editingBaseId || normalizeId(nome);
		setDraft((current) => ({
			...current,
			bases: [
				...(current.bases || []).filter((base) => base.id !== id),
				{ id, nome, ativo: true },
			].sort((a, b) => a.nome.localeCompare(b.nome)),
		}));
		setNewBase("");
		setEditingBaseId("");
	};

	const editBase = (base) => {
		setEditingBaseId(base.id);
		setNewBase(base.nome);
	};

	const toggleBase = (base) => {
		setDraft((current) => ({
			...current,
			bases: (current.bases || []).map((item) =>
				item.id === base.id ? { ...item, ativo: item.ativo === false } : item,
			),
		}));
	};

	const removeBase = (base) => {
		setDraft((current) => ({
			...current,
			bases: (current.bases || []).filter((item) => item.id !== base.id),
		}));
	};

	const togglePermissionCategory = (field, categoria) => {
		setPermissionDraft((current) => {
			const values = current[field] || [];
			return {
				...current,
				[field]: values.includes(categoria)
					? values.filter((item) => item !== categoria)
					: [...values, categoria],
			};
		});
	};

	const savePermission = () => {
		const chave = text(permissionDraft.chave).toLowerCase();
		if (!chave) return;
		setDraft((current) => ({
			...current,
			permissoesCategoria: {
				...(current.permissoesCategoria || {}),
				[permissionDraft.tipo]: {
					...(current.permissoesCategoria?.[permissionDraft.tipo] || {}),
					[chave]: {
						ver: normalizeList(permissionDraft.ver),
						solicitar: normalizeList(permissionDraft.solicitar),
					},
				},
			},
		}));
		setPermissionDraft({ tipo: "usuarios", chave: "", ver: [], solicitar: [] });
	};

	return (
		<ModalShell
			title="Configurações de insumos"
			description="Cadastre unidades, categorias, bases/cidades e permissões de visualização."
			onClose={onClose}
			size="5xl"
			bodyClassName="p-0"
		>
			<div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
				{[
					{
						key: "unidades",
						title: "Unidades",
						placeholder: "Ex.: Caixa",
						value: newUnit,
						setValue: setNewUnit,
					},
					{
						key: "categorias",
						title: "Categorias",
						placeholder: "Ex.: Papelaria",
						value: newCategory,
						setValue: setNewCategory,
					},
					{
						key: "setores",
						title: "Setores",
						placeholder: "Ex.: Administrativo",
						value: newSector,
						setValue: setNewSector,
					},
				].map((section) => (
					<div
						key={section.key}
						className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
					>
						<p className="text-sm font-bold text-slate-950">{section.title}</p>
						<div className="mt-3 flex gap-2">
							<input
								value={section.value}
								onChange={(event) => section.setValue(event.target.value)}
								className="input-field"
								placeholder={section.placeholder}
							/>
							<button
								type="button"
								onClick={() =>
									addValue(section.key, section.value, section.setValue)
								}
								className="rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white hover:bg-indigo-700"
							>
								Adicionar
							</button>
						</div>
						<div className="mt-3 flex flex-wrap gap-2">
							{(draft[section.key] || []).map((value) => (
								<span
									key={value}
									className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-bold text-indigo-700"
								>
									{value}
									<button
										type="button"
										onClick={() => removeValue(section.key, value)}
										className="text-slate-400 hover:text-red-600"
										title="Remover"
									>
										<Trash2 size={12} />
									</button>
								</span>
							))}
						</div>
					</div>
				))}
				<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
					<p className="text-sm font-bold text-slate-950">Bases/Cidades</p>
					<div className="mt-3 flex gap-2">
						<input
							value={newBase}
							onChange={(event) => setNewBase(event.target.value)}
							className="input-field"
							placeholder="Ex.: Alojamento"
						/>
						<button
							type="button"
							onClick={addBase}
							className="rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white hover:bg-indigo-700"
						>
							{editingBaseId ? "Salvar" : "Adicionar"}
						</button>
					</div>
					<div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
						{(draft.bases || []).map((base) => (
							<div
								key={base.id}
								className="flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2"
							>
								<button
									type="button"
									onClick={() => editBase(base)}
									className="min-w-0 flex-1 truncate text-left text-xs font-bold text-indigo-700"
								>
									{base.nome}
								</button>
								<button
									type="button"
									onClick={() => toggleBase(base)}
									className={`rounded-full px-2 py-0.5 text-[10px] font-black ${base.ativo === false ? "bg-slate-100 text-slate-500" : "bg-green-50 text-green-700"}`}
								>
									{base.ativo === false ? "Inativa" : "Ativa"}
								</button>
								<button
									type="button"
									onClick={() => removeBase(base)}
									className="text-slate-400 hover:text-red-600"
									title="Remover"
								>
									<Trash2 size={12} />
								</button>
							</div>
						))}
					</div>
				</div>
			</div>

			<div className="border-t border-slate-100 p-5">
				<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-sm font-black text-slate-950">
								Permissões por categoria
							</p>
							<p className="text-xs font-semibold text-blue-900">
								Informe e-mail/ID do usuário ou role/perfil, marque o que pode
								ver e solicitar.
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<select
								value={permissionDraft.tipo}
								onChange={(event) =>
									setPermissionDraft((current) => ({
										...current,
										tipo: event.target.value,
									}))
								}
								className="input-field h-10 w-32"
							>
								<option value="usuarios">Usuário</option>
								<option value="perfis">Perfil</option>
							</select>
							<input
								value={permissionDraft.chave}
								onChange={(event) =>
									setPermissionDraft((current) => ({
										...current,
										chave: event.target.value,
									}))
								}
								className="input-field h-10 w-64"
								placeholder="email@dominio.com ou role"
							/>
							<button
								type="button"
								onClick={savePermission}
								className="rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
							>
								Salvar permissão
							</button>
						</div>
					</div>
					<div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
						{["ver", "solicitar"].map((field) => (
							<div key={field} className="rounded-2xl bg-white p-3">
								<p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
									{field === "ver" ? "Pode visualizar" : "Pode solicitar"}
								</p>
								<div className="flex flex-wrap gap-2">
									{(draft.categorias || []).map((categoria) => (
										<button
											key={`${field}-${categoria}`}
											type="button"
											onClick={() => togglePermissionCategory(field, categoria)}
											className={`rounded-full border px-3 py-1 text-xs font-bold ${
												permissionDraft[field]?.includes(categoria)
													? "border-blue-600 bg-blue-600 text-white"
													: "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
											}`}
										>
											{categoria}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
					<div className="mt-4 grid gap-3 md:grid-cols-2">
						{["usuarios", "perfis"].map((tipo) => (
							<div key={tipo} className="rounded-2xl bg-white p-3">
								<p className="text-xs font-black uppercase tracking-wide text-slate-500">
									{tipo === "usuarios"
										? "Usuários configurados"
										: "Perfis configurados"}
								</p>
								<div className="mt-2 space-y-2">
									{Object.entries(draft.permissoesCategoria?.[tipo] || {}).map(
										([chave, regra]) => (
											<div
												key={`${tipo}-${chave}`}
												className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 p-2 text-xs"
											>
												<div>
													<p className="font-black text-slate-800">{chave}</p>
													<p className="font-semibold text-slate-500">
														Ver: {(regra.ver || []).join(", ") || "todas"} ·
														Solicitar:{" "}
														{(regra.solicitar || []).join(", ") || "todas"}
													</p>
												</div>
												<button
													type="button"
													onClick={() =>
														setDraft((current) => {
															const next = {
																...(current.permissoesCategoria?.[tipo] || {}),
															};
															delete next[chave];
															return {
																...current,
																permissoesCategoria: {
																	...(current.permissoesCategoria || {}),
																	[tipo]: next,
																},
															};
														})
													}
													className="text-slate-400 hover:text-red-600"
												>
													<Trash2 size={13} />
												</button>
											</div>
										),
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>

			<div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
				<button
					type="button"
					onClick={onClose}
					className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
				>
					Cancelar
				</button>
				<button
					type="button"
					onClick={() => onSave(draft)}
					disabled={saving}
					className="btn-primary flex items-center gap-2 disabled:opacity-50"
				>
					<Save size={16} />
					Salvar configurações
				</button>
			</div>
		</ModalShell>
	);
}

function MetricCard({ label, description, value, icon: Icon, tone }) {
	return (
		<div
			className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone.border}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className={`text-3xl font-black ${tone.text}`}>
						{formatNumber(value)}
					</p>
					<p className="mt-1 text-sm font-extrabold text-slate-950">{label}</p>
					<p className="mt-0.5 text-xs font-semibold text-slate-500">
						{description}
					</p>
				</div>
				<div
					className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone.bg} ${tone.text}`}
				>
					<Icon size={20} />
				</div>
			</div>
		</div>
	);
}

function EmptyState({ title, description, action, onAction }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
			<p className="text-sm font-extrabold text-slate-900">{title}</p>
			<p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
			{action && (
				<button
					type="button"
					onClick={onAction}
					className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
				>
					{action}
				</button>
			)}
		</div>
	);
}

function Dashboard({ data, onOpenView, onOpenLog, onLowStock }) {
	const [showLowStockModal, setShowLowStockModal] = useState(false);
	const [selectedResponsible, setSelectedResponsible] = useState("");
	const barData = {
		labels: data.retiradasPorMes.map((item) => item.label),
		datasets: [
			{
				label: "Retiradas",
				data: data.retiradasPorMes.map((item) => item.total),
				backgroundColor: "#4f46e5",
				borderRadius: 10,
			},
		],
	};

	const donutData = {
		labels: data.categorias.map((item) => item.categoria),
		datasets: [
			{
				data: data.categorias.map((item) => item.quantidade),
				backgroundColor: chartColors,
				borderWidth: 0,
			},
		],
	};

	const commonOptions = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (context) =>
						`${context.label}: ${formatNumber(context.raw)} registro(s)`,
				},
			},
		},
	};

	return (
		<div className="animate-[fadeIn_180ms_ease-out] space-y-5">
			<section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h3 className="text-lg font-black text-slate-950">
							Visão geral dos insumos
						</h3>
						<p className="text-sm font-semibold text-slate-500">
							Acompanhe a movimentação, o estoque e os principais indicadores do
							setor.
						</p>
					</div>
					<button
						type="button"
						onClick={() => onOpenView("produtos")}
						className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
					>
						Cadastrar produto
					</button>
				</div>
			</section>

			{data.produtos.length === 0 ? (
				<EmptyState
					title="Nenhum produto cadastrado."
					description="Cadastre o primeiro produto para começar a controlar o estoque."
					action="Cadastrar produto"
					onAction={() => onOpenView("produtos")}
				/>
			) : (
				<>
					<div className="grid items-start gap-5 xl:grid-cols-[1.25fr_1fr]">
						<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
							<div className="mb-4">
								<h4 className="text-base font-black text-slate-950">
									Retiradas por mês
								</h4>
								<p className="text-xs font-semibold text-slate-500">
									Últimos 6 meses com movimentações reais.
								</p>
							</div>
							<div className="h-72">
								{data.retiradasPorMes.every((item) => item.total === 0) ? (
									<EmptyState
										title="Nenhuma retirada registrada no período."
										description="As movimentações aparecerão aqui quando houver retiradas."
									/>
								) : (
									<Bar data={barData} options={commonOptions} />
								)}
							</div>
						</div>

						<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
							<div className="mb-4">
								<h4 className="text-base font-black text-slate-950">
									Distribuição por categoria
								</h4>
								<p className="text-xs font-semibold text-slate-500">
									Produtos cadastrados por categoria.
								</p>
							</div>
							{data.categorias.length === 0 ? (
								<EmptyState
									title="Sem categorias cadastradas."
									description="Os produtos sem categoria serão agrupados em Outros."
								/>
							) : (
								<div className="grid gap-4 md:grid-cols-[180px_1fr]">
									<div className="relative h-44">
										<Doughnut
											data={donutData}
											options={{ ...commonOptions, cutout: "68%" }}
										/>
										<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
											<span className="text-xl font-black text-slate-950">
												{formatNumber(data.totalEstoque)}
											</span>
											<span className="text-[10px] font-bold uppercase text-slate-400">
												Produtos
											</span>
										</div>
									</div>
									<div className="space-y-2">
										{data.categorias.map((item, index) => (
											<div
												key={item.categoria}
												className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
											>
												<div className="flex min-w-0 items-center gap-2">
													<span
														className="h-2.5 w-2.5 shrink-0 rounded-full"
														style={{
															background:
																chartColors[index % chartColors.length],
														}}
													/>
													<span className="truncate text-xs font-bold text-slate-700">
														{item.categoria}
													</span>
												</div>
												<span className="text-xs font-black text-slate-900">
													{formatNumber(item.quantidade)} ·{" "}
													{item.percentual.toLocaleString("pt-BR", {
														maximumFractionDigits: 1,
													})}
													%
												</span>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-4">
						{[
							{
								label: "Entradas no mês",
								value: data.entradasMes,
								description: "Itens adicionados",
								tone: "border-green-100 bg-green-50 text-green-700",
							},
							{
								label: "Saídas no mês",
								value: data.saidasMes,
								description: "Itens retirados",
								tone: "border-red-100 bg-red-50 text-red-700",
							},
							{
								label: "Estoque baixo",
								value: data.baixoEstoque.length,
								description: "Precisam reposição",
								tone: "border-orange-100 bg-orange-50 text-orange-700",
								onClick: () => setShowLowStockModal(true),
							},
							{
								label: "Itens mais usados",
								value: data.topProdutos.length,
								description: "No período",
								tone: "border-violet-100 bg-violet-50 text-violet-700",
							},
						].map((item) => {
							const CardTag = item.onClick ? "button" : "div";
							return (
								<CardTag
									key={item.label}
									type={item.onClick ? "button" : undefined}
									onClick={item.onClick}
									className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${item.onClick ? "hover:-translate-y-0.5 hover:shadow-md" : ""} ${item.tone}`}
								>
									<p className="text-2xl font-black">
										{formatNumber(item.value)}
									</p>
									<p className="mt-1 text-sm font-extrabold">{item.label}</p>
									<p className="text-xs font-semibold opacity-80">
										{item.description}
									</p>
								</CardTag>
							);
						})}
					</div>

					<div className="grid items-start gap-5 xl:grid-cols-[1.25fr_1fr]">
						<LowStockTable
							produtos={data.baixoEstoque.slice(0, 5)}
							total={data.baixoEstoque.length}
							onViewAll={onLowStock}
						/>
						<RecentWithdrawals
							retiradas={data.ultimasRetiradas}
							onViewAll={onOpenLog}
						/>
					</div>

					<div className="grid items-start gap-5 xl:grid-cols-[1fr_1fr_1fr]">
						<InventoryInsight
							total={data.baixoEstoque.length}
							onViewAll={onLowStock}
						/>
						<TopRanking
							title="Setores que mais retiram"
							description="Setores com mais movimentações registradas."
							items={data.topSetores}
							emptyTitle="Sem setores registrados."
							emptyDescription="Os setores aparecerão após novas retiradas."
							tone="indigo"
						/>
						<TopRanking
							title="Itens mais utilizados"
							description="Produtos com mais movimentações registradas."
							items={data.topProdutos}
							emptyTitle="Sem uso registrado."
							emptyDescription="Os produtos mais utilizados aparecerão após novas retiradas."
							tone="violet"
						/>
					</div>

					<div className="grid items-start gap-5 xl:grid-cols-[1fr_1fr]">
						<TopRanking
							title="Pessoas que mais retiraram"
							description="Responsáveis com mais movimentações registradas."
							items={data.topResponsaveis}
							emptyTitle="Nenhum responsável registrado."
							emptyDescription="As pessoas aparecerão conforme as retiradas forem lançadas."
							tone="emerald"
							onItemClick={(item) => setSelectedResponsible(item.nome)}
						/>
					</div>
				</>
			)}
			{showLowStockModal && (
				<LowStockModal
					produtos={data.baixoEstoque}
					onClose={() => setShowLowStockModal(false)}
					onBuyMore={() => {
						setShowLowStockModal(false);
						onLowStock();
					}}
					onCreateMore={() => {
						setShowLowStockModal(false);
						onOpenView("produtos");
					}}
				/>
			)}
			{selectedResponsible && (
				<ResponsibleWithdrawalsModal
					name={selectedResponsible}
					retiradas={data.retiradas.filter(
						(retirada) =>
							(text(retirada.responsavel) || "Responsável não informado") ===
							selectedResponsible,
					)}
					onClose={() => setSelectedResponsible("")}
				/>
			)}
		</div>
	);
}

function LowStockModal({ produtos, onClose, onBuyMore, onCreateMore }) {
	return (
		<ModalShell
			title="Itens com estoque baixo"
			description="Revise os produtos que precisam de reposição ou cadastre novos itens."
			onClose={onClose}
			size="4xl"
			bodyClassName="p-0"
		>
			<div className="p-5">
				{produtos.length === 0 ? (
					<EmptyState
						title="Nenhum item em estoque baixo."
						description="Todos os produtos estão acima do mínimo configurado."
					/>
				) : (
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
						{produtos.map((produto) => {
							const status = getStockStatus(produto);
							return (
								<div
									key={produto.id}
									className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate text-sm font-black text-slate-950">
												{produto.nome}
											</p>
											<p className="mt-1 text-xs font-bold text-slate-500">
												{produto.categoria || "Outros"} ·{" "}
												{produto.unidade || "Unidade"}
											</p>
										</div>
										<span
											className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${status.tone}`}
										>
											{status.label}
										</span>
									</div>
									<div className="mt-4 grid grid-cols-2 gap-2">
										<div className="rounded-xl bg-white px-3 py-2">
											<p className="text-[10px] font-bold uppercase text-slate-400">
												Atual
											</p>
											<p className="text-lg font-black text-slate-950">
												{formatNumber(produto.estoque_atual)}
											</p>
										</div>
										<div className="rounded-xl bg-white px-3 py-2">
											<p className="text-[10px] font-bold uppercase text-slate-400">
												Mínimo
											</p>
											<p className="text-lg font-black text-slate-950">
												{formatNumber(produto.estoque_minimo)}
											</p>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
			<div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
				<button
					type="button"
					onClick={onBuyMore}
					className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700 hover:bg-orange-100"
				>
					Comprar mais
				</button>
				<button type="button" onClick={onCreateMore} className="btn-primary">
					Cadastrar mais
				</button>
			</div>
		</ModalShell>
	);
}

function LowStockTable({ produtos, total, onViewAll }) {
	return (
		<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-start justify-between gap-3">
				<div>
					<h4 className="text-base font-black text-slate-950">
						Produtos com baixo estoque
					</h4>
					<p className="text-xs font-semibold text-slate-500">
						Itens que precisam de reposição.
					</p>
				</div>
				{total > 5 && (
					<button
						type="button"
						onClick={onViewAll}
						className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
					>
						Ver todos
					</button>
				)}
			</div>
			{produtos.length === 0 ? (
				<EmptyState
					title="Tudo certo por aqui!"
					description="Nenhum produto está abaixo do estoque mínimo."
				/>
			) : (
				<div className="overflow-x-auto">
					<table className="min-w-[680px] w-full text-sm">
						<thead>
							<tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
								<th className="py-2 pr-3">Produto</th>
								<th className="py-2 pr-3">Categoria</th>
								<th className="py-2 pr-3">Atual</th>
								<th className="py-2 pr-3">Mínimo</th>
								<th className="py-2">Status</th>
							</tr>
						</thead>
						<tbody>
							{produtos.map((produto) => {
								const status = getStockStatus(produto);
								return (
									<tr
										key={produto.id}
										className="border-b border-slate-50 last:border-0"
									>
										<td className="break-anywhere py-3 pr-3 font-bold text-slate-900">
											{produto.nome}
										</td>
										<td className="py-3 pr-3 text-slate-500">
											{produto.categoria || "Outros"}
										</td>
										<td className="py-3 pr-3 font-black text-slate-900">
											{formatNumber(produto.estoque_atual)}
										</td>
										<td className="py-3 pr-3 text-slate-500">
											{formatNumber(produto.estoque_minimo)}
										</td>
										<td className="py-3">
											<span
												className={`rounded-full border px-2 py-1 text-xs font-bold ${status.tone}`}
											>
												{status.label}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function RecentWithdrawals({ retiradas, onViewAll }) {
	return (
		<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-start justify-between gap-3">
				<div>
					<h4 className="text-base font-black text-slate-950">
						Últimas retiradas
					</h4>
					<p className="text-xs font-semibold text-slate-500">
						Atividades mais recentes registradas.
					</p>
				</div>
				<button
					type="button"
					onClick={onViewAll}
					className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
				>
					Ver todas <ArrowRight size={13} />
				</button>
			</div>
			{retiradas.length === 0 ? (
				<EmptyState
					title="Nenhuma retirada registrada."
					description="As últimas movimentações aparecerão aqui."
				/>
			) : (
				<div className="space-y-3">
					{retiradas.map((retirada) => (
						<div
							key={retirada.id}
							className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-extrabold text-slate-950">
									{retirada.produto_nome}
								</p>
								<p className="text-xs font-semibold text-slate-500">
									{retirada.responsavel || "Responsável não informado"} ·{" "}
									{retirada.setor || "-"} · {retirada.quantidade}{" "}
									{retirada.unidade}
								</p>
							</div>
							<p className="shrink-0 text-right text-xs font-bold text-slate-500">
								{formatDateTime(retirada.retirado_em)}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function InventoryInsight({ total, onViewAll }) {
	return (
		<div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
			<div className="flex items-start gap-3">
				<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-indigo-600">
					<AlertTriangle size={20} />
				</div>
				<div>
					<h4 className="text-base font-black text-slate-950">
						Insight do estoque
					</h4>
					<p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
						{total > 0
							? `${formatNumber(total)} item(ns) estão com estoque baixo ou crítico. Recomendamos revisar os itens listados e realizar a reposição para evitar interrupções nas atividades do setor.`
							: "Nenhum item está com estoque baixo ou crítico. O estoque administrativo está saudável neste momento."}
					</p>
					{total > 0 && (
						<button
							type="button"
							onClick={onViewAll}
							className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-indigo-700 hover:text-indigo-900"
						>
							Ver produtos com baixo estoque <ArrowRight size={15} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function TopRanking({
	title,
	description,
	items,
	emptyTitle,
	emptyDescription,
	tone = "violet",
	onItemClick = null,
}) {
	const toneClass =
		{
			indigo: "bg-indigo-50 text-indigo-700",
			violet: "bg-violet-50 text-violet-700",
			emerald: "bg-emerald-50 text-emerald-700",
		}[tone] || "bg-violet-50 text-violet-700";

	return (
		<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
			<h4 className="text-base font-black text-slate-950">{title}</h4>
			<p className="text-xs font-semibold text-slate-500">{description}</p>
			{items.length === 0 ? (
				<div className="mt-4">
					<EmptyState title={emptyTitle} description={emptyDescription} />
				</div>
			) : (
				<div className="mt-4 space-y-3">
					{items.map((item, index) => {
						const RowTag = onItemClick ? "button" : "div";
						return (
							<RowTag
								key={item.nome}
								type={onItemClick ? "button" : undefined}
								onClick={onItemClick ? () => onItemClick(item) : undefined}
								className={`flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left ${onItemClick ? "transition hover:bg-emerald-50" : ""}`}
							>
								<div className="flex min-w-0 items-center gap-3">
									<span
										className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${toneClass}`}
									>
										{index + 1}
									</span>
									<span className="truncate text-sm font-extrabold text-slate-900">
										{item.nome}
									</span>
								</div>
								<span className="text-sm font-black text-slate-700">
									{formatNumber(item.quantidade)}
								</span>
							</RowTag>
						);
					})}
				</div>
			)}
		</div>
	);
}

const defaultReportOptions = {
	resumo: true,
	estoqueBaixo: true,
	estoqueCompleto: false,
	retiradas: true,
	setores: true,
	itens: true,
	pessoas: true,
};

async function gerarRelatorioInsumosPDF({
	options,
	resumo,
	dashboardData,
	produtos,
	retiradas,
}) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const margin = 36;
	let y = 42;

	const ensureSpace = (height = 120) => {
		if (y + height > pdf.internal.pageSize.getHeight() - 36) {
			pdf.addPage();
			y = 42;
		}
	};

	const addTitle = (title, subtitle = "") => {
		ensureSpace(72);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(18);
		pdf.setTextColor(15, 23, 42);
		pdf.text(title, margin, y);
		y += 20;
		if (subtitle) {
			pdf.setFont("helvetica", "normal");
			pdf.setFontSize(9);
			pdf.setTextColor(100, 116, 139);
			pdf.text(subtitle, margin, y);
			y += 18;
		}
	};

	const addTable = (
		title,
		head,
		body,
		emptyMessage = "Nenhum registro encontrado.",
	) => {
		ensureSpace(105);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(12);
		pdf.setTextColor(15, 23, 42);
		pdf.text(title, margin, y);
		y += 10;
		autoTable(pdf, {
			startY: y,
			head: [head],
			body: body.length
				? body
				: [[emptyMessage, ...Array(Math.max(0, head.length - 1)).fill("")]],
			margin: { left: margin, right: margin },
			styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
			headStyles: {
				fillColor: [37, 99, 235],
				textColor: 255,
				fontStyle: "bold",
			},
			alternateRowStyles: { fillColor: [248, 250, 252] },
		});
		y = pdf.lastAutoTable.finalY + 24;
	};

	pdf.setFillColor(15, 23, 42);
	pdf.rect(0, 0, pageWidth, 76, "F");
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(20);
	pdf.setTextColor(255, 255, 255);
	pdf.text("Relatório de Insumos Administrativos", margin, 34);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(9);
	pdf.text(`Gerado em ${formatDateTime(new Date().toISOString())}`, margin, 54);
	await addClusterLogo(pdf, { width: 92, height: 46, y: 15, marginRight: 36 });
	y = 104;

	if (options.resumo) {
		addTitle(
			"Resumo geral",
			"Indicadores principais do estoque administrativo.",
		);
		addTable(
			"Indicadores",
			["Indicador", "Valor"],
			[
				["Produtos cadastrados", formatNumber(resumo.totalProdutos)],
				["Quantidade em estoque", formatNumber(resumo.itensEstoque)],
				["Produtos zerados", formatNumber(resumo.semEstoque)],
				[
					"Produtos em estoque baixo",
					formatNumber(dashboardData.baixoEstoque.length),
				],
				["Retiradas no mês", formatNumber(resumo.retiradasMes)],
				["Setores atendidos no mês", formatNumber(resumo.setoresAtendidos)],
			],
		);
	}

	if (options.estoqueBaixo) {
		addTable(
			"Produtos com baixo estoque",
			["Produto", "Categoria", "Unidade", "Atual", "Mínimo", "Status"],
			dashboardData.baixoEstoque.map((produto) => {
				const status = getStockStatus(produto);
				return [
					produto.nome,
					produto.categoria || "Outros",
					produto.unidade || "-",
					formatNumber(produto.estoque_atual),
					formatNumber(produto.estoque_minimo),
					status.label,
				];
			}),
		);
	}

	if (options.estoqueCompleto) {
		addTable(
			"Estoque completo",
			[
				"Produto",
				"Categoria",
				"Unidade",
				"Atual",
				"Mínimo",
				"Status",
				"Observação",
			],
			produtos.map((produto) => {
				const status = getStockStatus(produto);
				return [
					produto.nome,
					produto.categoria || "Outros",
					produto.unidade || "-",
					formatNumber(produto.estoque_atual),
					formatNumber(produto.estoque_minimo),
					status.label,
					produto.observacao || "-",
				];
			}),
		);
	}

	if (options.retiradas) {
		addTable(
			"Log de retiradas",
			[
				"Data",
				"Produto",
				"Qtd.",
				"Quem retirou",
				"Lançado por",
				"Setor",
				"Estoque após",
			],
			retiradas.map((retirada) => [
				formatDateTime(retirada.retirado_em || retirada.criado_em),
				retirada.produto_nome || "-",
				`${formatNumber(retirada.quantidade)} ${retirada.unidade || ""}`.trim(),
				retirada.responsavel || "-",
				retirada.criado_por || "-",
				retirada.setor || "-",
				formatNumber(retirada.estoque_depois),
			]),
		);
	}

	if (options.setores) {
		addTable(
			"Setores que mais realizaram retiradas",
			["Posição", "Setor", "Movimentações"],
			dashboardData.topSetores.map((item, index) => [
				String(index + 1),
				item.nome,
				formatNumber(item.quantidade),
			]),
		);
	}

	if (options.itens) {
		addTable(
			"Itens mais utilizados",
			["Posição", "Item", "Movimentações"],
			dashboardData.topProdutos.map((item, index) => [
				String(index + 1),
				item.nome,
				formatNumber(item.quantidade),
			]),
		);
	}

	if (options.pessoas) {
		addTable(
			"Pessoas que mais realizaram retiradas",
			["Posição", "Pessoa", "Movimentações"],
			dashboardData.topResponsaveis.map((item, index) => [
				String(index + 1),
				item.nome,
				formatNumber(item.quantidade),
			]),
		);
	}

	const stamp = new Date().toISOString().slice(0, 10);
	pdf.save(`relatorio-insumos-administrativos-${stamp}.pdf`);
}

function ReportModal({ onClose, onGenerate, generating }) {
	const [options, setOptions] = useState(defaultReportOptions);
	const selectedCount = Object.values(options).filter(Boolean).length;
	const reportItems = [
		{
			key: "resumo",
			label: "Resumo geral",
			description: "Indicadores principais do estoque.",
		},
		{
			key: "estoqueBaixo",
			label: "Produtos com baixo estoque",
			description: "Itens críticos ou abaixo do mínimo.",
		},
		{
			key: "estoqueCompleto",
			label: "Estoque completo",
			description: "Todos os produtos cadastrados.",
		},
		{
			key: "retiradas",
			label: "Log de retiradas",
			description: "Histórico com quem retirou e quem lançou.",
		},
		{
			key: "setores",
			label: "Setores que mais retiram",
			description: "Ranking por setor.",
		},
		{
			key: "itens",
			label: "Itens mais utilizados",
			description: "Ranking de produtos mais retirados.",
		},
		{
			key: "pessoas",
			label: "Pessoas que mais retiraram",
			description: "Ranking por responsável.",
		},
	];

	const toggle = (key) => {
		setOptions((current) => ({ ...current, [key]: !current[key] }));
	};

	return (
		<ModalShell
			title="Gerar relatório de insumos"
			description="Selecione quais informações devem entrar no PDF."
			onClose={onClose}
			size="3xl"
			bodyClassName="p-0"
		>
			<div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
				{reportItems.map((item) => (
					<button
						key={item.key}
						type="button"
						onClick={() => toggle(item.key)}
						className={`rounded-2xl border p-4 text-left transition ${
							options[item.key]
								? "border-indigo-200 bg-indigo-50 text-indigo-900"
								: "border-slate-100 bg-white text-slate-700 hover:border-indigo-100 hover:bg-slate-50"
						}`}
					>
						<div className="flex items-start gap-3">
							<span
								className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${options[item.key] ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"}`}
							>
								{options[item.key] && (
									<span className="h-2 w-2 rounded-sm bg-white" />
								)}
							</span>
							<span>
								<span className="block text-sm font-black">{item.label}</span>
								<span className="mt-1 block text-xs font-semibold opacity-75">
									{item.description}
								</span>
							</span>
						</div>
					</button>
				))}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
				<p className="text-xs font-bold text-slate-500">
					{selectedCount} seção(ões) selecionada(s)
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						disabled={generating || selectedCount === 0}
						onClick={() => onGenerate(options)}
						className="btn-primary flex items-center gap-2 disabled:opacity-50"
					>
						<FileText size={16} />
						{generating ? "Gerando..." : "Gerar PDF"}
					</button>
				</div>
			</div>
		</ModalShell>
	);
}

const buildPurchaseRows = (produtos = [], baseFilter = "todos") =>
	produtos
		.filter((produto) => produto.status !== "inativo")
		.filter(
			(produto) =>
				baseFilter === "todos" || text(produto.base_id) === baseFilter,
		)
		.map((produto) => {
			const atual = toNumber(produto.estoque_atual);
			const ideal = toNumber(produto.estoque_ideal ?? produto.estoque_minimo);
			return {
				id: produto.id,
				item: produto.nome || "-",
				categoria: produto.categoria || "Outros",
				base: produto.base_nome || "-",
				unidade: produto.unidade || "un.",
				atual,
				ideal,
				comprar: Math.max(0, ideal - atual),
				fornecedor: produto.fornecedor || produto.observacao || "-",
			};
		})
		.filter((row) => row.comprar > 0)
		.sort(
			(a, b) =>
				a.base.localeCompare(b.base) ||
				a.categoria.localeCompare(b.categoria) ||
				a.item.localeCompare(b.item),
		);

function downloadPurchaseCsv(rows = []) {
	const headers = [
		"Item",
		"Categoria",
		"Base",
		"Quantidade atual",
		"Quantidade ideal",
		"Quantidade a comprar",
		"Unidade",
		"Observação/Fornecedor",
	];
	const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
	const csv = [
		headers,
		...rows.map((row) => [
			row.item,
			row.categoria,
			row.base,
			row.atual,
			row.ideal,
			row.comprar,
			row.unidade,
			row.fornecedor,
		]),
	]
		.map((line) => line.map(escape).join(";"))
		.join("\n");
	const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `relatorio-compras-insumos-${new Date().toISOString().slice(0, 10)}.csv`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

async function gerarRelatorioComprasPDF({ rows, baseLabel }) {
	const { default: jsPDF } = await import("jspdf");
	const { default: autoTable } = await import("jspdf-autotable");
	const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
	const pageWidth = pdf.internal.pageSize.getWidth();
	const margin = 34;
	const now = new Date();

	const header = () => {
		pdf.setFillColor(248, 250, 252);
		pdf.rect(0, 0, pageWidth, 74, "F");
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(17);
		pdf.setTextColor(15, 23, 42);
		pdf.text("Relatório mensal de compras de insumos", margin, 32);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		pdf.setTextColor(71, 85, 105);
		pdf.text(
			`Base: ${baseLabel || "Todas"} · Gerado em ${formatDateTime(now.toISOString())}`,
			margin,
			50,
		);
	};

	header();
	await addClusterLogo(pdf, {
		width: 70,
		height: 35,
		y: 20,
		marginRight: 36,
	}).catch(() => {});

	autoTable(pdf, {
		startY: 88,
		margin: { left: margin, right: margin },
		head: [
			[
				"Item",
				"Categoria",
				"Base",
				"Atual",
				"Ideal",
				"Comprar",
				"Un.",
				"Observação/Fornecedor",
			],
		],
		body: rows.map((row) => [
			row.item,
			row.categoria,
			row.base,
			formatNumber(row.atual),
			formatNumber(row.ideal),
			formatNumber(row.comprar),
			row.unidade,
			row.fornecedor,
		]),
		styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
		headStyles: {
			fillColor: [16, 185, 129],
			textColor: [255, 255, 255],
			fontStyle: "bold",
		},
		alternateRowStyles: { fillColor: [248, 250, 252] },
		didDrawPage: () => {
			const height = pdf.internal.pageSize.getHeight();
			pdf.setFontSize(8);
			pdf.setTextColor(148, 163, 184);
			pdf.text(
				"Gestão de estoque administrativo - Sistema Retiradas",
				margin,
				height - 18,
			);
		},
	});

	pdf.save(
		`relatorio-compras-insumos-${new Date().toISOString().slice(0, 10)}.pdf`,
	);
}

function PurchaseReportModal({
	produtos,
	bases,
	adminGlobal,
	userBaseId,
	onClose,
}) {
	const [baseFilter, setBaseFilter] = useState(
		adminGlobal ? "todos" : userBaseId || "todos",
	);
	const rows = useMemo(
		() => buildPurchaseRows(produtos, baseFilter),
		[baseFilter, produtos],
	);
	const totalComprar = rows.reduce((sum, row) => sum + row.comprar, 0);
	const baseLabel =
		baseFilter === "todos" ? "Todas as bases" : getBaseName(baseFilter, bases);

	return (
		<ModalShell
			title="Gerar relatório de compras"
			description="Itens abaixo da quantidade ideal, agrupados por base/cidade e categoria."
			onClose={onClose}
			size="5xl"
			bodyClassName="p-0"
		>
			<div className="space-y-4 p-5">
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
					<div>
						<p className="text-sm font-black text-slate-950">
							{formatNumber(rows.length)} item(ns) para comprar
						</p>
						<p className="text-xs font-semibold text-emerald-800">
							Total de unidades sugeridas: {formatNumber(totalComprar)}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{adminGlobal ? (
							<select
								value={baseFilter}
								onChange={(event) => setBaseFilter(event.target.value)}
								className="input-field h-10 w-56 bg-white"
							>
								<option value="todos">Todas as bases</option>
								{bases.map((base) => (
									<option key={base.id} value={base.id}>
										{base.nome}
									</option>
								))}
							</select>
						) : null}
						<button
							type="button"
							onClick={() => downloadPurchaseCsv(rows)}
							disabled={!rows.length}
							className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-700 disabled:opacity-50"
						>
							Exportar CSV
						</button>
						<button
							type="button"
							onClick={() => gerarRelatorioComprasPDF({ rows, baseLabel })}
							disabled={!rows.length}
							className="btn-primary flex items-center gap-2 disabled:opacity-50"
						>
							<FileText size={16} />
							Gerar PDF
						</button>
					</div>
				</div>
				<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
					<div className="overflow-x-auto">
						<table className="min-w-[900px] w-full text-sm">
							<thead className="border-b border-slate-100 bg-slate-50">
								<tr>
									{[
										"Item",
										"Categoria",
										"Base",
										"Atual",
										"Ideal",
										"Comprar",
										"Obs./Fornecedor",
									].map((header) => (
										<th
											key={header}
											className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500"
										>
											{header}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr
										key={row.id}
										className="border-b border-slate-50 last:border-0"
									>
										<td className="px-4 py-3 font-bold text-slate-900">
											{row.item}
										</td>
										<td className="px-4 py-3 text-slate-500">
											{row.categoria}
										</td>
										<td className="px-4 py-3 text-slate-500">{row.base}</td>
										<td className="px-4 py-3 text-slate-500">
											{formatNumber(row.atual)} {row.unidade}
										</td>
										<td className="px-4 py-3 text-slate-500">
											{formatNumber(row.ideal)} {row.unidade}
										</td>
										<td className="px-4 py-3 font-black text-emerald-700">
											{formatNumber(row.comprar)} {row.unidade}
										</td>
										<td className="max-w-md px-4 py-3 text-slate-500">
											{row.fornecedor}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{!rows.length ? (
						<div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
							Nenhum item abaixo da quantidade ideal.
						</div>
					) : null}
				</div>
			</div>
		</ModalShell>
	);
}

const InsumosAdministrativosPage = () => {
	const { currentUser } = useAuthContext();
	const {
		produtos,
		retiradas,
		reposicoes,
		config,
		resumo,
		loading,
		saving,
		error,
		carregar,
		salvarProduto,
		registrarRetirada,
		salvarConfig,
		atualizarStatusProduto,
	} = useInsumosAdministrativos(currentUser);

	const [activeView, setActiveView] = useState("dashboard");
	const [stockFilters, setStockFilters] = useState(emptyStockFilters);
	const [logFilters, setLogFilters] = useState(emptyLogFilters);
	const [produtoForm, setProdutoForm] = useState(emptyProduto);
	const [retiradaForm, setRetiradaForm] = useState(emptyRetirada);
	const [success, setSuccess] = useState("");
	const [showStock, setShowStock] = useState(false);
	const [showLog, setShowLog] = useState(false);
	const [showConfig, setShowConfig] = useState(false);
	const [showReport, setShowReport] = useState(false);
	const [showPurchaseReport, setShowPurchaseReport] = useState(false);
	const [generatingReport, setGeneratingReport] = useState(false);
	const podeGerenciar = hasPermission(
		currentUser,
		"manage_insumos_administrativos",
	);
	const adminGlobal = isGlobalInsumosAdmin(currentUser);
	const podeAlterarEstoque =
		podeGerenciar || hasPermission(currentUser, "view_insumos_administrativos");

	const unidades = useMemo(
		() => normalizeList((config || {}).unidades),
		[config],
	);
	const setores = useMemo(
		() => normalizeList((config || {}).setores),
		[config],
	);
	const bases = useMemo(
		() => (config?.bases || []).filter((base) => base.ativo !== false),
		[config?.bases],
	);
	const userBaseId = useMemo(() => getUserBaseId(currentUser), [currentUser]);
	const categoriasPermitidasVer = useMemo(
		() => getAllowedInsumosCategories(config, currentUser, "ver"),
		[config, currentUser],
	);
	const categoriasPermitidasSolicitar = useMemo(
		() => getAllowedInsumosCategories(config, currentUser, "solicitar"),
		[config, currentUser],
	);
	const categorias = useMemo(
		() =>
			normalizeList([
				...(config?.categorias || []),
				...produtos.map((produto) => produto.categoria || "Outros"),
			]).filter(
				(categoria) =>
					adminGlobal || categoriasPermitidasVer.includes(categoria),
			),
		[adminGlobal, categoriasPermitidasVer, config?.categorias, produtos],
	);
	const produtosVisiveis = useMemo(
		() =>
			produtos.filter((produto) => {
				const baseId = text(produto.base_id || produto.baseId);
				const matchesBase =
					adminGlobal || !userBaseId || !baseId || baseId === userBaseId;
				return (
					matchesBase && canUseInsumosCategory(produto, categoriasPermitidasVer)
				);
			}),
		[adminGlobal, categoriasPermitidasVer, produtos, userBaseId],
	);
	const retiradasVisiveis = useMemo(
		() =>
			retiradas.filter((retirada) => {
				const baseId = text(retirada.base_id || retirada.baseId);
				return (
					(adminGlobal || !userBaseId || !baseId || baseId === userBaseId) &&
					canUseInsumosCategory(retirada, categoriasPermitidasVer)
				);
			}),
		[adminGlobal, categoriasPermitidasVer, retiradas, userBaseId],
	);
	const reposicoesVisiveis = useMemo(
		() =>
			reposicoes.filter((reposicao) => {
				const baseId = text(reposicao.base_id || reposicao.baseId);
				return (
					(adminGlobal || !userBaseId || !baseId || baseId === userBaseId) &&
					canUseInsumosCategory(reposicao, categoriasPermitidasVer)
				);
			}),
		[adminGlobal, categoriasPermitidasVer, reposicoes, userBaseId],
	);
	const produtosAtivos = useMemo(
		() =>
			produtosVisiveis.filter(
				(produto) =>
					produto.status !== "inativo" &&
					canUseInsumosCategory(produto, categoriasPermitidasSolicitar),
			),
		[categoriasPermitidasSolicitar, produtosVisiveis],
	);
	const selectedProduto = produtosVisiveis.find(
		(produto) => produto.id === retiradaForm.produto_id,
	);

	const resumoVisivel = useMemo(() => {
		const totalProdutos = produtosVisiveis.length;
		const itensEstoque = produtosVisiveis.reduce(
			(sum, produto) => sum + Number(produto.estoque_atual || 0),
			0,
		);
		const semEstoque = produtosVisiveis.filter(
			(produto) => Number(produto.estoque_atual || 0) <= 0,
		).length;
		const retiradasMes = retiradasVisiveis.filter((retirada) =>
			isCurrentMonth(retirada.retirado_em || retirada.criado_em),
		).length;
		const setoresAtendidos = new Set(
			retiradasVisiveis
				.filter((retirada) =>
					isCurrentMonth(retirada.retirado_em || retirada.criado_em),
				)
				.map((retirada) => retirada.setor)
				.filter(Boolean),
		).size;
		return {
			...resumo,
			totalProdutos,
			itensEstoque,
			semEstoque,
			retiradasMes,
			setoresAtendidos,
		};
	}, [produtosVisiveis, resumo, retiradasVisiveis]);

	useEffect(() => {
		if (!produtoForm.unidade && unidades[0]) {
			setProdutoForm((current) => ({ ...current, unidade: unidades[0] }));
		}
	}, [produtoForm.unidade, unidades]);

	useEffect(() => {
		if (!produtoForm.base_id && bases[0]) {
			const defaultBaseId = adminGlobal
				? bases[0].id
				: userBaseId || bases[0].id;
			setProdutoForm((current) => ({
				...current,
				base_id: defaultBaseId,
				base_nome: getBaseName(defaultBaseId, bases),
			}));
		}
	}, [adminGlobal, bases, produtoForm.base_id, userBaseId]);

	const dashboardData = useMemo(() => {
		const now = new Date();
		const months = Array.from({ length: 6 }, (_, index) => {
			const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
			return { key: getMonthKey(date), label: getMonthLabel(date), total: 0 };
		});
		const monthMap = new Map(months.map((item) => [item.key, item]));
		retiradasVisiveis.forEach((retirada) => {
			const date = new Date(retirada.retirado_em || retirada.criado_em || "");
			const item = monthMap.get(getMonthKey(date));
			if (item) item.total += 1;
		});

		const totalEstoque = produtosVisiveis.length;
		const categoriaMap = new Map();
		produtosVisiveis.forEach((produto) => {
			const categoria = text(produto.categoria) || "Outros";
			categoriaMap.set(categoria, (categoriaMap.get(categoria) || 0) + 1);
		});
		const categoriasData = [...categoriaMap.entries()]
			.map(([categoria, quantidade]) => ({
				categoria,
				quantidade,
				percentual: totalEstoque ? (quantidade / totalEstoque) * 100 : 0,
			}))
			.sort((a, b) => b.quantidade - a.quantidade);

		const retiradasMes = retiradasVisiveis.filter((retirada) =>
			isCurrentMonth(retirada.retirado_em || retirada.criado_em),
		);
		const saidasMes = retiradasMes.reduce(
			(sum, retirada) => sum + toNumber(retirada.quantidade),
			0,
		);
		const entradasProdutosMes = produtosVisiveis
			.filter((produto) => isCurrentMonth(produto.criado_em))
			.reduce((sum, produto) => sum + toNumber(produto.estoque_atual), 0);
		const entradasReposicoesMes = reposicoesVisiveis
			.filter((reposicao) =>
				isCurrentMonth(reposicao.reposto_em || reposicao.criado_em),
			)
			.reduce((sum, reposicao) => sum + toNumber(reposicao.quantidade), 0);
		const entradasMes = entradasProdutosMes + entradasReposicoesMes;
		const baixoEstoque = produtosVisiveis
			.filter((produto) => {
				const atual = toNumber(produto.estoque_atual);
				const minimo = toNumber(produto.estoque_minimo);
				return atual <= 0 || (minimo > 0 && atual <= minimo);
			})
			.sort((a, b) => {
				const statusA =
					toNumber(a.estoque_atual) <= 0
						? -1
						: toNumber(a.estoque_atual) /
							Math.max(1, toNumber(a.estoque_minimo));
				const statusB =
					toNumber(b.estoque_atual) <= 0
						? -1
						: toNumber(b.estoque_atual) /
							Math.max(1, toNumber(b.estoque_minimo));
				return statusA - statusB;
			});
		const topMap = new Map();
		const setorMap = new Map();
		const responsavelMap = new Map();
		retiradasVisiveis.forEach((retirada) => {
			const nome = text(retirada.produto_nome) || "Produto sem nome";
			topMap.set(nome, (topMap.get(nome) || 0) + 1);
			const setor = text(retirada.setor) || "Setor não informado";
			setorMap.set(setor, (setorMap.get(setor) || 0) + 1);
			const responsavel =
				text(retirada.responsavel) || "Responsável não informado";
			responsavelMap.set(
				responsavel,
				(responsavelMap.get(responsavel) || 0) + 1,
			);
		});
		const topProdutos = [...topMap.entries()]
			.map(([nome, quantidade]) => ({ nome, quantidade }))
			.sort((a, b) => b.quantidade - a.quantidade)
			.slice(0, 5);
		const topSetores = [...setorMap.entries()]
			.map(([nome, quantidade]) => ({ nome, quantidade }))
			.sort((a, b) => b.quantidade - a.quantidade)
			.slice(0, 5);
		const topResponsaveis = [...responsavelMap.entries()]
			.map(([nome, quantidade]) => ({ nome, quantidade }))
			.sort((a, b) => b.quantidade - a.quantidade)
			.slice(0, 5);

		return {
			produtos: produtosVisiveis,
			totalEstoque,
			retiradasPorMes: months,
			categorias: categoriasData,
			entradasMes,
			saidasMes,
			baixoEstoque,
			ultimasRetiradas: retiradasVisiveis.slice(0, 5),
			topProdutos,
			topSetores,
			topResponsaveis,
			retiradas: retiradasVisiveis,
		};
	}, [produtosVisiveis, reposicoesVisiveis, retiradasVisiveis]);

	const produtosFiltrados = useMemo(() => {
		const q = normalizeText(stockFilters.busca);
		return produtosVisiveis.filter((produto) => {
			const status = getStockStatus(produto).key;
			const matchesSearch =
				!q ||
				[
					produto.nome,
					produto.categoria,
					produto.unidade,
					produto.base_nome,
					produto.fornecedor,
				].some((value) => normalizeText(value).includes(q));
			const matchesBase =
				stockFilters.base === "todos" ||
				text(produto.base_id) === stockFilters.base;
			const matchesCategoria =
				stockFilters.categoria === "todos" ||
				(produto.categoria || "Outros") === stockFilters.categoria;
			const matchesStatus =
				stockFilters.status === "todos" ||
				(stockFilters.status === "baixo" &&
					["atencao", "zerado"].includes(status)) ||
				status === stockFilters.status ||
				(stockFilters.status === "critico" && status === "zerado");
			return matchesSearch && matchesBase && matchesCategoria && matchesStatus;
		});
	}, [stockFilters, produtosVisiveis]);

	const retiradasFiltradas = useMemo(() => {
		const q = normalizeText(logFilters.busca);
		return retiradasVisiveis.filter((retirada) => {
			const produto = produtosVisiveis.find(
				(item) => item.id === retirada.produto_id,
			);
			const categoria = produto?.categoria || "Outros";
			const date = new Date(retirada.retirado_em || retirada.criado_em || "");
			const ymd = Number.isNaN(date.getTime())
				? ""
				: date.toISOString().slice(0, 10);
			const matchesSearch =
				!q ||
				[
					retirada.produto_nome,
					retirada.responsavel,
					retirada.criado_por,
					retirada.setor,
				].some((value) => normalizeText(value).includes(q));
			const matchesCategoria =
				logFilters.categoria === "todos" || categoria === logFilters.categoria;
			const matchesSetor =
				logFilters.setor === "todos" || retirada.setor === logFilters.setor;
			const matchesInicio =
				!logFilters.inicio || (ymd && ymd >= logFilters.inicio);
			const matchesFim = !logFilters.fim || (ymd && ymd <= logFilters.fim);
			return (
				matchesSearch &&
				matchesCategoria &&
				matchesSetor &&
				matchesInicio &&
				matchesFim
			);
		});
	}, [logFilters, produtosVisiveis, retiradasVisiveis]);

	const handleProdutoSubmit = async (event) => {
		event.preventDefault();
		const editing = Boolean(produtoForm.id);
		const baseId =
			text(produtoForm.base_id) || userBaseId || bases[0]?.id || "";
		const produto = await salvarProduto({
			...produtoForm,
			base_id: baseId,
			base_nome: text(produtoForm.base_nome) || getBaseName(baseId, bases),
		});
		setProdutoForm({ ...emptyProduto, unidade: unidades[0] || "Unidade" });
		setSuccess(
			`${produto.nome} ${editing ? "atualizado" : "cadastrado"} no estoque.`,
		);
		setActiveView("dashboard");
	};

	const handleRetiradaSubmit = async (event) => {
		event.preventDefault();
		const retirada = await registrarRetirada(retiradaForm);
		setRetiradaForm(emptyRetirada);
		setSuccess(
			`${retirada.responsavel} retirou ${retirada.quantidade} ${retirada.unidade} de ${retirada.produto_nome}.`,
		);
		setActiveView("dashboard");
	};

	const handleSaveConfig = async (nextConfig) => {
		await salvarConfig(nextConfig);
		setShowConfig(false);
		setSuccess("Configurações de insumos atualizadas.");
	};

	const handleGenerateReport = async (options) => {
		setGeneratingReport(true);
		setSuccess("");
		try {
			await gerarRelatorioInsumosPDF({
				options,
				resumo: resumoVisivel,
				dashboardData,
				produtos: produtosVisiveis,
				retiradas: retiradasVisiveis,
			});
			setShowReport(false);
			setSuccess("Relatório de insumos gerado com sucesso.");
		} catch (err) {
			console.error(
				"[InsumosAdministrativosPage] Falha ao gerar relatório:",
				err,
			);
			setSuccess("");
			window.alert(err?.message || "Não foi possível gerar o relatório.");
		} finally {
			setGeneratingReport(false);
		}
	};

	const handleEditProduto = (produto) => {
		setProdutoForm({
			...emptyProduto,
			...produto,
			estoque_atual: String(produto.estoque_atual ?? ""),
			estoque_minimo: String(produto.estoque_minimo ?? ""),
			estoque_ideal: String(
				produto.estoque_ideal ?? produto.estoque_minimo ?? "",
			),
		});
		setSuccess("");
		setActiveView("produtos");
	};

	const handleCancelEditProduto = () => {
		setProdutoForm({ ...emptyProduto, unidade: unidades[0] || "Unidade" });
		setSuccess("");
	};

	const handleToggleProdutoStatus = async (produto) => {
		const nextStatus = produto.status === "inativo" ? "ativo" : "inativo";
		await atualizarStatusProduto(produto.id, nextStatus);
		setSuccess(
			`${produto.nome} ${nextStatus === "inativo" ? "inativado" : "reativado"} com sucesso.`,
		);
	};

	const handleDeleteProduto = async (produto) => {
		if (
			!window.confirm(
				`Excluir ${produto.nome} do estoque? O histórico de retiradas será mantido.`,
			)
		)
			return;
		await atualizarStatusProduto(produto.id, "excluido");
		setSuccess(`${produto.nome} excluído do estoque.`);
	};

	const setView = (view) => {
		setActiveView(view);
		setSuccess("");
	};

	const openLowStock = () => {
		if (!podeGerenciar) return;
		setStockFilters((current) => ({ ...current, status: "baixo" }));
		setShowStock(true);
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
						<ClipboardList size={21} />
					</div>
					<div>
						<h2 className="text-xl font-black text-slate-950">
							Insumos administrativos
						</h2>
						<p className="text-sm font-semibold text-slate-500">
							Produtos, retiradas, estoque e histórico do setor administrativo.
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setView("produtos")}
						className="rounded-2xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
						title="Cadastrar produto"
					>
						<PackagePlus size={17} />
					</button>
					<button
						type="button"
						onClick={() => setView("retirada")}
						className="rounded-2xl border border-green-200 bg-green-50 p-2.5 text-green-700 transition hover:border-green-300 hover:bg-green-100"
						title="Cadastrar retirada"
					>
						<Plus size={17} />
					</button>
					{podeGerenciar && (
						<button
							type="button"
							onClick={() => setShowStock(true)}
							className="rounded-2xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
							title="Ver estoque"
						>
							<Archive size={17} />
						</button>
					)}
					<button
						type="button"
						onClick={() => setShowLog(true)}
						className="rounded-2xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
						title="Ver log de movimentações"
					>
						<History size={17} />
					</button>
					<button
						type="button"
						onClick={() => setShowReport(true)}
						className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
						title="Gerar relatório"
					>
						<FileText size={17} />
						PDF geral
					</button>
					<button
						type="button"
						onClick={() => setShowPurchaseReport(true)}
						className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
						title="Gerar relatório de compras"
					>
						<Download size={17} />
						PDF compras
					</button>
					{podeGerenciar && (
						<button
							type="button"
							onClick={() => setShowConfig(true)}
							className="rounded-2xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
							title="Configurar unidades e setores"
						>
							<Settings size={17} />
						</button>
					)}
					<button
						type="button"
						onClick={carregar}
						className="rounded-2xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
						title="Atualizar dados"
					>
						<RefreshCw size={17} />
					</button>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<MetricCard
					label="Produtos"
					description="Total visível"
					value={resumoVisivel.totalProdutos}
					icon={Boxes}
					tone={{
						border: "border-blue-100",
						bg: "bg-blue-50",
						text: "text-blue-700",
					}}
				/>
				<MetricCard
					label="Quantidade em estoque"
					description="Itens disponíveis"
					value={resumoVisivel.itensEstoque}
					icon={PackageCheck}
					tone={{
						border: "border-green-100",
						bg: "bg-green-50",
						text: "text-green-700",
					}}
				/>
				<MetricCard
					label="Produtos zerados"
					description="Sem estoque disponível"
					value={resumoVisivel.semEstoque}
					icon={Archive}
					tone={{
						border: "border-red-100",
						bg: "bg-red-50",
						text: "text-red-700",
					}}
				/>
				<MetricCard
					label="Retiradas no mês"
					description="Total de retiradas"
					value={resumoVisivel.retiradasMes}
					icon={History}
					tone={{
						border: "border-orange-100",
						bg: "bg-orange-50",
						text: "text-orange-700",
					}}
				/>
				<MetricCard
					label="Setores atendidos"
					description="Este mês"
					value={resumoVisivel.setoresAtendidos}
					icon={Building2}
					tone={{
						border: "border-violet-100",
						bg: "bg-violet-50",
						text: "text-violet-700",
					}}
				/>
			</div>

			<div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
				<div className="flex min-w-max gap-2">
					{VIEWS.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							type="button"
							onClick={() => setView(id)}
							className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
								activeView === id
									? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
									: "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
							}`}
						>
							<Icon size={15} />
							<span>{label}</span>
						</button>
					))}
				</div>
			</div>

			{(error || success) && (
				<div
					className={`rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-100 bg-red-50 text-red-700" : "border-green-100 bg-green-50 text-green-700"}`}
				>
					{error || success}
				</div>
			)}

			{activeView === "dashboard" && (
				<Dashboard
					data={dashboardData}
					onOpenView={setView}
					onOpenLog={() => setShowLog(true)}
					onLowStock={openLowStock}
				/>
			)}
			{activeView === "produtos" && (
				<ProductForm
					form={produtoForm}
					setForm={setProdutoForm}
					unidades={unidades}
					categorias={categorias}
					bases={bases}
					adminGlobal={adminGlobal}
					saving={saving}
					disabled={!podeAlterarEstoque}
					onSubmit={handleProdutoSubmit}
					onCancelEdit={handleCancelEditProduto}
				/>
			)}
			{activeView === "retirada" && (
				<WithdrawalForm
					form={retiradaForm}
					setForm={setRetiradaForm}
					produtos={produtosAtivos}
					setores={setores}
					selectedProduto={selectedProduto}
					saving={saving}
					disabled={!podeAlterarEstoque}
					onSubmit={handleRetiradaSubmit}
				/>
			)}
			{showStock && podeGerenciar && (
				<DataModal
					title="Estoque"
					description="Produtos cadastrados, quantidades atuais, status e ações."
					onClose={() => setShowStock(false)}
				>
					<StockList
						produtos={produtosFiltrados}
						categorias={categorias}
						bases={bases}
						adminGlobal={adminGlobal}
						filters={stockFilters}
						setFilters={setStockFilters}
						disabled={!podeGerenciar || saving}
						onEdit={(produto) => {
							setShowStock(false);
							handleEditProduto(produto);
						}}
						onToggleStatus={handleToggleProdutoStatus}
						onDelete={handleDeleteProduto}
					/>
				</DataModal>
			)}
			{showLog && (
				<DataModal
					title="Log de movimentações"
					description="Reposições, compras e retiradas registradas com data, hora e responsável."
					onClose={() => setShowLog(false)}
				>
					<MovementLog
						reposicoes={reposicoesVisiveis}
						retiradas={retiradasFiltradas}
						categorias={categorias}
						setores={setores}
						filters={logFilters}
						setFilters={setLogFilters}
					/>
				</DataModal>
			)}

			{showConfig && (
				<ConfigModal
					key={JSON.stringify({
						unidades: normalizeList(config?.unidades),
						setores: normalizeList(config?.setores),
						categorias: normalizeList(config?.categorias),
						bases: config?.bases || [],
						permissoesCategoria: config?.permissoesCategoria || {},
					})}
					config={config}
					saving={saving}
					onClose={() => setShowConfig(false)}
					onSave={handleSaveConfig}
				/>
			)}
			{showReport && (
				<ReportModal
					generating={generatingReport}
					onClose={() => setShowReport(false)}
					onGenerate={handleGenerateReport}
				/>
			)}
			{showPurchaseReport && (
				<PurchaseReportModal
					produtos={produtosVisiveis}
					bases={bases}
					adminGlobal={adminGlobal}
					userBaseId={userBaseId}
					onClose={() => setShowPurchaseReport(false)}
				/>
			)}
		</div>
	);
};

function DataModal({ title, description, children, onClose }) {
	return (
		<ModalShell
			title={title}
			description={description}
			onClose={onClose}
			size="full"
		>
			{children}
		</ModalShell>
	);
}

function PaginationControls({
	total,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
}) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const end = Math.min(total, page * pageSize);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3">
			<p className="text-xs font-bold text-slate-500">
				Mostrando {formatNumber(start)} a {formatNumber(end)} de{" "}
				{formatNumber(total)} registro(s)
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<select
					value={pageSize}
					onChange={(event) => {
						onPageSizeChange(Number(event.target.value));
						onPageChange(1);
					}}
					className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
					aria-label="Itens por página"
				>
					{PAGE_SIZE_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option} por página
						</option>
					))}
				</select>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => onPageChange(Math.max(1, page - 1))}
						disabled={page <= 1}
						className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Anterior
					</button>
					<span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
						{formatNumber(page)} / {formatNumber(totalPages)}
					</span>
					<button
						type="button"
						onClick={() => onPageChange(Math.min(totalPages, page + 1))}
						disabled={page >= totalPages}
						className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Próxima
					</button>
				</div>
			</div>
		</div>
	);
}

function ProductForm({
	form,
	setForm,
	unidades,
	categorias,
	bases,
	adminGlobal,
	saving,
	disabled,
	onSubmit,
	onCancelEdit,
}) {
	const editing = Boolean(form.id);
	return (
		<form
			onSubmit={onSubmit}
			className="animate-[fadeIn_180ms_ease-out] rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
		>
			<div className="mb-5">
				<h3 className="text-lg font-black text-slate-950">
					{editing ? "Editar produto" : "Cadastrar produto"}
				</h3>
				<p className="text-sm font-semibold text-slate-500">
					Informe a quantidade disponível e o mínimo recomendado para reposição.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-3">
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">Produto</span>
					<input
						required
						value={form.nome}
						onChange={(event) =>
							setForm((current) => ({ ...current, nome: event.target.value }))
						}
						className="input-field"
						placeholder="Clipes"
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">Base/Cidade</span>
					<select
						required
						value={form.base_id}
						disabled={!adminGlobal}
						onChange={(event) => {
							const baseId = event.target.value;
							setForm((current) => ({
								...current,
								base_id: baseId,
								base_nome: getBaseName(baseId, bases),
							}));
						}}
						className="input-field disabled:bg-slate-100"
					>
						<option value="">Selecione...</option>
						{bases.map((base) => (
							<option key={base.id} value={base.id}>
								{base.nome}
							</option>
						))}
					</select>
					{!adminGlobal ? (
						<span className="text-[11px] font-semibold text-slate-400">
							Usuário comum usa a própria base.
						</span>
					) : null}
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">Unidade</span>
					<select
						required
						value={form.unidade}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								unidade: event.target.value,
							}))
						}
						className="input-field"
					>
						<option value="">Selecione...</option>
						{unidades.map((unidade) => (
							<option key={unidade} value={unidade}>
								{unidade}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">Categoria</span>
					<select
						value={form.categoria}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								categoria: event.target.value,
							}))
						}
						className="input-field"
					>
						<option value="">Selecione...</option>
						{categorias.map((categoria) => (
							<option key={categoria} value={categoria}>
								{categoria}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">
						Quantidade atual
					</span>
					<input
						required
						type="number"
						min="0"
						step="1"
						value={form.estoque_atual}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								estoque_atual: event.target.value,
							}))
						}
						className="input-field"
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">
						Quantidade ideal
					</span>
					<input
						type="number"
						min="0"
						step="1"
						value={form.estoque_ideal || form.estoque_minimo}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								estoque_ideal: event.target.value,
								estoque_minimo: event.target.value,
							}))
						}
						className="input-field"
						placeholder="0"
					/>
					<span className="text-[11px] font-semibold text-slate-400">
						Meta usada no relatório de compras.
					</span>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">
						Fornecedor/observação de compra
					</span>
					<input
						value={form.fornecedor || ""}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								fornecedor: event.target.value,
							}))
						}
						className="input-field"
						placeholder="Fornecedor preferencial"
					/>
				</label>
				<label className="space-y-1 md:col-span-3">
					<span className="text-xs font-bold text-slate-500">Observação</span>
					<textarea
						value={form.observacao}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								observacao: event.target.value,
							}))
						}
						className="input-field min-h-32 resize-y"
						placeholder="Informações internas, marca, uso ou condição do item."
					/>
				</label>
			</div>
			<div className="mt-5 flex justify-end gap-2">
				{editing && (
					<button
						type="button"
						onClick={onCancelEdit}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
					>
						Cancelar edição
					</button>
				)}
				<button
					type="submit"
					disabled={disabled || saving}
					className="btn-primary flex items-center gap-2 disabled:opacity-50"
				>
					<Save size={16} />{" "}
					{editing ? "Salvar alterações" : "Cadastrar produto"}
				</button>
			</div>
		</form>
	);
}

function WithdrawalForm({
	form,
	setForm,
	produtos,
	setores,
	selectedProduto,
	saving,
	disabled,
	onSubmit,
}) {
	return (
		<form
			onSubmit={onSubmit}
			className="animate-[fadeIn_180ms_ease-out] rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
		>
			<div className="mb-5">
				<h3 className="text-lg font-black text-slate-950">
					Cadastrar retirada
				</h3>
				<p className="text-sm font-semibold text-slate-500">
					Retirada registrada automaticamente com data e hora do envio.
				</p>
			</div>
			<div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
				<p className="font-bold">Data e hora da retirada</p>
				<p className="text-xs">
					Será registrada automaticamente como {getNowLabel()}.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">Produto</span>
					<select
						required
						value={form.produto_id}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								produto_id: event.target.value,
							}))
						}
						className="input-field"
					>
						<option value="">Selecione...</option>
						{produtos.map((produto) => (
							<option key={produto.id} value={produto.id}>
								{produto.nome} - estoque {formatNumber(produto.estoque_atual)}{" "}
								{produto.unidade}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">
						Quantidade retirada
					</span>
					<input
						required
						type="number"
						min="1"
						step="1"
						value={form.quantidade}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								quantidade: event.target.value,
							}))
						}
						className="input-field"
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">
						Pessoa que retirou
					</span>
					<input
						required
						value={form.responsavel}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								responsavel: event.target.value,
							}))
						}
						className="input-field"
						placeholder="Nome"
					/>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-bold text-slate-500">Setor</span>
					<select
						required
						value={form.setor}
						onChange={(event) =>
							setForm((current) => ({ ...current, setor: event.target.value }))
						}
						className="input-field"
					>
						<option value="">Selecione...</option>
						{setores.map((setor) => (
							<option key={setor} value={setor}>
								{setor}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1 md:col-span-2">
					<span className="text-xs font-bold text-slate-500">Observação</span>
					<textarea
						value={form.observacao}
						onChange={(event) =>
							setForm((current) => ({
								...current,
								observacao: event.target.value,
							}))
						}
						className="input-field min-h-32 resize-y"
						placeholder="Informe detalhes da retirada, finalidade ou autorização."
					/>
				</label>
			</div>
			{selectedProduto && (
				<p className="mt-3 text-xs font-bold text-slate-500">
					Estoque atual: {formatNumber(selectedProduto.estoque_atual)}{" "}
					{selectedProduto.unidade}
				</p>
			)}
			<div className="mt-5 flex justify-end">
				<button
					type="submit"
					disabled={disabled || saving}
					className="btn-primary flex items-center gap-2 disabled:opacity-50"
				>
					<Save size={16} /> Registrar retirada
				</button>
			</div>
		</form>
	);
}

function StockList({
	produtos,
	categorias,
	bases,
	adminGlobal,
	filters,
	setFilters,
	disabled,
	onEdit,
	onToggleStatus,
	onDelete,
}) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const totalPages = Math.max(1, Math.ceil(produtos.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paginatedProdutos = produtos.slice(
		(safePage - 1) * pageSize,
		safePage * pageSize,
	);

	return (
		<div className="animate-[fadeIn_180ms_ease-out] space-y-4">
			<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
				<h3 className="text-lg font-black text-slate-950">Estoque</h3>
				<div className="mt-4 grid gap-3 md:grid-cols-4">
					<div className="relative">
						<Search
							size={14}
							className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
						/>
						<input
							value={filters.busca}
							onChange={(event) => {
								setPage(1);
								setFilters((current) => ({
									...current,
									busca: event.target.value,
								}));
							}}
							className="input-field pl-9"
							placeholder="Buscar produto..."
						/>
					</div>
					{adminGlobal ? (
						<select
							value={filters.base}
							onChange={(event) => {
								setPage(1);
								setFilters((current) => ({
									...current,
									base: event.target.value,
								}));
							}}
							className="input-field"
						>
							<option value="todos">Todas as bases</option>
							{bases.map((base) => (
								<option key={base.id} value={base.id}>
									{base.nome}
								</option>
							))}
						</select>
					) : null}
					<select
						value={filters.categoria}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								categoria: event.target.value,
							}));
						}}
						className="input-field"
					>
						<option value="todos">Todas as categorias</option>
						{categorias.map((categoria) => (
							<option key={categoria} value={categoria}>
								{categoria}
							</option>
						))}
					</select>
					<select
						value={filters.status}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								status: event.target.value,
							}));
						}}
						className="input-field"
					>
						<option value="todos">Todos os status</option>
						<option value="normal">Normal</option>
						<option value="baixo">Baixo/Crítico</option>
						<option value="atencao">Atenção</option>
						<option value="critico">Crítico</option>
						<option value="zerado">Zerado</option>
						<option value="inativo">Inativo</option>
					</select>
				</div>
			</div>
			<InventoryTable
				produtos={paginatedProdutos}
				disabled={disabled}
				onEdit={onEdit}
				onToggleStatus={onToggleStatus}
				onDelete={onDelete}
			/>
			<PaginationControls
				total={produtos.length}
				page={safePage}
				pageSize={pageSize}
				onPageChange={setPage}
				onPageSizeChange={setPageSize}
			/>
		</div>
	);
}

function InventoryTable({
	produtos,
	disabled,
	onEdit,
	onToggleStatus,
	onDelete,
}) {
	return (
		<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
			<div className="overflow-x-auto">
				<table className="min-w-[760px] w-full text-sm">
					<thead className="border-b border-slate-100 bg-slate-50">
						<tr>
							{[
								"Produto",
								"Base",
								"Categoria",
								"Unidade",
								"Quantidade",
								"Ideal",
								"Status",
								"Fornecedor/Obs.",
								"Ações",
							].map((header) => (
								<th
									key={header}
									className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500"
								>
									{header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{produtos.map((produto) => {
							const status = getStockStatus(produto);
							return (
								<tr
									key={produto.id}
									className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
								>
									<td className="px-5 py-3 font-bold text-slate-900">
										{produto.nome}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{produto.base_nome || "-"}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{produto.categoria || "Outros"}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{produto.unidade}
									</td>
									<td className="px-5 py-3 font-black text-slate-900">
										{formatNumber(produto.estoque_atual)}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{formatNumber(
											produto.estoque_ideal ?? produto.estoque_minimo,
										)}
									</td>
									<td className="px-5 py-3">
										<span
											className={`rounded-full border px-2.5 py-1 text-xs font-bold ${status.tone}`}
										>
											{status.label}
										</span>
									</td>
									<td className="max-w-md px-5 py-3 text-slate-500">
										{produto.fornecedor || produto.observacao || "-"}
									</td>
									<td className="px-5 py-3">
										<div className="flex items-center gap-2">
											<button
												type="button"
												disabled={disabled}
												onClick={() => onEdit(produto)}
												className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
												title="Editar"
											>
												<Pencil size={14} />
											</button>
											<button
												type="button"
												disabled={disabled}
												onClick={() => onToggleStatus(produto)}
												className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50"
												title={
													produto.status === "inativo" ? "Reativar" : "Inativar"
												}
											>
												{produto.status === "inativo" ? (
													<PackageCheck size={14} />
												) : (
													<Archive size={14} />
												)}
											</button>
											<button
												type="button"
												disabled={disabled}
												onClick={() => onDelete(produto)}
												className="rounded-xl border border-red-100 p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
												title="Excluir"
											>
												<Trash2 size={14} />
											</button>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{produtos.length === 0 && (
				<div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
					Nenhum registro encontrado.
				</div>
			)}
		</div>
	);
}

function MovementLog({
	reposicoes,
	retiradas,
	categorias,
	setores,
	filters,
	setFilters,
}) {
	return (
		<div className="space-y-5">
			<RestockLog reposicoes={reposicoes} />
			<WithdrawalLog
				retiradas={retiradas}
				categorias={categorias}
				setores={setores}
				filters={filters}
				setFilters={setFilters}
			/>
		</div>
	);
}

function RestockLog({ reposicoes }) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const totalPages = Math.max(1, Math.ceil(reposicoes.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paginatedReposicoes = reposicoes.slice(
		(safePage - 1) * pageSize,
		safePage * pageSize,
	);

	return (
		<div className="animate-[fadeIn_180ms_ease-out] space-y-4">
			<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
				<h3 className="text-lg font-black text-slate-950">Log de reposições</h3>
				<p className="text-sm font-semibold text-emerald-800">
					Compras e entradas adicionadas em produtos já cadastrados.
				</p>
			</div>
			<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
				<div className="overflow-x-auto">
					<table className="min-w-[760px] w-full text-sm">
						<thead className="border-b border-slate-100 bg-slate-50">
							<tr>
								{[
									"Data",
									"Produto",
									"Quantidade adicionada",
									"Adicionado por",
									"Estoque antes",
									"Estoque depois",
									"Observação",
								].map((header) => (
									<th
										key={header}
										className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500"
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{paginatedReposicoes.map((reposicao) => (
								<tr
									key={reposicao.id}
									className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
								>
									<td className="px-5 py-3 text-slate-500">
										{formatDateTime(
											reposicao.reposto_em || reposicao.criado_em,
										)}
									</td>
									<td className="px-5 py-3 font-bold text-slate-900">
										{reposicao.produto_nome}
									</td>
									<td className="px-5 py-3 font-black text-emerald-700">
										+{formatNumber(reposicao.quantidade)} {reposicao.unidade}
									</td>
									<td className="px-5 py-3 text-slate-700">
										{reposicao.criado_por || "-"}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{formatNumber(reposicao.estoque_antes)}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{formatNumber(reposicao.estoque_depois)}
									</td>
									<td className="max-w-md px-5 py-3 text-slate-500">
										{reposicao.observacao || "-"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{reposicoes.length === 0 && (
					<div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
						Nenhuma reposição registrada.
					</div>
				)}
				{reposicoes.length > 0 && (
					<PaginationControls
						total={reposicoes.length}
						page={safePage}
						pageSize={pageSize}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
					/>
				)}
			</div>
		</div>
	);
}

function WithdrawalLog({
	retiradas,
	categorias,
	setores,
	filters,
	setFilters,
}) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const totalPages = Math.max(1, Math.ceil(retiradas.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paginatedRetiradas = retiradas.slice(
		(safePage - 1) * pageSize,
		safePage * pageSize,
	);

	return (
		<div className="animate-[fadeIn_180ms_ease-out] space-y-4">
			<div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
				<h3 className="text-lg font-black text-slate-950">Log de retiradas</h3>
				<div className="mt-4 grid gap-3 md:grid-cols-5">
					<input
						value={filters.busca}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								busca: event.target.value,
							}));
						}}
						className="input-field"
						placeholder="Produto ou responsável..."
					/>
					<select
						value={filters.categoria}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								categoria: event.target.value,
							}));
						}}
						className="input-field"
					>
						<option value="todos">Todas as categorias</option>
						{categorias.map((categoria) => (
							<option key={categoria} value={categoria}>
								{categoria}
							</option>
						))}
					</select>
					<select
						value={filters.setor}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								setor: event.target.value,
							}));
						}}
						className="input-field"
					>
						<option value="todos">Todos os setores</option>
						{setores.map((setor) => (
							<option key={setor} value={setor}>
								{setor}
							</option>
						))}
					</select>
					<input
						type="date"
						value={filters.inicio}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								inicio: event.target.value,
							}));
						}}
						className="input-field"
						aria-label="Data inicial"
					/>
					<input
						type="date"
						value={filters.fim}
						onChange={(event) => {
							setPage(1);
							setFilters((current) => ({
								...current,
								fim: event.target.value,
							}));
						}}
						className="input-field"
						aria-label="Data final"
					/>
				</div>
			</div>
			<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
				<div className="overflow-x-auto">
					<table className="min-w-[760px] w-full text-sm">
						<thead className="border-b border-slate-100 bg-slate-50">
							<tr>
								{[
									"Data",
									"Produto",
									"Quantidade",
									"Quem retirou",
									"Lançado por",
									"Setor",
									"Estoque após",
									"Observação",
								].map((header) => (
									<th
										key={header}
										className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500"
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{paginatedRetiradas.map((retirada) => (
								<tr
									key={retirada.id}
									className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
								>
									<td className="px-5 py-3 text-slate-500">
										{formatDateTime(retirada.retirado_em)}
									</td>
									<td className="px-5 py-3 font-bold text-slate-900">
										{retirada.produto_nome}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{retirada.quantidade} {retirada.unidade}
									</td>
									<td className="px-5 py-3 text-slate-700">
										{retirada.responsavel || "-"}
									</td>
									<td className="px-5 py-3 text-slate-700">
										{retirada.criado_por || "-"}
									</td>
									<td className="px-5 py-3 text-slate-500">{retirada.setor}</td>
									<td className="px-5 py-3 text-slate-500">
										{formatNumber(retirada.estoque_depois)}
									</td>
									<td className="max-w-md px-5 py-3 text-slate-500">
										{retirada.observacao || "-"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{retiradas.length === 0 && (
					<div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
						Nenhum registro encontrado.
					</div>
				)}
				{retiradas.length > 0 && (
					<PaginationControls
						total={retiradas.length}
						page={safePage}
						pageSize={pageSize}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
					/>
				)}
			</div>
		</div>
	);
}

function ResponsibleWithdrawalsModal({ name, retiradas, onClose }) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const totalPages = Math.max(1, Math.ceil(retiradas.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paginatedRetiradas = retiradas.slice(
		(safePage - 1) * pageSize,
		safePage * pageSize,
	);

	return (
		<ModalShell
			title={name}
			description="Itens retirados, com data, hora, setor e quantidade."
			onClose={onClose}
			size="5xl"
		>
			<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
				<div className="overflow-x-auto">
					<table className="min-w-[760px] w-full text-sm">
						<thead className="border-b border-slate-100 bg-slate-50">
							<tr>
								{[
									"Data",
									"Produto",
									"Quantidade",
									"Setor",
									"Lançado por",
									"Estoque após",
									"Observação",
								].map((header) => (
									<th
										key={header}
										className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500"
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{paginatedRetiradas.map((retirada) => (
								<tr
									key={retirada.id}
									className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
								>
									<td className="px-5 py-3 text-slate-500">
										{formatDateTime(retirada.retirado_em || retirada.criado_em)}
									</td>
									<td className="px-5 py-3 font-bold text-slate-900">
										{retirada.produto_nome}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{retirada.quantidade} {retirada.unidade}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{retirada.setor || "-"}
									</td>
									<td className="px-5 py-3 text-slate-700">
										{retirada.criado_por || "-"}
									</td>
									<td className="px-5 py-3 text-slate-500">
										{formatNumber(retirada.estoque_depois)}
									</td>
									<td className="max-w-md px-5 py-3 text-slate-500">
										{retirada.observacao || "-"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{retiradas.length === 0 && (
					<div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
						Nenhuma retirada encontrada para esta pessoa.
					</div>
				)}
				{retiradas.length > 0 && (
					<PaginationControls
						total={retiradas.length}
						page={safePage}
						pageSize={pageSize}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
					/>
				)}
			</div>
		</ModalShell>
	);
}

export default InsumosAdministrativosPage;

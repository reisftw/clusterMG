import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	AlertTriangle,
	Boxes,
	CheckCircle2,
	ClipboardCheck,
	Cog,
	Download,
	Edit3,
	Eye,
	History,
	Lock,
	Plus,
	QrCode,
	RefreshCw,
	Trash2,
	ShieldCheck,
	Shuffle,
	Undo2,
	Unlock,
	Wrench,
	XCircle,
} from "lucide-react";
import {
	blockAssetsSecurityAsset,
	createAssetsSecurityAsset,
	createAssetsSecurityChecklistTemplate,
	createAssetsSecurityMaintenance,
	deleteAssetsSecurityConfig,
	deleteAssetsSecurityAsset,
	executeAssetsSecurityChecklist,
	fetchAssetsSecurityAssets,
	fetchAssetsSecurityChecklistTemplates,
	fetchAssetsSecurityDashboard,
	fetchAssetsSecurityBlocks,
	fetchAssetsSecurityMeta,
	fetchAssetsSecurityMaintenance,
	fetchAssetsSecurityOccurrences,
	fetchAssetsSecurityReturns,
	fetchAssetsSecurityTransfers,
	fetchAssetsSecurityTimeline,
	releaseAssetsSecurityAsset,
	reportAssetsSecurityProblem,
	returnAssetsSecurityAsset,
	transferAssetsSecurityAsset,
	updateAssetsSecurityAsset,
	updateAssetsSecurityMaintenance,
	upsertAssetsSecurityConfig,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import ImageUploader from "../../components/ImageUploader";
import { useRotAuth } from "../../state/RotAuthContext";

const CONFIG_SECTIONS = [
	{ kind: "categories", title: "Categorias de ativos", subtitle: "Agrupam escadas, ferramentas e equipamentos operacionais." },
	{ kind: "types", title: "Tipos de ativos", subtitle: "Definem comportamento padrão, checklist e frequência." },
	{ kind: "statuses", title: "Status", subtitle: "Controlam disponibilidade, bloqueio de uso e transferência." },
	{ kind: "criticalities", title: "Criticidades", subtitle: "Peso, cor e ações de risco operacional." },
	{ kind: "codePatterns", title: "Padrões de código", subtitle: "Prefixos e sequências por operação, tipo ou empresa." },
];

const KPI_TONES = {
	blue: "bg-blue-50 text-blue-600",
	emerald: "bg-emerald-50 text-emerald-600",
	red: "bg-red-50 text-red-600",
	amber: "bg-amber-50 text-amber-600",
	purple: "bg-purple-50 text-purple-600",
	slate: "bg-slate-100 text-slate-600",
};

function formatCurrency(value) {
	if (value === null || value === undefined) return "Restrito";
	return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function qrImageUrl(publicUrl, size = 180) {
	return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(publicUrl)}`;
}

function safeFileName(value) {
	return String(value || "ativo").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "ativo";
}

function normalizeChecklistOptions(options, { keepBlank = false } = {}) {
	const source = Array.isArray(options) && options.length ? options : ["OK", "N-OK", "Não se aplica"];
	const normalized = source
		.map((option) => {
			if (typeof option === "string") {
				return { label: option, value: option, status: option === "N-OK" ? "N-OK" : option === "OK" ? "OK" : "" };
			}
			const label = String(option?.label || option?.value || "").trim();
			return {
				label,
				value: String(option?.value || label).trim(),
				status: String(option?.status || "").trim(),
			};
		});
	return keepBlank ? normalized : normalized.filter((option) => option.label);
}

function defaultChecklistQuestion(label = "") {
	return {
		label,
		required: true,
		options: [
			{ label: "OK", value: "OK", status: "OK" },
			{ label: "N-OK", value: "N-OK", status: "N-OK" },
			{ label: "Não se aplica", value: "Não se aplica", status: "" },
		],
	};
}

async function fetchQrBlob(publicUrl, size = 900) {
	const response = await fetch(qrImageUrl(publicUrl, size), { mode: "cors" });
	if (!response.ok) throw new Error("Falha ao gerar o QR Code.");
	return response.blob();
}

async function downloadAssetQrPng(asset) {
	const publicUrl = `${window.location.origin}${asset.qrUrl}`;
	const blob = await fetchQrBlob(publicUrl);
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `QR_${safeFileName(asset.code)}.png`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function downloadAssetQrPdf(asset) {
	const publicUrl = `${window.location.origin}${asset.qrUrl}`;
	const blob = await fetchQrBlob(publicUrl);
	const dataUrl = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error("Falha ao preparar o QR Code."));
		reader.readAsDataURL(blob);
	});
	const { jsPDF } = await import("jspdf");
	const pdf = new jsPDF("p", "mm", "a4");
	pdf.setFillColor(6, 27, 56);
	pdf.rect(0, 0, 210, 24, "F");
	pdf.setFontSize(15);
	pdf.setTextColor(255, 255, 255);
	pdf.text("OPERAÇÃO | Sempre Internet", 105, 15, { align: "center" });
	pdf.setFontSize(22);
	pdf.setTextColor(15, 23, 42);
	pdf.text(asset.code || "Ativo", 105, 46, { align: "center" });
	pdf.setFontSize(12);
	pdf.setTextColor(71, 85, 105);
	pdf.text(String(asset.name || "Ativo operacional").slice(0, 80), 105, 56, { align: "center" });
	pdf.addImage(dataUrl, "PNG", 55, 72, 100, 100);
	pdf.setDrawColor(226, 232, 240);
	pdf.roundedRect(45, 64, 120, 120, 6, 6);
	pdf.setFontSize(10);
	pdf.setTextColor(100, 116, 139);
	pdf.text("Aponte a câmera para consultar status, checklist e histórico autorizado.", 105, 196, { align: "center", maxWidth: 160 });
	pdf.text(publicUrl, 105, 206, { align: "center", maxWidth: 170 });
	pdf.save(`QR_${safeFileName(asset.code)}.pdf`);
}

async function downloadMaintenanceOrderPdf(item) {
	const { jsPDF } = await import("jspdf");
	const pdf = new jsPDF("p", "mm", "a4");
	const createdAt = item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-";
	const closedAt = item.closed_at ? new Date(item.closed_at).toLocaleString("pt-BR") : "-";
	const rows = [
		["Código", item.code || "-"],
		["Ativo", `${item.asset_name || "-"}${item.asset_code ? ` (${item.asset_code})` : ""}`],
		["Status", item.status || "-"],
		["Criticidade", item.criticality_name || "-"],
		["Aberta por", item.opened_by_name || "Sistema"],
		["Aberta em", createdAt],
		["Fechada em", closedAt],
	];

	pdf.setFillColor(6, 27, 56);
	pdf.rect(0, 0, 210, 30, "F");
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(16);
	pdf.setTextColor(255, 255, 255);
	pdf.text("OPERAÇÃO | Sempre Internet", 14, 13);
	pdf.setFontSize(10);
	pdf.setFont("helvetica", "normal");
	pdf.text("Ordem de manutenção", 14, 22);

	pdf.setTextColor(15, 23, 42);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(20);
	pdf.text(item.code || "Ordem de manutenção", 14, 46);
	pdf.setFontSize(11);
	pdf.setTextColor(71, 85, 105);
	pdf.text(String(item.asset_name || "Ativo operacional").slice(0, 95), 14, 55);

	let y = 70;
	rows.forEach(([label, value]) => {
		pdf.setFillColor(248, 250, 252);
		pdf.roundedRect(14, y - 6, 182, 10, 2, 2, "F");
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(8);
		pdf.setTextColor(100, 116, 139);
		pdf.text(label.toUpperCase(), 18, y);
		pdf.setFontSize(9);
		pdf.setTextColor(15, 23, 42);
		pdf.text(String(value).slice(0, 90), 70, y);
		y += 12;
	});

	const sections = [
		["Descrição da manutenção", item.description || "-"],
		["Serviço executado", item.service_performed || "Ainda não informado."],
		["Observações", item.notes || "-"],
	];
	sections.forEach(([title, text]) => {
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(10);
		pdf.setTextColor(15, 23, 42);
		pdf.text(title, 14, y + 2);
		y += 7;
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		pdf.setTextColor(51, 65, 85);
		const lines = pdf.splitTextToSize(String(text), 176);
		pdf.text(lines.slice(0, 7), 14, y);
		y += Math.min(lines.length, 7) * 5 + 8;
	});

	pdf.setDrawColor(203, 213, 225);
	pdf.line(14, 270, 196, 270);
	pdf.setFontSize(8);
	pdf.setTextColor(100, 116, 139);
	pdf.text(`Gerado em ${new Date().toLocaleString("pt-BR")} pela Operação.`, 14, 278);
	pdf.save(`OM_${safeFileName(item.code)}.pdf`);
}

export default function AssetsSecurityPage() {
	const { hasPermission, user } = useRotAuth();
	const canCreate = hasPermission("ativos.criar");
	const canEdit = hasPermission("ativos.editar");
	const canDelete = hasPermission("ativos.excluir");
	const canConfigure = hasPermission("checklists.configurar");
	const canSeeHistory = hasPermission("ativos.historico.visualizar");
	const [searchParams] = useSearchParams();
	const requestedTab = searchParams.get("tab") || "visao-geral";
	const currentTab = requestedTab === "indicadores" ? "visao-geral" : requestedTab;
	const [meta, setMeta] = useState(null);
	const [dashboard, setDashboard] = useState(null);
	const [assets, setAssets] = useState([]);
	const [templates, setTemplates] = useState([]);
	const [occurrences, setOccurrences] = useState([]);
	const [maintenance, setMaintenance] = useState([]);
	const [transfers, setTransfers] = useState([]);
	const [returnsData, setReturnsData] = useState([]);
	const [blocks, setBlocks] = useState([]);
	const [total, setTotal] = useState(0);
	const [filters, setFilters] = useState({ q: "", operationScope: "", statusId: "" });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [assetModal, setAssetModal] = useState(null);
	const [timelineModal, setTimelineModal] = useState(null);
	const [configModal, setConfigModal] = useState(null);
	const [actionModal, setActionModal] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [metaData, dashData, assetsData, templateData, occurrenceData, maintenanceData, transferData, returnData, blockData] = await Promise.all([
				fetchAssetsSecurityMeta(),
				fetchAssetsSecurityDashboard(),
				fetchAssetsSecurityAssets({ ...filters, limit: 60 }),
				fetchAssetsSecurityChecklistTemplates().catch(() => []),
				fetchAssetsSecurityOccurrences().catch(() => []),
				fetchAssetsSecurityMaintenance().catch(() => []),
				fetchAssetsSecurityTransfers().catch(() => []),
				fetchAssetsSecurityReturns().catch(() => []),
				fetchAssetsSecurityBlocks().catch(() => []),
			]);
			setMeta(metaData);
			setDashboard(dashData);
			setAssets(assetsData.items || []);
			setTemplates(templateData || []);
			setOccurrences(occurrenceData || []);
			setMaintenance(maintenanceData || []);
			setTransfers(transferData || []);
			setReturnsData(returnData || []);
			setBlocks(blockData || []);
			setTotal(assetsData.total || 0);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar Ativos & Segurança.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const filteredAssets = useMemo(() => assets, [assets]);

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex items-center gap-3">
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<ShieldCheck size={24} />
						</span>
						<div>
							<h1 className="text-2xl font-black text-slate-950">Ativos & Segurança</h1>
							<p className="text-sm font-semibold text-slate-500">Inspeções, ativos operacionais, custódia e segurança em campo.</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
							<RefreshCw size={16} /> Atualizar
						</button>
						{canCreate ? (
							<button type="button" onClick={() => setAssetModal({ asset: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700">
								<Plus size={17} /> Novo ativo
							</button>
						) : null}
					</div>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{currentTab === "visao-geral" ? <Overview dashboard={dashboard} assets={assets} /> : null}
			{currentTab === "ativos" || currentTab === "meus-ativos" ? (
				<AssetsList
					assets={filteredAssets}
					total={total}
					meta={meta}
					filters={filters}
					setFilters={setFilters}
					onSearch={() => load()}
					canEdit={canEdit}
					canDelete={canDelete}
					canSeeHistory={canSeeHistory}
					onEdit={(asset) => setAssetModal({ asset })}
					onTimeline={(asset) => setTimelineModal({ asset })}
					onAction={(kind, asset) => setActionModal({ kind, asset })}
					onDelete={async (asset) => {
						if (!window.confirm(`Inativar o ativo ${asset.code}? O histórico será preservado.`)) return;
						await deleteAssetsSecurityAsset(asset.id);
						await load();
					}}
				/>
			) : null}
			{currentTab === "checklists" ? <ChecklistPanel templates={templates} assets={assets} onRun={(asset) => setActionModal({ kind: "checklist", asset })} /> : null}
			{currentTab === "transferencias" ? <TransferPanel items={transfers} /> : null}
			{currentTab === "devolucoes" ? <ReturnPanel items={returnsData} /> : null}
			{currentTab === "ocorrencias" ? <OccurrencePanel items={occurrences} /> : null}
			{currentTab === "manutencoes" ? <MaintenancePanel items={maintenance} onUpdate={async (item, status) => { await updateAssetsSecurityMaintenance(item.id, { status }); await load(); }} /> : null}
			{currentTab === "bloqueados" ? <BlockPanel items={blocks} onRelease={(asset) => setActionModal({ kind: "release", asset })} /> : null}
			{currentTab === "configuracoes" ? (
				<SettingsPanel
					meta={meta}
					templates={templates}
					canConfigure={canConfigure}
					onNew={(section) => setConfigModal({ section })}
					onEdit={(section, item) => setConfigModal({ section, item })}
					onChecklist={() => setConfigModal({ section: { kind: "checklists", title: "Modelo de checklist", subtitle: "Crie um checklist próprio para ativos ou tipos de equipamento." } })}
					onDelete={async (section, item) => {
						if (!window.confirm(`Excluir/inativar "${item.name}"?`)) return;
						await deleteAssetsSecurityConfig(section.kind, item.id);
						await load();
					}}
				/>
			) : null}

			{assetModal ? (
				<AssetFormModal
					asset={assetModal.asset}
					meta={meta}
					user={user}
					onClose={() => setAssetModal(null)}
					onSaved={async () => {
						setAssetModal(null);
						await load();
					}}
				/>
			) : null}

			{timelineModal ? (
				<TimelineModal asset={timelineModal.asset} onClose={() => setTimelineModal(null)} />
			) : null}

			{configModal ? (
				<ConfigModal
					section={configModal.section}
					item={configModal.item}
					meta={meta}
					onClose={() => setConfigModal(null)}
					onSaved={async () => {
						setConfigModal(null);
						await load();
					}}
				/>
			) : null}

			{actionModal ? (
				<AssetActionModal
					kind={actionModal.kind}
					asset={actionModal.asset}
					meta={meta}
					templates={templates}
					onClose={() => setActionModal(null)}
					onSaved={async () => {
						setActionModal(null);
						await load();
					}}
				/>
			) : null}
		</div>
	);
}

function Overview({ dashboard, assets }) {
	const summary = dashboard?.summary || {};
	const cards = [
		{ label: "Ativos totais", value: summary.total || 0, icon: Boxes, tone: "blue" },
		{ label: "Em uso", value: summary.inUse || 0, icon: CheckCircle2, tone: "emerald" },
		{ label: "Bloqueados", value: summary.blocked || 0, icon: XCircle, tone: "red" },
		{ label: "Inspeções vencidas", value: summary.overdueInspections || 0, icon: AlertTriangle, tone: "amber" },
		{ label: "Ocorrências abertas", value: summary.openOccurrences || 0, icon: AlertTriangle, tone: "amber" },
		{ label: "Manutenções abertas", value: summary.openMaintenance || 0, icon: Wrench, tone: "purple" },
		{ label: "Checklists hoje", value: summary.checklistsToday || 0, icon: ClipboardCheck, tone: "emerald" },
		{ label: "N-OK hoje", value: summary.nokToday || 0, icon: XCircle, tone: "red" },
		{ label: "Alto valor", value: summary.highValue || 0, icon: ShieldCheck, tone: "purple" },
		{ label: "Valor total", value: formatCurrency(summary.totalValue), icon: Boxes, tone: "slate" },
	];
	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{cards.map((card) => {
					const Icon = card.icon;
					return (
						<div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-xs font-black uppercase tracking-wide text-slate-500">{card.label}</p>
									<p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p>
								</div>
								<span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${KPI_TONES[card.tone] || KPI_TONES.blue}`}>
									<Icon size={22} />
								</span>
							</div>
						</div>
					);
				})}
			</div>
			<div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Ativos por regional</h2>
					<div className="mt-4 space-y-3">
						{(dashboard?.byRegional || []).map((item) => (
							<div key={item.name}>
								<div className="mb-1 flex justify-between text-xs font-black uppercase text-slate-500">
									<span>{item.name}</span>
									<span>{item.total}</span>
								</div>
								<div className="h-3 overflow-hidden rounded-full bg-slate-100">
									<div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (item.total / Math.max(1, summary.total || 1)) * 100)}%` }} />
								</div>
							</div>
						))}
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Indicadores rápidos</h2>
					<div className="mt-4 grid gap-3 md:grid-cols-2">
						<MiniInfo label="Conformidade hoje" value={`${summary.conformityRateToday || 0}%`} />
						<MiniInfo label="Transferências hoje" value={summary.transfersToday || 0} />
						<MiniInfo label="Aceites pendentes" value={summary.pendingTransfers || 0} danger={Number(summary.pendingTransfers || 0) > 0} />
						<MiniInfo label="Devoluções hoje" value={summary.returnsToday || 0} />
					</div>
				</section>
			</div>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<h2 className="text-lg font-black text-slate-950">Últimos ativos</h2>
					<div className="mt-4 space-y-3">
						{assets.slice(0, 5).map((asset) => (
							<div key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
								<div className="min-w-0">
									<p className="truncate text-sm font-black text-slate-900">{asset.name}</p>
									<p className="text-xs font-bold text-slate-500">{asset.code} · {asset.operationScope}</p>
								</div>
								<span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: `${asset.statusColor || "#2563eb"}18`, color: asset.statusColor || "#2563eb" }}>
									{asset.statusName || "Status"}
								</span>
							</div>
						))}
					</div>
			</section>
		</div>
	);
}

function AssetsList({ assets, total, meta, filters, setFilters, onSearch, canEdit, canDelete, canSeeHistory, onEdit, onTimeline, onAction, onDelete }) {
	return (
		<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">Ativos cadastrados</h2>
					<p className="text-sm font-semibold text-slate-500">{total} registro(s)</p>
				</div>
				<div className="grid gap-2 md:grid-cols-[1fr_180px_180px_auto]">
					<input value={filters.q} onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))} placeholder="Buscar por código, nome, série..." className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					<select value={filters.operationScope} onChange={(e) => setFilters((current) => ({ ...current, operationScope: e.target.value }))} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none">
						<option value="">Todas operações</option>
						<option value="ROT">ROT</option>
						<option value="FIELD">FIELD</option>
						<option value="DELIVERY">DELIVERY</option>
					</select>
					<select value={filters.statusId} onChange={(e) => setFilters((current) => ({ ...current, statusId: e.target.value }))} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none">
						<option value="">Todos status</option>
						{(meta?.statuses || []).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
					</select>
					<button type="button" onClick={onSearch} className="rot-btn-tactile h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">Filtrar</button>
				</div>
			</div>
			<div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
				{assets.map((asset) => (
					<AssetCard key={asset.id} asset={asset} canEdit={canEdit} canDelete={canDelete} canSeeHistory={canSeeHistory} onEdit={() => onEdit(asset)} onTimeline={() => onTimeline(asset)} onAction={(kind) => onAction(kind, asset)} onDelete={() => onDelete(asset)} />
				))}
			</div>
			{!assets.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum ativo encontrado.</p> : null}
		</section>
	);
}

function AssetCard({ asset, canEdit, canDelete, canSeeHistory, onEdit, onTimeline, onAction, onDelete }) {
	const publicUrl = `${window.location.origin}${asset.qrUrl}`;
	return (
		<article className="rot-card-hover rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start gap-4">
				<div className="rounded-xl border border-slate-100 bg-white p-1">
					<img src={qrImageUrl(publicUrl, 96)} alt={`QR Code ${asset.code}`} className="h-20 w-20" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="font-mono text-xs font-black text-blue-600">{asset.code}</p>
							<h3 className="truncate text-lg font-black text-slate-950">{asset.name}</h3>
							<p className="text-xs font-bold uppercase text-slate-500">{asset.operationScope} · {asset.regionalName || "Sem regional"}</p>
						</div>
						<span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black" style={{ backgroundColor: `${asset.statusColor || "#2563eb"}18`, color: asset.statusColor || "#2563eb" }}>
							{asset.statusName || "Status"}
						</span>
					</div>
					<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
						<MiniInfo label="Tipo" value={asset.typeName || "N/D"} />
						<MiniInfo label="Custódia" value={asset.custodyTechnicianName || asset.custodyUserName || "Sem custódia"} />
						<MiniInfo label="Valor" value={formatCurrency(asset.assetValue)} />
						<MiniInfo label="Condição" value={asset.statusBlocksUse ? "N-OK" : "OK"} danger={asset.statusBlocksUse} />
					</div>
				</div>
			</div>
			<div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
				<a href={asset.qrUrl} target="_blank" rel="noreferrer" className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
					<QrCode size={14} /> QR
				</a>
				<button type="button" onClick={() => downloadAssetQrPng(asset)} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
					<Download size={14} /> PNG
				</button>
				<button type="button" onClick={() => downloadAssetQrPdf(asset)} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
					<Download size={14} /> PDF
				</button>
				{canSeeHistory ? (
					<button type="button" onClick={onTimeline} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
						<History size={14} /> Histórico
					</button>
				) : null}
				{canEdit ? (
					<button type="button" onClick={onEdit} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700">
						<Edit3 size={14} /> Editar
					</button>
				) : null}
				<button type="button" onClick={() => onAction("checklist")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-50">
					<ClipboardCheck size={14} /> Checklist
				</button>
				<button type="button" onClick={() => onAction("transfer")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
					<Shuffle size={14} /> Transferir
				</button>
				<button type="button" onClick={() => onAction("return")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
					<Undo2 size={14} /> Devolver
				</button>
				<button type="button" onClick={() => onAction("problem")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 px-3 text-xs font-black text-amber-700 hover:bg-amber-50">
					<AlertTriangle size={14} /> Problema
				</button>
				<button type="button" onClick={() => onAction(asset.statusBlocksUse ? "release" : "block")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50">
					{asset.statusBlocksUse ? <Unlock size={14} /> : <Lock size={14} />} {asset.statusBlocksUse ? "Liberar" : "Bloquear"}
				</button>
				<button type="button" onClick={() => onAction("maintenance")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-purple-200 px-3 text-xs font-black text-purple-700 hover:bg-purple-50">
					<Wrench size={14} /> Manutenção
				</button>
				{canDelete ? (
					<button type="button" onClick={onDelete} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50">
						<XCircle size={14} /> Inativar
					</button>
				) : null}
			</div>
		</article>
	);
}

function MiniInfo({ label, value, danger }) {
	return (
		<div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
			<p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
			<p className={`truncate font-black ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</p>
		</div>
	);
}

function SettingsPanel({ meta, templates, canConfigure, onNew, onEdit, onDelete, onChecklist }) {
	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card xl:col-span-2">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="text-lg font-black text-slate-950">Modelos de checklist</h2>
						<p className="text-sm font-semibold text-slate-500">Crie checklists próprios para cada equipamento, tipo ou rotina operacional.</p>
					</div>
					{canConfigure ? (
						<button type="button" onClick={onChecklist} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white">
							<Plus size={14} /> Novo checklist
						</button>
					) : null}
				</div>
				<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{(templates || []).map((template) => (
						<div key={template.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="truncate text-sm font-black text-slate-900">{template.name}</p>
									<p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{template.description || "Checklist configurável"}</p>
								</div>
								<span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{template.questions?.length || 0} itens</span>
							</div>
						</div>
					))}
				</div>
			</section>
			{CONFIG_SECTIONS.map((section) => {
				const items = meta?.[section.kind] || [];
				return (
					<section key={section.kind} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2 className="text-lg font-black text-slate-950">{section.title}</h2>
								<p className="text-sm font-semibold text-slate-500">{section.subtitle}</p>
							</div>
							{canConfigure ? (
								<button type="button" onClick={() => onNew(section)} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white">
									<Plus size={14} /> Novo
								</button>
							) : null}
						</div>
						<div className="mt-4 space-y-2">
							{items.slice(0, 8).map((item) => (
								<div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
									<div className="min-w-0">
										<p className="truncate text-sm font-black text-slate-900">{item.name}</p>
										<p className="truncate text-xs font-semibold text-slate-500">{item.description || item.prefix || item.color || "Configuração ativa"}</p>
									</div>
									<div className="flex shrink-0 items-center gap-1.5">
										<span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.active === false ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>
											{item.active === false ? "Inativo" : "Ativo"}
										</span>
										{canConfigure ? (
											<>
												<button type="button" onClick={() => onEdit(section, item)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-700" title="Editar">
													<Edit3 size={14} />
												</button>
												<button type="button" onClick={() => onDelete(section, item)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50" title="Excluir">
													<Trash2 size={14} />
												</button>
											</>
										) : null}
									</div>
								</div>
							))}
						</div>
					</section>
				);
			})}
		</div>
	);
}

function AssetFormModal({ asset, meta, user, onClose, onSaved }) {
	const isEdit = Boolean(asset);
	const [form, setForm] = useState(() => ({
		name: asset?.name || "",
		categoryId: asset?.categoryId || meta?.categories?.[0]?.id || "",
		typeId: asset?.typeId || meta?.types?.[0]?.id || "",
		description: asset?.description || "",
		manufacturer: asset?.manufacturer || "",
		model: asset?.model || "",
		serialNumber: asset?.serialNumber || "",
		patrimony: asset?.patrimony || "",
		assetValue: asset?.assetValue ?? "",
		acquiredAt: asset?.acquiredAt || "",
		companyId: asset?.companyId || "",
		operationScope: asset?.operationScope || user?.operationScopes?.[0] || "ROT",
		regionalId: asset?.regionalId || user?.regionalId || meta?.regionals?.[0]?.id || "",
		statusId: asset?.statusId || "disponivel",
		criticalityId: asset?.criticalityId || "informativo",
		highValue: asset?.highValue || false,
		criticalEquipment: asset?.criticalEquipment || false,
		requiresChecklist: asset?.requiresChecklist || false,
		inspectionFrequency: asset?.inspectionFrequency || "",
		custodyTechnicianId: asset?.custodyTechnicianId || "",
		notes: asset?.notes || "",
	}));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
	const submit = async (event) => {
		event.preventDefault();
		if (!form.name.trim()) {
			setError("Informe o nome do ativo.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			if (isEdit) await updateAssetsSecurityAsset(asset.id, form);
			else await createAssetsSecurityAsset(form);
			onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o ativo.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar ativo" : "Novo ativo"} description="Cadastro operacional com responsabilidade estrutural e custódia atual separadas." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Boxes size={22} /></span>} onClose={onClose} size="5xl">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-5">
				<div className="grid gap-4 md:grid-cols-3">
					<Field label="Nome" className="md:col-span-2"><input value={form.name} onChange={(e) => setField("name", e.target.value)} className="rot-input" autoFocus /></Field>
					<Field label="Operação"><select value={form.operationScope} onChange={(e) => setField("operationScope", e.target.value)} className="rot-input"><option value="ROT">ROT</option><option value="FIELD">FIELD</option><option value="DELIVERY">DELIVERY</option></select></Field>
					<Field label="Categoria"><Select value={form.categoryId} onChange={(v) => setField("categoryId", v)} items={meta?.categories || []} /></Field>
					<Field label="Tipo"><Select value={form.typeId} onChange={(v) => setField("typeId", v)} items={meta?.types || []} /></Field>
					<Field label="Status"><Select value={form.statusId} onChange={(v) => setField("statusId", v)} items={meta?.statuses || []} /></Field>
					<Field label="Criticidade"><Select value={form.criticalityId} onChange={(v) => setField("criticalityId", v)} items={meta?.criticalities || []} /></Field>
					<Field label="Regional"><Select value={form.regionalId} onChange={(v) => setField("regionalId", v)} items={meta?.regionals || []} /></Field>
					<Field label="Empresa"><Select value={form.companyId} onChange={(v) => setField("companyId", v)} items={meta?.companies || []} empty="Sem empresa" /></Field>
					<Field label="Custódia atual"><Select value={form.custodyTechnicianId} onChange={(v) => setField("custodyTechnicianId", v)} items={meta?.technicians || []} empty="Sem técnico" /></Field>
					<Field label="Fabricante"><input value={form.manufacturer} onChange={(e) => setField("manufacturer", e.target.value)} className="rot-input" /></Field>
					<Field label="Modelo"><input value={form.model} onChange={(e) => setField("model", e.target.value)} className="rot-input" /></Field>
					<Field label="Número de série"><input value={form.serialNumber} onChange={(e) => setField("serialNumber", e.target.value)} className="rot-input" /></Field>
					<Field label="Patrimônio"><input value={form.patrimony} onChange={(e) => setField("patrimony", e.target.value)} className="rot-input" /></Field>
					<Field label="Valor"><input type="number" min="0" step="0.01" value={form.assetValue} onChange={(e) => setField("assetValue", e.target.value)} className="rot-input" /></Field>
					<Field label="Aquisição"><input type="date" value={form.acquiredAt || ""} onChange={(e) => setField("acquiredAt", e.target.value)} className="rot-input" /></Field>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<Toggle label="Alto valor" checked={form.highValue} onChange={(value) => setField("highValue", value)} />
					<Toggle label="Equipamento crítico" checked={form.criticalEquipment} onChange={(value) => setField("criticalEquipment", value)} />
					<Toggle label="Exige checklist" checked={form.requiresChecklist} onChange={(value) => setField("requiresChecklist", value)} />
				</div>
				<Field label="Observações"><textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3} className="rot-input min-h-24 py-3" /></Field>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar ativo"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function Select({ value, onChange, items, empty = "Selecione" }) {
	return (
		<select value={value || ""} onChange={(e) => onChange(e.target.value)} className="rot-input">
			<option value="">{empty}</option>
			{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
		</select>
	);
}

function Field({ label, children, className = "" }) {
	return (
		<label className={`block ${className}`}>
			<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
			{children}
		</label>
	);
}

function Toggle({ label, checked, onChange }) {
	return (
		<button type="button" onClick={() => onChange(!checked)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-black transition ${checked ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}>
			<span>{label}</span>
			<span className={`h-5 w-9 rounded-full p-0.5 transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
				<span className={`block h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-4" : ""}`} />
			</span>
		</button>
	);
}

function TimelineModal({ asset, onClose }) {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let active = true;
		fetchAssetsSecurityTimeline(asset.id).then((data) => active && setItems(data)).finally(() => active && setLoading(false));
		return () => { active = false; };
	}, [asset.id]);
	return (
		<ModalShell open title={`Histórico — ${asset.code}`} description={asset.name} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><History size={22} /></span>} onClose={onClose} size="3xl">
			{loading ? <Spinner /> : (
				<div className="space-y-3">
					{items.map((item) => (
						<div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-black text-slate-950">{item.title}</p>
									<p className="text-sm font-semibold text-slate-500">{item.description}</p>
								</div>
								<p className="shrink-0 text-xs font-bold text-slate-400">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
							</div>
							<p className="mt-2 text-xs font-bold text-slate-500">{item.createdByName || "Sistema"}</p>
						</div>
					))}
					{!items.length ? <p className="py-8 text-center text-sm font-bold text-slate-400">Sem eventos registrados.</p> : null}
				</div>
			)}
		</ModalShell>
	);
}

function ConfigModal({ section, item, meta, onClose, onSaved }) {
	const [form, setForm] = useState(() => ({
		id: item?.id || "",
		name: item?.name || "",
		description: item?.description || "",
		color: item?.color || "#2563eb",
		prefix: item?.prefix || "OP-ATV",
		operationScope: item?.operationScope || "",
		categoryId: item?.categoryId || "",
		questions: (item?.questions || [
			defaultChecklistQuestion("Ativo está presente e identificado?"),
			defaultChecklistQuestion("Funcionamento aparente está conforme?"),
			defaultChecklistQuestion("Sem avarias, desgaste ou dano visível?"),
		]).map((question) => ({ ...question, options: normalizeChecklistOptions(question.options) })),
	}));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const submit = async (event) => {
		event.preventDefault();
		if (!form.name.trim()) {
			setError("Informe o nome.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			if (section.kind === "checklists") {
				const questions = form.questions
					.map((question) => ({
						...question,
						type: "single_choice",
						options: normalizeChecklistOptions(question.options),
					}))
					.filter((question) => String(question.label || "").trim());
				if (!questions.length) throw new Error("Informe pelo menos uma pergunta.");
				if (questions.some((question) => !question.options.length)) throw new Error("Cada pergunta precisa ter pelo menos uma resposta.");
				await createAssetsSecurityChecklistTemplate({ name: form.name, description: form.description, questions });
			} else {
				const payload = buildConfigPayload(section.kind, form);
				await upsertAssetsSecurityConfig(section.kind, payload);
			}
			onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a configuração.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell open title={section.title} description={section.subtitle} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Cog size={22} /></span>} onClose={onClose} size={section.kind === "checklists" ? "5xl" : "md"}>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<Field label="Nome"><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} className="rot-input" autoFocus /></Field>
				{section.kind === "types" ? <Field label="Categoria"><Select value={form.categoryId} onChange={(v) => setForm((c) => ({ ...c, categoryId: v }))} items={meta?.categories || []} /></Field> : null}
				{section.kind === "statuses" || section.kind === "criticalities" ? <Field label="Cor"><input type="color" value={form.color} onChange={(e) => setForm((c) => ({ ...c, color: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-2" /></Field> : null}
				{section.kind === "codePatterns" ? (
					<>
						<Field label="Prefixo"><input value={form.prefix} onChange={(e) => setForm((c) => ({ ...c, prefix: e.target.value.toUpperCase() }))} className="rot-input" /></Field>
						<Field label="Operação"><select value={form.operationScope} onChange={(e) => setForm((c) => ({ ...c, operationScope: e.target.value }))} className="rot-input"><option value="">Todas</option><option value="ROT">ROT</option><option value="FIELD">FIELD</option><option value="DELIVERY">DELIVERY</option></select></Field>
					</>
				) : <Field label="Descrição"><textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} className="rot-input min-h-24 py-3" /></Field>}
				{section.kind === "checklists" ? (
					<div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex items-center justify-between gap-3">
							<p className="text-xs font-black uppercase text-slate-500">Perguntas do checklist</p>
							<button type="button" onClick={() => setForm((c) => ({ ...c, questions: [...c.questions, defaultChecklistQuestion()] }))} className="rot-btn-tactile inline-flex h-8 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-black text-white">
								<Plus size={13} /> Pergunta
							</button>
						</div>
						{form.questions.map((question, index) => (
							<div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
								<div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
									<div className="space-y-3">
										<Field label={`Pergunta ${index + 1}`}>
											<textarea value={question.label} onChange={(e) => setForm((c) => ({ ...c, questions: c.questions.map((itemQuestion, itemIndex) => itemIndex === index ? { ...itemQuestion, label: e.target.value } : itemQuestion) }))} className="rot-input min-h-24 py-3" placeholder="Descreva o item que será avaliado" />
										</Field>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<label className="flex items-center gap-2 text-xs font-black text-slate-600">
												<input type="checkbox" checked={question.required !== false} onChange={(e) => setForm((c) => ({ ...c, questions: c.questions.map((itemQuestion, itemIndex) => itemIndex === index ? { ...itemQuestion, required: e.target.checked } : itemQuestion) }))} />
												Obrigatória
											</label>
											<button type="button" onClick={() => setForm((c) => ({ ...c, questions: c.questions.filter((_, itemIndex) => itemIndex !== index) }))} className="rot-btn-tactile inline-flex h-9 items-center gap-1 rounded-xl border border-red-200 px-3 text-xs font-black text-red-600">
												<Trash2 size={14} /> Remover pergunta
											</button>
										</div>
									</div>
									<div className="space-y-2">
										<div className="flex items-center justify-between gap-2">
											<p className="text-xs font-black uppercase text-slate-500">Respostas possíveis</p>
											<button type="button" onClick={() => setForm((c) => ({ ...c, questions: c.questions.map((itemQuestion, itemIndex) => itemIndex === index ? { ...itemQuestion, options: [...normalizeChecklistOptions(itemQuestion.options), { label: "", value: "", status: "" }] } : itemQuestion) }))} className="rot-btn-tactile inline-flex h-8 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-700">
												<Plus size={13} /> Resposta
											</button>
										</div>
										{normalizeChecklistOptions(question.options, { keepBlank: true }).map((option, optionIndex) => (
											<div key={optionIndex} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2 md:grid-cols-[1fr_150px_auto] md:items-center">
												<input value={option.label} onChange={(e) => setForm((c) => ({ ...c, questions: c.questions.map((itemQuestion, itemIndex) => {
													if (itemIndex !== index) return itemQuestion;
													const options = normalizeChecklistOptions(itemQuestion.options, { keepBlank: true }).map((itemOption, itemOptionIndex) => itemOptionIndex === optionIndex ? { ...itemOption, label: e.target.value, value: e.target.value } : itemOption);
													return { ...itemQuestion, options };
												}) }))} className="rot-input h-10" placeholder={`Resposta ${optionIndex + 1}`} />
												<select value={option.status || ""} onChange={(e) => setForm((c) => ({ ...c, questions: c.questions.map((itemQuestion, itemIndex) => {
													if (itemIndex !== index) return itemQuestion;
													const options = normalizeChecklistOptions(itemQuestion.options, { keepBlank: true }).map((itemOption, itemOptionIndex) => itemOptionIndex === optionIndex ? { ...itemOption, status: e.target.value } : itemOption);
													return { ...itemQuestion, options };
												}) }))} className="rot-input h-10">
													<option value="">Neutra</option>
													<option value="OK">Conforme</option>
													<option value="N-OK">N-OK / Bloqueia</option>
												</select>
										<button type="button" onClick={() => setForm((c) => ({ ...c, questions: c.questions.map((itemQuestion, itemIndex) => itemIndex === index ? { ...itemQuestion, options: normalizeChecklistOptions(itemQuestion.options, { keepBlank: true }).filter((_, itemOptionIndex) => itemOptionIndex !== optionIndex) } : itemQuestion) }))} className="rot-btn-tactile inline-flex h-10 items-center justify-center rounded-xl border border-red-200 px-3 text-xs font-black text-red-600">
													<Trash2 size={14} />
												</button>
											</div>
										))}
										<p className="text-xs font-bold text-slate-500">Marque respostas críticas como N-OK para bloquear o ativo e gerar ocorrência automaticamente.</p>
									</div>
								</div>
							</div>
						))}
					</div>
				) : null}
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function buildConfigPayload(kind, form) {
	const base = form.id ? { id: form.id } : {};
	if (kind === "statuses") return { ...base, name: form.name, color: form.color, blocksUse: false, blocksTransfer: false, sortOrder: 99, active: true };
	if (kind === "criticalities") return { ...base, name: form.name, color: form.color, weight: 99, actions: {}, active: true };
	if (kind === "types") return { ...base, name: form.name, categoryId: form.categoryId || null, description: form.description, requiresChecklist: false, active: true };
	if (kind === "codePatterns") return { ...base, name: form.name, prefix: form.prefix, padding: 6, nextNumber: 1, operationScope: form.operationScope || null, active: true };
	return { ...base, name: form.name, description: form.description, active: true };
}

function ChecklistPanel({ templates, assets, onRun }) {
	return (
		<div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ClipboardCheck size={22} /></span>
					<div>
						<h2 className="text-lg font-black text-slate-950">Modelos de checklist</h2>
						<p className="text-sm font-semibold text-slate-500">Itens obrigatórios, resultado OK/N-OK e bloqueio automático.</p>
					</div>
				</div>
				<div className="mt-4 space-y-3">
					{templates.map((template) => (
						<div key={template.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-black text-slate-950">{template.name}</p>
									<p className="text-xs font-bold text-slate-500">{template.description || "Checklist operacional"}</p>
								</div>
								<span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">v{template.versionNumber || 1}</span>
							</div>
							<p className="mt-3 text-xs font-bold text-slate-500">{template.questions?.length || 0} pergunta(s)</p>
						</div>
					))}
					{!templates.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">Nenhum modelo ativo.</p> : null}
				</div>
			</section>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<h2 className="text-lg font-black text-slate-950">Executar checklist rápido</h2>
				<p className="text-sm font-semibold text-slate-500">Selecione um ativo para registrar inspeção, conformidade ou N-OK.</p>
				<div className="mt-4 grid gap-3 md:grid-cols-2">
					{assets.slice(0, 12).map((asset) => (
						<button key={asset.id} type="button" onClick={() => onRun(asset)} className="rot-btn-tactile rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50">
							<p className="font-mono text-xs font-black text-blue-600">{asset.code}</p>
							<p className="mt-1 truncate text-sm font-black text-slate-950">{asset.name}</p>
							<p className="mt-1 text-xs font-bold text-slate-500">{asset.statusName || "Status"} · {asset.custodyTechnicianName || "Sem custódia"}</p>
						</button>
					))}
				</div>
			</section>
		</div>
	);
}

function TransferPanel({ items }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Shuffle size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Transferências</h2>
					<p className="text-sm font-semibold text-slate-500">Cadeia de custódia entre técnicos, aceite e condição do ativo.</p>
				</div>
			</div>
			<div className="mt-5 grid gap-3 xl:grid-cols-2">
				{items.map((item) => (
					<article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="font-mono text-xs font-black text-blue-600">{item.code}</p>
								<h3 className="mt-1 truncate text-base font-black text-slate-950">{item.asset_name}</h3>
								<p className="mt-1 text-sm font-bold text-slate-500">{item.from_technician_name || "Sem origem"} → {item.to_technician_name || "Sem destino"}</p>
							</div>
							<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${item.status === "PENDING_ACCEPTANCE" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{item.status === "PENDING_ACCEPTANCE" ? "Aguardando aceite" : "Concluída"}</span>
						</div>
						<div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
							<MiniInfo label="Condição" value={item.condition || "Não informada"} />
							<MiniInfo label="Solicitada por" value={item.requested_by_name || "Sistema"} />
						</div>
						<p className="mt-3 text-xs font-bold text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-"}</p>
					</article>
				))}
				{!items.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400 xl:col-span-2">Nenhuma transferência registrada.</p> : null}
			</div>
		</section>
	);
}

function ReturnPanel({ items }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Undo2 size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Devoluções</h2>
					<p className="text-sm font-semibold text-slate-500">Histórico de retorno de ativos, destino operacional e problemas informados.</p>
				</div>
			</div>
			<div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
				<table className="w-full min-w-[760px] text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
						<tr><th className="px-4 py-3">Ativo</th><th className="px-4 py-3">Técnico</th><th className="px-4 py-3">Destino</th><th className="px-4 py-3">Condição</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data</th></tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{items.map((item) => (
							<tr key={item.id}>
								<td className="px-4 py-3 font-black text-slate-900">{item.code} · {item.asset_name}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{item.from_technician_name || "Sem técnico"}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{item.destination_status_name || "Disponível"}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{item.condition || "-"}</td>
								<td className="px-4 py-3 font-black text-slate-700">{item.status}</td>
								<td className="px-4 py-3 font-bold text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-"}</td>
							</tr>
						))}
					</tbody>
				</table>
				{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma devolução registrada.</p> : null}
			</div>
		</section>
	);
}

function BlockPanel({ items, onRelease }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Lock size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Ativos bloqueados</h2>
					<p className="text-sm font-semibold text-slate-500">Bloqueios manuais ou automáticos por N-OK, ocorrência ou manutenção.</p>
				</div>
			</div>
			<div className="mt-5 grid gap-3 xl:grid-cols-2">
				{items.map((item) => (
					<article key={item.id} className={`rounded-2xl border p-4 ${item.active ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50 opacity-80"}`}>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-mono text-xs font-black text-red-600">{item.code}</p>
								<h3 className="mt-1 text-base font-black text-slate-950">{item.asset_name}</h3>
								<p className="mt-1 text-sm font-semibold text-slate-600">{item.reason}</p>
							</div>
							<span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.active ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.active ? "Bloqueado" : "Liberado"}</span>
						</div>
						<p className="mt-3 text-xs font-bold text-slate-500">Por {item.blocked_by_name || "Sistema"} em {item.blocked_at ? new Date(item.blocked_at).toLocaleString("pt-BR") : "-"}</p>
						{item.active ? (
							<button type="button" onClick={() => onRelease({ id: item.asset_id, code: item.code, name: item.asset_name })} className="rot-btn-tactile mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white">
								<Unlock size={14} /> Liberar ativo
							</button>
						) : null}
					</article>
				))}
				{!items.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400 xl:col-span-2">Nenhum bloqueio registrado.</p> : null}
			</div>
		</section>
	);
}

function OccurrencePanel({ items }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><AlertTriangle size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Ocorrências de ativos</h2>
					<p className="text-sm font-semibold text-slate-500">Problemas reportados, N-OK em checklist e bloqueios por risco.</p>
				</div>
			</div>
			<div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
				<table className="w-full min-w-[760px] text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
						<tr><th className="px-4 py-3">Ativo</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Criticidade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aberta por</th><th className="px-4 py-3">Data</th></tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{items.map((item) => (
							<tr key={item.id}>
								<td className="px-4 py-3 font-black text-slate-900">{item.code} · {item.asset_name}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{item.type}</td>
								<td className="px-4 py-3"><span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: `${item.criticality_color || "#f59e0b"}18`, color: item.criticality_color || "#f59e0b" }}>{item.criticality_name || "Atenção"}</span></td>
								<td className="px-4 py-3 font-black text-slate-700">{item.status}</td>
								<td className="px-4 py-3 font-bold text-slate-500">{item.opened_by_name || "Sistema"}</td>
								<td className="px-4 py-3 font-bold text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-"}</td>
							</tr>
						))}
					</tbody>
				</table>
				{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma ocorrência registrada.</p> : null}
			</div>
		</section>
	);
}

function MaintenancePanel({ items, onUpdate }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><Wrench size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Ordens de manutenção</h2>
					<p className="text-sm font-semibold text-slate-500">Controle de equipamentos indisponíveis, reparos e liberação.</p>
				</div>
			</div>
			<div className="mt-5 grid gap-3 xl:grid-cols-2">
				{items.map((item) => (
					<article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-mono text-xs font-black text-purple-600">{item.code}</p>
								<h3 className="mt-1 text-base font-black text-slate-950">{item.asset_name}</h3>
								{item.asset_code ? <p className="mt-0.5 text-xs font-black text-slate-400">{item.asset_code}</p> : null}
								<p className="mt-1 text-sm font-semibold text-slate-500">{item.description}</p>
							</div>
							<span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700">{item.status}</span>
						</div>
						<div className="mt-4 flex flex-wrap gap-2">
							<button type="button" onClick={() => downloadMaintenanceOrderPdf(item)} className="rot-btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
								<Download size={14} /> PDF
							</button>
							<button type="button" onClick={() => onUpdate(item, "EM_MANUTENCAO")} className="rot-btn-tactile rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Em andamento</button>
							<button type="button" onClick={() => onUpdate(item, "LIBERADO")} className="rot-btn-tactile rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Liberar</button>
							<button type="button" onClick={() => onUpdate(item, "CANCELADO")} className="rot-btn-tactile rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700">Cancelar</button>
						</div>
					</article>
				))}
				{!items.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400 xl:col-span-2">Nenhuma ordem de manutenção aberta.</p> : null}
			</div>
		</section>
	);
}

function AssetActionModal({ kind, asset, meta, templates, onClose, onSaved }) {
	const template = templates[0] || null;
	const [templateId, setTemplateId] = useState(template?.id || "");
	const selectedTemplate = templates.find((item) => item.id === templateId) || template;
	const [answers, setAnswers] = useState(() => defaultAnswers(selectedTemplate));
	const [form, setForm] = useState({
		toTechnicianId: "",
		destinationStatusId: "disponivel",
		condition: "OK",
		type: "Problema reportado",
		criticalityId: asset?.criticalityId || "atencao",
		description: "",
		reason: "",
		notes: "",
		problems: "",
		blockAsset: true,
		requiresAcceptance: Boolean(asset?.highValue),
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [imageCount, setImageCount] = useState(0);

	useEffect(() => {
		setAnswers(defaultAnswers(selectedTemplate));
	}, [selectedTemplate?.id]);

	const titleByKind = {
		checklist: "Executar checklist",
		transfer: "Transferir ativo",
		return: "Devolver ativo",
		problem: "Reportar problema",
		block: "Bloquear ativo",
		release: "Liberar ativo",
		maintenance: "Abrir manutenção",
	};
	const iconByKind = {
		checklist: ClipboardCheck,
		transfer: Shuffle,
		return: Undo2,
		problem: AlertTriangle,
		block: Lock,
		release: Unlock,
		maintenance: Wrench,
	};
	const Icon = iconByKind[kind] || ShieldCheck;
	const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
	const setAnswer = (questionId, option) => setAnswers((current) => current.map((answer) => answer.questionId === questionId ? { ...answer, value: option.value || option.label, label: option.label, status: option.status || "" } : answer));

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			const evidence = [{ entityType: "ASSET", entityId: asset.id, images: imageCount }];
			if (kind === "checklist") await executeAssetsSecurityChecklist(asset.id, { templateId, answers, observation: form.notes, evidence });
			if (kind === "transfer") await transferAssetsSecurityAsset(asset.id, { toTechnicianId: form.toTechnicianId, condition: form.condition, reason: form.reason, notes: form.notes, requiresAcceptance: form.requiresAcceptance, evidence });
			if (kind === "return") await returnAssetsSecurityAsset(asset.id, { destinationStatusId: form.destinationStatusId, condition: form.condition, problems: form.problems, notes: form.notes, evidence });
			if (kind === "problem") await reportAssetsSecurityProblem(asset.id, { type: form.type, description: form.description, criticalityId: form.criticalityId, blockAsset: form.blockAsset, evidence });
			if (kind === "block") await blockAssetsSecurityAsset(asset.id, { reason: form.reason, evidence });
			if (kind === "release") await releaseAssetsSecurityAsset(asset.id, { notes: form.notes });
			if (kind === "maintenance") await createAssetsSecurityMaintenance(asset.id, { description: form.description, criticalityId: form.criticalityId, evidence });
			onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível concluir a ação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={titleByKind[kind] || "Ação do ativo"} description={`${asset.code} · ${asset.name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon size={22} /></span>} onClose={onClose} size="3xl">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				{kind === "checklist" ? (
					<>
						<Field label="Modelo"><Select value={templateId} onChange={setTemplateId} items={templates} /></Field>
						<div className="space-y-3">
							{(selectedTemplate?.questions || []).map((question) => {
								const current = answers.find((answer) => answer.questionId === question.id)?.label || "";
								const options = normalizeChecklistOptions(question.options);
								return (
									<div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
										<p className="text-sm font-black text-slate-900">{question.label}</p>
										<div className="mt-3 flex flex-wrap gap-2">
											{options.map((option) => (
												<button key={`${question.id}-${option.label}`} type="button" onClick={() => setAnswer(question.id, option)} className={`rot-btn-tactile rounded-xl px-3 py-2 text-xs font-black ${current === option.label ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{option.label}</button>
											))}
										</div>
									</div>
								);
							})}
						</div>
						<Field label="Observações"><textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3} className="rot-input min-h-24 py-3" /></Field>
					</>
				) : null}
				{kind === "transfer" ? (
					<>
						<Field label="Novo responsável"><Select value={form.toTechnicianId} onChange={(v) => setField("toTechnicianId", v)} items={meta?.technicians || []} empty="Selecione o técnico" /></Field>
						<Field label="Condição na transferência"><input value={form.condition} onChange={(e) => setField("condition", e.target.value)} className="rot-input" /></Field>
						<Toggle label="Exigir aceite do recebedor" checked={form.requiresAcceptance} onChange={(value) => setField("requiresAcceptance", value)} />
						<Field label="Motivo"><textarea value={form.reason} onChange={(e) => setField("reason", e.target.value)} rows={2} className="rot-input min-h-20 py-3" /></Field>
					</>
				) : null}
				{kind === "return" ? (
					<>
						<Field label="Status de destino"><Select value={form.destinationStatusId} onChange={(v) => setField("destinationStatusId", v)} items={meta?.statuses || []} /></Field>
						<Field label="Condição na devolução"><input value={form.condition} onChange={(e) => setField("condition", e.target.value)} className="rot-input" /></Field>
						<Field label="Problemas encontrados"><textarea value={form.problems} onChange={(e) => setField("problems", e.target.value)} rows={3} className="rot-input min-h-24 py-3" /></Field>
					</>
				) : null}
				{kind === "problem" || kind === "maintenance" ? (
					<>
						{kind === "problem" ? <Field label="Tipo"><input value={form.type} onChange={(e) => setField("type", e.target.value)} className="rot-input" /></Field> : null}
						<Field label={kind === "maintenance" ? "Descrição da manutenção" : "Descrição do problema"}><textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={4} className="rot-input min-h-28 py-3" required /></Field>
						<Field label="Criticidade"><Select value={form.criticalityId} onChange={(v) => setField("criticalityId", v)} items={meta?.criticalities || []} /></Field>
						{kind === "problem" ? <Toggle label="Bloquear ativo imediatamente" checked={form.blockAsset} onChange={(value) => setField("blockAsset", value)} /> : null}
					</>
				) : null}
				{kind === "block" ? <Field label="Motivo do bloqueio"><textarea value={form.reason} onChange={(e) => setField("reason", e.target.value)} rows={4} className="rot-input min-h-28 py-3" required /></Field> : null}
				{kind === "release" ? <Field label="Observação de liberação"><textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={4} className="rot-input min-h-28 py-3" /></Field> : null}
				{kind !== "release" ? <ImageUploader entityType="ASSET" entityId={asset.id} onCountChange={setImageCount} /> : null}
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Salvando..." : "Confirmar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function defaultAnswers(template) {
	return (template?.questions || []).map((question) => ({
		questionId: question.id,
		value: normalizeChecklistOptions(question.options)[0]?.value || "OK",
		label: normalizeChecklistOptions(question.options)[0]?.label || "OK",
		status: normalizeChecklistOptions(question.options)[0]?.status || "OK",
	}));
}

function Placeholder({ icon: Icon, title, text }) {
	return (
		<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
			<span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon size={26} /></span>
			<h2 className="mt-4 text-xl font-black text-slate-950">{title}</h2>
			<p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-slate-500">{text}</p>
		</section>
	);
}

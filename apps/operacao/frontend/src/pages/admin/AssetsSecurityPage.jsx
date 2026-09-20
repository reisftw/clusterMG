import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	AlertTriangle,
	Boxes,
	CheckCircle2,
	ChevronRight,
	ClipboardCheck,
	Cog,
	Download,
	Edit3,
	Eye,
	History,
	Lock,
	PackageCheck,
	Plus,
	QrCode,
	RefreshCw,
	Trash2,
	ShieldCheck,
	Shuffle,
	Undo2,
	Unlock,
	Wallet,
	Wrench,
	X,
	XCircle,
} from "lucide-react";
import {
	blockAssetsSecurityAsset,
	checkoutAssetsSecurityAsset,
	createAssetsSecurityAsset,
	createAssetsSecurityChecklistTemplate,
	createAssetsSecurityMaintenance,
	declineAssetsSecurityTransfer,
	deleteAssetsSecurityChecklistTemplate,
	deleteAssetsSecurityConfig,
	deleteAssetsSecurityAsset,
	executeAssetsSecurityChecklist,
	fetchAssetsSecurityAssets,
	fetchAssetsSecurityChecklistExecution,
	fetchAssetsSecurityChecklistExecutions,
	fetchAssetsSecurityChecklistTemplates,
	fetchAssetsSecurityChecklistsPendingForMe,
	fetchAssetsSecurityDashboard,
	fetchAssetsSecurityBlocks,
	fetchAssetsSecurityMeta,
	fetchAssetsSecurityMaintenance,
	fetchAssetsSecurityOccurrences,
	fetchAssetsSecurityReturns,
	fetchAssetsSecurityTransfers,
	fetchAssetsSecurityTimeline,
	fetchRotAttachments,
	releaseAssetsSecurityAsset,
	reportAssetsSecurityProblem,
	returnAssetsSecurityAsset,
	transferAssetsSecurityAsset,
	updateAssetsSecurityAsset,
	updateAssetsSecurityChecklistTemplate,
	updateAssetsSecurityMaintenance,
	updateAssetsSecurityTransfer,
	upsertAssetsSecurityConfig,
} from "../../api/rotApi";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import Field from "../../components/ui/Field";
import ModalShell from "../../components/ui/ModalShell";
import SearchableSelect from "../../components/ui/SearchableSelect";
import Select from "../../components/ui/Select";
import Spinner from "../../components/ui/Spinner";
import Toggle from "../../components/ui/Toggle";
import ToggleCard from "../../components/ui/ToggleCard";
import ImageUploader from "../../components/ImageUploader";
import { useRotAuth } from "../../state/useRotAuth";

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

function formatRelativeTime(date) {
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "poucos segundos";
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

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
	const canTransfer = hasPermission("ativos.transferir");
	const canReturn = hasPermission("ativos.devolver");
	const canReportProblem = hasPermission("ocorrencias.criar");
	const canBlock = hasPermission("ativos.bloquear");
	const canRelease = hasPermission("ativos.liberar");
	const canMaintain = hasPermission("manutencoes.criar");
	const [searchParams, setSearchParams] = useSearchParams();
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
	const [pendingChecklists, setPendingChecklists] = useState([]);
	const [total, setTotal] = useState(0);
	const [filters, setFilters] = useState({ q: "", operationScope: "", statusId: "" });
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
	const [error, setError] = useState("");
	const [assetModal, setAssetModal] = useState(null);
	const [timelineModal, setTimelineModal] = useState(null);
	const [configModal, setConfigModal] = useState(null);
	const [actionModal, setActionModal] = useState(null);

	const load = async ({ silent } = {}) => {
		if (silent) setRefreshing(true);
		else setLoading(true);
		setError("");
		try {
			const [metaData, dashData, assetsData, templateData, occurrenceData, maintenanceData, transferData, returnData, blockData, pendingChecklistData] = await Promise.all([
				fetchAssetsSecurityMeta(),
				fetchAssetsSecurityDashboard().catch(() => null),
				fetchAssetsSecurityAssets({ ...filters, limit: 60 }),
				fetchAssetsSecurityChecklistTemplates().catch(() => []),
				fetchAssetsSecurityOccurrences().catch(() => []),
				fetchAssetsSecurityMaintenance().catch(() => []),
				fetchAssetsSecurityTransfers().catch(() => []),
				fetchAssetsSecurityReturns().catch(() => []),
				fetchAssetsSecurityBlocks().catch(() => []),
				fetchAssetsSecurityChecklistsPendingForMe().catch(() => []),
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
			setPendingChecklists(pendingChecklistData || []);
			setTotal(assetsData.total || 0);
			setLastUpdatedAt(new Date());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar Ativos & Segurança.");
		} finally {
			if (silent) setRefreshing(false);
			else setLoading(false);
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
							<p className="text-sm font-semibold text-slate-500">Controle patrimonial, segurança, inspeções e movimentações operacionais.</p>
							{lastUpdatedAt ? <p className="mt-0.5 text-xs font-semibold text-slate-400">Atualizado há {formatRelativeTime(lastUpdatedAt)}</p> : null}
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => load({ silent: true })} disabled={refreshing} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
							<RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Atualizando..." : "Atualizar"}
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

			{currentTab === "visao-geral" && hasPermission("ativos.dashboard.visualizar") ? <Overview dashboard={dashboard} assets={assets} setSearchParams={setSearchParams} /> : null}
			{currentTab === "ativos" ? (
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
					canTransfer={canTransfer}
					canReturn={canReturn}
					canReportProblem={canReportProblem}
					canBlock={canBlock}
					canRelease={canRelease}
					canMaintain={canMaintain}
					onEdit={(asset) => setAssetModal({ asset })}
					onTimeline={(asset) => setTimelineModal({ asset })}
					onAction={(kind, asset) => setActionModal({ kind, asset })}
					onDelete={async (asset) => {
						if (!window.confirm(`Inativar o ativo ${asset.code}? O histórico será preservado.`)) return;
						await deleteAssetsSecurityAsset(asset.id);
						await load();
					}}
					onCheckout={async (asset) => {
						if (!window.confirm(`Resgatar "${asset.name}" (${asset.code}) para sua custódia?`)) return;
						try {
							await checkoutAssetsSecurityAsset(asset.id);
							await load();
						} catch (err) {
							window.alert(err?.message || "Não foi possível resgatar este ativo.");
						}
					}}
				/>
			) : null}
			{currentTab === "checklists" ? (canConfigure ? <ChecklistManagementPanel /> : <ChecklistPanel items={pendingChecklists} onRun={(asset) => setActionModal({ kind: "checklist", asset })} />) : null}
			{currentTab === "transferencias" ? <TransferPanel items={transfers} meta={meta} onChanged={load} /> : null}
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
					onEditChecklist={(template) => setConfigModal({ section: { kind: "checklists", title: "Editar checklist", subtitle: "Altere perguntas e respostas do modelo. Uma nova versão é publicada." }, item: template })}
					onDeleteChecklist={async (template) => {
						if (!window.confirm(`Excluir o checklist "${template.name}"? Ativos que já usam ele como padrão precisarão de um novo modelo.`)) return;
						await deleteAssetsSecurityChecklistTemplate(template.id);
						await load();
					}}
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
					templates={templates}
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

function InfoTip({ text }) {
	return <span title={text} tabIndex={0} className="cursor-help text-slate-300 hover:text-slate-500 focus-visible:text-slate-500" aria-label={text}>ⓘ</span>;
}

function goToAssetsTab(setSearchParams, tab) {
	setSearchParams((current) => {
		const next = new URLSearchParams(current);
		next.set("tab", tab);
		return next;
	});
}

function AttentionRow({ ok, label, okLabel, count, onGo, goLabel, severity }) {
	if (ok) {
		return (
			<div className="flex items-center gap-2 py-1.5 text-sm font-bold text-emerald-700">
				<CheckCircle2 size={15} className="shrink-0" /> {okLabel}
			</div>
		);
	}
	const toneClass = severity === "critico" ? "text-red-700" : severity === "atencao" ? "text-amber-700" : "text-blue-700";
	const IconTag = severity === "critico" ? XCircle : AlertTriangle;
	return (
		<div className="flex items-center justify-between gap-2 py-1.5">
			<span className={`flex items-center gap-2 text-sm font-bold ${toneClass}`}>
				<IconTag size={15} className="shrink-0" /> {count} {label}
			</span>
			{onGo ? (
				<button type="button" onClick={onGo} className="rot-btn-tactile inline-flex items-center gap-0.5 text-xs font-black text-blue-600 hover:text-blue-700">
					{goLabel} <ChevronRight size={13} />
				</button>
			) : null}
		</div>
	);
}

function Overview({ dashboard, assets, setSearchParams }) {
	const summary = dashboard?.summary || {};
	const total = summary.total || 0;
	const inUse = summary.inUse || 0;
	const available = summary.available || 0;
	const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
	const [distributionDimension, setDistributionDimension] = useState("regional");
	const distributionItems = distributionDimension === "base" ? (dashboard?.byBase || []) : (dashboard?.byRegional || []);
	const distributionTotal = Math.max(1, distributionItems.reduce((sum, item) => sum + item.total, 0));

	const attentionItems = [
		{ key: "blocked", count: summary.blocked || 0, label: "ativo(s) bloqueado(s)", okLabel: "Nenhum ativo bloqueado", severity: "critico", tab: "bloqueados", goLabel: "Ver bloqueados" },
		{ key: "overdue", count: summary.overdueInspections || 0, label: "inspeção(ões) vencida(s)", okLabel: "Nenhuma inspeção vencida", severity: "atencao" },
		{ key: "occurrences", count: summary.openOccurrences || 0, label: "ocorrência(s) aberta(s)", okLabel: "Nenhuma ocorrência aberta", severity: "atencao", tab: "ocorrencias", goLabel: "Ver ocorrências" },
		{ key: "maintenance", count: summary.openMaintenance || 0, label: "manutenção(ões) aberta(s)", okLabel: "Nenhuma manutenção aberta", severity: "atencao", tab: "manutencoes", goLabel: "Ver manutenções" },
		{ key: "nok", count: summary.nokToday || 0, label: "checklist(s) N-OK hoje", okLabel: "Nenhum N-OK hoje", severity: "critico" },
		{ key: "pending", count: summary.pendingTransfers || 0, label: "aceite(s) pendente(s)", okLabel: "Nenhum aceite pendente", severity: "pendente", tab: "transferencias", goLabel: "Ver transferências" },
	];
	const allClear = attentionItems.every((item) => !item.count);

	const hasChecklistsToday = (summary.checklistsToday || 0) > 0;

	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<div className="flex items-center justify-between gap-3">
						<span className={`flex h-10 w-10 items-center justify-center rounded-xl ${KPI_TONES.blue}`}><Boxes size={18} /></span>
					</div>
					<p className="mt-3 text-2xl font-black text-slate-950">{total}</p>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">Ativos totais</p>
					<p className="mt-0.5 text-[11px] font-semibold text-slate-400">Equipamentos cadastrados</p>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<span className={`flex h-10 w-10 items-center justify-center rounded-xl ${KPI_TONES.emerald}`}><CheckCircle2 size={18} /></span>
					<p className="mt-3 text-2xl font-black text-slate-950">{inUse}</p>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">Em uso</p>
					<p className="mt-0.5 text-[11px] font-semibold text-slate-400">{total ? `${pct(inUse)}% da base` : "Sem ativos cadastrados"}</p>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<span className={`flex h-10 w-10 items-center justify-center rounded-xl ${KPI_TONES.blue}`}><ShieldCheck size={18} /></span>
					<p className="mt-3 text-2xl font-black text-slate-950">{available}</p>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">Disponíveis</p>
					<p className="mt-0.5 text-[11px] font-semibold text-slate-400">{total ? `${pct(available)}% da base` : "Sem ativos cadastrados"}</p>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<span className={`flex h-10 w-10 items-center justify-center rounded-xl ${KPI_TONES.slate}`}><Wallet size={18} /></span>
					<p className="mt-3 text-2xl font-black text-slate-950">{formatCurrency(summary.totalValue)}</p>
					<p className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-500">Valor patrimonial <InfoTip text="Soma do valor cadastrado dos ativos, considerando os filtros atuais." /></p>
					<p className="mt-0.5 text-[11px] font-semibold text-slate-400">Soma dos ativos com valor informado</p>
				</div>
			</div>

			<div className="grid gap-5 xl:grid-cols-2">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Atenções</h2>
					<p className="text-xs font-semibold text-slate-500">Pendências e situações que podem exigir atuação.</p>
					{allClear ? (
						<div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
							<p className="flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={16} /> Tudo certo por aqui</p>
							<p className="mt-1 text-xs font-semibold text-emerald-600">Nenhum bloqueio, inspeção vencida, ocorrência ou manutenção pendente nos filtros atuais.</p>
						</div>
					) : (
						<div className="mt-3 divide-y divide-slate-100">
							{attentionItems.map((item) => (
								<AttentionRow
									key={item.key}
									ok={!item.count}
									count={item.count}
									label={item.label}
									okLabel={item.okLabel}
									severity={item.severity}
									goLabel={item.goLabel}
									onGo={item.tab ? () => goToAssetsTab(setSearchParams, item.tab) : null}
								/>
							))}
						</div>
					)}
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Operação hoje</h2>
					<p className="text-xs font-semibold text-slate-500">Movimentações e controles realizados no dia.</p>
					<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{[
							{ label: "Checklists", value: summary.checklistsToday || 0 },
							{ label: "Transferências", value: summary.transfersToday || 0 },
							{ label: "Devoluções", value: summary.returnsToday || 0 },
							{ label: "N-OK", value: summary.nokToday || 0, danger: (summary.nokToday || 0) > 0 },
						].map((metric) => (
							<div key={metric.label} className="text-center">
								<p className={`text-2xl font-black ${metric.danger ? "text-red-600" : "text-slate-950"}`}>{metric.value}</p>
								<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{metric.label}</p>
							</div>
						))}
					</div>
					<div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
						<span className="flex items-center gap-1 text-xs font-black uppercase text-slate-500">Conformidade <InfoTip text="Percentual de checklists concluídos hoje sem não conformidade (N-OK)." /></span>
						<span className="text-sm font-black text-slate-900">{hasChecklistsToday ? `${summary.conformityRateToday || 0}%` : "Sem dados"}</span>
					</div>
				</section>
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-lg font-black text-slate-950">Distribuição dos ativos</h2>
					<div className="flex gap-1 rounded-xl border border-slate-200 p-1">
						<button type="button" onClick={() => setDistributionDimension("regional")} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${distributionDimension === "regional" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Regional</button>
						<button type="button" onClick={() => setDistributionDimension("base")} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${distributionDimension === "base" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Base</button>
					</div>
				</div>
				<div className="mt-4 space-y-3">
					{distributionItems.length ? distributionItems.map((item) => (
						<div key={item.name}>
							<div className="mb-1 flex justify-between text-xs font-black uppercase text-slate-500">
								<span>{item.name}</span>
								<span>{item.total} · {Math.round((item.total / distributionTotal) * 100)}%</span>
							</div>
							<div className="h-3 overflow-hidden rounded-full bg-slate-100">
								<div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (item.total / distributionTotal) * 100)}%` }} />
							</div>
						</div>
					)) : <p className="text-sm font-semibold text-slate-400">Nenhum ativo encontrado para os filtros selecionados.</p>}
				</div>
			</section>

			<div className="grid gap-5 xl:grid-cols-2">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Status dos ativos</h2>
					<div className="mt-4 space-y-2.5">
						{[
							{ label: "Disponível", value: available, color: "#2563eb" },
							{ label: "Em uso", value: inUse, color: "#059669" },
							{ label: "Manutenção", value: summary.inMaintenance || 0, color: "#d97706" },
							{ label: "Bloqueado", value: summary.blocked || 0, color: "#dc2626" },
						].map((row) => (
							<div key={row.label} className="flex items-center justify-between text-sm">
								<span className="flex items-center gap-2 font-bold text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} /> {row.label}</span>
								<span className="font-black text-slate-900">{row.value}</span>
							</div>
						))}
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
					<h2 className="text-lg font-black text-slate-950">Patrimônio</h2>
					<p className="mt-3 text-2xl font-black text-slate-950">{formatCurrency(summary.totalValue)}</p>
					<p className="text-xs font-semibold text-slate-500">Valor cadastrado</p>
					<p className="mt-3 flex items-center gap-1 text-sm font-black text-slate-700">
						<ShieldCheck size={15} className="text-purple-500" /> {summary.highValue || 0} ativo(s) de alto valor
						<InfoTip text="Ativos classificados para controle patrimonial reforçado." />
					</p>
					<button type="button" onClick={() => goToAssetsTab(setSearchParams, "ativos")} className="rot-btn-tactile mt-3 inline-flex items-center gap-0.5 text-xs font-black text-blue-600 hover:text-blue-700">
						Ver ativos <ChevronRight size={13} />
					</button>
				</section>
			</div>

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-black text-slate-950">Últimos ativos</h2>
					{assets.length ? (
						<button type="button" onClick={() => goToAssetsTab(setSearchParams, "ativos")} className="rot-btn-tactile inline-flex items-center gap-0.5 text-xs font-black text-blue-600 hover:text-blue-700">
							Ver todos <ChevronRight size={13} />
						</button>
					) : null}
				</div>
				<div className="mt-4 space-y-3">
					{assets.slice(0, 5).map((asset) => {
						const structure = [asset.operationScope, asset.regionalName, asset.baseName].filter(Boolean).join(" • ");
						const custody = asset.custodyTechnicianName || asset.custodyUserName || "Sem responsável atual";
						return (
							<div key={asset.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
								<div className="min-w-0">
									<p className="truncate text-sm font-black text-slate-900">{asset.name}</p>
									<p className="truncate text-xs font-bold text-slate-500">{asset.code}{structure ? ` • ${structure}` : ""}</p>
									<p className="truncate text-[11px] font-semibold text-slate-400">{custody}</p>
								</div>
								<span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: `${asset.statusColor || "#2563eb"}18`, color: asset.statusColor || "#2563eb" }}>
									{asset.statusName || "Status"}
								</span>
							</div>
						);
					})}
					{!assets.length ? (
						<p className="text-sm font-semibold text-slate-400">Nenhum ativo cadastrado ainda.</p>
					) : null}
				</div>
			</section>
		</div>
	);
}

function AssetsList({ assets, total, meta, filters, setFilters, onSearch, canEdit, canDelete, canSeeHistory, canTransfer, canReturn, canReportProblem, canBlock, canRelease, canMaintain, onEdit, onTimeline, onAction, onDelete, onCheckout }) {
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
					<AssetCard key={asset.id} asset={asset} canEdit={canEdit} canDelete={canDelete} canSeeHistory={canSeeHistory} canTransfer={canTransfer} canReturn={canReturn} canReportProblem={canReportProblem} canBlock={canBlock} canRelease={canRelease} canMaintain={canMaintain} onEdit={() => onEdit(asset)} onTimeline={() => onTimeline(asset)} onAction={(kind) => onAction(kind, asset)} onDelete={() => onDelete(asset)} onCheckout={() => onCheckout(asset)} />
				))}
			</div>
			{!assets.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum ativo encontrado.</p> : null}
		</section>
	);
}

function AssetCard({ asset, canEdit, canDelete, canSeeHistory, canTransfer, canReturn, canReportProblem, canBlock, canRelease, canMaintain, onEdit, onTimeline, onAction, onDelete, onCheckout }) {
	const canToggleBlock = asset.statusBlocksUse ? canRelease : canBlock;
	const canCheckout = !asset.statusBlocksUse && asset.statusId === "disponivel" && !asset.custodyUserName && !asset.custodyTechnicianName;
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
							<p className="text-xs font-bold uppercase text-slate-500">{asset.operationScope} · {asset.regionalName || "Sem regional"}{asset.baseName ? ` · ${asset.baseName}` : ""}</p>
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
				{canCheckout ? (
					<button type="button" onClick={onCheckout} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700">
						<PackageCheck size={14} /> Resgatar
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
				{canTransfer ? (
					<button type="button" onClick={() => onAction("transfer")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
						<Shuffle size={14} /> Transferir
					</button>
				) : null}
				{canReturn ? (
					<button type="button" onClick={() => onAction("return")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
						<Undo2 size={14} /> Devolver
					</button>
				) : null}
				{canReportProblem ? (
					<button type="button" onClick={() => onAction("problem")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 px-3 text-xs font-black text-amber-700 hover:bg-amber-50">
						<AlertTriangle size={14} /> Problema
					</button>
				) : null}
				{canToggleBlock ? (
					<button type="button" onClick={() => onAction(asset.statusBlocksUse ? "release" : "block")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 hover:bg-red-50">
						{asset.statusBlocksUse ? <Unlock size={14} /> : <Lock size={14} />} {asset.statusBlocksUse ? "Liberar" : "Bloquear"}
					</button>
				) : null}
				{canMaintain ? (
					<button type="button" onClick={() => onAction("maintenance")} className="rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-purple-200 px-3 text-xs font-black text-purple-700 hover:bg-purple-50">
						<Wrench size={14} /> Manutenção
					</button>
				) : null}
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

function SettingsPanel({ meta, templates, canConfigure, onNew, onEdit, onDelete, onChecklist, onEditChecklist, onDeleteChecklist }) {
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
							{canConfigure ? (
								<div className="mt-3 flex gap-1.5 border-t border-slate-200 pt-3">
									<button type="button" onClick={() => onEditChecklist(template)} className="rot-btn-tactile flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:text-blue-700">
										<Edit3 size={13} /> Editar
									</button>
									<button type="button" onClick={() => onDeleteChecklist(template)} className="rot-btn-tactile flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white text-xs font-black text-red-600 hover:bg-red-50">
										<Trash2 size={13} /> Excluir
									</button>
								</div>
							) : null}
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
										<p className="truncate text-xs font-semibold text-slate-500">{item.description || item.prefix || item.code || item.color || "Configuração ativa"}</p>
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

function buildAssetFormState(asset, user, meta) {
	return {
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
		baseId: asset?.baseId || "",
		statusId: asset?.statusId || "disponivel",
		criticalityId: asset?.criticalityId || "informativo",
		highValue: asset?.highValue || false,
		criticalEquipment: asset?.criticalEquipment || false,
		requiresChecklist: asset?.requiresChecklist || false,
		checklistTemplateId: asset?.checklistTemplateId || "",
		inspectionFrequency: asset?.inspectionFrequency || "diario",
		custodyTechnicianId: asset?.custodyTechnicianId || "",
		notes: asset?.notes || "",
	};
}

function formatCurrencyDigits(value) {
	if (value === "" || value === null || value === undefined) return "";
	const cents = Math.round(Number(value) * 100);
	if (!Number.isFinite(cents)) return "";
	return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const INSPECTION_FREQUENCY_OPTIONS = [
	{ id: "diario", name: "Diário" },
	{ id: "semanal", name: "Semanal" },
	{ id: "quinzenal", name: "Quinzenal" },
	{ id: "mensal", name: "Mensal" },
];

function AssetFormModal({ asset, meta, templates, user, onClose, onSaved }) {
	const isEdit = Boolean(asset);
	const initialForm = useMemo(() => buildAssetFormState(asset, user, meta), [asset, user, meta]);
	const [form, setForm] = useState(initialForm);
	const initialSnapshotRef = useRef(JSON.stringify(initialForm));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [fieldErrors, setFieldErrors] = useState({});
	const [baseNotice, setBaseNotice] = useState("");
	const nameInputRef = useRef(null);
	const baseFieldRef = useRef(null);
	const previousRegionalRef = useRef(form.regionalId);

	const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

	const basesForRegional = useMemo(() => {
		if (!form.regionalId) return [];
		return (meta?.bases || []).filter((base) => base.regionalId === form.regionalId);
	}, [meta?.bases, form.regionalId]);

	const techniciansForRegional = useMemo(() => {
		const all = meta?.technicians || [];
		if (!form.regionalId) return all;
		const scoped = all.filter((tech) => !tech.regionalId || tech.regionalId === form.regionalId);
		return scoped.length ? scoped : all;
	}, [meta?.technicians, form.regionalId]);

	// Base pertence a uma unica regional (relacao real: regional_cidades.regional_id).
	// Se a regional mudar e a base escolhida nao pertencer mais a ela, limpa e avisa
	// discretamente em vez de deixar uma combinacao invalida seguir pro backend.
	useEffect(() => {
		if (previousRegionalRef.current === form.regionalId) return;
		previousRegionalRef.current = form.regionalId;
		if (form.baseId && !basesForRegional.some((base) => base.id === form.baseId)) {
			setField("baseId", "");
			setBaseNotice("Base removida porque não pertence à regional selecionada.");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [form.regionalId, basesForRegional]);

	const selectedRegionalName = meta?.regionals?.find((item) => item.id === form.regionalId)?.name || "";
	const selectedBaseName = meta?.bases?.find((item) => item.id === form.baseId)?.name || "";
	const selectedStatus = meta?.statuses?.find((item) => item.id === form.statusId);

	const submit = async (event) => {
		event.preventDefault();
		const nextFieldErrors = {};
		if (!form.name.trim()) nextFieldErrors.name = "Informe o nome do ativo.";
		if (!form.baseId) nextFieldErrors.baseId = "Informe a base do ativo.";
		setFieldErrors(nextFieldErrors);
		if (Object.keys(nextFieldErrors).length) {
			setError("Corrija os campos destacados antes de salvar.");
			if (nextFieldErrors.name) nameInputRef.current?.focus();
			else if (nextFieldErrors.baseId) baseFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}
		setSaving(true);
		setError("");
		try {
			if (isEdit) await updateAssetsSecurityAsset(asset.id, form);
			else await createAssetsSecurityAsset(form);
			onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível criar o ativo.");
		} finally {
			setSaving(false);
		}
	};

	const isDirty = JSON.stringify(form) !== initialSnapshotRef.current;
	const requestClose = () => {
		if (isDirty && !window.confirm("Existem informações preenchidas que ainda não foram salvas. Descartar o cadastro?")) return;
		onClose();
	};

	return (
		<ModalShell
			open
			title={isEdit ? "Editar ativo" : "Novo ativo"}
			description="Cadastre e configure um equipamento operacional."
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Boxes size={22} /></span>}
			onClose={requestClose}
			size="5xl"
			footer={
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-xs font-semibold text-slate-400">* Campos obrigatórios</p>
					<div className="flex gap-2">
						<button type="button" onClick={requestClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="submit" form="asset-form" disabled={saving} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
							{saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}{saving ? "Salvando..." : "Salvar ativo"}
						</button>
					</div>
				</div>
			}
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form id="asset-form" onSubmit={submit} className="space-y-6">
				<section className="space-y-3">
					<SectionHeader title="Identificação" description="Informações básicas usadas para reconhecer e localizar este equipamento." />
					<Field label="Nome do ativo" required error={fieldErrors.name}>
						<input ref={nameInputRef} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Ex.: Máquina de fusão Fujikura 90S+" className="rot-input" autoFocus />
					</Field>
					<div className="grid gap-4 md:grid-cols-2">
						<Field label="Categoria" required><Select value={form.categoryId} onChange={(v) => setField("categoryId", v)} items={meta?.categories || []} /></Field>
						<Field label="Tipo" required><Select value={form.typeId} onChange={(v) => setField("typeId", v)} items={meta?.types || []} /></Field>
						<Field label="Fabricante"><input value={form.manufacturer} onChange={(e) => setField("manufacturer", e.target.value)} className="rot-input" /></Field>
						<Field label="Modelo"><input value={form.model} onChange={(e) => setField("model", e.target.value)} className="rot-input" /></Field>
						<Field label="Número de série"><input value={form.serialNumber} onChange={(e) => setField("serialNumber", e.target.value)} placeholder="Ex.: FJK90S-23981" className="rot-input" /></Field>
						<Field label="Patrimônio"><input value={form.patrimony} onChange={(e) => setField("patrimony", e.target.value)} placeholder="Ex.: PAT-000123" className="rot-input" /></Field>
					</div>
				</section>

				<section className="space-y-3">
					<SectionHeader title="Alocação operacional" description="Defina a estrutura à qual o ativo pertence e quem está responsável por ele atualmente." />
					<div className="grid gap-4 md:grid-cols-2">
						<Field label="Operação" required><select value={form.operationScope} onChange={(e) => setField("operationScope", e.target.value)} className="rot-input"><option value="ROT">ROT</option><option value="FIELD">FIELD</option><option value="DELIVERY">DELIVERY</option></select></Field>
						<Field label="Regional" required>
							<SearchableSelect value={form.regionalId} onChange={(v) => setField("regionalId", v)} items={meta?.regionals || []} placeholder="Buscar regional..." />
						</Field>
						<Field
							label="Base"
							required
							error={fieldErrors.baseId}
							hint={!fieldErrors.baseId ? (!form.regionalId ? "Selecione uma regional para visualizar as bases disponíveis." : !basesForRegional.length ? "Nenhuma base disponível para esta regional." : baseNotice) : ""}
						>
							<div ref={baseFieldRef}>
								<SearchableSelect
									value={form.baseId}
									onChange={(v) => { setField("baseId", v); setBaseNotice(""); }}
									items={basesForRegional}
									placeholder={form.regionalId ? "Buscar base..." : "Selecione uma regional primeiro"}
									disabled={!form.regionalId}
									empty="Nenhuma base encontrada."
								/>
							</div>
						</Field>
						<Field label="Empresa" hint="Empresa vinculada ao ativo."><SearchableSelect value={form.companyId} onChange={(v) => setField("companyId", v)} items={meta?.companies || []} placeholder="Buscar empresa..." empty="Nenhuma empresa encontrada." /></Field>
					</div>
					<Field label="Custódia atual" hint="Pessoa, equipe ou local atualmente responsável pelo equipamento.">
						<SearchableSelect
							value={form.custodyTechnicianId}
							onChange={(v) => setField("custodyTechnicianId", v)}
							items={techniciansForRegional}
							placeholder="Buscar técnico, colaborador, equipe ou local..."
							empty="Sem responsável atual."
						/>
					</Field>
					<StructureBreadcrumb operationScope={form.operationScope} regionalName={selectedRegionalName} baseName={selectedBaseName} />
				</section>

				<section className="space-y-3">
					<SectionHeader title="Condição operacional" />
					<div className="grid gap-4 md:grid-cols-2">
						<Field label="Status" required>
							<div className="flex items-center gap-2">
								<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedStatus?.color || "#94a3b8" }} />
								<Select value={form.statusId} onChange={(v) => setField("statusId", v)} items={meta?.statuses || []} />
							</div>
						</Field>
						<Field label="Criticidade" required hint="Define o impacto operacional deste ativo."><Select value={form.criticalityId} onChange={(v) => setField("criticalityId", v)} items={meta?.criticalities || []} /></Field>
					</div>
				</section>

				<section className="space-y-3">
					<SectionHeader title="Informações patrimoniais" />
					<div className="grid gap-4 md:grid-cols-2">
						<Field label="Valor">
							<input
								inputMode="numeric"
								value={formatCurrencyDigits(form.assetValue)}
								onChange={(e) => {
									const digits = e.target.value.replace(/\D/g, "");
									setField("assetValue", digits ? (Number(digits) / 100).toFixed(2) : "");
								}}
								placeholder="R$ 0,00"
								className="rot-input"
							/>
						</Field>
						<Field label="Aquisição"><input type="date" value={form.acquiredAt || ""} onChange={(e) => setField("acquiredAt", e.target.value)} className="rot-input" /></Field>
					</div>
				</section>

				<section className="space-y-3">
					<SectionHeader title="Regras e controles" />
					<div className="grid gap-3 md:grid-cols-3">
						<ToggleCard icon="💰" label="Alto valor" description="Controle patrimonial reforçado." checked={form.highValue} onChange={(v) => setField("highValue", v)} hint="Este ativo poderá receber controles adicionais de auditoria." />
						<ToggleCard icon="⚠️" label="Equipamento crítico" description="Impacto relevante para a operação." checked={form.criticalEquipment} onChange={(v) => setField("criticalEquipment", v)} hint="Recomendamos também utilizar checklist obrigatório para ativos críticos." />
						<ToggleCard icon="☑️" label="Exige checklist" description="Checklist obrigatório nos fluxos configurados." checked={form.requiresChecklist} onChange={(v) => setField("requiresChecklist", v)} hint="Um checklist será solicitado nos fluxos configurados para este ativo." />
					</div>
					{form.requiresChecklist ? (
						<div className="grid gap-3 md:grid-cols-2">
							<Field label="Checklist padrão" hint="O técnico não escolhe o modelo na hora — é sempre este.">
								<Select value={form.checklistTemplateId} onChange={(v) => setField("checklistTemplateId", v)} items={templates || []} empty="Selecione um modelo" />
							</Field>
							<Field label="Frequência" hint="Define quando o checklist volta a ficar pendente para quem estiver com o ativo.">
								<Select value={form.inspectionFrequency} onChange={(v) => setField("inspectionFrequency", v)} items={INSPECTION_FREQUENCY_OPTIONS} />
							</Field>
						</div>
					) : null}
				</section>

				<section className="space-y-3">
					<SectionHeader title="Observações" />
					<div>
						<textarea value={form.notes} onChange={(e) => setField("notes", e.target.value.slice(0, 2000))} rows={3} maxLength={2000} placeholder="Adicione informações relevantes sobre conservação, uso, restrições ou características deste ativo." className="rot-input min-h-24 py-3" />
						<span className="mt-1 block text-right text-[11px] font-semibold text-slate-400">{form.notes.length} / 2000</span>
					</div>
				</section>
			</form>
		</ModalShell>
	);
}

function SectionHeader({ title, description }) {
	return (
		<div className="border-b border-slate-100 pb-2">
			<h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{title}</h3>
			{description ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{description}</p> : null}
		</div>
	);
}

function StructureBreadcrumb({ operationScope, regionalName, baseName }) {
	const parts = [operationScope, regionalName, baseName].filter(Boolean);
	if (parts.length < 2) return null;
	return (
		<div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
			<p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Estrutura operacional</p>
			<p className="mt-0.5 text-sm font-bold text-slate-700">{parts.join(" › ")}</p>
		</div>
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
				if (item?.id) await updateAssetsSecurityChecklistTemplate(item.id, { name: form.name, description: form.description, questions });
				else await createAssetsSecurityChecklistTemplate({ name: form.name, description: form.description, questions });
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

// Antes essa aba era uma vitrine de todos os modelos de checklist +
// escolha livre de qualquer ativo (visao de gestao). Trocado para o
// checklist obrigatorio do dia-a-dia: so os ativos que a propria pessoa
// tem em custodia e que estao com a inspecao vencida, seguindo a
// frequencia que o supervisor configurou no cadastro do ativo.
function ChecklistPanel({ items, onRun }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ClipboardCheck size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Meu checklist do dia</h2>
					<p className="text-sm font-semibold text-slate-500">Ativos sob sua custódia com checklist obrigatório pendente.</p>
				</div>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{items.map((asset) => (
					<button key={asset.id} type="button" onClick={() => onRun(asset)} className="rot-btn-tactile rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm hover:border-amber-300 hover:bg-amber-100">
						<p className="font-mono text-xs font-black text-amber-700">{asset.code}</p>
						<p className="mt-1 truncate text-sm font-black text-slate-950">{asset.name}</p>
						<p className="mt-1 text-xs font-bold text-slate-500">{asset.statusName || "Status"} · pendente desde {asset.nextInspectionAt ? new Date(asset.nextInspectionAt).toLocaleDateString("pt-BR") : "sempre"}</p>
					</button>
				))}
				{!items.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400 md:col-span-2">Nenhum checklist pendente no momento. 🎉</p> : null}
			</div>
		</section>
	);
}

// Visao de quem tem checklists.configurar (lideranca/gestao): historico
// de tudo que foi executado, com respostas e fotos — nao o pendente
// pessoal, que e so pra quem nao gerencia (ChecklistPanel acima).
function ChecklistManagementPanel() {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [detailId, setDetailId] = useState(null);

	const load = () => {
		setLoading(true);
		setError("");
		fetchAssetsSecurityChecklistExecutions()
			.then(setItems)
			.catch((err) => setError(err?.message || "Não foi possível carregar o histórico de checklists."))
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		// load() chama setLoading(true) de forma síncrona — mantido reusável
		// (não só para o mount) para uma eventual ação de recarregar.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		load();
	}, []);

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ClipboardCheck size={22} /></span>
				<div>
					<h2 className="text-lg font-black text-slate-950">Checklists realizados</h2>
					<p className="text-sm font-semibold text-slate-500">Histórico de execuções. Clique em um item para ver respostas e fotos.</p>
				</div>
			</div>
			{error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p> : null}
			{loading ? <div className="mt-4"><Spinner /></div> : (
				<div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
					<table className="w-full min-w-[720px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
							<tr><th className="px-4 py-3">Ativo</th><th className="px-4 py-3">Modelo</th><th className="px-4 py-3">Executado por</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3">Data</th></tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{items.map((item) => (
								<tr key={item.id} onClick={() => setDetailId(item.id)} className="cursor-pointer hover:bg-slate-50">
									<td className="px-4 py-3 font-black text-slate-900">{item.asset_code} · {item.asset_name}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.template_name || "—"}</td>
									<td className="px-4 py-3 font-bold text-slate-600">{item.executed_by_name || "—"}</td>
									<td className={`px-4 py-3 font-black ${item.result === "N-OK" ? "text-red-600" : "text-emerald-600"}`}>{item.result || item.status}</td>
									<td className="px-4 py-3 font-bold text-slate-500">{item.completed_at ? new Date(item.completed_at).toLocaleString("pt-BR") : "-"}</td>
								</tr>
							))}
						</tbody>
					</table>
					{!items.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum checklist realizado ainda.</p> : null}
				</div>
			)}
			{detailId ? <ChecklistExecutionDetailModal executionId={detailId} onClose={() => setDetailId(null)} /> : null}
		</section>
	);
}

function ChecklistExecutionDetailModal({ executionId, onClose }) {
	const [data, setData] = useState(null);
	const [photos, setPhotos] = useState([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		// Reset síncrono intencional ao trocar de execução: mostra o estado de
		// carregamento antes do fetch assíncrono iniciar.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setLoading(true);
		fetchAssetsSecurityChecklistExecution(executionId)
			.then(async (res) => {
				if (cancelled) return;
				setData(res);
				if (res.execution?.asset_id) {
					const attachments = await fetchRotAttachments("ASSET", res.execution.asset_id).catch(() => ({ items: [] }));
					if (!cancelled) setPhotos(attachments.items || []);
				}
			})
			.catch((err) => !cancelled && setError(err?.message || "Não foi possível carregar o checklist."))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [executionId]);

	return (
		<ModalShell open title="Checklist realizado" description={data?.execution ? `${data.execution.asset_code} · ${data.execution.asset_name}` : ""} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ClipboardCheck size={22} /></span>} onClose={onClose} size="2xl">
			{loading ? <Spinner /> : null}
			{error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			{data ? (
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-3 text-sm">
						<MiniInfo label="Modelo" value={data.execution.template_name || "—"} />
						<MiniInfo label="Executado por" value={data.execution.executed_by_name || "—"} />
						<MiniInfo label="Resultado" value={data.execution.result || data.execution.status} danger={data.execution.result === "N-OK"} />
						<MiniInfo label="Data" value={data.execution.completed_at ? new Date(data.execution.completed_at).toLocaleString("pt-BR") : "-"} />
					</div>
					<div className="space-y-1.5">
						{data.answers.map((answer) => (
							<div key={answer.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
								<span className="text-sm font-bold text-slate-700">{answer.question_label || "Pergunta"}</span>
								<span className={`text-xs font-black uppercase ${answer.status === "N-OK" ? "text-red-600" : "text-emerald-600"}`}>{answer.label}</span>
							</div>
						))}
						{!data.answers.length ? <p className="text-sm font-bold text-slate-400">Sem respostas registradas.</p> : null}
					</div>
					{photos.length ? (
						<div>
							<p className="mb-2 text-xs font-black uppercase text-slate-500">Fotos do ativo</p>
							<div className="grid grid-cols-3 gap-2">
								{photos.map((photo) => (
									<img key={photo.id} src={photo.url} alt="Foto anexada" className="aspect-video w-full rounded-xl border border-slate-200 object-cover" />
								))}
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</ModalShell>
	);
}

function filterByDateRange(items, dateFrom, dateTo, field = "created_at") {
	if (!dateFrom && !dateTo) return items;
	const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
	const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
	return items.filter((item) => {
		if (!item[field]) return false;
		const value = new Date(item[field]);
		if (from && value < from) return false;
		if (to && value > to) return false;
		return true;
	});
}

const TRANSFER_STATUS_LABEL = {
	PENDING_ACCEPTANCE: { label: "Aguardando aceite", className: "bg-amber-50 text-amber-700" },
	COMPLETED: { label: "Concluída", className: "bg-emerald-50 text-emerald-700" },
	CANCELED: { label: "Cancelada", className: "bg-slate-100 text-slate-500" },
	DECLINED: { label: "Recusada", className: "bg-red-50 text-red-700" },
};

// A tabela so tem status CANCELED tanto pra "recebedor recusou" quanto
// "gestao cancelou" (mesmo endpoint /decline pros dois casos) — usa quem
// recusou (declined_by) pra diferenciar na exibicao, sem precisar de um
// status novo no banco.
function resolveTransferStatus(item) {
	if (item.status === "CANCELED" && item.declined_by && item.declined_by === item.to_user_id) return "DECLINED";
	return item.status;
}

function TransferPanel({ items, meta, onChanged }) {
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [editItem, setEditItem] = useState(null);
	const [busyId, setBusyId] = useState("");
	const filteredItems = filterByDateRange(items, dateFrom, dateTo);

	const cancelTransfer = async (item) => {
		const reason = window.prompt(`Motivo do cancelamento da transferência de "${item.asset_name}":`);
		if (reason === null) return;
		const trimmedReason = reason.trim();
		if (!trimmedReason) {
			window.alert("Informe o motivo do cancelamento.");
			return;
		}
		if (!window.confirm(`Confirma o cancelamento da transferência de "${item.asset_name}"? Essa ação não pode ser desfeita.`)) return;
		setBusyId(item.id);
		try {
			await declineAssetsSecurityTransfer(item.id, { reason: trimmedReason });
			await onChanged?.();
		} catch (err) {
			window.alert(err?.message || "Não foi possível cancelar a transferência.");
		} finally {
			setBusyId("");
		}
	};

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Shuffle size={22} /></span>
					<div>
						<h2 className="text-lg font-black text-slate-950">Transferências</h2>
						<p className="text-sm font-semibold text-slate-500">Cadeia de custódia entre técnicos, aceite e condição do ativo.</p>
					</div>
				</div>
				<DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
			</div>
			<div className="mt-5 grid gap-3 xl:grid-cols-2">
				{filteredItems.map((item) => {
					const statusInfo = TRANSFER_STATUS_LABEL[resolveTransferStatus(item)] || TRANSFER_STATUS_LABEL.COMPLETED;
					const pending = item.status === "PENDING_ACCEPTANCE";
					return (
						<article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-mono text-xs font-black text-blue-600">{item.code}</p>
									<h3 className="mt-1 truncate text-base font-black text-slate-950">{item.asset_name}</h3>
									<p className="mt-1 text-sm font-bold text-slate-500">{item.from_technician_name || item.from_user_name || "Sem origem"} → {item.to_technician_name || item.to_user_name || "Sem destino"}</p>
								</div>
								<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${statusInfo.className}`}>{statusInfo.label}</span>
							</div>
							<div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
								<MiniInfo label="Condição" value={item.condition || "Não informada"} />
								<MiniInfo label="Solicitada por" value={item.requested_by_name || "Sistema"} />
							</div>
							<p className="mt-3 text-xs font-bold text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-"}</p>
							{item.decline_reason ? <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">Motivo: {item.decline_reason}</p> : null}
							{pending ? (
								<div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
									<button type="button" onClick={() => setEditItem(item)} className="rot-btn-tactile inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50">
										<Edit3 size={13} /> Editar
									</button>
									<button type="button" disabled={busyId === item.id} onClick={() => cancelTransfer(item)} className="rot-btn-tactile inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-60">
										<X size={13} /> Cancelar
									</button>
								</div>
							) : null}
						</article>
					);
				})}
				{!filteredItems.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400 xl:col-span-2">Nenhuma transferência nesse período.</p> : null}
			</div>
			{editItem ? (
				<TransferEditModal
					transfer={editItem}
					meta={meta}
					onClose={() => setEditItem(null)}
					onSaved={async () => { setEditItem(null); await onChanged?.(); }}
				/>
			) : null}
		</section>
	);
}

function TransferEditModal({ transfer, meta, onClose, onSaved }) {
	const [toUserId, setToUserId] = useState(transfer.to_user_id || "");
	const [condition, setCondition] = useState(transfer.condition || "");
	const [reason, setReason] = useState(transfer.reason || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			await updateAssetsSecurityTransfer(transfer.id, { toUserId, condition, reason });
			onSaved();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a transferência.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Editar transferência" description={`${transfer.code} · ${transfer.asset_name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Edit3 size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<Field label="Novo responsável"><SearchableSelect value={toUserId} onChange={setToUserId} items={meta?.users || []} placeholder="Buscar usuário..." empty="Nenhum usuário encontrado." /></Field>
				<Field label="Condição na transferência"><input value={condition} onChange={(e) => setCondition(e.target.value)} className="rot-input" /></Field>
				<Field label="Motivo"><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="rot-input min-h-20 py-3" /></Field>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function ReturnPanel({ items }) {
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [detail, setDetail] = useState(null);
	const filteredItems = filterByDateRange(items, dateFrom, dateTo);
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Undo2 size={22} /></span>
					<div>
						<h2 className="text-lg font-black text-slate-950">Devoluções</h2>
						<p className="text-sm font-semibold text-slate-500">Histórico de retorno de ativos, destino operacional e problemas informados.</p>
					</div>
				</div>
				<DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
			</div>
			<div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
				<table className="w-full min-w-[760px] text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
						<tr><th className="px-4 py-3">Ativo</th><th className="px-4 py-3">Técnico</th><th className="px-4 py-3">Destino</th><th className="px-4 py-3">Condição</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data</th></tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{filteredItems.map((item) => (
							<tr key={item.id} onClick={() => setDetail(item)} className="cursor-pointer hover:bg-slate-50">
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
				{!filteredItems.length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma devolução nesse período.</p> : null}
			</div>
			{detail ? <ReturnDetailModal item={detail} onClose={() => setDetail(null)} /> : null}
		</section>
	);
}

function ReturnDetailModal({ item, onClose }) {
	const [checklist, setChecklist] = useState(null);
	const [photos, setPhotos] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		// Reset síncrono intencional ao trocar de item: mostra o estado de
		// carregamento antes do fetch assíncrono iniciar.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setLoading(true);
		Promise.all([
			item.checklist_execution_id ? fetchAssetsSecurityChecklistExecution(item.checklist_execution_id).catch(() => null) : Promise.resolve(null),
			item.asset_id ? fetchRotAttachments("ASSET", item.asset_id).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
		]).then(([checklistData, attachments]) => {
			if (cancelled) return;
			setChecklist(checklistData);
			setPhotos(attachments.items || []);
		}).finally(() => !cancelled && setLoading(false));
		return () => { cancelled = true; };
	}, [item]);

	return (
		<ModalShell open title="Devolução" description={`${item.code} · ${item.asset_name}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Undo2 size={22} /></span>} onClose={onClose} size="2xl">
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-3 text-sm">
					<MiniInfo label="Técnico" value={item.from_technician_name || "Sem técnico"} />
					<MiniInfo label="Devolvido por" value={item.returned_by_name || "—"} />
					<MiniInfo label="Destino" value={item.destination_status_name || "Disponível"} />
					<MiniInfo label="Condição" value={item.condition || "-"} />
					<MiniInfo label="Status" value={item.status} />
					<MiniInfo label="Data" value={item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-"} />
				</div>
				{item.problems ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Problemas informados: {item.problems}</p> : null}
				{item.notes ? <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm italic text-slate-600">"{item.notes}"</p> : null}
				{loading ? <Spinner /> : null}
				{checklist ? (
					<div>
						<p className="mb-2 text-xs font-black uppercase text-slate-500">Checklist de devolução — {checklist.execution?.template_name || "—"}</p>
						<div className="space-y-1.5">
							{checklist.answers.map((answer) => (
								<div key={answer.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
									<span className="text-sm font-bold text-slate-700">{answer.question_label || "Pergunta"}</span>
									<span className={`text-xs font-black uppercase ${answer.status === "N-OK" ? "text-red-600" : "text-emerald-600"}`}>{answer.label}</span>
								</div>
							))}
							{!checklist.answers.length ? <p className="text-sm font-bold text-slate-400">Sem respostas registradas.</p> : null}
						</div>
					</div>
				) : null}
				{photos.length ? (
					<div>
						<p className="mb-2 text-xs font-black uppercase text-slate-500">Fotos do ativo</p>
						<div className="grid grid-cols-3 gap-2">
							{photos.map((photo) => (
								<img key={photo.id} src={photo.url} alt="Foto anexada" className="aspect-video w-full rounded-xl border border-slate-200 object-cover" />
							))}
						</div>
					</div>
				) : null}
			</div>
		</ModalShell>
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

const MAINTENANCE_FILTERS = [
	{ key: "todas", label: "Todas", statuses: null },
	{ key: "andamento", label: "Em andamento", statuses: ["REPORTADO", "TRIAGEM", "AGUARDANDO_MANUTENCAO", "EM_MANUTENCAO"] },
	{ key: "prontas", label: "Prontas para liberar", statuses: ["AGUARDANDO_VALIDACAO"] },
	{ key: "canceladas", label: "Canceladas", statuses: ["CANCELADO"] },
];

function MaintenancePanel({ items, onUpdate }) {
	const [filter, setFilter] = useState("todas");
	const activeFilter = MAINTENANCE_FILTERS.find((option) => option.key === filter) || MAINTENANCE_FILTERS[0];
	const filteredItems = activeFilter.statuses ? items.filter((item) => activeFilter.statuses.includes(item.status)) : items;
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><Wrench size={22} /></span>
					<div>
						<h2 className="text-lg font-black text-slate-950">Ordens de manutenção</h2>
						<p className="text-sm font-semibold text-slate-500">Controle de equipamentos indisponíveis, reparos e liberação.</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{MAINTENANCE_FILTERS.map((option) => (
						<button key={option.key} type="button" onClick={() => setFilter(option.key)} className={`rot-btn-tactile rounded-xl px-3 py-2 text-xs font-black ${filter === option.key ? "bg-purple-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
							{option.label}
						</button>
					))}
				</div>
			</div>
			<div className="mt-5 grid gap-3 xl:grid-cols-2">
				{filteredItems.map((item) => {
					const isCancelled = item.status === "CANCELADO";
					return (
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
								{!isCancelled ? (
									<>
										<button type="button" onClick={() => onUpdate(item, "EM_MANUTENCAO")} className="rot-btn-tactile rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Em andamento</button>
										<button type="button" onClick={() => onUpdate(item, "LIBERADO")} className="rot-btn-tactile rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Liberar</button>
										<button type="button" onClick={() => onUpdate(item, "CANCELADO")} className="rot-btn-tactile rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700">Cancelar</button>
									</>
								) : null}
							</div>
						</article>
					);
				})}
				{!filteredItems.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400 xl:col-span-2">Nenhuma ordem de manutenção nesse filtro.</p> : null}
			</div>
		</section>
	);
}

export function AssetActionModal({ kind, asset, meta, templates, onClose, onSaved }) {
	const selectedTemplate = templates.find((item) => item.id === asset?.checklistTemplateId) || templates[0] || null;
	const templateId = selectedTemplate?.id || "";
	const [answers, setAnswers] = useState(() => defaultAnswers(selectedTemplate));
	const [form, setForm] = useState({
		toUserId: "",
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

	const returnNeedsChecklist = kind === "return" && Boolean(asset?.requiresChecklist);

	const submit = async (event) => {
		event.preventDefault();
		if (returnNeedsChecklist && !selectedTemplate) {
			setError("Nenhum modelo de checklist disponível para este ativo. Cadastre um modelo antes de devolver.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const evidence = [{ entityType: "ASSET", entityId: asset.id, images: imageCount }];
			if (kind === "checklist") await executeAssetsSecurityChecklist(asset.id, { templateId, answers, observation: form.notes, evidence });
			if (kind === "transfer") await transferAssetsSecurityAsset(asset.id, { toUserId: form.toUserId, condition: form.condition, reason: form.reason, notes: form.notes, requiresAcceptance: form.requiresAcceptance, evidence });
			if (kind === "return") await returnAssetsSecurityAsset(asset.id, { destinationStatusId: form.destinationStatusId, condition: form.condition, problems: form.problems, notes: form.notes, evidence, checklist: returnNeedsChecklist ? { templateId, answers } : undefined });
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
						{selectedTemplate ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">Checklist: {selectedTemplate.name}</p> : <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">Nenhum checklist padrão configurado para este ativo. Edite o cadastro do ativo para definir um.</p>}
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
						<Field label="Novo responsável" hint="Digite o início do nome do usuário cadastrado."><SearchableSelect value={form.toUserId} onChange={(v) => setField("toUserId", v)} items={meta?.users || []} placeholder="Buscar usuário..." empty="Nenhum usuário encontrado." /></Field>
						<Field label="Condição na transferência"><input value={form.condition} onChange={(e) => setField("condition", e.target.value)} className="rot-input" /></Field>
						<Toggle label="Exigir aceite do recebedor" checked={form.requiresAcceptance} onChange={(value) => setField("requiresAcceptance", value)} />
						<Field label="Motivo"><textarea value={form.reason} onChange={(e) => setField("reason", e.target.value)} rows={2} className="rot-input min-h-20 py-3" /></Field>
					</>
				) : null}
				{kind === "return" ? (
					<>
						{returnNeedsChecklist ? (
							<>
								<p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">Este ativo exige checklist para ser devolvido{selectedTemplate ? `: ${selectedTemplate.name}` : ""}.</p>
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
							</>
						) : null}
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

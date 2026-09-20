import {
	AlertTriangle,
	BarChart2,
	Calendar,
	Copy,
	Flag,
	PencilLine,
	SkipBack,
	SkipForward,
	Settings,
	ShieldAlert,
	Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import Spinner from "../../../components/ui/Spinner";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import {
	META_BASES,
	META_MESES,
	META_MODES,
	normalizeMetasBaseConfig,
} from "../constants/metasBaseConfig";
import { useMetas } from "../hooks/useMetas";
import MetasAuditoria from "./MetasAuditoria";
import MetasExportButton from "./MetasExportButton";
import MetasExportPDF from "./MetasExportPDF";
import MetasLancamentoManual from "./MetasLancamentoManual";
import MetasMultas from "./MetasMultas";
import MetasPerformance from "./MetasPerformance";
import MetasReportsCentral from "./MetasReportsCentral";
import MetasResumoMensal from "./MetasResumoMensal";
import MetasSaldoDiario from "./MetasSaldoDiario";
import MetasUpload from "./MetasUpload";

const MESES = [
	"Janeiro",
	"Fevereiro",
	"Marco",
	"Abril",
	"Maio",
	"Junho",
	"Julho",
	"Agosto",
	"Setembro",
	"Outubro",
	"Novembro",
	"Dezembro",
];

const ABAS = [
	{ id: "resumo", label: "Resumo Mensal", icon: BarChart2 },
	{ id: "performance", label: "Performance", icon: Target },
	{ id: "saldo", label: "Saldo Diario", icon: Calendar },
	{ id: "lancamento", label: "Lançamento", icon: PencilLine },
	{ id: "multas", label: "Multas", icon: AlertTriangle },
	{ id: "forca-tarefa", label: "Forca tarefa", icon: Flag },
	{ id: "auditoria", label: "Auditoria", icon: ShieldAlert },
];

const FONTES_DADOS = META_BASES;

const DEFAULT_FORCA_FORM = {
	ativa: false,
	inicio: "",
	fim: "",
	metas: {
		regionais: 600,
		agentes: 150,
		tecnicos: 400,
	},
};

function getDadosMesPorFonte(dadosMes, fonte) {
	if (!dadosMes) return null;
	if (fonte === "onnet") return dadosMes.onnet || null;
	if (fonte === "onnetSempre") return dadosMes.onnetSempre || null;
	return dadosMes;
}

function temDadosOperacionais(dadosMes) {
	return Boolean(
		dadosMes &&
			(Number(dadosMes.totalOS || 0) > 0 || Number(dadosMes.meta || 0) > 0),
	);
}

function temDadosNaFonte(dadosMes, fonte) {
	const dadosFonte = getDadosMesPorFonte(dadosMes, fonte);
	return temDadosOperacionais(dadosFonte);
}

function buildAllDataPorFonte(allData, fonte) {
	return Object.fromEntries(
		Object.entries(allData || {})
			.map(([mes, dadosMes]) => [mes, getDadosMesPorFonte(dadosMes, fonte)])
			.filter(([, dadosMes]) => temDadosOperacionais(dadosMes)),
	);
}

function parseLocalDate(value) {
	if (!value) return null;
	const [year, month, day] = String(value).split("-").map(Number);
	if (!year || !month || !day) return null;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateBR(date) {
	if (!date) return "--";
	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

function formatNumber(value) {
	return Number(value || 0).toLocaleString("pt-BR");
}

function getMesFromDate(date) {
	return MESES[date.getMonth()] || "";
}

function moveMonth(month, direction) {
	const index = MESES.findIndex((item) => item === month);
	if (index < 0) return month;
	return MESES[(index + direction + MESES.length) % MESES.length];
}

function getForcaTaskContext(config, allData, agentesData) {
	if (!config?.ativa) {
		return {
			available: false,
			reason: "Ative a forca tarefa para gerar os textos.",
		};
	}

	const start = parseLocalDate(config.inicio);
	const end = parseLocalDate(config.fim);
	if (!start || !end || start > end) {
		return {
			available: false,
			reason: "Configure um periodo valido para a forca tarefa.",
		};
	}

	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	yesterday.setHours(0, 0, 0, 0);

	if (yesterday < start || yesterday > end) {
		return {
			available: false,
			reason: `Ontem (${formatDateBR(yesterday)}) esta fora do periodo da forca tarefa.`,
		};
	}

	const mes = getMesFromDate(yesterday);
	const dayIndex = yesterday.getDate() - 1;
	const dadosMes = allData?.[mes];
	const agentesMes = agentesData?.[mes] || [];

	if (!dadosMes) {
		return {
			available: false,
			reason: `Ainda nao ha dados de ${mes} carregados para montar os textos.`,
		};
	}

	const startIndex =
		start.getMonth() === yesterday.getMonth() ? start.getDate() - 1 : 0;
	const endIndex =
		end.getMonth() === yesterday.getMonth() ? end.getDate() - 1 : dayIndex;
	const inRange = (index) => index >= startIndex && index <= endIndex;

	const regionaisDetalhes = (dadosMes.regionais || [])
		.map((item) => ({
			name: item.name || "Sem regional",
			ontem: Number(item.daily?.[dayIndex] || 0),
			acumulado: (item.daily || []).reduce(
				(sum, value, index) =>
					inRange(index) ? sum + Number(value || 0) : sum,
				0,
			),
		}))
		.sort((a, b) => b.ontem - a.ontem || b.acumulado - a.acumulado);

	const agentesDetalhes = (agentesMes || [])
		.map((item) => ({
			name: item.cidade || item.nome || "Sem cidade",
			ontem: Number(item.daily?.[dayIndex] || 0),
			acumulado: (item.daily || []).reduce(
				(sum, value, index) =>
					inRange(index) ? sum + Number(value || 0) : sum,
				0,
			),
		}))
		.sort((a, b) => b.ontem - a.ontem || b.acumulado - a.acumulado);

	const rawYesterday = (dadosMes.saldoDiario || []).find(
		(item) => Number(item.dia) === yesterday.getDate(),
	);
	const totalRegionaisOntem =
		Number(rawYesterday?.regionais || 0) ||
		regionaisDetalhes.reduce((sum, item) => sum + item.ontem, 0);
	const totalAgentesOntem =
		Number(rawYesterday?.agente || 0) ||
		agentesDetalhes.reduce((sum, item) => sum + item.ontem, 0);
	const acumuladoRegionais = regionaisDetalhes.reduce(
		(sum, item) => sum + item.acumulado,
		0,
	);
	const acumuladoAgentes = agentesDetalhes.reduce(
		(sum, item) => sum + item.acumulado,
		0,
	);
	const metaRegionais = Number(config.metas?.regionais || 0);
	const metaAgentes = Number(config.metas?.agentes || 0);

	return {
		available: true,
		date: yesterday,
		periodo: `${formatDateBR(start)} a ${formatDateBR(end)}`,
		regionais: {
			meta: metaRegionais,
			ontem: totalRegionaisOntem,
			acumulado: acumuladoRegionais,
			falta: Math.max(0, metaRegionais - acumuladoRegionais),
			detalhes: regionaisDetalhes.slice(0, 7),
		},
		agentes: {
			meta: metaAgentes,
			ontem: totalAgentesOntem,
			acumulado: acumuladoAgentes,
			falta: Math.max(0, metaAgentes - acumuladoAgentes),
			detalhes: agentesDetalhes.slice(0, 7),
		},
	};
}

function buildForcaTaskMessages(context) {
	if (!context.available) return { regionais: "", agentes: "" };

	const data = formatDateBR(context.date);
	const linhasRegionais = context.regionais.detalhes.length
		? context.regionais.detalhes
				.map(
					(item, index) =>
						`${index + 1}. ${item.name}: ${formatNumber(item.ontem)} ontem | ${formatNumber(item.acumulado)} no periodo`,
				)
				.join("\n")
		: "Sem lancamentos de regionais ontem.";

	const linhasAgentes = context.agentes.detalhes.length
		? context.agentes.detalhes
				.map(
					(item, index) =>
						`${index + 1}. ${item.name}: ${formatNumber(item.ontem)} ontem | ${formatNumber(item.acumulado)} no periodo`,
				)
				.join("\n")
		: "Sem lancamentos de agente autorizado ontem.";

	return {
		regionais: [
			"🚀 FORCA TAREFA | REGIONAIS",
			`Resultado de ontem (${data}): ${formatNumber(context.regionais.ontem)} retiradas.`,
			`Periodo: ${context.periodo}`,
			`Acumulado: ${formatNumber(context.regionais.acumulado)} de ${formatNumber(context.regionais.meta)} | Faltam ${formatNumber(context.regionais.falta)}.`,
			"",
			"Destaques por regional:",
			linhasRegionais,
			"",
			"Time, seguimos firmes na forca tarefa. Cada retirada conta para encurtar a distancia da meta. Vamos manter o ritmo e fechar esse desafio com entrega forte!",
		].join("\n"),
		agentes: [
			"⭐ FORCA TAREFA | AGENTE AUTORIZADO",
			`Ontem (${data}) as cidades somaram ${formatNumber(context.agentes.ontem)} retiradas.`,
			`Periodo acompanhado: ${context.periodo}`,
			`Placar da forca tarefa: ${formatNumber(context.agentes.acumulado)} de ${formatNumber(context.agentes.meta)} | Faltam ${formatNumber(context.agentes.falta)}.`,
			"",
			"Top cidades do dia:",
			linhasAgentes,
			"",
			"Pessoal dos agentes autorizados, excelente ter as cidades no jogo. Vamos manter contato, puxar as pendencias e transformar cada oportunidade em retirada concluida!",
		].join("\n"),
	};
}

function ForceTaskCopyMessages({ config, allData, agentesData }) {
	const [copied, setCopied] = useState("");
	const context = useMemo(
		() => getForcaTaskContext(config, allData, agentesData),
		[agentesData, allData, config],
	);
	const messages = useMemo(() => buildForcaTaskMessages(context), [context]);

	const copyMessage = async (key, text) => {
		await navigator.clipboard.writeText(text);
		setCopied(key);
		window.setTimeout(() => setCopied(""), 2500);
	};

	if (!context.available) {
		return (
			<section className="rounded-2xl border border-gray-100 bg-white p-5">
				<p className="text-sm font-bold text-gray-900">Textos para WhatsApp</p>
				<p className="mt-2 text-sm text-gray-500">{context.reason}</p>
			</section>
		);
	}

	const cards = [
		{
			key: "regionais",
			title: "Mensagem para regionais",
			text: messages.regionais,
		},
		{
			key: "agentes",
			title: "Mensagem para agentes autorizados",
			text: messages.agentes,
		},
	];

	return (
		<section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 lg:col-span-2">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-sm font-bold text-gray-900">
						Textos para WhatsApp
					</p>
					<p className="mt-1 text-xs text-gray-600">
						Resultado de ontem atualizado pela ultima planilha importada.
					</p>
				</div>
				{copied ? (
					<span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
						Texto copiado.
					</span>
				) : null}
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-2">
				{cards.map((card) => (
					<div
						key={card.key}
						className="rounded-2xl border border-blue-100 bg-white p-4"
					>
						<div className="flex items-center justify-between gap-3">
							<h3 className="text-sm font-bold text-gray-900">{card.title}</h3>
							<button
								type="button"
								onClick={() => copyMessage(card.key, card.text)}
								className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
							>
								<Copy size={14} />
								Copiar
							</button>
						</div>
						<textarea
							readOnly
							value={card.text}
							className="mt-3 min-h-72 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700"
						/>
					</div>
				))}
			</div>
		</section>
	);
}

function MetasForcaTarefaConfig({
	config,
	onSave,
	saving,
	canManage,
	allData,
	agentesData,
}) {
	const [form, setForm] = useState(() => ({
		...DEFAULT_FORCA_FORM,
		...(config || {}),
		metas: {
			...DEFAULT_FORCA_FORM.metas,
			...(config?.metas || {}),
		},
	}));
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const updateMeta = (key, value) => {
		setForm((current) => ({
			...current,
			metas: {
				...current.metas,
				[key]: value,
			},
		}));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setMessage("");
		setError("");

		try {
			await onSave({
				...form,
				metas: {
					regionais: Number(form.metas.regionais) || 0,
					agentes: Number(form.metas.agentes) || 0,
					tecnicos: Number(form.metas.tecnicos) || 0,
				},
			});
			setMessage("Forca tarefa salva e painel publico atualizado.");
		} catch (err) {
			setError(err?.message || "Nao foi possivel salvar a forca tarefa.");
		}
	};

	return (
		<div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
			<section className="rounded-2xl border border-gray-100 bg-white p-5">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h2 className="text-sm font-bold text-gray-900">
							Configurar forca tarefa
						</h2>
						<p className="mt-1 text-xs text-gray-500">
							Ative um desafio temporario para aparecer no /painel.
						</p>
					</div>
					<span
						className={`rounded-full px-3 py-1 text-xs font-semibold ${
							form.ativa
								? "bg-emerald-50 text-emerald-700"
								: "bg-gray-100 text-gray-500"
						}`}
					>
						{form.ativa ? "Ativa" : "Desativada"}
					</span>
				</div>

				<form className="mt-5 space-y-4" onSubmit={handleSubmit}>
					<label className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
						<input
							type="checkbox"
							checked={form.ativa}
							disabled={!canManage || saving}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									ativa: event.target.checked,
								}))
							}
						/>
						Mostrar forca tarefa no painel
					</label>

					<div className="grid gap-4 sm:grid-cols-2">
						<label className="space-y-1.5">
							<span className="text-xs font-semibold text-gray-600">
								Inicio
							</span>
							<input
								type="date"
								className="input-field"
								value={form.inicio}
								disabled={!canManage || saving}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										inicio: event.target.value,
									}))
								}
							/>
						</label>
						<label className="space-y-1.5">
							<span className="text-xs font-semibold text-gray-600">Fim</span>
							<input
								type="date"
								className="input-field"
								value={form.fim}
								disabled={!canManage || saving}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										fim: event.target.value,
									}))
								}
							/>
						</label>
					</div>

					<div className="grid gap-4 sm:grid-cols-3">
						<label className="space-y-1.5">
							<span className="text-xs font-semibold text-gray-600">
								Meta regionais
							</span>
							<input
								type="number"
								min="0"
								className="input-field"
								value={form.metas.regionais}
								disabled={!canManage || saving}
								onChange={(event) =>
									updateMeta("regionais", event.target.value)
								}
							/>
						</label>
						<label className="space-y-1.5">
							<span className="text-xs font-semibold text-gray-600">
								Meta agente autorizado
							</span>
							<input
								type="number"
								min="0"
								className="input-field"
								value={form.metas.agentes}
								disabled={!canManage || saving}
								onChange={(event) => updateMeta("agentes", event.target.value)}
							/>
						</label>
						<label className="space-y-1.5">
							<span className="text-xs font-semibold text-gray-600">
								Meta tecnicos retirada
							</span>
							<input
								type="number"
								min="0"
								className="input-field"
								value={form.metas.tecnicos}
								disabled={!canManage || saving}
								onChange={(event) => updateMeta("tecnicos", event.target.value)}
							/>
						</label>
					</div>

					{canManage ? (
						<button
							type="submit"
							disabled={saving}
							className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saving ? "Salvando..." : "Salvar forca tarefa"}
						</button>
					) : null}

					{message ? (
						<p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
							{message}
						</p>
					) : null}
					{error ? (
						<p className="text-sm font-semibold text-red-600">{error}</p>
					) : null}
				</form>
			</section>

			<section className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
				<p className="text-xs font-bold uppercase tracking-wide text-orange-700">
					Como vai aparecer no painel
				</p>
				<h3 className="mt-2 text-xl font-extrabold text-gray-900">
					Forca tarefa
				</h3>
				<p className="mt-2 text-sm text-gray-600">
					O /painel vai somar apenas as entregas entre as datas configuradas e
					comparar com as metas abaixo.
				</p>
				<div className="mt-5 grid gap-3 sm:grid-cols-3">
					<div className="rounded-xl bg-white p-4">
						<p className="text-xs text-gray-500">Regionais</p>
						<p className="mt-1 text-2xl font-black text-blue-700">
							{form.metas.regionais}
						</p>
					</div>
					<div className="rounded-xl bg-white p-4">
						<p className="text-xs text-gray-500">Agente autorizado</p>
						<p className="mt-1 text-2xl font-black text-blue-700">
							{form.metas.agentes}
						</p>
					</div>
					<div className="rounded-xl bg-white p-4">
						<p className="text-xs text-gray-500">Tecnicos retirada</p>
						<p className="mt-1 text-2xl font-black text-blue-700">
							{form.metas.tecnicos}
						</p>
					</div>
				</div>
			</section>

			<ForceTaskCopyMessages
				config={config}
				allData={allData}
				agentesData={agentesData}
			/>
		</div>
	);
}

function MetasBaseConfigModal({ config, onClose, onSave, saving }) {
	const [form, setForm] = useState(() => normalizeMetasBaseConfig(config));
	const [error, setError] = useState("");

	const updateBase = (baseId, patch) => {
		setForm((current) => ({
			...current,
			[baseId]: {
				...current[baseId],
				...patch,
			},
		}));
	};

	const updateSeasonalMonth = (baseId, mes, value) => {
		setForm((current) => ({
			...current,
			[baseId]: {
				...current[baseId],
				seasonalPercentByMonth: {
					...current[baseId].seasonalPercentByMonth,
					[mes]: value,
				},
			},
		}));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		try {
			await onSave(form);
			onClose();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar as metas.");
		}
	};

	return (
		<ModalShell
			title="Configurar metas por base"
			description="Escolha se cada base usa meta sazonal por mês ou uma meta fixa em todos os meses."
			onClose={onClose}
			size="5xl"
			footer={
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					{error ? (
						<p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
							{error}
						</p>
					) : (
						<p className="text-xs font-semibold text-slate-500">
							A alteração recalcula os cards e relatórios sem precisar resubir a
							planilha.
						</p>
					)}
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
						>
							Cancelar
						</button>
						<button
							type="submit"
							form="metas-base-config-form"
							disabled={saving}
							className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saving ? "Salvando..." : "Salvar metas"}
						</button>
					</div>
				</div>
			}
		>
			<form
				id="metas-base-config-form"
				className="space-y-4"
				onSubmit={handleSubmit}
			>
				{META_BASES.map((base) => {
					const baseConfig = form[base.id];
					const isFixa = baseConfig.mode === META_MODES.FIXA;

					return (
						<section
							key={base.id}
							className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
						>
							<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div>
									<p className="text-xs font-black uppercase tracking-wide text-blue-600">
										{base.label}
									</p>
									<h3 className="mt-1 text-lg font-black text-slate-950">
										Regra da meta
									</h3>
									<p className="mt-1 text-sm text-slate-500">
										Esta base é independente das outras e será avaliada pela
										regra abaixo.
									</p>
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									<label className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
										<span className="text-xs font-bold uppercase text-slate-500">
											Tipo
										</span>
										<select
											value={baseConfig.mode}
											onChange={(event) =>
												updateBase(base.id, { mode: event.target.value })
											}
											className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
										>
											<option value={META_MODES.SAZONAL}>Meta sazonal</option>
											<option value={META_MODES.FIXA}>Meta fixa</option>
										</select>
									</label>
									<label className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
										<span className="text-xs font-bold uppercase text-slate-500">
											Percentual fixo
										</span>
										<input
											type="number"
											min="0"
											max="100"
											step="0.1"
											value={baseConfig.fixedPercent}
											onChange={(event) =>
												updateBase(base.id, {
													fixedPercent: event.target.value,
												})
											}
											disabled={!isFixa}
											className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
										/>
									</label>
								</div>
							</div>

							{!isFixa ? (
								<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
									{META_MESES.map((mes) => (
										<label
											key={mes}
											className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm"
										>
											<span className="text-xs font-bold text-slate-500">
												{mes === "Marco" ? "Março" : mes}
											</span>
											<div className="mt-1 flex items-center gap-2">
												<input
													type="number"
													min="0"
													max="100"
													step="0.1"
													value={baseConfig.seasonalPercentByMonth[mes]}
													onChange={(event) =>
														updateSeasonalMonth(
															base.id,
															mes,
															event.target.value,
														)
													}
													className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
												/>
												<span className="text-xs font-bold text-slate-400">
													%
												</span>
											</div>
										</label>
									))}
								</div>
							) : null}
						</section>
					);
				})}
			</form>
		</ModalShell>
	);
}

// Extraidos pra achado javascript:S3358 (ternario aninhado).
function resolveMonthButtonClass({ mesSelecionado, m, allData, fonteDados, aba }) {
	if (mesSelecionado === m) return "bg-blue-600 text-white";
	if (temDadosNaFonte(allData[m], fonteDados)) {
		return "bg-gray-100 text-gray-600 hover:bg-gray-200";
	}
	if (aba === "lancamento") return "bg-gray-100 text-gray-600 hover:bg-gray-200";
	return "bg-gray-50 text-gray-300 cursor-default";
}

function resolveFonteButtonClass(fonteDados, fonteId, disponivel) {
	if (fonteDados === fonteId) return "bg-blue-600 text-white shadow-sm";
	if (disponivel) return "bg-gray-100 text-gray-600 hover:bg-gray-200";
	return "bg-gray-50 text-gray-300 cursor-not-allowed";
}

const MetasPage = () => {
	const { currentUser } = useAuthContext();
	const podeGerenciar = hasPermission(currentUser, "manage_metas");

	const {
		allData,
		loading,
		uploading,
		lastUpdate,
		mesSelecionado,
		setMesSelecionado,
		processarPlanilha,
		feriadosExtras,
		forcaTarefaConfig,
		agentesData,
		savingForcaTarefa,
		salvarForcaTarefa,
		metasBaseConfig,
		savingMetasBaseConfig,
		salvarConfiguracaoMetasBase,
		savingManualEntry,
		salvarLancamentoManual,
	} = useMetas();

	// Converte array MM-DD para Set, memoizado
	const feriadosSet = useMemo(
		() => new Set(feriadosExtras ?? []),
		[feriadosExtras],
	);

	const [aba, setAba] = useState("resumo");
	const [fonteDados, setFonteDados] = useState("sempre");
	const [showMetasConfig, setShowMetasConfig] = useState(false);
	const allDataFonte = useMemo(
		() => buildAllDataPorFonte(allData, fonteDados),
		[allData, fonteDados],
	);
	const dadosMesFonte = allDataFonte[mesSelecionado] || null;
	const temDados = Object.keys(allData).length > 0;
	const fonteSelecionadaLabel =
		FONTES_DADOS.find((fonte) => fonte.id === fonteDados)?.label || "SEMPRE";

	const tabClass = (id) =>
		`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
			aba === id
				? "bg-blue-600 text-white shadow-sm"
				: "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
		}`;

	const fonteDisponivelNoMes = (fonte) =>
		temDadosNaFonte(allData?.[mesSelecionado], fonte);

	if (loading)
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner />
			</div>
		);

	return (
		<div className="space-y-4 p-4 md:p-6">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold text-gray-900">
						Retirada FTTH · 2026
					</h1>
					{lastUpdate && (
						<p className="text-xs text-gray-400 mt-0.5">{lastUpdate}</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					{podeGerenciar && (
						<button
							type="button"
							onClick={() => setShowMetasConfig(true)}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"
							title="Configurar meta sazonal ou fixa por base"
						>
							<Settings size={16} />
							Configurar metas
						</button>
					)}
					{podeGerenciar && (
						<MetasUpload onUpload={processarPlanilha} uploading={uploading} />
					)}
					<MetasReportsCentral
						allData={allData}
						agentesData={agentesData}
						currentMonth={mesSelecionado}
					/>
					<MetasExportButton dadosMes={dadosMesFonte || {}} />
					<MetasExportPDF
						allData={allDataFonte}
						dadosMes={dadosMesFonte}
						feriadosSet={feriadosSet}
					/>
				</div>
			</div>

			{/* Sem dados */}
			{!temDados && aba !== "lancamento" && (
				<div className="bg-white rounded-2xl border border-gray-100 p-14 text-center">
					<BarChart2 size={32} className="text-gray-200 mx-auto mb-3" />
					<p className="text-sm font-semibold text-gray-400">
						Nenhum dado carregado.
					</p>
					{podeGerenciar && (
						<p className="text-xs text-gray-300 mt-1">
							Clique em <strong>Atualizar Planilha</strong> para importar os
							dados.
						</p>
					)}
				</div>
			)}

			{(temDados || podeGerenciar) && (
				<>
					{/* Seletor de mes */}
					{aba !== "auditoria" && (
						<div className="flex flex-wrap items-center gap-2">
							{aba === "lancamento" ? (
								<div className="mr-1 flex items-center gap-2 rounded-2xl border border-blue-100 bg-white p-1.5">
									<button
										type="button"
										onClick={() => setMesSelecionado(moveMonth(mesSelecionado, -1))}
										className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100"
										title="Voltar mês"
									>
										<SkipBack size={16} />
									</button>
									<select
										value={mesSelecionado}
										onChange={(event) => setMesSelecionado(event.target.value)}
										className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400"
										aria-label="Mês do lançamento"
									>
										{MESES.map((m) => (
											<option key={m} value={m}>
												{m}
											</option>
										))}
									</select>
									<button
										type="button"
										onClick={() => setMesSelecionado(moveMonth(mesSelecionado, 1))}
										className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100"
										title="Avançar mês"
									>
										<SkipForward size={16} />
									</button>
								</div>
							) : null}
							{MESES.map((m) => (
								<button
									type="button"
									key={m}
									onClick={() => setMesSelecionado(m)}
									className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${resolveMonthButtonClass(
										{ mesSelecionado, m, allData, fonteDados, aba },
									)}`}
									disabled={
										aba !== "lancamento" &&
										!temDadosNaFonte(allData[m], fonteDados) &&
										mesSelecionado !== m
									}
								>
									{m}
								</button>
							))}
						</div>
					)}

					{aba !== "auditoria" && (
						<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3">
							<div>
								<p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
									Base dos dados
								</p>
								<p className="text-sm font-extrabold text-gray-900">
									{fonteSelecionadaLabel}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								{FONTES_DADOS.map((fonte) => {
									const disponivel = fonteDisponivelNoMes(fonte.id);
									return (
										<button
											key={fonte.id}
											type="button"
											onClick={() => setFonteDados(fonte.id)}
											disabled={!disponivel}
											className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${resolveFonteButtonClass(
												fonteDados,
												fonte.id,
												disponivel,
											)}`}
											title={
												disponivel
													? fonte.label
													: "Sem dados nesta fonte para o mes selecionado"
											}
										>
											{fonte.label}
										</button>
									);
								})}
							</div>
						</div>
					)}

					{/* Abas */}
					<div className="flex flex-wrap gap-1 bg-white rounded-2xl border border-gray-100 p-2">
						{ABAS.map(({ id, label, icon: Icon }) => (
							<button
								type="button"
								key={id}
								onClick={() => setAba(id)}
								className={tabClass(id)}
							>
								<Icon size={15} />
								{label}
							</button>
						))}
					</div>

					{/* Conteudo */}
					{aba === "resumo" && (
						<MetasResumoMensal
							allData={allDataFonte}
							mesSelecionado={mesSelecionado}
							onSelectMes={setMesSelecionado}
							feriadosSet={feriadosSet}
						/>
					)}
					{aba === "performance" && (
						<MetasPerformance dados={dadosMesFonte} mes={mesSelecionado} />
					)}
					{aba === "saldo" && (
						<MetasSaldoDiario dados={dadosMesFonte} feriadosSet={feriadosSet} />
					)}
					{aba === "lancamento" && (
						<MetasLancamentoManual
							key={mesSelecionado}
							month={mesSelecionado}
							allData={allData}
							agentesData={agentesData}
							metasBaseConfig={metasBaseConfig}
							onSave={salvarLancamentoManual}
							saving={savingManualEntry}
							canManage={podeGerenciar}
						/>
					)}
					{aba === "multas" && (
						<MetasMultas dados={dadosMesFonte} mes={mesSelecionado} />
					)}
					{aba === "forca-tarefa" && (
						<MetasForcaTarefaConfig
							config={forcaTarefaConfig}
							onSave={salvarForcaTarefa}
							saving={savingForcaTarefa}
							canManage={podeGerenciar}
							allData={allData}
							agentesData={agentesData}
						/>
					)}
					{aba === "auditoria" && <MetasAuditoria />}
				</>
			)}

			{showMetasConfig ? (
				<MetasBaseConfigModal
					config={metasBaseConfig}
					onClose={() => setShowMetasConfig(false)}
					onSave={salvarConfiguracaoMetasBase}
					saving={savingMetasBaseConfig}
				/>
			) : null}
		</div>
	);
};

export default MetasPage;

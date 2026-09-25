import {
	AlertTriangle,
	CalendarPlus,
	ChevronLeft,
	ChevronRight,
	MessageCircleReply,
	RefreshCw,
	Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import PageHeader from "../../../components/ui/PageHeader";
import ResponsiveDataView from "../../../components/ui/ResponsiveDataView";
import {
	buscarMensageriaEnviados,
	gerarAgendamentoPorRespostasMensageria,
} from "../services/mensageriaService";

const PAGE_SIZE = 20;

const formatDateTime = (value) => {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const toDateKey = (value) => {
	const text = String(value || "").trim();
	if (!text) return "";
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
	const match = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
	if (!match) return "";
	const day = Number(match[1]);
	const month = Number(match[2]);
	const rawYear = match[3] ? Number(match[3]) : new Date().getFullYear();
	const year = rawYear < 100 ? 2000 + rawYear : rawYear;
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return "";
	}
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const toTimeValue = (value) => {
	const text = String(value || "").trim();
	const match =
		text.match(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b/i) ||
		text.match(/\b(\d{1,2})\s*h(?:oras?)?\b/i);
	if (!match) return "";
	const hour = Number(match[1]);
	const minute = Number(match[2] || 0);
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const resolveStoredScheduleResult = (item, responses = [], sentItems = []) => {
	const related = [...responses, ...sentItems, item].filter(Boolean);
	const appointmentId = related.find(
		(entry) => entry.agendamento_id || entry.agendamentoId,
	);
	if (!appointmentId) return null;
	const orderedResponses = [...responses].sort(
		(left, right) => getItemTimestamp(left) - getItemTimestamp(right),
	);
	let date = "";
	let time = "";
	orderedResponses.forEach((response) => {
		const message = readCallbackMessage(response);
		date = toDateKey(response.schedule?.date || message) || date;
		time = toTimeValue(response.schedule?.time || message) || time;
	});
	return {
		ok: true,
		created: false,
		agendamento_id:
			appointmentId.agendamento_id || appointmentId.agendamentoId || "",
		schedule: { date, time },
		message: "Agendamento já gerado para este cliente/O.S.",
	};
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const getPhoneVariants = (value) => {
	const digits = normalizePhone(value);
	if (!digits) return [];
	const variants = new Set([digits]);
	if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
		variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
	}
	if (digits.startsWith("55") && digits.length === 12) {
		variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
	}
	return [...variants];
};

const getPhoneGroupKey = (value) => {
	const variants = getPhoneVariants(value);
	return (
		variants.sort((a, b) => a.length - b.length)[0] || normalizePhone(value)
	);
};

const readCallbackMessage = (callback) =>
	callback?.mensagem ||
	callback?.message ||
	callback?.text ||
	callback?.payload?.message ||
	callback?.payload?.text ||
	callback?.payload?.data?.message?.conversation ||
	callback?.payload?.data?.message?.extendedTextMessage?.text ||
	callback?.payload?.data?.body ||
	"";

const getItemTimestamp = (item) => {
	const value =
		item?.criadoEm?.value ||
		item?.criadoEm ||
		item?.criado_em?.value ||
		item?.criado_em ||
		item?.recebido_em?.value ||
		item?.recebido_em ||
		item?.atualizadoEm?.value ||
		item?.atualizadoEm ||
		"";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const groupItemsByPhone = (items = []) => {
	const groups = new Map();
	items.forEach((item) => {
		const key = getPhoneGroupKey(item.telefone) || item.id;
		const current = groups.get(key);
		if (!current) {
			groups.set(key, { ...item, groupedItems: [item] });
			return;
		}
		const currentDate = getItemTimestamp(current);
		const nextDate = getItemTimestamp(item);
		if (nextDate > currentDate) {
			groups.set(key, {
				...item,
				groupedItems: [...current.groupedItems, item],
			});
		} else {
			current.groupedItems.push(item);
		}
	});
	return [...groups.values()].sort(
		(a, b) => getItemTimestamp(b) - getItemTimestamp(a),
	);
};

const addToIndex = (map, key, callback) => {
	const normalizedKey = String(key || "").trim();
	if (!normalizedKey) return;
	const current = map.get(normalizedKey) || [];
	current.push(callback);
	map.set(normalizedKey, current);
};

const buildCallbackIndexes = (callbacks = []) => {
	const byHistory = new Map();
	const byQueue = new Map();
	const byOs = new Map();
	const byPhone = new Map();

	callbacks.forEach((callback) => {
		addToIndex(byHistory, callback.historicoId, callback);
		addToIndex(byQueue, callback.filaId, callback);
		addToIndex(byOs, callback.os, callback);
		getPhoneVariants(callback.telefone).forEach((phone) =>
			addToIndex(byPhone, phone, callback),
		);
	});

	return { byHistory, byQueue, byOs, byPhone };
};

const findResponsesForItem = (item, indexes) => {
	const responseMap = new Map();
	const addResponses = (responses = []) => {
		responses.forEach((response) => {
			responseMap.set(
				response.id ||
					`${response.telefone}-${getItemTimestamp(response)}-${readCallbackMessage(response)}`,
				response,
			);
		});
	};

	addResponses(indexes.byHistory.get(String(item.id || "")));
	addResponses(indexes.byQueue.get(String(item.filaId || "")));
	addResponses(indexes.byOs.get(String(item.os || "")));
	getPhoneVariants(item.telefone).forEach((phone) =>
		addResponses(indexes.byPhone.get(phone)),
	);

	return [...responseMap.values()].sort(
		(a, b) => getItemTimestamp(b) - getItemTimestamp(a),
	);
};

const MensageriaEnviadosPage = () => {
	const [items, setItems] = useState([]);
	const [callbacks, setCallbacks] = useState([]);
	const [resumo, setResumo] = useState({
		enviados: 0,
		falhas: 0,
		respostas: 0,
	});
	const [page, setPage] = useState(0);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(true);
	const [feedback, setFeedback] = useState("");
	const [conversationModal, setConversationModal] = useState(null);
	const [viewTab, setViewTab] = useState("todos");
	const [scheduleWorking, setScheduleWorking] = useState(false);
	const [scheduleFeedback, setScheduleFeedback] = useState("");
	const [scheduleResult, setScheduleResult] = useState(null);

	const latestCallbacksByPhone = useMemo(() => {
		const groups = new Map();
		callbacks.forEach((callback) => {
			const key = getPhoneGroupKey(callback.telefone) || callback.id;
			const current = groups.get(key);
			const currentDate = getItemTimestamp(current);
			const nextDate = getItemTimestamp(callback);
			if (!current || nextDate >= currentDate) {
				groups.set(key, callback);
			}
		});
		return [...groups.values()].sort(
			(a, b) => getItemTimestamp(b) - getItemTimestamp(a),
		);
	}, [callbacks]);

	const loadData = useCallback(async () => {
		setLoading(true);
		setFeedback("");
		try {
			const result = await buscarMensageriaEnviados({
				limit: 1000,
				offset: 0,
			});
			setItems(result.items || []);
			setCallbacks(result.callbacks || []);
			setResumo(result.resumo || {});
			setPage(0);
		} catch (error) {
			setFeedback(error?.message || "N?o foi poss?vel carregar os envios.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const visibleItems = useMemo(() => {
		const search = query.trim().toLowerCase();
		const callbackIndexes = buildCallbackIndexes(callbacks);
		const grouped = groupItemsByPhone(items).map((item) => {
			const relatedItems = item.groupedItems?.length
				? item.groupedItems
				: [item];
			const responseMap = new Map();
			relatedItems.forEach((relatedItem) => {
				findResponsesForItem(relatedItem, callbackIndexes).forEach(
					(response) => {
						responseMap.set(
							response.id ||
								`${response.telefone}-${getItemTimestamp(response)}-${readCallbackMessage(response)}`,
							response,
						);
					},
				);
			});
			const responses = [...responseMap.values()].sort(
				(a, b) => getItemTimestamp(b) - getItemTimestamp(a),
			);
			return { ...item, groupedItems: relatedItems, responses };
		});
		const tabFiltered =
			viewTab === "agendados"
				? grouped.filter((item) =>
						item.responses?.some(
							(response) => response.agendado || response.status === "agendado",
						),
					)
				: grouped;
		const filtered = search
			? tabFiltered.filter((item) =>
					[
						item.cliente,
						item.telefone,
						item.os,
						item.cidade,
						item.status,
						item.origem,
					]
						.join(" ")
						.toLowerCase()
						.includes(search),
				)
			: tabFiltered;
		return filtered;
	}, [callbacks, items, query, viewTab]);

	const pageItems = useMemo(() => {
		const start = page * PAGE_SIZE;
		return visibleItems.slice(start, start + PAGE_SIZE);
	}, [page, visibleItems]);
	const hasNext = (page + 1) * PAGE_SIZE < visibleItems.length;

	const handleViewTabChange = (nextTab) => {
		setViewTab(nextTab);
		setPage(0);
	};

	const handleQueryChange = (event) => {
		setQuery(event.target.value);
		setPage(0);
	};

	const openConversationModal = (item, responses = [], sentItems = []) => {
		const existingSchedule = resolveStoredScheduleResult(
			item,
			responses,
			sentItems,
		);
		setScheduleFeedback(existingSchedule?.message || "");
		setScheduleResult(existingSchedule);
		setConversationModal({ item, responses, sentItems });
	};

	const handleGenerateAppointment = async () => {
		if (!conversationModal?.item) return;
		setScheduleWorking(true);
		setScheduleFeedback("");
		setScheduleResult(null);
		setFeedback("");
		try {
			const item = conversationModal.item;
			const response = conversationModal.responses?.[0] || {};
			const sentItem = conversationModal.sentItems?.[0] || {};
			const result = await gerarAgendamentoPorRespostasMensageria({
				telefone: item.telefone || response.telefone || sentItem.telefone || "",
				os: item.os || response.os || sentItem.os || "",
				filaId: item.filaId || response.filaId || sentItem.filaId || "",
				historicoId: item.id || response.historicoId || sentItem.id || "",
			});
			const message =
				result?.message ||
				(result?.created
					? "Agendamento criado pelas respostas registradas."
					: "Agendamento já existia para este cliente.");
			setScheduleFeedback(message);
			setScheduleResult(result || null);
			setFeedback(message);
			await loadData();
		} catch (error) {
			const message =
				error?.message || "Não foi possível gerar o agendamento.";
			setScheduleFeedback(message);
			setScheduleResult(null);
			setFeedback(message);
		} finally {
			setScheduleWorking(false);
		}
	};

	return (
		<div className="space-y-6">
			<PageHeader
				title="Enviados"
				description="Mensagens enviadas pela Mensageria e respostas recebidas dos clientes."
				icon={
					<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
						<Send size={22} />
					</span>
				}
				actions={
					<button
						type="button"
						onClick={loadData}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<RefreshCw size={17} className={loading ? "animate-spin" : ""} />
						Atualizar
					</button>
				}
			/>

			{feedback ? (
				<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
					{feedback}
				</div>
			) : null}

			<section className="grid gap-4 md:grid-cols-3">
				<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
					<p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
						Enviadas
					</p>
					<p className="mt-2 text-2xl font-bold text-emerald-900">
						{Number(resumo.enviados || 0).toLocaleString("pt-BR")}
					</p>
				</div>
				<div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
					<p className="text-xs font-bold uppercase tracking-wide text-blue-700">
						Respostas
					</p>
					<p className="mt-2 text-2xl font-bold text-blue-900">
						{Number(resumo.respostas || 0).toLocaleString("pt-BR")}
					</p>
				</div>
				<div className="rounded-lg border border-red-200 bg-red-50 p-4">
					<p className="text-xs font-bold uppercase tracking-wide text-red-700">
						Falhas
					</p>
					<p className="mt-2 text-2xl font-bold text-red-900">
						{Number(resumo.falhas || 0).toLocaleString("pt-BR")}
					</p>
				</div>
			</section>

			<section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-2 text-slate-900">
					<MessageCircleReply size={18} className="text-blue-700" />
					<h2 className="text-lg font-bold">Últimas respostas recebidas</h2>
				</div>
				<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{latestCallbacksByPhone.length ? (
						latestCallbacksByPhone.slice(0, 8).map((callback) => (
							<div
								key={callback.id}
								className="rounded-lg border border-blue-100 bg-blue-50 p-3"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs font-bold uppercase tracking-wide text-blue-700">
										{callback.telefone || "Telefone não identificado"}
									</p>
									<span className="text-[11px] font-semibold text-slate-500">
										{formatDateTime(callback.criado_em)}
									</span>
								</div>
								<p className="mt-2 text-sm font-semibold text-slate-900">
									{callback.cliente || callback.os || "Cliente não localizado"}
								</p>
								<div className="mt-2 flex items-center justify-between gap-2">
									<p className="text-xs font-bold text-blue-700">
										{callback.status || "-"}
									</p>
									<button
										type="button"
										onClick={() =>
											openConversationModal(callback, [callback], [])
										}
										className="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
									>
										Ver resposta
									</button>
								</div>
							</div>
						))
					) : (
						<div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
							Nenhuma resposta recebida ainda.
						</div>
					)}
				</div>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
					<button
						type="button"
						onClick={() => handleViewTabChange("todos")}
						className={`rounded-md px-4 py-2 text-sm font-bold transition ${
							viewTab === "todos"
								? "bg-blue-600 text-white shadow-sm"
								: "text-slate-600 hover:bg-white"
						}`}
					>
						Todos
					</button>
					<button
						type="button"
						onClick={() => handleViewTabChange("agendados")}
						className={`rounded-md px-4 py-2 text-sm font-bold transition ${
							viewTab === "agendados"
								? "bg-blue-600 text-white shadow-sm"
								: "text-slate-600 hover:bg-white"
						}`}
					>
						Agendados automaticamente
					</button>
				</div>
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<input
						value={query}
						onChange={handleQueryChange}
						placeholder="Buscar por cliente, telefone, O.S. ou cidade"
						className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 md:max-w-md"
					/>
					<div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
						<span>Pagina {page + 1}</span>
						<button
							type="button"
							disabled={page === 0 || loading}
							onClick={() => setPage((current) => Math.max(current - 1, 0))}
							className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<ChevronLeft size={17} />
						</button>
						<button
							type="button"
							disabled={!hasNext || loading}
							onClick={() => setPage((current) => current + 1)}
							className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<ChevronRight size={17} />
						</button>
					</div>
				</div>

				<div className="mt-5">
					{loading ? (
						<div className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-500">
							<RefreshCw size={17} className="animate-spin" />
							Carregando envios...
						</div>
					) : (
						<ResponsiveDataView
							items={pageItems}
							getRowKey={(item) => item.id}
							emptyMessage="Nenhum envio encontrado."
							strategy="cards"
							minTableWidth="min-w-[980px]"
							columns={[
								{
									key: "cliente",
									header: "Cliente",
									render: (item) => (
										<div>
											<p className="font-bold text-slate-900">
												{item.cliente || "-"}
											</p>
											<p className="text-xs text-slate-500">
												{item.os || "-"} • {item.cidade || "-"}
											</p>
										</div>
									),
								},
								{
									key: "telefone",
									header: "Telefone",
									render: (item) => (
										<span className="font-semibold">
											{item.telefone || "-"}
										</span>
									),
								},
								{
									key: "data",
									header: "Data",
									render: (item) =>
										formatDateTime(item.criadoEm || item.criado_em),
								},
								{
									key: "status",
									header: "Status",
									render: (item) => (
										<span
											className={`inline-flex h-fit w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
												item.status === "falhou"
													? "bg-red-50 text-red-700"
													: "bg-emerald-50 text-emerald-700"
											}`}
										>
											{item.status === "falhou" ? (
												<AlertTriangle size={13} />
											) : (
												<Send size={13} />
											)}
											{item.status || "enviado"}
										</span>
									),
								},
								{
									key: "resposta",
									header: "Resposta do cliente",
									render: (item) => {
										const relatedItems = item.groupedItems?.length
											? item.groupedItems
											: [item];
										const responses = item.responses || [];
										const latestResponse = responses[0] || null;
										return latestResponse ? (
											<div className="space-y-2">
												<div className="rounded-lg border border-blue-100 bg-blue-50 p-2">
													<div className="flex items-center gap-1 text-xs font-bold text-blue-700">
														<MessageCircleReply size={13} />
														{formatDateTime(latestResponse.criado_em)}
													</div>
													<p className="mt-1 text-xs text-slate-500">
														{latestResponse.status || "-"}
													</p>
													<button
														type="button"
														onClick={() =>
															openConversationModal(
																item,
																responses,
																relatedItems,
															)
														}
														className="mt-2 inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-100"
													>
														{responses.length > 1
															? `Ver ${responses.length} respostas`
															: "Ver resposta"}
													</button>
												</div>
											</div>
										) : (
											<button
												type="button"
												onClick={() =>
													openConversationModal(item, responses, relatedItems)
												}
												className="min-h-11 text-xs font-semibold text-slate-400 underline-offset-2 hover:text-blue-700 hover:underline"
											>
												Sem resposta registrada
											</button>
										);
									},
								},
							]}
						/>
					)}
				</div>
			</section>

			{conversationModal ? (
				<ModalShell
					title="Mensagens do cliente"
					description={`${conversationModal.item?.cliente || "-"} · ${conversationModal.item?.telefone || "-"}`}
					onClose={() => setConversationModal(null)}
					size="4xl"
				>
					<div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm font-bold text-blue-900">
								Gerar agendamento por respostas
							</p>
							<p className="text-xs font-semibold text-blue-700">
								O sistema relê as mensagens recebidas, identifica data e horário
								e cria o agendamento sem reenviar WhatsApp.
							</p>
						</div>
						{scheduleResult?.agendamento_id ? (
							<a
								href={`/agendamentos${
									scheduleResult.schedule?.date
										? `?data=${encodeURIComponent(scheduleResult.schedule.date)}`
										: ""
								}`}
								className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
							>
								<CalendarPlus size={16} />
								Ver no calendário
							</a>
						) : (
							<button
								type="button"
								onClick={handleGenerateAppointment}
								disabled={scheduleWorking || !conversationModal.responses?.length}
								className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<CalendarPlus size={16} />
								{scheduleWorking ? "Gerando..." : "Gerar agendamento"}
							</button>
						)}
					</div>
					{scheduleFeedback ? (
						<div
							className={`mb-4 rounded-lg border px-4 py-3 text-sm font-bold ${
								scheduleResult?.agendamento_id
									? "border-emerald-200 bg-emerald-50 text-emerald-800"
									: "border-blue-200 bg-white text-blue-800"
							}`}
						>
							{scheduleFeedback}
						</div>
					) : null}
					<div className="grid gap-4 lg:grid-cols-2">
						<div>
							<h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-blue-700">
								Recebidas
							</h3>
							<div className="space-y-3">
								{conversationModal.responses?.length ? (
									conversationModal.responses.map((response) => (
										<div
											key={response.id}
											className="rounded-lg border border-blue-100 bg-blue-50 p-3"
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
													<MessageCircleReply size={13} />
													{formatDateTime(response.criado_em)}
												</span>
												<span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">
													{response.status || "-"}
												</span>
											</div>
											<p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
												{readCallbackMessage(response) ||
													"Mensagem sem texto legível"}
											</p>
											{response.motivo ? (
												<p className="mt-2 text-xs font-semibold text-slate-500">
													{response.motivo}
												</p>
											) : null}
										</div>
									))
								) : (
									<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500">
										Nenhuma resposta recebida.
									</div>
								)}
							</div>
						</div>
						<div>
							<h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-700">
								Enviadas
							</h3>
							<div className="space-y-3">
								{(conversationModal.sentItems || []).map((sentItem) => (
									<div
										key={sentItem.id}
										className="rounded-lg border border-emerald-100 bg-emerald-50 p-3"
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
												<Send size={13} />
												{formatDateTime(
													sentItem.criadoEm || sentItem.criado_em,
												)}
											</span>
											<span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">
												{sentItem.status || "enviado"}
											</span>
										</div>
										<p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
											{sentItem.mensagem ||
												"Mensagem enviada sem corpo registrado."}
										</p>
										<p className="mt-2 text-xs font-semibold text-slate-500">
											{sentItem.origem || "-"} - {sentItem.os || "-"}
										</p>
									</div>
								))}
							</div>
						</div>
					</div>
				</ModalShell>
			) : null}
		</div>
	);
};

export default MensageriaEnviadosPage;

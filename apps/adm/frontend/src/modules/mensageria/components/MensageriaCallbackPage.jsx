import {
	CalendarCheck,
	Clock3,
	MessageCircleReply,
	RefreshCw,
	Send,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/useAuthContext";
import {
	buscarCallbacksMensageria,
	registrarCallbackMensageria,
} from "../services/mensageriaService";

const STATUS_LABELS = {
	agendado: "Agendado",
	recebido: "Recebido",
	sem_data_horario: "Sem data/horário",
	dados_insuficientes: "Dados insuficientes",
	cliente_nao_localizado: "Cliente não localizado",
	cliente_indisponivel: "Cliente indisponível",
	erro: "Erro",
};

const STATUS_CLASSES = {
	agendado: "border-emerald-200 bg-emerald-50 text-emerald-700",
	recebido: "border-blue-200 bg-blue-50 text-blue-700",
	sem_data_horario: "border-amber-200 bg-amber-50 text-amber-700",
	dados_insuficientes: "border-orange-200 bg-orange-50 text-orange-700",
	cliente_nao_localizado: "border-orange-200 bg-orange-50 text-orange-700",
	cliente_indisponivel: "border-slate-200 bg-slate-50 text-slate-700",
	erro: "border-red-200 bg-red-50 text-red-700",
};

const initialForm = {
	codigo_cliente: "",
	telefone: "",
	cliente: "",
	mensagem: "Pode agendar para 15/08/2026 às 14:30",
};

const formatDateTime = (value) => {
	const date = value?.toDate?.() || (value ? new Date(value) : null);
	if (!date || Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const getCallbackDate = (item = {}) =>
	item.criado_em ||
	item.criadoEm ||
	item.recebido_em ||
	item.recebidoEm ||
	item.updatedAt ||
	item.atualizado_em ||
	null;

const formatSchedule = (schedule) => {
	if (!schedule?.date) return "-";
	const [year, month, day] = schedule.date.split("-");
	return `${day}/${month}/${year}${schedule.time ? ` ${schedule.time}` : ""}`;
};

const MensageriaCallbackPage = () => {
	const { currentUser } = useAuthContext();
	const canManage =
		hasPermission(currentUser, "mensageria.callback.manage") ||
		hasPermission(currentUser, "manage_mensageria");
	const [callbacks, setCallbacks] = useState([]);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [sending, setSending] = useState(false);
	const [feedback, setFeedback] = useState("");

	const loadData = async () => {
		setLoading(true);
		setFeedback("");
		try {
			setCallbacks(await buscarCallbacksMensageria());
		} catch (error) {
			setFeedback(error?.message || "Não foi possível carregar os callbacks.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, []);

	const stats = useMemo(
		() => ({
			total: callbacks.length,
			agendados: callbacks.filter((item) => item.agendado).length,
			pendentes: callbacks.filter((item) => !item.agendado).length,
			semData: callbacks.filter((item) => item.status === "sem_data_horario")
				.length,
		}),
		[callbacks],
	);

	const setField = (field, value) => {
		setForm((current) => ({ ...current, [field]: value }));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setSending(true);
		setFeedback("");
		try {
			const result = await registrarCallbackMensageria({
				...form,
				origem: "teste_manual",
			});
			setFeedback(
				result?.agendado
					? `Callback agendado pelo Retorninho. Agendamento: ${result.agendamento_id}`
					: `Callback registrado: ${STATUS_LABELS[result?.status] || result?.status || "recebido"}.`,
			);
			setForm(initialForm);
			await loadData();
		} catch (error) {
			setFeedback(error?.message || "Não foi possível registrar o callback.");
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="space-y-6">
			<section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
						<MessageCircleReply size={22} />
					</span>
					<div>
						<h1 className="text-2xl font-bold text-slate-900">Callback</h1>
						<p className="mt-1 text-sm text-slate-500">
							Retornos do WhatsApp que o Retorninho interpreta para agendar
							automaticamente no sistema.
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={loadData}
					className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
				>
					<RefreshCw size={17} />
					Atualizar
				</button>
			</section>

			{feedback ? (
				<div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
					{feedback}
				</div>
			) : null}

			<section className="grid gap-4 md:grid-cols-4">
				{[
					{ label: "Callbacks", value: stats.total, icon: MessageCircleReply },
					{ label: "Agendados", value: stats.agendados, icon: CalendarCheck },
					{ label: "Pendentes", value: stats.pendentes, icon: Clock3 },
					{
						label: "Sem data/horário",
						value: stats.semData,
						icon: TriangleAlert,
					},
				].map(({ label, value, icon: Icon }) => (
					<div
						key={label}
						className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
					>
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
									{label}
								</p>
								<p className="mt-2 text-2xl font-bold text-slate-900">
									{Number(value || 0).toLocaleString("pt-BR")}
								</p>
							</div>
							<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
								<Icon size={20} />
							</span>
						</div>
					</div>
				))}
			</section>

			<section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
				<form
					onSubmit={handleSubmit}
					className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
				>
					<h2 className="text-lg font-bold text-slate-900">
						Teste de callback
					</h2>
					<p className="mt-1 text-sm text-slate-500">
						Simula o retorno que a API do WhatsApp enviará. Para agendar
						automático, informe o código do cliente.
					</p>

					<div className="mt-4 space-y-3">
						<label className="block">
							<span className="text-sm font-semibold text-slate-700">
								Código do cliente
							</span>
							<input
								value={form.codigo_cliente}
								onChange={(event) =>
									setField("codigo_cliente", event.target.value)
								}
								disabled={!canManage}
								className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
							/>
						</label>
						<label className="block">
							<span className="text-sm font-semibold text-slate-700">
								Telefone
							</span>
							<input
								value={form.telefone}
								onChange={(event) => setField("telefone", event.target.value)}
								disabled={!canManage}
								className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
							/>
						</label>
						<label className="block">
							<span className="text-sm font-semibold text-slate-700">
								Cliente
							</span>
							<input
								value={form.cliente}
								onChange={(event) => setField("cliente", event.target.value)}
								disabled={!canManage}
								className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
							/>
						</label>
						<label className="block">
							<span className="text-sm font-semibold text-slate-700">
								Mensagem recebida
							</span>
							<textarea
								value={form.mensagem}
								onChange={(event) => setField("mensagem", event.target.value)}
								disabled={!canManage}
								rows={4}
								className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
							/>
						</label>
					</div>

					<button
						type="submit"
						disabled={sending || !canManage || !form.mensagem.trim()}
						className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Send size={17} />
						{sending ? "Processando..." : "Processar callback"}
					</button>
				</form>

				<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-lg font-bold text-slate-900">
						Retornos recebidos
					</h2>
					<div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
						<table className="min-w-[900px] w-full divide-y divide-slate-200 text-sm">
							<thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<tr>
									<th className="px-4 py-3">Recebido</th>
									<th className="px-4 py-3">Cliente</th>
									<th className="px-4 py-3">Mensagem</th>
									<th className="px-4 py-3">Data entendida</th>
									<th className="px-4 py-3">Status</th>
									<th className="px-4 py-3">Agendamento</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 bg-white">
								{loading ? (
									<tr>
										<td
											colSpan={6}
											className="px-4 py-8 text-center text-sm text-slate-500"
										>
											Carregando callbacks...
										</td>
									</tr>
								) : callbacks.length ? (
									callbacks.map((item) => (
										<tr key={item.id} className="align-top hover:bg-slate-50">
											<td className="px-4 py-3 text-slate-600">
												{formatDateTime(getCallbackDate(item))}
											</td>
											<td className="px-4 py-3">
												<p className="font-semibold text-slate-900">
													{item.cliente || "Cliente não informado"}
												</p>
												<p className="text-xs text-slate-500">
													Código {item.codigo_cliente || "-"} ·{" "}
													{item.telefone || "-"}
												</p>
											</td>
											<td className="max-w-[320px] px-4 py-3 text-slate-600">
												{item.mensagem || "-"}
											</td>
											<td className="px-4 py-3 text-slate-600">
												{formatSchedule(item.schedule)}
											</td>
											<td className="px-4 py-3">
												<span
													className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[item.status] || STATUS_CLASSES.recebido}`}
												>
													{STATUS_LABELS[item.status] ||
														item.status ||
														"Recebido"}
												</span>
												{item.motivo ? (
													<p className="mt-1 text-xs text-slate-400">
														{item.motivo}
													</p>
												) : null}
											</td>
											<td className="px-4 py-3 text-slate-600">
												{item.agendamento_id ? (
													<span className="font-semibold text-emerald-700">
														{item.agendamento_id}
													</span>
												) : (
													"Não agendado"
												)}
											</td>
										</tr>
									))
								) : (
									<tr>
										<td
											colSpan={6}
											className="px-4 py-8 text-center text-sm text-slate-500"
										>
											Nenhum callback recebido ainda.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>
		</div>
	);
};

export default MensageriaCallbackPage;

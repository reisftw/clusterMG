import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Edit3, FileSpreadsheet, Plus, RefreshCw, Search, Ticket, Trash2, Upload } from "lucide-react";
import { createRotTicket, deleteRotTicket, fetchRotRegionals, fetchRotServiceTypes, fetchRotTickets, importRotTickets, updateRotTicket } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { listTicketImportSheets, parseTicketWorkbook } from "../../utils/ticketImport";

function formatDate(value) {
	if (!value) return "";
	return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function monthLabel(monthKey) {
	if (!monthKey || monthKey === "sem-data") return "Sem data";
	return new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// Fiel a rot/src/pages/TicketsPage.tsx — chamados/O.S. agrupados por
// mes, com tipo de servico (pontuado), cidade e equipe. Import via
// planilha do legado (rot/src/utils/ticketImport.ts, portado pra
// utils/ticketImport.js) reconhece tecnico/tipo de servico automatico
// a partir da mesma planilha usada pra alimentar a Operação hoje; ver
// 008_rot_tickets.sql.
export default function TicketsPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.tickets.manage");
	const [tickets, setTickets] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [serviceTypes, setServiceTypes] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const [monthFilter, setMonthFilter] = useState("all");
	const [modal, setModal] = useState(null);
	const [importModal, setImportModal] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [ticketsData, types, regionalList] = await Promise.all([fetchRotTickets(), fetchRotServiceTypes(), fetchRotRegionals()]);
			setTickets(ticketsData.items);
			setTechnicians(ticketsData.technicians);
			setServiceTypes(types);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os chamados.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		return tickets.filter((ticket) => {
			if (term && !ticket.ticketNumber.toLowerCase().includes(term)) return false;
			return true;
		});
	}, [tickets, search]);

	const grouped = useMemo(() => {
		const currentMonth = new Date().toISOString().slice(0, 7);
		const groups = {};
		for (const ticket of filtered) {
			const monthKey = ticket.date ? String(ticket.date).slice(0, 7) : "sem-data";
			if (monthFilter !== "all" && monthKey !== monthFilter) continue;
			if (!groups[monthKey]) groups[monthKey] = [];
			groups[monthKey].push(ticket);
		}
		return { groups, currentMonth };
	}, [filtered, monthFilter]);

	const availableMonths = useMemo(() => [...new Set(tickets.map((t) => (t.date ? String(t.date).slice(0, 7) : "sem-data")))].sort((a, b) => b.localeCompare(a)), [tickets]);
	const sortedMonthKeys = Object.keys(grouped.groups).sort((a, b) => b.localeCompare(a));

	const handleDelete = async (ticket) => {
		if (!window.confirm(`Excluir o chamado #${ticket.ticketNumber}?`)) return;
		try {
			await deleteRotTicket(ticket.id);
			setTickets((current) => current.filter((t) => t.id !== ticket.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o chamado.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<Ticket size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Chamados</h1>
						<p className="text-sm font-semibold text-slate-500">{tickets.length} ticket(s) registrado(s).</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setImportModal(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
							<FileSpreadsheet size={16} /> Importar planilha
						</button>
					) : null}
					{canManage ? (
						<button type="button" onClick={() => setModal({ ticket: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
							<Plus size={17} /> Novo Chamado
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="flex flex-col gap-3 sm:flex-row">
				<label className="relative flex-1">
					<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
					<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número do ticket..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
					<option value="all">Todos os meses</option>
					{availableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
				</select>
			</div>

			<div className="space-y-4">
				{sortedMonthKeys.length ? sortedMonthKeys.map((monthKey) => {
					const isCurrent = monthKey === grouped.currentMonth;
					const monthTickets = [...grouped.groups[monthKey]].sort((a, b) => String(b.date).localeCompare(String(a.date)));
					return (
						<div key={monthKey} className="space-y-2">
							<div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isCurrent ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-slate-50"}`}>
								<div>
									<h3 className={`text-sm font-black uppercase tracking-wide ${isCurrent ? "text-orange-700" : "text-slate-700"}`}>{monthLabel(monthKey)}</h3>
									<p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{monthTickets.length} ticket(s)</p>
								</div>
								{isCurrent ? <span className="rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">Mês atual</span> : null}
							</div>
							{monthTickets.map((ticket) => {
								const serviceType = serviceTypes.find((s) => s.id === ticket.serviceTypeId);
								const regional = regionals.find((r) => r.id === ticket.regionalId);
								const city = regional?.cities?.find((c) => c.id === ticket.cityId);
								return (
									<div key={ticket.id} className={`rot-row-hover flex items-center justify-between rounded-xl border p-4 shadow-sm ${isCurrent ? "border-orange-200 bg-orange-50/60" : "border-slate-200 bg-white"}`}>
										<div>
											<div className="text-lg font-black text-slate-900">#{ticket.ticketNumber}</div>
											<div className="text-sm text-slate-600">{serviceType?.name || "—"} {serviceType ? `(${serviceType.points}pts)` : ""}</div>
											<div className="text-xs text-slate-400">{formatDate(ticket.date)} · {city?.name || "Cidade n/d"}</div>
											<div className="mt-2 flex flex-wrap gap-1">
												{ticket.teamIds.map((userId) => {
													const tech = technicians.find((t) => t.id === userId);
													return tech ? <span key={userId} className={`rounded px-1.5 py-0.5 text-[10px] ${isCurrent ? "bg-orange-100 text-orange-800" : "bg-blue-50 text-blue-900"}`}>{tech.name.split(" ")[0]}</span> : null;
												})}
											</div>
										</div>
										{canManage ? (
											<div className="flex gap-2">
												<button type="button" onClick={() => setModal({ ticket })} className="rot-btn-tactile rounded-lg p-2 text-blue-600 hover:bg-blue-50">
													<Edit3 size={18} />
												</button>
												<button type="button" onClick={() => handleDelete(ticket)} className="rot-btn-tactile rounded-lg p-2 text-red-400 hover:bg-red-50">
													<Trash2 size={18} />
												</button>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					);
				}) : (
					<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum chamado encontrado.</div>
				)}
			</div>

			{modal ? (
				<TicketFormModal
					ticket={modal.ticket}
					serviceTypes={serviceTypes}
					regionals={regionals}
					technicians={technicians}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setTickets((current) => {
							const exists = current.some((t) => t.id === saved.id);
							return exists ? current.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...current];
						});
						setModal(null);
					}}
				/>
			) : null}

			{importModal ? (
				<TicketImportModal
					existingTickets={tickets}
					regionals={regionals}
					serviceTypes={serviceTypes}
					technicians={technicians}
					onClose={() => setImportModal(false)}
					onImported={() => {
						setImportModal(false);
						load();
					}}
				/>
			) : null}
		</div>
	);
}

function TicketFormModal({ ticket, serviceTypes, regionals, technicians, onClose, onSaved }) {
	const isEdit = Boolean(ticket);
	const [ticketNumber, setTicketNumber] = useState(ticket?.ticketNumber || "");
	const [date, setDate] = useState(ticket?.date ? String(ticket.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
	const [serviceTypeId, setServiceTypeId] = useState(ticket?.serviceTypeId || serviceTypes[0]?.id || "");
	const [regionalId, setRegionalId] = useState(ticket?.regionalId || regionals[0]?.id || "");
	const [cityId, setCityId] = useState(ticket?.cityId || "");
	const [teamIds, setTeamIds] = useState(ticket?.teamIds || []);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const cities = regionals.find((r) => r.id === regionalId)?.cities || [];
	const regionalTechs = technicians.filter((t) => t.regionalId === regionalId);

	const toggleTech = (id) => setTeamIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

	const submit = async (event) => {
		event.preventDefault();
		if (!ticketNumber.trim() || !date || !regionalId) {
			setError("Informe número, data e regional.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { ticketNumber: ticketNumber.trim(), date, serviceTypeId: serviceTypeId || null, regionalId, cityId: cityId || null, teamIds };
			const saved = isEdit ? await updateRotTicket(ticket.id, payload) : await createRotTicket(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o chamado.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar chamado" : "Novo chamado"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Ticket size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Número do ticket</span>
						<input value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Data</span>
						<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
				</div>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo de serviço</span>
					<select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						<option value="">Não definido</option>
						{serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.points}pts)</option>)}
					</select>
				</label>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
						<select value={regionalId} onChange={(e) => { setRegionalId(e.target.value); setCityId(""); }} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
						</select>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Cidade</span>
						<select value={cityId} onChange={(e) => setCityId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							<option value="">Não definida</option>
							{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
						</select>
					</label>
				</div>
				<div>
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Equipe</span>
					<div className="flex flex-wrap gap-1.5">
						{regionalTechs.length ? regionalTechs.map((tech) => (
							<button key={tech.id} type="button" onClick={() => toggleTech(tech.id)} className={`rot-btn-tactile rounded-lg px-3 py-1.5 text-xs font-bold ${teamIds.includes(tech.id) ? "bg-orange-600 text-white" : "border border-slate-200 text-slate-600"}`}>
								{tech.name}
							</button>
						)) : <p className="text-xs font-semibold text-slate-400">Nenhum técnico cadastrado nesta regional.</p>}
					</div>
				</div>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
						{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar chamado"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// Importador de chamados via planilha — mesmo fluxo do Operação legado
// (rot/src/pages/TicketsPage.tsx): escolhe o arquivo, escolhe a
// aba/mes, o parser (utils/ticketImport.js) reconhece automaticamente
// numero do ticket/data/tipo de servico/tecnicos, o usuario revisa e
// corrige manualmente as linhas com problema (regional/servico nao
// reconhecidos), e so entao envia — tudo numa unica transacao no
// backend (POST /admin/tickets/import).
function TicketImportModal({ existingTickets, regionals, serviceTypes, technicians, onClose, onImported }) {
	const fileInputRef = useRef(null);
	const [fileName, setFileName] = useState("");
	const [arrayBuffer, setArrayBuffer] = useState(null);
	const [availableSheets, setAvailableSheets] = useState([]);
	const [selectedSheet, setSelectedSheet] = useState("");
	const [importState, setImportState] = useState(null);
	const [rowOverrides, setRowOverrides] = useState({});
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState("");
	const [result, setResult] = useState(null);

	const handleFile = async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setError("");
		setImportState(null);
		setRowOverrides({});
		setResult(null);
		try {
			const buffer = await file.arrayBuffer();
			const sheets = listTicketImportSheets(buffer);
			setArrayBuffer(buffer);
			setFileName(file.name);
			setAvailableSheets(sheets);
			setSelectedSheet(sheets[0] || "");
		} catch (err) {
			setError(err?.message || "Não foi possível ler a planilha.");
		}
	};

	const handleParse = () => {
		if (!arrayBuffer || !selectedSheet) return;
		setError("");
		try {
			const parsed = parseTicketWorkbook({
				arrayBuffer,
				existingTickets,
				regionals,
				selectedSheetName: selectedSheet,
				serviceTypes,
				usersList: technicians,
			});
			setImportState(parsed);
			setRowOverrides({});
		} catch (err) {
			setError(err?.message || "Não foi possível processar a planilha.");
		}
	};

	const rows = importState?.rows || [];
	const effectiveRows = useMemo(
		() =>
			rows.map((row, index) => {
				const override = rowOverrides[index] || {};
				const regionalId = override.regionalId ?? row.regionalId;
				const serviceTypeId = override.serviceTypeId ?? row.serviceTypeId;
				const issues = [];
				if (!row.ticketNumber) issues.push("Ticket sem número identificado");
				if (!row.date) issues.push("Data inválida");
				if (!serviceTypeId) issues.push("Tipo de serviço não reconhecido");
				if (row.teamIds.length === 0) issues.push("Nenhum técnico reconhecido");
				if (!regionalId) issues.push("Regional não identificada");
				return { ...row, regionalId, serviceTypeId, issues };
			}),
		[rows, rowOverrides],
	);
	const readyRows = effectiveRows.filter((row) => !row.issues.length);
	const unresolvedCount = effectiveRows.length - readyRows.length;

	const setOverride = (index, field, value) => {
		setRowOverrides((current) => ({ ...current, [index]: { ...current[index], [field]: value } }));
	};

	const handleImport = async () => {
		if (!readyRows.length) return;
		setIsImporting(true);
		setError("");
		try {
			const payload = readyRows.map((row) => ({
				ticketNumber: row.ticketNumber,
				date: row.date,
				serviceTypeId: row.serviceTypeId || null,
				regionalId: row.regionalId,
				cityId: row.cityId || null,
				teamIds: row.teamIds,
			}));
			const data = await importRotTickets(payload);
			setResult(data);
		} catch (err) {
			setError(err?.message || "Não foi possível importar os tickets.");
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<ModalShell
			open
			title="Importar chamados via planilha"
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><FileSpreadsheet size={22} /></span>}
			onClose={onClose}
			size="6xl"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}

			{result ? (
				<div className="space-y-4">
					<div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
						<CheckCircle2 className="shrink-0 text-emerald-600" size={24} />
						<div>
							<p className="text-sm font-black text-emerald-800">{result.imported} ticket(s) importado(s) com sucesso.</p>
							{result.skipped ? <p className="text-xs font-semibold text-emerald-700">{result.skipped} linha(s) ignorada(s) por falta de dados obrigatórios.</p> : null}
						</div>
					</div>
					<div className="flex justify-end">
						<button type="button" onClick={onImported} className="rot-btn-tactile rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">Concluir</button>
					</div>
				</div>
			) : (
				<div className="space-y-4">
					<div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex-1">
							<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Arquivo (.xlsx)</span>
							<input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="block w-full text-sm font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-600 file:px-3 file:py-2 file:text-xs file:font-black file:uppercase file:text-white hover:file:bg-orange-700" />
							{fileName ? <p className="mt-1 text-[11px] font-semibold text-slate-400">{fileName}</p> : null}
						</div>
						{availableSheets.length ? (
							<label className="block">
								<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Mês da planilha</span>
								<select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
									{availableSheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
								</select>
							</label>
						) : arrayBuffer ? (
							<p className="text-xs font-bold text-amber-600">Nenhuma aba de mês (ex.: SETEMBRO2026) encontrada nesta planilha.</p>
						) : null}
						<button type="button" disabled={!arrayBuffer || !selectedSheet} onClick={handleParse} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-40">
							<Upload size={16} /> Processar
						</button>
					</div>

					{importState ? (
						<>
							<div className="flex flex-wrap gap-4 text-xs font-bold text-slate-600">
								<span className="text-emerald-600">{readyRows.length} pronto(s) para enviar</span>
								{unresolvedCount ? <span className="text-amber-600">{unresolvedCount} precisam de ajuste</span> : null}
								{importState.duplicateCount ? <span className="text-slate-400">{importState.duplicateCount} já existente(s) no sistema (ignorado)</span> : null}
							</div>

							<div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-200">
								<table className="w-full min-w-[900px] text-left text-xs">
									<thead className="sticky top-0 bg-slate-50">
										<tr>
											<th className="p-2 font-black uppercase text-slate-400">Ticket</th>
											<th className="p-2 font-black uppercase text-slate-400">Data</th>
											<th className="p-2 font-black uppercase text-slate-400">Serviço</th>
											<th className="p-2 font-black uppercase text-slate-400">Técnicos reconhecidos</th>
											<th className="p-2 font-black uppercase text-slate-400">Regional</th>
											<th className="p-2 font-black uppercase text-slate-400">Status</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{effectiveRows.map((row, index) => (
											<tr key={`${row.ticketKey}-${index}`} className={row.issues.length ? "bg-amber-50/50" : ""}>
												<td className="p-2 font-black text-slate-800">{row.ticketNumber || <span className="italic text-red-500">—</span>}</td>
												<td className="p-2 font-semibold text-slate-600">{row.date ? formatDate(row.date) : <span className="italic text-red-500">inválida</span>}</td>
												<td className="p-2">
													<select value={row.serviceTypeId} onChange={(e) => setOverride(index, "serviceTypeId", e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
														<option value="">— não reconhecido —</option>
														{serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
													</select>
													{row.rawServiceLabel ? <p className="mt-0.5 truncate text-[10px] text-slate-400">"{row.rawServiceLabel}"</p> : null}
												</td>
												<td className="p-2 font-semibold text-slate-600">
													{row.technicianNames.length ? row.technicianNames.join(", ") : <span className="italic text-red-500">nenhum</span>}
												</td>
												<td className="p-2">
													<select value={row.regionalId} onChange={(e) => setOverride(index, "regionalId", e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
														<option value="">— não identificada —</option>
														{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
													</select>
												</td>
												<td className="p-2">
													{row.issues.length ? (
														<span className="flex items-center gap-1 text-[11px] font-bold text-amber-600"><AlertTriangle size={13} /> {row.issues[0]}{row.issues.length > 1 ? ` +${row.issues.length - 1}` : ""}</span>
													) : (
														<span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><CheckCircle2 size={13} /> Pronto</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>

							{importState.duplicateCount ? (
								<p className="text-[11px] text-slate-400">
									Já existentes (ignorados): {importState.duplicateTickets.slice(0, 8).join(", ")}{importState.duplicateCount > 8 ? "…" : ""}
								</p>
							) : null}

							<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
								<button type="button" onClick={onClose} disabled={isImporting} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
								<button type="button" disabled={!readyRows.length || isImporting} onClick={handleImport} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-40">
									{isImporting ? "Importando..." : `Importar ${readyRows.length} ticket(s)`}
								</button>
							</div>
						</>
					) : null}
				</div>
			)}
		</ModalShell>
	);
}

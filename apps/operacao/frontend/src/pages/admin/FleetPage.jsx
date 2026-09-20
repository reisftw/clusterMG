import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, ChevronRight, Plus, RefreshCw, Store, Trash2 } from "lucide-react";
import {
	createRotVehicle,
	createRotWorkshop,
	deleteRotVehicle,
	deleteRotWorkshop,
	fetchRotFleet,
	fetchRotRegionals,
	updateRotVehicle,
	updateRotWorkshop,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { formatKm, VEHICLE_STATUS_BADGE, VEHICLE_STATUS_LABEL } from "../../utils/fleetKm";

// Fase 1 da reestruturacao de Frotas: o card fica so com informacao
// operacional rapida (secao 3/51 do pedido) — toda a logica de
// transferencia/KM/manutencao/bloqueio/documentos mora na Ficha 360
// (FleetVehicleDetailPage), nao mais aqui.
const OPERATION_SCOPE_LABELS = { ROT: "ROT", FIELD: "Field", DELIVERY: "Delivery" };
const OPERATION_SCOPE_OPTIONS = [
	{ value: "ROT", label: "ROT" },
	{ value: "FIELD", label: "Field" },
	{ value: "DELIVERY", label: "Delivery" },
];

function normalizeOperationScope(value) {
	const scope = String(value || "ROT").trim().toUpperCase();
	return OPERATION_SCOPE_LABELS[scope] ? scope : "ROT";
}

export default function FleetPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.fleet.manage");
	const [vehicles, setVehicles] = useState([]);
	const [workshops, setWorkshops] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [vehicleModal, setVehicleModal] = useState(null);
	const [workshopsModalOpen, setWorkshopsModalOpen] = useState(false);
	const [operationFilter, setOperationFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");

	const visibleVehicles = useMemo(() => {
		return vehicles
			.filter((vehicle) => !operationFilter || normalizeOperationScope(vehicle.operationScope) === operationFilter)
			.filter((vehicle) => !statusFilter || vehicle.status === statusFilter);
	}, [vehicles, operationFilter, statusFilter]);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [fleet, regionalList] = await Promise.all([fetchRotFleet(), fetchRotRegionals()]);
			setVehicles(fleet.vehicles);
			setWorkshops(fleet.workshops);
			setTechnicians(fleet.technicians);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar a frota.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleDeleteVehicle = async (vehicle) => {
		if (!window.confirm(`Excluir o veículo "${vehicle.model} — ${vehicle.plate}"?`)) return;
		try {
			await deleteRotVehicle(vehicle.id);
			setVehicles((current) => current.filter((v) => v.id !== vehicle.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o veículo.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<Car size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Gestão de Frotas</h1>
						<p className="text-sm font-semibold text-slate-500">{visibleVehicles.length} de {vehicles.length} veículo(s) cadastrado(s).</p>
					</div>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<select
						value={operationFilter}
						onChange={(event) => setOperationFilter(event.target.value)}
						className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
					>
						<option value="">Todas operações</option>
						{OPERATION_SCOPE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
					<select
						value={statusFilter}
						onChange={(event) => setStatusFilter(event.target.value)}
						className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
					>
						<option value="">Todo status</option>
						{Object.entries(VEHICLE_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
					</select>
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<>
							<button type="button" onClick={() => setWorkshopsModalOpen(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-900 px-4 text-sm font-bold text-white shadow hover:bg-blue-950">
								<Store size={16} /> Oficinas
							</button>
							<button type="button" onClick={() => setVehicleModal({ vehicle: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
								<Plus size={17} /> Novo Veículo
							</button>
						</>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{visibleVehicles.length ? (
				<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
					{visibleVehicles.map((vehicle) => {
						const responsible = technicians.find((t) => t.id === vehicle.responsibleId);
						return (
							<article
								key={vehicle.id}
								onClick={() => navigate(`/frota/${vehicle.id}`)}
								className="rot-card-hover flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
							>
								<div className="relative overflow-hidden bg-blue-900 p-5 text-white">
									<Car size={110} className="pointer-events-none absolute -bottom-4 -right-4 rotate-12 opacity-10" />
									<div className="relative z-10">
										<div className="mb-3 flex items-start justify-between gap-2">
											<div className="flex flex-wrap gap-1.5">
												<span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black shadow-md ${VEHICLE_STATUS_BADGE[vehicle.status] || "bg-slate-600"}`}>
													{VEHICLE_STATUS_LABEL[vehicle.status] || vehicle.status}
												</span>
												<span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[10px] font-black text-white ring-1 ring-white/20">
													{OPERATION_SCOPE_LABELS[normalizeOperationScope(vehicle.operationScope)]}
												</span>
											</div>
											{canManage ? (
												<button type="button" onClick={(e) => { e.stopPropagation(); setVehicleModal({ vehicle }); }} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20">
													<ChevronRight size={14} className="rotate-90" />
												</button>
											) : null}
										</div>
										<h3 className="text-xl font-black uppercase leading-none tracking-tight">{vehicle.model}</h3>
										<div className="mt-2 flex items-center gap-3">
											<span className="rounded bg-orange-500 px-2 py-0.5 font-mono text-sm font-bold shadow-sm">{vehicle.plate}</span>
											<span className="border-l border-white/30 pl-3 text-[10px] font-bold uppercase opacity-70">{vehicle.manufacturer}</span>
										</div>
									</div>
								</div>

								<div className="flex-1 space-y-3 p-5">
									<div>
										<p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável</p>
										<p className="text-sm font-bold text-slate-700">{responsible?.name || "Sem responsável"}</p>
									</div>
									<div className="flex items-center justify-between">
										<div>
											<p className="text-[10px] font-black uppercase tracking-widest text-slate-400">KM atual</p>
											<p className="text-sm font-bold text-slate-700">{formatKm(vehicle.currentKm)}</p>
										</div>
										<div className="text-right">
											<p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atualizado</p>
											<p className="text-xs font-bold text-slate-500">{vehicle.currentKmAt ? new Date(vehicle.currentKmAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
										</div>
									</div>
								</div>

								<div className="flex items-center justify-between border-t bg-slate-50 px-5 py-3 text-xs font-black uppercase text-orange-600">
									Ver ficha completa <ChevronRight size={15} />
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum veículo encontrado para esses filtros.</div>
			)}

			{vehicleModal ? (
				<VehicleFormModal
					vehicle={vehicleModal.vehicle}
					regionals={regionals}
					onClose={() => setVehicleModal(null)}
					onSaved={(saved) => {
						setVehicles((current) => {
							const exists = current.some((v) => v.id === saved.id);
							return exists ? current.map((v) => (v.id === saved.id ? saved : v)) : [...current, saved];
						});
						setVehicleModal(null);
					}}
					onDeleted={() => { handleDeleteVehicle(vehicleModal.vehicle); setVehicleModal(null); }}
				/>
			) : null}

			{workshopsModalOpen ? <WorkshopsModal workshops={workshops} regionals={regionals} onClose={() => setWorkshopsModalOpen(false)} onChanged={setWorkshops} /> : null}
		</div>
	);
}

function VehicleFormModal({ vehicle, regionals, onClose, onSaved, onDeleted }) {
	const isEdit = Boolean(vehicle);
	const [model, setModel] = useState(vehicle?.model || "");
	const [plate, setPlate] = useState(vehicle?.plate || "");
	const [manufacturer, setManufacturer] = useState(vehicle?.manufacturer || "");
	const [year, setYear] = useState(vehicle?.year || "");
	const [regionalId, setRegionalId] = useState(vehicle?.regionalId || regionals[0]?.id || "");
	const [operationScope, setOperationScope] = useState(normalizeOperationScope(vehicle?.operationScope));
	const [km, setKm] = useState(vehicle?.currentKm ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!model.trim() || !plate.trim()) {
			setError("Informe modelo e placa.");
			return;
		}
		if (!isEdit && (km === "" || Number.isNaN(Number(km)) || Number(km) < 0)) {
			setError("Informe a quilometragem atual do veículo.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { model: model.trim(), plate: plate.trim(), manufacturer, regionalId, operationScope, year: year ? Number(year) : null };
			if (!isEdit) payload.km = Number(km);
			const saved = isEdit ? await updateRotVehicle(vehicle.id, payload) : await createRotVehicle(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o veículo.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar veículo" : "Novo veículo"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Car size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Modelo</span>
					<input value={model} onChange={(e) => setModel(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Placa</span>
						<input value={plate} onChange={(e) => setPlate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Fabricante</span>
						<input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Ano/modelo</span>
						<input type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Quilometragem atual{!isEdit ? <span className="text-red-500"> *</span> : null}</span>
						<input type="number" inputMode="numeric" min={0} value={km} onChange={(e) => setKm(e.target.value)} disabled={isEdit} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-400" />
						{isEdit ? <span className="mt-1 block text-[11px] font-semibold text-slate-400">Use a Ficha do veículo para registrar nova leitura.</span> : null}
					</label>
				</div>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
					<select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Operação do veículo</span>
					<select value={operationScope} onChange={(e) => setOperationScope(normalizeOperationScope(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						{OPERATION_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
					</select>
					<p className="mt-1 text-xs font-semibold text-slate-500">Veículos só aparecem para usuários vinculados à mesma operação.</p>
				</label>
				<div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
					{isEdit ? (
						<button type="button" onClick={onDeleted} className="rot-btn-tactile rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50">Excluir</button>
					) : <span />}
					<div className="flex gap-2">
						<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
						<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
							{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar veículo"}
						</button>
					</div>
				</div>
			</form>
		</ModalShell>
	);
}

function WorkshopsModal({ workshops, regionals, onClose, onChanged }) {
	const [name, setName] = useState("");
	const [address, setAddress] = useState("");
	const [phone, setPhone] = useState("");
	const [saving, setSaving] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		if (!name.trim()) return;
		setSaving(true);
		try {
			const created = await createRotWorkshop({ name: name.trim(), address, phone });
			onChanged((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
			setName("");
			setAddress("");
			setPhone("");
		} finally {
			setSaving(false);
		}
	};

	const remove = async (workshop) => {
		if (!window.confirm(`Remover a oficina "${workshop.name}"?`)) return;
		await deleteRotWorkshop(workshop.id);
		onChanged((current) => current.filter((w) => w.id !== workshop.id));
	};

	return (
		<ModalShell open title="Oficinas parceiras" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-900"><Store size={22} /></span>} onClose={onClose} size="lg">
			<form onSubmit={submit} className="mb-4 grid gap-2 sm:grid-cols-[1.2fr_1.4fr_1fr_auto]">
				<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Endereço" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
				<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-900 px-4 text-sm font-black text-white hover:bg-blue-950 disabled:opacity-60"><Plus size={16} /></button>
			</form>
			<div className="space-y-1.5">
				{workshops.map((workshop) => (
					<div key={workshop.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5">
						<div>
							<p className="text-sm font-black text-slate-800">{workshop.name}</p>
							<p className="text-xs font-semibold text-slate-400">{workshop.address} {workshop.phone ? `· ${workshop.phone}` : ""}</p>
						</div>
						<button type="button" onClick={() => remove(workshop)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
					</div>
				))}
				{!workshops.length ? <p className="py-6 text-center text-sm font-bold text-slate-400">Nenhuma oficina cadastrada.</p> : null}
			</div>
		</ModalShell>
	);
}

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Car, CheckCircle, Edit3, Plus, RefreshCw, Store, Trash2, Wrench, Zap } from "lucide-react";
import {
	assignRotVehicleResponsible,
	createRotVehicle,
	createRotVehicleClaim,
	createRotVehicleMaintenance,
	createRotWorkshop,
	deleteRotVehicle,
	deleteRotVehicleClaim,
	deleteRotVehicleMaintenance,
	deleteRotWorkshop,
	fetchRotFleet,
	fetchRotRegionals,
	finishRotVehicleMaintenance,
	updateRotVehicle,
	updateRotWorkshop,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";

// Fiel a rot/src/pages/FleetPage.tsx — cards de veiculo (status por
// manutencao aberta/responsavel), sinistros e manutencoes expansiveis,
// oficinas geridas em modal a parte.
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
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.fleet.manage");
	const [vehicles, setVehicles] = useState([]);
	const [claims, setClaims] = useState([]);
	const [maintenances, setMaintenances] = useState([]);
	const [workshops, setWorkshops] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [expanded, setExpanded] = useState({});
	const [vehicleModal, setVehicleModal] = useState(null);
	const [workshopsModalOpen, setWorkshopsModalOpen] = useState(false);
	const [claimModalVehicle, setClaimModalVehicle] = useState(null);
	const [maintModalVehicle, setMaintModalVehicle] = useState(null);
	const [finishModal, setFinishModal] = useState(null);
	const [operationFilter, setOperationFilter] = useState("");

	const visibleVehicles = useMemo(() => {
		if (!operationFilter) return vehicles;
		return vehicles.filter((vehicle) => normalizeOperationScope(vehicle.operationScope) === operationFilter);
	}, [vehicles, operationFilter]);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [fleet, regionalList] = await Promise.all([fetchRotFleet(), fetchRotRegionals()]);
			setVehicles(fleet.vehicles);
			setClaims(fleet.claims);
			setMaintenances(fleet.maintenances);
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

	const toggle = (vehicleId, view) => setExpanded((current) => ({ ...current, [vehicleId]: current[vehicleId] === view ? null : view }));

	const handleAssign = async (vehicle, responsibleId) => {
		setError("");
		try {
			const updated = await assignRotVehicleResponsible(vehicle.id, responsibleId);
			setVehicles((current) => current.map((v) => (v.id === updated.id ? updated : v)));
		} catch (err) {
			setError(err?.message || "Não foi possível atribuir o responsável.");
		}
	};

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
						const vehicleClaims = claims.filter((c) => c.vehicleId === vehicle.id);
						const vehicleMaint = maintenances.filter((m) => m.vehicleId === vehicle.id);
						const openMaint = vehicleMaint.filter((m) => m.status === "OPEN");
						const finishedMaint = vehicleMaint.filter((m) => m.status === "FINISHED").slice(0, 3);
						const hasOpenMaint = openMaint.length > 0;
						const hasResponsible = Boolean(vehicle.responsibleId);
						const responsible = technicians.find((t) => t.id === vehicle.responsibleId);
						const status = hasOpenMaint
							? { label: "EM MANUTENÇÃO", color: "bg-red-600", icon: Wrench }
							: hasResponsible
								? { label: "EM OPERAÇÃO", color: "bg-emerald-600", icon: Zap }
								: { label: "PARADO NA BASE", color: "bg-amber-500", icon: Store };
						const StatusIcon = status.icon;
						const activeView = expanded[vehicle.id];

						return (
							<article key={vehicle.id} className="rot-card-hover flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
								<div className="relative overflow-hidden bg-blue-900 p-5 text-white">
									<Car size={110} className="pointer-events-none absolute -bottom-4 -right-4 rotate-12 opacity-10" />
									<div className="relative z-10">
										<div className="mb-3 flex items-start justify-between">
											<div className="flex flex-wrap gap-1.5">
												<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black shadow-md ${status.color}`}>
													<StatusIcon size={13} /> {status.label}
												</span>
												<span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[10px] font-black text-white ring-1 ring-white/20">
													{OPERATION_SCOPE_LABELS[normalizeOperationScope(vehicle.operationScope)]}
												</span>
											</div>
											{canManage ? (
												<button type="button" onClick={() => setVehicleModal({ vehicle })} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20">
													<Edit3 size={14} />
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

								<div className="flex-1 p-5">
									<div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
										<p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável pelo carro</p>
										{canManage ? (
											<select
												value={vehicle.responsibleId || ""}
												onChange={(e) => handleAssign(vehicle, e.target.value)}
												className={`w-full rounded-xl border-2 p-2.5 text-sm font-bold outline-none ${hasResponsible ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-800"}`}
											>
												<option value="">-- Disponível (base) --</option>
												{technicians
													.filter((t) => t.regionalId === vehicle.regionalId)
													.filter((t) => {
														const scopes = Array.isArray(t.operationScopes) && t.operationScopes.length ? t.operationScopes : ["ROT"];
														return scopes.map(normalizeOperationScope).includes(normalizeOperationScope(vehicle.operationScope));
													})
													.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
											</select>
										) : (
											<p className="text-sm font-bold text-slate-700">{responsible?.name || "Parado na base"}</p>
										)}
									</div>
								</div>

								<div className="flex gap-2 border-t bg-slate-50 px-4 py-3">
									<button type="button" onClick={() => toggle(vehicle.id, "claims")} className={`rot-btn-tactile flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-black uppercase ${activeView === "claims" ? "bg-red-600 text-white" : "border border-red-100 bg-white text-red-600"}`}>
										<AlertTriangle size={13} /> Sinistros ({vehicleClaims.length})
									</button>
									<button type="button" onClick={() => toggle(vehicle.id, "maintenances")} className={`rot-btn-tactile flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-black uppercase ${activeView === "maintenances" ? "bg-blue-600 text-white" : "border border-blue-100 bg-white text-blue-600"}`}>
										<Wrench size={13} /> Manutenções
									</button>
								</div>

								{activeView === "claims" ? (
									<div className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-200 bg-slate-100 p-4">
										<div className="mb-2 flex items-center justify-between">
											<span className="text-[10px] font-black uppercase text-red-800">Histórico de ocorrências</span>
											{canManage ? (
												<button type="button" onClick={() => setClaimModalVehicle(vehicle)} className="rounded-full bg-red-600 p-1 text-white hover:bg-red-700">
													<Plus size={15} />
												</button>
											) : null}
										</div>
										{vehicleClaims.length ? vehicleClaims.map((claim) => (
											<div key={claim.id} className="group relative rounded-lg border-l-4 border-red-500 bg-white p-3 shadow-sm">
												<div className="mb-1 flex justify-between pr-8 text-[9px] font-bold text-slate-400">
													<span>{new Date(claim.date).toLocaleDateString("pt-BR")}</span>
													<span>Por: {claim.createdByName?.split(" ")[0] || "—"}</span>
												</div>
												<p className="text-xs font-medium text-slate-700">{claim.description}</p>
												{canManage ? (
													<button type="button" onClick={() => deleteRotVehicleClaim(claim.id).then(() => setClaims((c) => c.filter((x) => x.id !== claim.id)))} className="absolute right-2 top-2 p-1 text-red-400 opacity-0 hover:bg-red-50 group-hover:opacity-100">
														<Trash2 size={12} />
													</button>
												) : null}
											</div>
										)) : <p className="rounded-lg bg-white/50 py-4 text-center text-[10px] italic text-slate-400">Nenhum registro.</p>}
									</div>
								) : null}

								{activeView === "maintenances" ? (
									<div className="max-h-72 space-y-3 overflow-y-auto border-t border-slate-200 bg-slate-100 p-4">
										<div className="mb-1 flex items-center justify-between">
											<span className="text-[10px] font-black uppercase tracking-tighter text-blue-800">Agenda e histórico</span>
											{canManage ? (
												<button type="button" onClick={() => setMaintModalVehicle(vehicle)} className="rounded-full bg-blue-600 p-1 text-white hover:bg-blue-700">
													<Plus size={15} />
												</button>
											) : null}
										</div>
										{openMaint.map((maint) => {
											const workshop = workshops.find((w) => w.id === maint.workshopId);
											return (
												<div key={maint.id} className="flex items-center justify-between rounded-lg border-l-4 border-orange-500 bg-white p-3 shadow-sm">
													<div className="min-w-0 flex-1 pr-2">
														<p className="text-xs font-black text-slate-800">{new Date(maint.date).toLocaleDateString("pt-BR")} - {maint.time}</p>
														<p className="truncate text-[10px] font-bold uppercase text-blue-700">{workshop?.name || "Oficina"}</p>
													</div>
													<div className="flex items-center gap-1">
														{canManage ? (
															<button type="button" onClick={() => deleteRotVehicleMaintenance(maint.id).then(() => setMaintenances((m) => m.filter((x) => x.id !== maint.id)))} className="p-1.5 text-red-600 hover:bg-red-50 rounded">
																<Trash2 size={14} />
															</button>
														) : null}
														<button type="button" onClick={() => setFinishModal(maint)} className="rounded-lg bg-emerald-600 p-1.5 text-white shadow hover:bg-emerald-700">
															<CheckCircle size={16} />
														</button>
													</div>
												</div>
											);
										})}
										{finishedMaint.length ? (
											<div className="border-t border-slate-200 pt-2">
												<p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Serviços concluídos</p>
												{finishedMaint.map((maint) => (
													<div key={maint.id} className="mb-2 rounded border border-emerald-100 bg-emerald-50 p-2 text-[10px]">
														<div className="mb-1 flex justify-between font-bold text-emerald-800">
															<span>{new Date(maint.finishedAt || maint.date).toLocaleDateString("pt-BR")}</span>
															<CheckCircle size={10} />
														</div>
														<p className="italic text-slate-600 line-clamp-1">"{maint.resolutionNote}"</p>
													</div>
												))}
											</div>
										) : null}
									</div>
								) : null}
							</article>
						);
					})}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum veículo encontrado para essa operação.</div>
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

			{claimModalVehicle ? (
				<ClaimFormModal
					vehicle={claimModalVehicle}
					onClose={() => setClaimModalVehicle(null)}
					onCreated={(claim) => { setClaims((c) => [claim, ...c]); setClaimModalVehicle(null); }}
				/>
			) : null}

			{maintModalVehicle ? (
				<MaintenanceFormModal
					vehicle={maintModalVehicle}
					workshops={workshops}
					onClose={() => setMaintModalVehicle(null)}
					onCreated={(m) => { setMaintenances((current) => [m, ...current]); setMaintModalVehicle(null); }}
				/>
			) : null}

			{finishModal ? (
				<FinishMaintenanceModal
					maintenance={finishModal}
					onClose={() => setFinishModal(null)}
					onFinished={(updated) => { setMaintenances((current) => current.map((m) => (m.id === updated.id ? updated : m))); setFinishModal(null); }}
				/>
			) : null}
		</div>
	);
}

function VehicleFormModal({ vehicle, regionals, onClose, onSaved, onDeleted }) {
	const isEdit = Boolean(vehicle);
	const [model, setModel] = useState(vehicle?.model || "");
	const [plate, setPlate] = useState(vehicle?.plate || "");
	const [manufacturer, setManufacturer] = useState(vehicle?.manufacturer || "");
	const [regionalId, setRegionalId] = useState(vehicle?.regionalId || regionals[0]?.id || "");
	const [operationScope, setOperationScope] = useState(normalizeOperationScope(vehicle?.operationScope));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!model.trim() || !plate.trim()) {
			setError("Informe modelo e placa.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { model: model.trim(), plate: plate.trim(), manufacturer, regionalId, operationScope };
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

function ClaimFormModal({ vehicle, onClose, onCreated }) {
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!description.trim()) {
			setError("Descreva a ocorrência.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const created = await createRotVehicleClaim(vehicle.id, { description: description.trim() });
			onCreated(created);
		} catch (err) {
			setError(err?.message || "Não foi possível registrar o sinistro.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={`Novo sinistro — ${vehicle.plate}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600"><AlertTriangle size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} autoFocus placeholder="Descreva o ocorrido..." className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100" />
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60">{saving ? "Salvando..." : "Registrar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function MaintenanceFormModal({ vehicle, workshops, onClose, onCreated }) {
	const [workshopId, setWorkshopId] = useState(workshops[0]?.id || "");
	const [date, setDate] = useState("");
	const [time, setTime] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!date) {
			setError("Informe a data.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const created = await createRotVehicleMaintenance(vehicle.id, { workshopId: workshopId || null, date, time });
			onCreated(created);
		} catch (err) {
			setError(err?.message || "Não foi possível agendar a manutenção.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={`Agendar manutenção — ${vehicle.plate}`} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Wrench size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Oficina</span>
					<select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
						<option value="">Sem oficina definida</option>
						{workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
					</select>
				</label>
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Data</span>
						<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Hora</span>
						<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
					</label>
				</div>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Agendando..." : "Agendar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function FinishMaintenanceModal({ maintenance, onClose, onFinished }) {
	const [resolutionNote, setResolutionNote] = useState("");
	const [saving, setSaving] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		try {
			const updated = await finishRotVehicleMaintenance(maintenance.id, resolutionNote.trim());
			onFinished(updated);
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Concluir manutenção" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle size={22} /></span>} onClose={onClose} size="sm">
			<form onSubmit={submit} className="space-y-4">
				<textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={3} autoFocus placeholder="O que foi feito?" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Salvando..." : "Concluir"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

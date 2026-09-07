import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { brl, integer } from "../../../utils/financeiroFormatters";

export default function PartnersConfigSection({
	BudgetDropdownSection,
	canManage,
	config,
	filteredPartners,
	onCreatePartner,
	onEditPartner,
	onRemovePartner,
	onViewPartner,
	partnerSearch,
	saving,
	setPartnerSearch,
}) {
	return (
		<BudgetDropdownSection
			title="Fornecedores / Clientes"
			count={filteredPartners.length}
			items={filteredPartners}
			pageSize={9}
			className="mt-5 border-purple-200 bg-purple-50"
			emptyText="Nenhum fornecedor ou cliente cadastrado."
			action={
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<input
						value={partnerSearch}
						onChange={(event) => setPartnerSearch(event.target.value)}
						placeholder="Pesquisar por código ou nome"
						className="min-h-10 w-full min-w-64 rounded-xl border border-purple-200 bg-white px-3 text-sm font-bold normal-case text-slate-900 outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
					/>
					<button
						type="button"
						onClick={onCreatePartner}
						disabled={!canManage || saving}
						className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-purple-700 px-3 text-xs font-black text-white hover:bg-purple-800 disabled:opacity-50"
					>
						<Plus size={14} /> Novo fornecedor
					</button>
				</div>
			}
			renderItem={(partner) => (
				<PartnerCard
					key={partner.id}
					partner={partner}
					accounts={config.accounts || []}
					centers={config.centers || []}
					canManage={canManage}
					saving={saving}
					onView={onViewPartner}
					onEdit={onEditPartner}
					onRemove={onRemovePartner}
				/>
			)}
		/>
	);
}

function PartnerCard({
	partner,
	accounts,
	centers,
	canManage,
	saving,
	onView,
	onEdit,
	onRemove,
}) {
	const account = accounts.find((item) => item.id === partner.contaPadraoId);
	const partnerCenters = (
		partner.centrosCusto || [partner.centroCustoPadraoId].filter(Boolean)
	)
		.map((centerId) => centers.find((item) => item.id === centerId))
		.filter(Boolean);

	return (
		<article className="rounded-2xl border border-purple-100 bg-white p-3 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide text-purple-700">
						{partner.codigo || partner.cnpj || partner.id}
					</p>
					<h3
						className="truncate text-base font-black text-slate-950"
						title={partner.nome}
					>
						{partner.nome}
					</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">
						{partner.tipo === "cliente" ? "Cliente" : "Fornecedor"} ·{" "}
						{partner.status || "ativo"}
					</p>
				</div>
				<span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-black text-purple-700">
					{integer.format(partner.linhasImportadas || 0)} linha(s)
				</span>
			</div>
			<dl className="mt-3 grid gap-2 text-xs font-bold text-slate-600">
				<div className="rounded-xl bg-slate-50 p-2">
					<dt className="text-slate-400">Conta padrão</dt>
					<dd className="truncate text-slate-800">{account?.nome || "-"}</dd>
				</div>
				<div className="rounded-xl bg-slate-50 p-2">
					<dt className="text-slate-400">Centros de custo</dt>
					<dd className="line-clamp-2 text-slate-800">
						{partnerCenters.length
							? partnerCenters.map((center) => center.nome).join(", ")
							: "-"}
					</dd>
				</div>
				<div className="rounded-xl bg-emerald-50 p-2">
					<dt className="text-emerald-700">Realizado</dt>
					<dd className="break-words font-black text-emerald-950">
						{brl.format(partner.totalRealizado || 0)}
					</dd>
				</div>
			</dl>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => onView(partner)}
					className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-purple-200 px-2 text-xs font-black text-purple-700 hover:bg-purple-50"
				>
					<Eye size={13} /> Ver
				</button>
				<button
					type="button"
					onClick={() => onEdit(partner)}
					disabled={!canManage || saving}
					className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-blue-200 px-2 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
				>
					<Pencil size={13} /> Editar
				</button>
				<button
					type="button"
					onClick={() => onRemove(partner.id)}
					disabled={!canManage || saving}
					className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-red-200 px-2 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
				>
					<Trash2 size={13} /> Excluir
				</button>
			</div>
		</article>
	);
}

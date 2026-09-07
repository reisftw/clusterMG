import CostCenterCompaniesField from "./CostCenterCompaniesField";
import CostCenterLinkedAccountsField from "./CostCenterLinkedAccountsField";

export default function CostCenterRegistrationTab({
	accounts = [],
	annualBudgetPreview,
	branches = [],
	brl,
	budgetSettings,
	canManage,
	centers = [],
	companies = [],
	costCenterTypes,
	decimal,
	directorateOptions = [],
	form,
	formatOptionLabel,
	linkedFields,
	MoneyInput,
	readOnly,
	saldoMes,
	update,
	updateDirectorate,
	usoPercentual,
}) {
	return (
		<>
			<div className="grid gap-4 md:grid-cols-2">
				<label className="text-xs font-black uppercase text-slate-500">
					ID / Código
					<input
						value={form.codigo || form.id || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("codigo", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Nome do centro
					<input
						value={form.nome || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("nome", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Centro pai
					<select
						value={form.parentId || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("parentId", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Raiz / sem centro pai</option>
						{centers
							.filter((item) => item.id !== form.id)
							.map((item) => (
								<option key={item.id} value={item.id}>
									{item.nome}
								</option>
							))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Tipo do centro
					<select
						value={form.tipoCentro || "departamento"}
						disabled={readOnly || !canManage}
						onChange={(event) => update("tipoCentro", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						{budgetSettings.centerTypes.map((type) => (
							<option key={type} value={type}>
								{formatOptionLabel(type)}
							</option>
						))}
					</select>
				</label>
				<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
					<p className="text-xs font-black uppercase text-slate-500">
						Plano reduzido
					</p>
					<div className="mt-3 grid gap-3 sm:grid-cols-4">
						<div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
							<p className="text-[11px] font-black uppercase text-slate-400">
								Tipo
							</p>
							<p className="mt-1 text-sm font-black text-slate-900">
								{form.tipoPlano === "S"
									? "Sintético"
									: form.tipoPlano === "A"
										? "Analítico"
										: "-"}
							</p>
						</div>
						<div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
							<p className="text-[11px] font-black uppercase text-slate-400">
								Nível
							</p>
							<p className="mt-1 text-sm font-black text-slate-900">
								{form.nivel || "-"}
							</p>
						</div>
						<div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
							<p className="text-[11px] font-black uppercase text-slate-400">
								Classificação
							</p>
							<p className="mt-1 text-sm font-black text-slate-900">
								{form.classificacao || "-"}
							</p>
						</div>
						<div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
							<p className="text-[11px] font-black uppercase text-slate-400">
								Reduzida
							</p>
							<p className="mt-1 text-sm font-black text-slate-900">
								{form.reduzida || form.codigo || "-"}
							</p>
						</div>
					</div>
				</div>
				<CostCenterCompaniesField
					branches={branches}
					companies={companies}
					canManage={canManage}
					readOnly={readOnly}
					{...linkedFields}
				/>
				<CostCenterLinkedAccountsField
					accounts={accounts}
					canManage={canManage}
					costCenterTypes={costCenterTypes}
					readOnly={readOnly}
					{...linkedFields}
				/>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Conta financeira padrão
					<select
						value={form.contaFinanceiraPadrao || ""}
						disabled={
							readOnly || !canManage || !(form.contasFinanceiras || []).length
						}
						onChange={(event) =>
							update("contaFinanceiraPadrao", event.target.value)
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Sem padrão</option>
						{accounts
							.filter((account) =>
								(form.contasFinanceiras || []).includes(account.id),
							)
							.map((account) => (
								<option key={account.id} value={account.id}>
									{account.nome}
								</option>
							))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Responsável
					<input
						value={form.responsavel || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("responsavel", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Número do responsável
					<input
						value={form.telefoneResponsavel || ""}
						disabled={readOnly || !canManage}
						onChange={(event) =>
							update("telefoneResponsavel", event.target.value)
						}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					E-mail do responsável
					<input
						value={form.emailResponsavel || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("emailResponsavel", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Classificação
					<select
						value={form.tipoDespesa || "opex"}
						disabled={readOnly || !canManage}
						onChange={(event) => update("tipoDespesa", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="opex">OPEX - despesa operacional</option>
						<option value="capex">CAPEX - investimento</option>
						<option value="misto">Misto - CAPEX e OPEX</option>
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Categoria principal
					<select
						value={form.categoriaPrincipal || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("categoriaPrincipal", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Selecione a categoria</option>
						{budgetSettings.mainCategories.map((category) => (
							<option key={category} value={category}>
								{category}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Diretoria
					<select
						value={form.diretoria || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => updateDirectorate(event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						<option value="">Selecione a diretoria</option>
						{directorateOptions.map((directorate) => (
							<option
								key={directorate.id || directorate.nome}
								value={directorate.nome}
							>
								{directorate.nome}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Conta contábil / GL
					<input
						value={form.contaContabil || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("contaContabil", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				{form.tipoPlano === "S" ? (
					<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold normal-case text-blue-900 md:col-span-2">
						Centro sintético não recebe orçamento, comprometido ou realizado
						próprio. Esses valores são calculados automaticamente pela soma dos
						centros analíticos filhos.
					</div>
				) : (
					<>
						<label className="text-xs font-black uppercase text-slate-500">
							Orçamento mensal
							<MoneyInput
								value={form.valorMensal}
								disabled={readOnly || !canManage}
								onChange={(event) => update("valorMensal", event.target.value)}
							/>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							Orçamento anual
							<div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black normal-case text-slate-800">
								{brl.format(annualBudgetPreview)}
								<span className="ml-2 text-xs font-bold text-slate-500">
									calculado pelo mensal x 12
								</span>
							</div>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							Realizado no mês
							<div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black normal-case text-slate-600">
								Calculado pela planilha importada, conforme o mês do campo Data
								Pagamento.
							</div>
						</label>
						<label className="text-xs font-black uppercase text-slate-500">
							Comprometido no mês
							<MoneyInput
								value={form.comprometidoMes}
								disabled={readOnly || !canManage}
								onChange={(event) =>
									update("comprometidoMes", event.target.value)
								}
							/>
						</label>
					</>
				)}
				<label className="text-xs font-black uppercase text-slate-500">
					Alerta ao atingir (%)
					<input
						type="number"
						min="1"
						max="100"
						value={form.alertaPercentual || 85}
						disabled={readOnly || !canManage}
						onChange={(event) => update("alertaPercentual", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500">
					Status
					<select
						value={form.status || "ativo"}
						disabled={readOnly || !canManage}
						onChange={(event) => update("status", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					>
						{budgetSettings.centerStatuses.map((status) => (
							<option key={status} value={status}>
								{formatOptionLabel(status)}
							</option>
						))}
					</select>
				</label>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Finalidade
					<textarea
						rows={3}
						value={form.finalidade || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("finalidade", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<label className="text-xs font-black uppercase text-slate-500 md:col-span-2">
					Observações
					<textarea
						rows={3}
						value={form.observacoes || ""}
						disabled={readOnly || !canManage}
						onChange={(event) => update("observacoes", event.target.value)}
						className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
					/>
				</label>
			</div>
			{form.tipoPlano === "S" ? null : (
				<dl className="mt-5 grid gap-3 md:grid-cols-3">
					<div className="rounded-2xl bg-slate-50 p-4">
						<dt className="text-xs font-black uppercase text-slate-500">
							Uso do mês
						</dt>
						<dd className="mt-1 text-xl font-black text-slate-950">
							{decimal.format(usoPercentual)}%
						</dd>
					</div>
					<div className="rounded-2xl bg-slate-50 p-4">
						<dt className="text-xs font-black uppercase text-slate-500">
							Saldo mensal
						</dt>
						<dd className="mt-1 text-xl font-black text-slate-950">
							{brl.format(saldoMes)}
						</dd>
					</div>
					<div className="rounded-2xl bg-slate-50 p-4">
						<dt className="text-xs font-black uppercase text-slate-500">
							Tipo
						</dt>
						<dd className="mt-1 text-xl font-black text-slate-950">
							{costCenterTypes[form.tipoDespesa] || "OPEX"}
						</dd>
					</div>
				</dl>
			)}
		</>
	);
}

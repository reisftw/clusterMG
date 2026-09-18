// Cards "reais e financeiros" da Dashboard (pedido do usuário) — dados
// públicos oficiais via BrasilAPI (proxy no backend, ver
// apps/finan/backend/src/brasilapi/routes.js): consulta de CNPJ, lista de
// bancos, câmbio em tempo real e taxas/índices oficiais do Brasil.
import { Banknote, Building2, Landmark, Loader2, Percent, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanBancos, fetchFinanCambio, fetchFinanCnpj, fetchFinanTaxas } from "../api/finanApi";

function CardShell({ icon: Icon, title, subtitle, children }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center gap-2.5">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
					<Icon size={17} />
				</span>
				<div className="min-w-0">
					<h3 className="text-sm font-black text-slate-950">{title}</h3>
					{subtitle ? <p className="truncate text-[11px] font-semibold text-slate-500">{subtitle}</p> : null}
				</div>
			</div>
			<div className="mt-3">{children}</div>
		</div>
	);
}

function CnpjCard() {
	const [cnpj, setCnpj] = useState("");
	const [loading, setLoading] = useState(false);
	const [empresa, setEmpresa] = useState(null);
	const [error, setError] = useState("");

	const handleSearch = async (event) => {
		event.preventDefault();
		const digits = cnpj.replace(/\D/g, "");
		if (digits.length !== 14) {
			setError("Informe os 14 dígitos do CNPJ.");
			return;
		}
		setLoading(true);
		setError("");
		setEmpresa(null);
		try {
			setEmpresa(await fetchFinanCnpj(digits));
		} catch (err) {
			setError(err?.message || "CNPJ não encontrado.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<CardShell icon={Building2} title="Consultar CNPJ" subtitle="Dados oficiais da Receita Federal">
			<form onSubmit={handleSearch} className="flex gap-2">
				<input
					value={cnpj}
					onChange={(e) => setCnpj(e.target.value)}
					placeholder="00.000.000/0000-00"
					className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold outline-none focus:border-blue-400"
				/>
				<button type="submit" disabled={loading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
					{loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
				</button>
			</form>
			{error ? <p className="mt-2 text-[11px] font-bold text-red-600">{error}</p> : null}
			{empresa ? (
				<div className="mt-3 space-y-1 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
					<p className="text-xs font-black text-slate-900">{empresa.razaoSocial}</p>
					{empresa.nomeFantasia ? <p className="text-[11px] font-semibold text-slate-500">{empresa.nomeFantasia}</p> : null}
					<p className={`text-[11px] font-black ${empresa.ativa ? "text-emerald-600" : "text-red-600"}`}>
						{empresa.situacaoCadastral}
					</p>
					<p className="text-[11px] font-semibold text-slate-500">{empresa.municipio} - {empresa.uf}</p>
				</div>
			) : null}
		</CardShell>
	);
}

function BancosCard() {
	const [bancos, setBancos] = useState([]);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchFinanBancos()
			.then(setBancos)
			.catch(() => setBancos([]))
			.finally(() => setLoading(false));
	}, []);

	const filtrados = query.trim().length >= 2 ? bancos.filter((b) => b.nome.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];

	return (
		<CardShell icon={Landmark} title="Bancos do Brasil" subtitle={loading ? "Carregando..." : `${bancos.length} instituições`}>
			<input
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Buscar banco pelo nome..."
				className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold outline-none focus:border-blue-400"
			/>
			{filtrados.length ? (
				<div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
					{filtrados.map((banco) => (
						<div key={`${banco.codigo}-${banco.ispb}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
							<span className="truncate font-bold text-slate-800">{banco.nome}</span>
							<span className="shrink-0 font-black text-slate-400">{banco.codigo}</span>
						</div>
					))}
				</div>
			) : null}
		</CardShell>
	);
}

const MOEDAS_PADRAO = ["USD", "EUR", "GBP", "JPY", "ARS"];
const MOEDA_LABEL = { USD: "Dólar", EUR: "Euro", GBP: "Libra", JPY: "Iene", ARS: "Peso ARG" };

function CambioCard() {
	const [cotacoes, setCotacoes] = useState([]);
	const [loading, setLoading] = useState(true);
	const [buscaMoeda, setBuscaMoeda] = useState("");
	const [extra, setExtra] = useState(null);
	const [buscando, setBuscando] = useState(false);

	useEffect(() => {
		fetchFinanCambio(MOEDAS_PADRAO)
			.then(setCotacoes)
			.catch(() => setCotacoes([]))
			.finally(() => setLoading(false));
	}, []);

	const handleBuscarOutra = async (event) => {
		event.preventDefault();
		const codigo = buscaMoeda.trim().toUpperCase();
		if (codigo.length !== 3) return;
		setBuscando(true);
		setExtra(null);
		try {
			const [resultado] = await fetchFinanCambio([codigo]);
			setExtra(resultado?.venda ? resultado : { moeda: codigo, venda: null });
		} catch {
			setExtra({ moeda: codigo, venda: null });
		} finally {
			setBuscando(false);
		}
	};

	return (
		<CardShell icon={Banknote} title="Câmbio em tempo real" subtitle="Cotação de venda, Banco Central">
			{loading ? (
				<p className="text-xs font-semibold text-slate-500">Carregando...</p>
			) : (
				<div className="grid grid-cols-1 gap-1">
					{cotacoes.map((item) => (
						<div key={item.moeda} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
							<span className="font-bold text-slate-700">{MOEDA_LABEL[item.moeda] || item.moeda} ({item.moeda})</span>
							<span className="font-black text-slate-900">{item.venda ? `R$ ${Number(item.venda).toFixed(4)}` : "—"}</span>
						</div>
					))}
				</div>
			)}
			<form onSubmit={handleBuscarOutra} className="mt-2 flex gap-2">
				<input
					value={buscaMoeda}
					onChange={(e) => setBuscaMoeda(e.target.value)}
					placeholder="Outra moeda (ex: CAD)"
					maxLength={3}
					className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold uppercase outline-none focus:border-blue-400"
				/>
				<button type="submit" disabled={buscando} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
					{buscando ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
				</button>
			</form>
			{extra ? (
				<p className="mt-1.5 text-[11px] font-bold text-slate-700">
					{extra.moeda}: {extra.venda ? `R$ ${Number(extra.venda).toFixed(4)}` : "Não encontrada"}
				</p>
			) : null}
		</CardShell>
	);
}

function TaxasCard() {
	const [taxas, setTaxas] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchFinanTaxas()
			.then(setTaxas)
			.catch(() => setTaxas([]))
			.finally(() => setLoading(false));
	}, []);

	return (
		<CardShell icon={Percent} title="Taxas e índices oficiais" subtitle="Selic, CDI, IPCA e outros">
			{loading ? (
				<p className="text-xs font-semibold text-slate-500">Carregando...</p>
			) : taxas.length ? (
				<div className="grid grid-cols-1 gap-1">
					{taxas.map((item) => (
						<div key={item.nome} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
							<span className="font-bold text-slate-700">{item.nome}</span>
							<span className="font-black text-slate-900">{Number(item.valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>
						</div>
					))}
				</div>
			) : (
				<p className="text-xs font-semibold text-slate-400">Sem dados no momento.</p>
			)}
		</CardShell>
	);
}

export default function FinanBrasilApiCards() {
	return (
		<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<CnpjCard />
			<BancosCard />
			<CambioCard />
			<TaxasCard />
		</div>
	);
}

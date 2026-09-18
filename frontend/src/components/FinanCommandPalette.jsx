// Roteiro Finan #31 (Fase 4B — Busca Global / Command Palette Ctrl+K,
// estende #22): overlay global, abre com Ctrl+K (ou Cmd+K no Mac) de
// qualquer tela, resultados agrupados por tipo com navegação por teclado
// (setas + Enter + Esc). Reaproveita o mesmo endpoint de busca que já
// alimenta a GlobalSearchBar do topbar (fetchFinanBusca) — não duplica
// lógica de busca, só a forma de abrir/navegar o resultado.
import { Building2, CreditCard, FileText, Handshake, Search, Users, Wallet, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchFinanBusca } from "../api/finanApi";

const TIPO_META = {
	fornecedor: { label: "Fornecedores", icon: Building2 },
	nota_fiscal: { label: "Notas fiscais", icon: FileText },
	conta_pagar: { label: "Contas a pagar", icon: Wallet },
	conta_receber: { label: "Contas a receber", icon: Wallet },
	contrato: { label: "Contratos", icon: Handshake },
	colaborador: { label: "Equipe", icon: Users },
	conta_financeira: { label: "Plano de contas", icon: CreditCard },
	integracao: { label: "Integrações", icon: Wrench },
};

function groupResults(items) {
	const groups = new Map();
	items.forEach((item) => {
		const key = item.tipo || "outro";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(item);
	});
	return [...groups.entries()].map(([tipo, list]) => ({
		tipo,
		label: TIPO_META[tipo]?.label || tipo,
		Icon: TIPO_META[tipo]?.icon || Search,
		items: list,
	}));
}

export default function FinanCommandPalette() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef(null);

	const close = useCallback(() => {
		setOpen(false);
		setQuery("");
		setResults([]);
		setActiveIndex(0);
	}, []);

	// Ctrl+K / Cmd+K abre de qualquer tela. "/" tambem abre quando o foco
	// nao esta num campo de texto (atalho comum em apps de busca, ex.
	// GitHub/Linear) — checa o elemento focado pra nao atrapalhar digitação
	// normal em formulários.
	useEffect(() => {
		function onKeyDown(event) {
			const isTypingTarget = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) ||
				document.activeElement?.isContentEditable;
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((current) => !current);
				return;
			}
			if (event.key === "/" && !isTypingTarget && !open) {
				event.preventDefault();
				setOpen(true);
			}
			if (event.key === "Escape" && open) {
				close();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, close]);

	useEffect(() => {
		if (open) {
			// Espera o modal montar pra focar — senao o foco tenta ir pro
			// input antes dele existir no DOM.
			const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
			return () => window.clearTimeout(timer);
		}
		return undefined;
	}, [open]);

	useEffect(() => {
		if (!open || query.trim().length < 2) {
			setResults([]);
			return undefined;
		}
		let active = true;
		setLoading(true);
		const timer = window.setTimeout(() => {
			fetchFinanBusca(query.trim())
				.then((items) => {
					if (active) {
						setResults(items);
						setActiveIndex(0);
					}
				})
				.catch(() => {
					if (active) setResults([]);
				})
				.finally(() => {
					if (active) setLoading(false);
				});
		}, 250);
		return () => {
			active = false;
			window.clearTimeout(timer);
		};
	}, [query, open]);

	const groups = useMemo(() => groupResults(results), [results]);
	const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

	const goTo = useCallback(
		(item) => {
			if (!item) return;
			navigate(item.link);
			close();
		},
		[navigate, close],
	);

	const onInputKeyDown = (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatItems.length - 1)));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			goTo(flatItems[activeIndex]);
		}
	};

	if (!open) return null;

	let runningIndex = -1;

	return (
		<div className="fixed inset-0 z-[999] flex items-start justify-center bg-slate-950/60 px-4 pt-[12vh] backdrop-blur-sm">
			<button
				type="button"
				className="absolute inset-0 cursor-default"
				aria-label="Fechar busca"
				onClick={close}
			/>
			<div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
				<div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 focus-within:bg-slate-50">
					<Search size={18} className="shrink-0 text-slate-400" />
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={onInputKeyDown}
						placeholder="Buscar fornecedor, NF, CNPJ, conta, contrato, colaborador..."
						className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
					/>
					<kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-400 sm:block">
						ESC
					</kbd>
					<button
						type="button"
						onClick={close}
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 sm:hidden"
						aria-label="Fechar"
					>
						<X size={16} />
					</button>
				</div>

				<div className="max-h-[60vh] overflow-y-auto p-2">
					{loading ? (
						<p className="px-3 py-6 text-center text-sm font-semibold text-slate-400">Buscando...</p>
					) : query.trim().length < 2 ? (
						<p className="px-3 py-6 text-center text-sm font-semibold text-slate-400">
							Digite ao menos 2 caracteres para buscar em todo o Finan.
						</p>
					) : !flatItems.length ? (
						<p className="px-3 py-6 text-center text-sm font-semibold text-slate-400">Nenhum resultado encontrado.</p>
					) : (
						groups.map((group) => (
							<div key={group.tipo} className="mb-1">
								<p className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
									{group.label}
								</p>
								{group.items.map((item) => {
									runningIndex += 1;
									const index = runningIndex;
									const isActive = index === activeIndex;
									return (
										<button
											key={`${item.tipo}-${item.titulo}-${index}`}
											type="button"
											onMouseEnter={() => setActiveIndex(index)}
											onClick={() => goTo(item)}
											className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
												isActive ? "bg-blue-50" : "hover:bg-slate-50"
											}`}
										>
											<group.Icon size={16} className="shrink-0 text-slate-400" />
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm font-bold text-slate-900">{item.titulo}</span>
												<span className="block truncate text-xs font-medium text-slate-500">{item.subtitulo}</span>
											</span>
										</button>
									);
								})}
							</div>
						))
					)}
				</div>

				<div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-400">
					<span>↑↓ navegar · Enter abrir · Esc fechar</span>
					<span>Ctrl+K / ⌘K</span>
				</div>
			</div>
		</div>
	);
}

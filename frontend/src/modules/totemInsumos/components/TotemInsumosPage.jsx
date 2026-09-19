import {
	AlertTriangle,
	CheckCircle2,
	LogOut,
	Mail,
	Minus,
	PackagePlus,
	Plus,
	RefreshCw,
	Search,
	ShoppingCart,
	WifiOff,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	carregarTotemInsumos,
	criarTotemRequisicoes,
	encerrarTotemSessao,
	isBrasilTecparEmail,
	normalizeTotemEmail,
	solicitarTotemOtp,
	validarTotemOtp,
} from "../services/totemInsumosService";

const INITIAL_STATE = "IDLE";
const KIOSK_ID = "TOTEM-001";
const IDLE_TIMEOUT_SECONDS = 120;
const CONFIRM_TIMEOUT_SECONDS = 30;

function formatQuantity(value) {
	return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function maskEmail(email = "") {
	const [local, domain] = normalizeTotemEmail(email).split("@");
	if (!local || !domain) return email;
	return `${local.slice(0, 1)}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

function firstName(name = "") {
	return String(name || "").trim().split(/\s+/)[0] || "colaborador";
}

function TotemButton({ children, variant = "primary", className = "", ...props }) {
	const variants = {
		primary:
			"bg-blue-600 text-white shadow-xl shadow-blue-950/20 hover:bg-blue-700 disabled:bg-slate-300",
		orange:
			"bg-orange-500 text-white shadow-xl shadow-orange-950/20 hover:bg-orange-600 disabled:bg-slate-300",
		light:
			"border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50 disabled:text-slate-400",
		danger:
			"bg-red-600 text-white shadow-xl shadow-red-950/20 hover:bg-red-700 disabled:bg-slate-300",
	};
	return (
		<button
			type="button"
			className={`inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-7 py-4 text-lg font-black transition active:scale-[0.99] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}

function Shell({ children, user, onLogout, cartCount = 0, showCart = false, onOpenCart }) {
	return (
		<div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_10%,#dbeafe_0,#f8fafc_28%,#eef2ff_100%)] text-slate-950">
			<header className="flex items-center justify-between px-6 py-5 md:px-10">
				<div className="flex items-center gap-4">
					<img src="/logo-adm.png" alt="Administrativo" className="h-14 w-auto object-contain" />
					<div>
						<p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">
							Autoatendimento
						</p>
						<p className="text-lg font-black text-slate-900">
							Solicitação de Insumos
						</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					{showCart ? (
						<TotemButton variant="light" className="min-h-12 px-5 text-base" onClick={onOpenCart}>
							<ShoppingCart size={22} /> Pedido • {cartCount}
						</TotemButton>
					) : null}
					{user ? (
						<TotemButton variant="light" className="min-h-12 px-5 text-base" onClick={onLogout}>
							<LogOut size={20} /> Encerrar sessão
						</TotemButton>
					) : null}
				</div>
			</header>
			<main className="mx-auto flex min-h-[calc(100vh-112px)] w-full max-w-7xl flex-col px-6 pb-8 md:px-10">
				{children}
			</main>
		</div>
	);
}

function OfflineBanner({ online, onRetry }) {
	if (online) return null;
	return (
		<div className="fixed inset-x-4 bottom-4 z-[300] rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl md:inset-x-auto md:right-6 md:w-[420px]">
			<div className="flex items-center gap-3">
				<WifiOff size={26} />
				<div className="flex-1">
					<p className="font-black">Sem conexão</p>
					<p className="text-sm font-semibold">Não conseguimos acessar o sistema no momento.</p>
				</div>
				<button type="button" onClick={onRetry} className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white">
					Tentar
				</button>
			</div>
		</div>
	);
}

export default function TotemInsumosPage() {
	const [state, setState] = useState(INITIAL_STATE);
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [resendSeconds, setResendSeconds] = useState(0);
	const [session, setSession] = useState(null);
	const [products, setProducts] = useState([]);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("Todos");
	const [cart, setCart] = useState({});
	const [cartOpen, setCartOpen] = useState(false);
	const [createdRequests, setCreatedRequests] = useState([]);
	const [confirmSeconds, setConfirmSeconds] = useState(CONFIRM_TIMEOUT_SECONDS);
	const [idleWarning, setIdleWarning] = useState(false);
	const [idleCountdown, setIdleCountdown] = useState(30);
	const [online, setOnline] = useState(() => navigator.onLine);
	const idleTimerRef = useRef(null);
	const idleWarningRef = useRef(null);

	const resetKioskSession = useCallback(
		async (reason = "finished") => {
			const token = session?.token;
			setState(INITIAL_STATE);
			setEmail("");
			setOtp("");
			setError("");
			setLoading(false);
			setResendSeconds(0);
			setSession(null);
			setProducts([]);
			setQuery("");
			setCategory("Todos");
			setCart({});
			setCartOpen(false);
			setCreatedRequests([]);
			setConfirmSeconds(CONFIRM_TIMEOUT_SECONDS);
			setIdleWarning(false);
			setIdleCountdown(30);
			if (token) await encerrarTotemSessao({ token, reason });
			window.history.replaceState(null, "", "/totem");
		},
		[session?.token],
	);

	const touchActivity = useCallback(() => {
		if (!session || ["SUCCESS", "MORE_REQUEST"].includes(state)) return;
		window.clearTimeout(idleTimerRef.current);
		window.clearInterval(idleWarningRef.current);
		setIdleWarning(false);
		setIdleCountdown(30);
		idleTimerRef.current = window.setTimeout(() => {
			setIdleWarning(true);
			let remaining = 30;
			setIdleCountdown(remaining);
			idleWarningRef.current = window.setInterval(() => {
				remaining -= 1;
				setIdleCountdown(remaining);
				if (remaining <= 0) {
					window.clearInterval(idleWarningRef.current);
					resetKioskSession("timeout");
				}
			}, 1000);
		}, IDLE_TIMEOUT_SECONDS * 1000);
	}, [resetKioskSession, session, state]);

	useEffect(() => {
		document.title = "Totem de Insumos | Administrativo";
		const onlineHandler = () => setOnline(true);
		const offlineHandler = () => setOnline(false);
		window.addEventListener("online", onlineHandler);
		window.addEventListener("offline", offlineHandler);
		return () => {
			window.removeEventListener("online", onlineHandler);
			window.removeEventListener("offline", offlineHandler);
		};
	}, []);

	useEffect(() => {
		const events = ["pointerdown", "keydown", "touchstart"];
		events.forEach((eventName) => window.addEventListener(eventName, touchActivity, { passive: true }));
		touchActivity();
		return () => {
			events.forEach((eventName) => window.removeEventListener(eventName, touchActivity));
			window.clearTimeout(idleTimerRef.current);
			window.clearInterval(idleWarningRef.current);
		};
	}, [touchActivity]);

	useEffect(() => {
		if (resendSeconds <= 0) return undefined;
		const timer = window.setInterval(() => {
			setResendSeconds((current) => Math.max(0, current - 1));
		}, 1000);
		return () => window.clearInterval(timer);
	}, [resendSeconds]);

	useEffect(() => {
		if (state !== "SUCCESS") return undefined;
		setConfirmSeconds(CONFIRM_TIMEOUT_SECONDS);
		const timer = window.setInterval(() => {
			setConfirmSeconds((current) => {
				if (current <= 1) {
					window.clearInterval(timer);
					resetKioskSession("success_timeout");
					return 0;
				}
				return current - 1;
			});
		}, 1000);
		return () => window.clearInterval(timer);
	}, [resetKioskSession, state]);

	const categories = useMemo(
		() => ["Todos", ...new Set(products.map((item) => item.categoria || "Outros"))],
		[products],
	);

	const filteredProducts = useMemo(() => {
		const q = query.trim().toLowerCase();
		return products.filter((item) => {
			const matchesCategory = category === "Todos" || item.categoria === category;
			const matchesQuery = !q || `${item.nome} ${item.categoria} ${item.descricao}`.toLowerCase().includes(q);
			return matchesCategory && matchesQuery;
		});
	}, [category, products, query]);

	const cartItems = useMemo(
		() =>
			Object.entries(cart)
				.map(([id, quantidade]) => {
					const product = products.find((item) => item.id === id);
					return product ? { ...product, quantidade } : null;
				})
				.filter(Boolean),
		[cart, products],
	);
	const cartCount = cartItems.reduce((sum, item) => sum + Number(item.quantidade || 0), 0);

	const updateCart = (id, quantity) => {
		const product = products.find((item) => item.id === id);
		const max = Number(product?.estoque_atual || 0);
		setCart((current) => {
			const nextQuantity = Math.min(Math.max(0, Number(quantity || 0)), max);
			const next = { ...current };
			if (nextQuantity <= 0) delete next[id];
			else next[id] = nextQuantity;
			return next;
		});
	};

	const requestOtp = async () => {
		const normalized = normalizeTotemEmail(email);
		setError("");
		if (!isBrasilTecparEmail(normalized)) {
			setError("Utilize seu e-mail corporativo Brasil Tecpar.");
			return;
		}
		setLoading(true);
		try {
			const response = await solicitarTotemOtp(normalized);
			setEmail(normalized);
			setResendSeconds(Number(response.resendInSeconds || 45));
			setState("OTP");
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const verifyOtp = async () => {
		setError("");
		if (otp.replace(/\D/g, "").length !== 6) {
			setError("Digite o código de 6 dígitos.");
			return;
		}
		setLoading(true);
		try {
			const response = await validarTotemOtp({ email, code: otp, kioskId: KIOSK_ID });
			setSession(response);
			setState("CATALOG");
			const catalog = await carregarTotemInsumos(response.token);
			setProducts(catalog.items || []);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const loadCatalog = async () => {
		if (!session?.token) return;
		setLoading(true);
		setError("");
		try {
			const catalog = await carregarTotemInsumos(session.token);
			setProducts(catalog.items || []);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const submitRequest = async () => {
		if (!cartItems.length || loading) return;
		setLoading(true);
		setError("");
		setState("SUBMITTING");
		try {
			const response = await criarTotemRequisicoes({
				token: session.token,
				items: cartItems.map((item) => ({
					produtoId: item.id,
					quantidade: item.quantidade,
				})),
			});
			setCreatedRequests(response.items || []);
			setCart({});
			setCartOpen(false);
			setState("SUCCESS");
		} catch (err) {
			setState("REVIEW");
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const newOrder = async () => {
		setCart({});
		setQuery("");
		setCategory("Todos");
		setCreatedRequests([]);
		setError("");
		setState("CATALOG");
		await loadCatalog();
	};

	const user = session?.user;

	return (
		<Shell
			user={user}
			onLogout={() => resetKioskSession("manual_logout")}
			cartCount={cartCount}
			showCart={state === "CATALOG" || state === "CART"}
			onOpenCart={() => setCartOpen(true)}
		>
			<OfflineBanner online={online} onRetry={loadCatalog} />
			{idleWarning ? (
				<div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
					<div className="w-full max-w-xl rounded-[2rem] bg-white p-8 text-center shadow-2xl">
						<AlertTriangle className="mx-auto text-orange-500" size={58} />
						<h2 className="mt-4 text-3xl font-black">Você ainda está aí?</h2>
						<p className="mt-3 text-lg font-semibold text-slate-600">
							Sua sessão será encerrada em {idleCountdown}s.
						</p>
						<div className="mt-7 grid gap-3 sm:grid-cols-2">
							<TotemButton variant="light" onClick={touchActivity}>Continuar pedido</TotemButton>
							<TotemButton variant="danger" onClick={() => resetKioskSession("timeout_confirmed")}>Encerrar agora</TotemButton>
						</div>
					</div>
				</div>
			) : null}

			{state === "IDLE" ? (
				<section className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
					<div>
						<p className="text-base font-black uppercase tracking-[0.35em] text-orange-500">
							Brasil Tecpar
						</p>
						<h1 className="mt-4 max-w-3xl text-6xl font-black leading-[1.02] text-slate-950 md:text-7xl">
							Solicitação de Insumos
						</h1>
						<p className="mt-5 max-w-2xl text-2xl font-semibold leading-9 text-slate-600">
							Faça seu pedido de forma rápida, segura e integrada ao Administrativo.
						</p>
						<TotemButton className="mt-9 min-h-20 px-10 text-2xl" onClick={() => setState("EMAIL")}>
							<ShoppingCart size={30} /> Iniciar pedido
						</TotemButton>
						<p className="mt-8 text-sm font-black uppercase tracking-[0.25em] text-slate-400">
							Autoatendimento • Brasil Tecpar
						</p>
					</div>
					<div className="relative hidden min-h-[520px] items-center justify-center lg:flex">
						<div className="absolute inset-10 rounded-full bg-blue-500/10 blur-3xl" />
						<img src="/retorninho-adm.webp" alt="" className="relative max-h-[560px] object-contain drop-shadow-2xl" />
					</div>
				</section>
			) : null}

			{state === "EMAIL" ? (
				<section className="mx-auto flex flex-1 w-full max-w-3xl items-center">
					<div className="w-full rounded-[2rem] border border-white bg-white/90 p-8 shadow-2xl">
						<Mail className="text-blue-600" size={44} />
						<h1 className="mt-5 text-4xl font-black">Qual é o seu e-mail?</h1>
						<p className="mt-3 text-xl font-semibold text-slate-600">
							Utilize seu e-mail corporativo Brasil Tecpar.
						</p>
						<input
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="off"
							inputMode="email"
							placeholder="nome.sobrenome@brasiltecpar.com.br"
							className="mt-7 h-20 w-full rounded-3xl border-2 border-slate-200 px-6 text-2xl font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						/>
						{error ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-lg font-bold text-red-700">{error}</p> : null}
						<div className="mt-7 flex flex-wrap gap-3">
							<TotemButton onClick={requestOtp} disabled={loading}>
								{loading ? "Enviando código..." : "Receber código"}
							</TotemButton>
							<TotemButton variant="light" onClick={() => resetKioskSession("back_to_idle")}>Voltar</TotemButton>
						</div>
					</div>
				</section>
			) : null}

			{state === "OTP" ? (
				<section className="mx-auto flex flex-1 w-full max-w-3xl items-center">
					<div className="w-full rounded-[2rem] border border-white bg-white/90 p-8 shadow-2xl">
						<h1 className="text-4xl font-black">Confira seu e-mail</h1>
						<p className="mt-3 text-xl font-semibold text-slate-600">
							Digite o código enviado para <strong>{maskEmail(email)}</strong>.
						</p>
						<input
							value={otp}
							onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
							autoComplete="one-time-code"
							inputMode="numeric"
							placeholder="000000"
							className="mt-7 h-24 w-full rounded-3xl border-2 border-slate-200 px-6 text-center text-5xl font-black tracking-[0.35em] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						/>
						{error ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-lg font-bold text-red-700">{error}</p> : null}
						<div className="mt-7 flex flex-wrap gap-3">
							<TotemButton onClick={verifyOtp} disabled={loading}>
								{loading ? "Validando código..." : "Confirmar código"}
							</TotemButton>
							<TotemButton variant="light" onClick={requestOtp} disabled={loading || resendSeconds > 0}>
								{resendSeconds > 0 ? `Reenviar em ${resendSeconds}s` : "Reenviar código"}
							</TotemButton>
							<TotemButton variant="light" onClick={() => { setOtp(""); setState("EMAIL"); }}>Usar outro e-mail</TotemButton>
						</div>
					</div>
				</section>
			) : null}

			{state === "CATALOG" ? (
				<section className="flex-1">
					<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
						<div>
							<p className="text-lg font-black text-blue-700">Olá, {firstName(user?.nome)}.</p>
							<h1 className="text-4xl font-black">O que você precisa hoje?</h1>
						</div>
						<TotemButton variant="light" className="min-h-12 px-5 text-base" onClick={loadCatalog}>
							<RefreshCw size={20} /> Atualizar
						</TotemButton>
					</div>
					<div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
						<label className="flex min-h-16 items-center gap-3 rounded-3xl border-2 border-white bg-white px-5 shadow-sm">
							<Search className="text-slate-400" size={28} />
							<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar insumo" className="h-14 flex-1 bg-transparent text-xl font-bold outline-none" />
						</label>
						<div className="flex max-w-full gap-2 overflow-x-auto pb-1">
							{categories.map((item) => (
								<button key={item} type="button" onClick={() => setCategory(item)} className={`min-h-16 whitespace-nowrap rounded-2xl px-5 text-base font-black transition ${category === item ? "bg-blue-600 text-white shadow-lg" : "bg-white text-slate-700"}`}>
									{item}
								</button>
							))}
						</div>
					</div>
					{loading ? (
						<div className="rounded-[2rem] bg-white p-10 text-center text-xl font-black text-slate-500">Carregando insumos...</div>
					) : null}
					{error ? <p className="mb-5 rounded-2xl bg-red-50 p-4 text-lg font-bold text-red-700">{error}</p> : null}
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{filteredProducts.map((item) => {
							const quantity = cart[item.id] || 0;
							return (
								<div key={item.id} className="rounded-[1.75rem] border border-white bg-white p-5 shadow-lg">
									<div className="flex items-start gap-4">
										<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
											<PackagePlus size={34} />
										</div>
										<div className="min-w-0 flex-1">
											<p className="line-clamp-2 text-xl font-black">{item.nome}</p>
											<p className="mt-1 text-sm font-bold uppercase tracking-wide text-orange-500">{item.categoria}</p>
											<p className="mt-2 text-sm font-semibold text-slate-500">Disponível: {formatQuantity(item.estoque_atual)} {item.unidade}</p>
										</div>
									</div>
									<div className="mt-5 flex items-center justify-between gap-3">
										<div className="flex items-center rounded-2xl bg-slate-100 p-1">
											<button type="button" onClick={() => updateCart(item.id, quantity - 1)} className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-slate-800 shadow-sm">
												<Minus size={24} />
											</button>
											<span className="w-16 text-center text-2xl font-black">{quantity}</span>
											<button type="button" onClick={() => updateCart(item.id, quantity + 1)} className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
												<Plus size={24} />
											</button>
										</div>
										<TotemButton className="min-h-14 px-5 text-base" onClick={() => updateCart(item.id, quantity + 1)}>
											Adicionar
										</TotemButton>
									</div>
								</div>
							);
						})}
					</div>
				</section>
			) : null}

			{(cartOpen || state === "REVIEW") && (
				<div className="fixed inset-0 z-[240] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm md:items-center">
					<div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
						<div className="flex items-center justify-between border-b border-slate-100 p-5">
							<div>
								<h2 className="text-3xl font-black">{state === "REVIEW" ? "Confira sua solicitação" : "Seu pedido"}</h2>
								<p className="text-sm font-bold text-slate-500">{cartCount} item(ns) selecionado(s)</p>
							</div>
							<button type="button" onClick={() => state === "REVIEW" ? setState("CATALOG") : setCartOpen(false)} className="rounded-2xl border border-slate-200 p-3">
								<X size={24} />
							</button>
						</div>
						<div className="max-h-[58vh] space-y-3 overflow-y-auto p-5">
							{cartItems.length ? cartItems.map((item) => (
								<div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
									<div>
										<p className="text-lg font-black">{item.nome}</p>
										<p className="text-sm font-bold text-slate-500">{item.categoria} • {item.unidade}</p>
									</div>
									<div className="flex items-center rounded-2xl bg-white p-1 shadow-sm">
										<button type="button" onClick={() => updateCart(item.id, item.quantidade - 1)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
											<Minus size={22} />
										</button>
										<span className="w-14 text-center text-xl font-black">{item.quantidade}</span>
										<button type="button" onClick={() => updateCart(item.id, item.quantidade + 1)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
											<Plus size={22} />
										</button>
									</div>
								</div>
							)) : (
								<p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-lg font-bold text-slate-500">Seu pedido ainda está vazio.</p>
							)}
						</div>
						<div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2">
							<TotemButton variant="light" onClick={() => { setCartOpen(false); setState("CATALOG"); }}>Voltar e alterar</TotemButton>
							<TotemButton variant="orange" disabled={!cartItems.length} onClick={() => { setCartOpen(false); setState("REVIEW"); }}>
								Conferir pedido
							</TotemButton>
							{state === "REVIEW" ? (
								<TotemButton className="sm:col-span-2" disabled={!cartItems.length || loading} onClick={submitRequest}>
									{loading ? "Registrando sua solicitação..." : "Confirmar solicitação"}
								</TotemButton>
							) : null}
							{error && state === "REVIEW" ? <p className="sm:col-span-2 rounded-2xl bg-red-50 p-4 text-lg font-bold text-red-700">{error}</p> : null}
						</div>
					</div>
				</div>
			)}

			{state === "SUBMITTING" ? (
				<section className="flex flex-1 items-center justify-center">
					<div className="rounded-[2rem] bg-white p-10 text-center shadow-2xl">
						<RefreshCw className="mx-auto animate-spin text-blue-600" size={58} />
						<h1 className="mt-5 text-3xl font-black">Registrando sua solicitação...</h1>
						<p className="mt-2 text-lg font-semibold text-slate-500">Aguarde, não toque novamente no botão.</p>
					</div>
				</section>
			) : null}

			{state === "SUCCESS" ? (
				<section className="mx-auto flex flex-1 w-full max-w-3xl items-center">
					<div className="w-full rounded-[2rem] bg-white p-8 text-center shadow-2xl">
						<CheckCircle2 className="mx-auto text-emerald-500" size={76} />
						<h1 className="mt-5 text-4xl font-black">Pedido realizado!</h1>
						<p className="mt-3 text-xl font-semibold text-slate-600">
							Enviamos o comprovante para {maskEmail(email)}.
						</p>
						<div className="mt-6 rounded-3xl bg-blue-50 p-5 text-left">
							<p className="text-sm font-black uppercase tracking-wide text-blue-700">Requisições</p>
							<p className="mt-2 text-2xl font-black text-slate-950">
								{createdRequests.map((item) => item.protocolo).join(", ")}
							</p>
						</div>
						<h2 className="mt-8 text-2xl font-black">Deseja fazer outro pedido?</h2>
						<p className="mt-2 text-lg font-semibold text-slate-500">Sessão encerrada automaticamente em {confirmSeconds}s.</p>
						<div className="mt-7 grid gap-3 sm:grid-cols-2">
							<TotemButton onClick={newOrder}>Sim, novo pedido</TotemButton>
							<TotemButton variant="danger" onClick={() => resetKioskSession("finished")}>Não, finalizar</TotemButton>
						</div>
					</div>
				</section>
			) : null}
		</Shell>
	);
}

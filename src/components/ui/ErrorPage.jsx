import {
	ArrowLeft,
	Check,
	Clock3,
	Coffee,
	Home,
	LifeBuoy,
	ShieldCheck,
	TriangleAlert,
	Wrench,
} from "lucide-react";
import { ROUTES } from "../../router/routes";

const ERROR_CONFIG = {
	403: {
		code: "403",
		badge: "Ops! Acesso negado",
		title: "Você não tem permissão para entrar aqui.",
		description:
			"Essa área precisa de autorização. Se você acredita que deveria ter acesso, fale com o administrador.",
		helpTitle: "Sem problema!",
		helpText:
			"Retorninho já está verificando as permissões para manter tudo seguro.",
	},
	404: {
		code: "404",
		badge: "Ops! Página não encontrada",
		title: "Essa página saiu para um café e ainda não voltou.",
		description: "",
		helpTitle: "Não se preocupe!",
		helpText:
			"Retorninho já está trabalhando para o site voltar ao ar o mais rápido possível.",
	},
	500: {
		code: "500",
		badge: "Ops! Algo saiu do esperado",
		title: "Tivemos uma instabilidade por aqui.",
		description:
			"Nossa equipe pode verificar o ocorrido. Tente novamente em alguns instantes.",
		helpTitle: "Estamos cuidando disso!",
		helpText: "Retorninho já recebeu o chamado e está olhando o sistema.",
	},
};

const InfoCard = ({ icon: Icon, iconClass, title, text }) => (
	<div className="flex items-start gap-3 xl:gap-5">
		<span
			className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full xl:h-14 xl:w-14 ${iconClass}`}
		>
			<Icon size={20} />
		</span>
		<div>
			<h3 className="text-sm font-black text-[#10134c] xl:text-base">
				{title}
			</h3>
			<p className="mt-1 text-xs leading-relaxed text-[#525b94] xl:mt-2 xl:text-sm">
				{text}
			</p>
		</div>
	</div>
);

const ErrorPage = ({ code = "404", extraActions = null }) => {
	const config = ERROR_CONFIG[String(code)] || ERROR_CONFIG[500];
	const goHome = () => {
		if (typeof window !== "undefined") {
			window.location.assign(ROUTES.DASHBOARD);
		}
	};
	const goBack = () => {
		if (typeof window === "undefined") return;
		if (window.history.length > 1) {
			window.history.back();
			return;
		}
		window.location.assign(ROUTES.DASHBOARD);
	};

	return (
		<main className="relative min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_92%_4%,rgba(30,103,255,0.08),transparent_20%),linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] px-4 py-4 text-[#11145b] sm:px-5 lg:py-5 xl:py-7">
			<div className="absolute right-10 top-12 hidden grid-cols-5 gap-3 lg:grid">
				{Array.from({ length: 35 }).map((_, index) => (
					<span key={index} className="h-1.5 w-1.5 rounded-full bg-blue-100" />
				))}
			</div>
			<div className="absolute -bottom-28 left-[30%] h-72 w-72 rounded-full bg-blue-50" />

			<div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] max-w-[1500px] flex-col">
				<header className="flex h-14 shrink-0 items-center justify-between sm:h-16 xl:h-20">
					<img
						src="/cluster-mg.png"
						alt="Sempre Internet"
						className="h-16 w-auto object-contain sm:h-20 xl:h-24"
					/>
				</header>

				<section className="grid min-h-0 flex-1 items-center gap-6 py-2 lg:grid-cols-[0.82fr_1.18fr] xl:gap-8 xl:py-4">
					<div className="relative z-10 max-w-[540px] lg:pl-10 xl:pl-16">
						<div className="mb-3 inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-xs font-bold text-orange-600 sm:mb-4 xl:mb-6 xl:px-5 xl:py-3 xl:text-sm">
							<TriangleAlert size={16} />
							{config.badge}
						</div>

						<h1 className="break-anywhere text-5xl font-black leading-none tracking-normal sm:text-6xl lg:text-[88px] xl:text-[108px]">
							Erro{" "}
							<span className="bg-[linear-gradient(90deg,#ff7a00_0%,#ff4b00_46%,#0068ff_100%)] bg-clip-text text-transparent">
								{config.code}
							</span>
						</h1>
						<p className="mt-3 max-w-[460px] text-lg font-semibold leading-snug text-[#10145f] sm:text-xl xl:mt-5 xl:text-2xl">
							{config.title}{" "}
							<Coffee className="inline-block text-slate-500" size={20} />
						</p>
						{config.description ? (
							<p className="mt-2 max-w-[470px] text-sm leading-relaxed text-[#525b94] xl:text-base">
								{config.description}
							</p>
						) : null}

						<div className="mt-4 flex max-w-[440px] items-start gap-4 rounded-2xl border border-blue-100 bg-white/86 p-4 shadow-[0_18px_55px_rgba(20,39,100,0.08)] xl:mt-7 xl:gap-5 xl:rounded-3xl xl:p-6">
							<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-[0_10px_30px_rgba(20,39,100,0.1)] xl:h-16 xl:w-16">
								<Wrench size={24} />
							</span>
							<div>
								<h2 className="text-base font-black text-[#10134c] xl:text-lg">
									{config.helpTitle}
								</h2>
								<p className="mt-1 text-sm leading-relaxed text-[#525b94] xl:mt-2 xl:text-base">
									{config.helpText}
								</p>
							</div>
						</div>

						{extraActions ? (
							<div className="mt-4 max-w-[440px] xl:mt-6">{extraActions}</div>
						) : null}

						<div className="mt-4 grid max-w-[440px] gap-3 sm:grid-cols-2 xl:mt-6 xl:gap-5">
							<button
								type="button"
								onClick={goHome}
								className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[linear-gradient(90deg,#ff6a00_0%,#ff3d00_100%)] px-5 py-3 text-sm font-black text-white shadow-[0_18px_34px_rgba(255,82,0,0.24)] transition hover:-translate-y-0.5 xl:min-h-16 xl:rounded-2xl xl:px-6 xl:text-base"
							>
								<Home size={20} />
								Ir para o início
							</button>
							<button
								type="button"
								onClick={goBack}
								className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-blue-100 bg-white px-5 py-3 text-sm font-black text-[#10145f] shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 xl:min-h-16 xl:rounded-2xl xl:px-6 xl:text-base"
							>
								<ArrowLeft size={20} />
								Voltar
							</button>
						</div>

						<div className="mt-4 flex items-center gap-3 xl:mt-7 xl:gap-4">
							<span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600 xl:h-14 xl:w-14">
								<LifeBuoy size={22} />
							</span>
							<div>
								<p className="text-sm font-black text-[#10134c] xl:text-base">
									Precisa de ajuda?
								</p>
								<p className="mt-1 text-sm text-[#525b94]">
									Entre em contato com o{" "}
									<a
										href="mailto:suporte@sempre.net.br"
										className="font-bold text-blue-600 hover:text-blue-700"
									>
										suporte.
									</a>
								</p>
							</div>
						</div>
					</div>

					<div className="relative hidden min-h-0 self-stretch sm:block">
						<img
							src="/retorninho-pc.png"
							alt="Retorninho trabalhando no computador"
							className="absolute bottom-0 right-[-16vw] max-h-full w-[128%] max-w-none object-contain sm:right-[-10vw] sm:w-[104%] lg:right-[-12vw] lg:w-[116%] xl:right-[-11vw] xl:w-[118%]"
						/>
					</div>
				</section>

				<section className="relative z-10 mx-auto hidden w-full max-w-[1240px] shrink-0 gap-4 rounded-2xl border border-blue-50 bg-white/92 px-5 py-4 shadow-[0_22px_70px_rgba(20,39,100,0.08)] backdrop-blur md:grid md:grid-cols-3 xl:mb-2 xl:gap-6 xl:rounded-3xl xl:px-8 xl:py-7">
					<InfoCard
						icon={ShieldCheck}
						iconClass="bg-blue-50 text-blue-600"
						title="Estamos cuidando de tudo"
						text="Nossa equipe foi notificada e já está analisando o problema."
					/>
					<InfoCard
						icon={Clock3}
						iconClass="bg-orange-50 text-orange-600"
						title="Voltaremos em breve"
						text="Em instantes tudo estará funcionando normalmente."
					/>
					<InfoCard
						icon={Check}
						iconClass="bg-emerald-50 text-emerald-600"
						title="Obrigado pela paciência!"
						text="Agradecemos sua compreensão enquanto resolvemos isso."
					/>
				</section>
			</div>
		</main>
	);
};

export default ErrorPage;

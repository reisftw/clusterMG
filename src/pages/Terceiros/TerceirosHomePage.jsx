import { useEffect } from "react";
import { ChevronRight, FileText, LockKeyhole, Map, PackageSearch, ScanBarcode, ShieldCheck } from "lucide-react";
import { ROUTES } from "../../router/routes";
import MelzFooter from "../../components/layout/MelzFooter";

const cardStyles = {
  blue: {
    glow: "from-blue-400/70",
    icon: "text-blue-600",
    iconBg: "bg-blue-50",
    arrow: "bg-blue-500/20 text-blue-300 group-hover:bg-blue-500/30 group-hover:text-blue-100",
    border: "group-hover:border-blue-300/50",
  },
  green: {
    glow: "from-emerald-400/70",
    icon: "text-emerald-600",
    iconBg: "bg-emerald-50",
    arrow: "bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500/30 group-hover:text-emerald-100",
    border: "group-hover:border-emerald-300/50",
  },
  violet: {
    glow: "from-violet-400/70",
    icon: "text-violet-600",
    iconBg: "bg-violet-50",
    arrow: "bg-violet-500/20 text-violet-300 group-hover:bg-violet-500/30 group-hover:text-violet-100",
    border: "group-hover:border-violet-300/50",
  },
  orange: {
    glow: "from-orange-400/80",
    icon: "text-orange-600",
    iconBg: "bg-orange-50",
    arrow: "bg-orange-500/20 text-orange-300 group-hover:bg-orange-500/30 group-hover:text-orange-100",
    border: "group-hover:border-orange-300/50",
  },
};

function MenuButton({ icon: Icon, title, helper, href, tone = "blue" }) {
  const styles = cardStyles[tone] || cardStyles.blue;

  return (
    <a
      href={href}
      className={`group relative flex min-h-[116px] items-center gap-4 overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.055))] p-4 text-left text-white shadow-[0_20px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:bg-white/15 active:scale-[0.985] sm:min-h-[126px] sm:p-5 ${styles.border}`}
      aria-label={title}
    >
      <span className={`pointer-events-none absolute bottom-5 left-0 h-16 w-2 rounded-r-full bg-gradient-to-b ${styles.glow} to-transparent opacity-90 blur-[1px] transition group-hover:h-20`} />
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_50%,rgba(255,255,255,0.12),transparent_34%)] opacity-70" />
      <span className={`relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[24px] ${styles.iconBg} ${styles.icon} shadow-[0_18px_34px_rgba(0,0,0,0.18)] transition duration-200 group-hover:scale-105 sm:h-20 sm:w-20`}>
        <Icon size={34} strokeWidth={2.35} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</span>
        <span className="mt-2 block text-base font-semibold leading-snug text-blue-100/85 sm:text-lg">{helper}</span>
      </span>
      <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition duration-200 group-hover:translate-x-1 ${styles.arrow}`}>
        <ChevronRight size={30} strokeWidth={3} />
      </span>
    </a>
  );
}

function SecurityCard() {
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(255,255,255,0.06))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-5">
      <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-blue-500/15 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-blue-500/10 text-blue-200">
          <ShieldCheck size={48} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black text-white">Ambiente protegido</p>
          <p className="mt-2 text-base font-semibold leading-relaxed text-blue-100/80">
            Seu acesso é realizado de forma segura.
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500/16 text-blue-200">
          <LockKeyhole size={23} />
        </span>
      </div>
    </div>
  );
}

export default function TerceirosHomePage({ portal = "terceiros" }) {
  const isTerceirizados = portal === "terceirizados";
  const terceirosParam = isTerceirizados ? "?from=terceirizados" : "?from=terceiros";

  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    const previous = link?.getAttribute("href");
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    const previousAppleIcon = appleIcon?.getAttribute("href");
    link?.setAttribute("href", "/terceiros.webmanifest?v=cluster-v2");
    appleIcon?.setAttribute("href", "/terceiros-apple-touch-icon-v2.png");
    return () => {
      if (previous) link?.setAttribute("href", previous);
      if (previousAppleIcon) appleIcon?.setAttribute("href", previousAppleIcon);
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_86%_22%,rgba(37,99,235,0.20),transparent_28%),radial-gradient(circle_at_4%_42%,rgba(59,130,246,0.17),transparent_24%),linear-gradient(180deg,#061833_0%,#082247_52%,#04162c_100%)] text-white">
      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-6 pt-9 sm:max-w-lg sm:px-7 lg:max-w-xl">
        <div className="pointer-events-none absolute right-0 top-28 h-72 w-72 translate-x-1/2 rounded-full border border-blue-300/10" />
        <div className="pointer-events-none absolute right-0 top-36 h-56 w-56 translate-x-2/3 rounded-full border border-blue-300/10" />
        <div className="pointer-events-none absolute bottom-20 right-0 h-28 w-28 bg-[radial-gradient(circle,rgba(37,99,235,0.22)_1px,transparent_1px)] [background-size:9px_9px] opacity-40" />

        <header className="relative shrink-0 text-center">
          <img
            src="/cluster-mg.png"
            alt="Cluster MG"
            className="mx-auto h-auto w-64 max-w-full object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,0.28)] sm:w-80"
          />
          <p className="mt-5 text-xs font-black uppercase tracking-[0.34em] text-orange-300 sm:text-sm">
            Área de terceiros
          </p>
          <h1 className="mt-3 text-5xl font-black leading-none tracking-tight text-white sm:text-6xl">Retiradas</h1>
        </header>

        <section className="relative flex flex-1 flex-col gap-4 py-8 sm:gap-5">
          <MenuButton
            icon={Map}
            title="Mapa"
            helper="Abrir painel público do mapa"
            href={`${ROUTES.PAINEL_MAPA}${terceirosParam}`}
            tone="blue"
          />
          <MenuButton
            icon={PackageSearch}
            title="Match"
            helper="Abrir painel público do match"
            href={`${ROUTES.PAINEL_MATCH}${terceirosParam}`}
            tone="green"
          />
          <MenuButton
            icon={ScanBarcode}
            title="Consultar MAC"
            helper="Digitar, escanear ou ler imagem"
            href={isTerceirizados ? ROUTES.TERCEIRIZADOS_CONSULTA_MAC : ROUTES.TERCEIROS_CONSULTA_MAC}
            tone="violet"
          />
          <MenuButton
            icon={FileText}
            title="Documentos"
            helper="Enviar documentos mensais"
            href={ROUTES.TERCEIRIZADOS_LOGIN}
            tone="orange"
          />
          <SecurityCard />
        </section>

        <div className="shrink-0">
          <MelzFooter variant="dark" className="border-white/10 bg-transparent text-white" />
        </div>
      </main>
    </div>
  );
}

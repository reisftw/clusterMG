const MELZ_LINK = "https://www.linkedin.com/in/reisftw/";

const MelzFooter = ({ className = "", variant = "default" }) => {
	const isDark = variant === "dark";

	return (
		<footer
			className={[
				"flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-[11px] font-semibold",
				isDark
					? "border-t border-white/10 bg-slate-950/25 text-white/75"
					: "border-t border-slate-200 bg-white/85 text-slate-500",
				className,
			].join(" ")}
		>
			<span>Desenvolvido por</span>
			<a
				href={MELZ_LINK}
				target="_blank"
				rel="noreferrer"
				title="Melz Tech"
				aria-label="Abrir LinkedIn da Melz Tech"
				className="group relative inline-flex items-center"
			>
				<img
					src="/melz-logo.png"
					alt="Melz Tech"
					loading="lazy"
					decoding="async"
					className="h-5 w-auto object-contain transition duration-200 group-hover:scale-105"
				/>
				<span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-max max-w-[min(12rem,calc(100vw-2rem))] -translate-x-1/2 whitespace-normal rounded-md bg-slate-950 px-2 py-1 text-center text-[10px] font-bold leading-tight text-white shadow-lg group-hover:block">
					Melz Tech
				</span>
			</a>
		</footer>
	);
};

export default MelzFooter;

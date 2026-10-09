import { getAppBuildInfo } from "../../utils/appBuildInfo";

const MelzFooter = ({ className = "", variant = "default" }) => {
	const isDark = variant === "dark";
	const { environment, version } = getAppBuildInfo();

	return (
		<footer
			className={[
				"flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-[11px] font-semibold",
				isDark
					? "border-t border-white/10 bg-slate-950/25 text-white/75"
					: "border-t border-slate-200 bg-white/85 text-slate-500",
				className,
			].join(" ")}
		>
			<span title={`Versão ${version} · ${environment}`}>
				v{version} · {environment}
			</span>
		</footer>
	);
};

export default MelzFooter;

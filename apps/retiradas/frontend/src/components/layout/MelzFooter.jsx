import { Sparkles } from "lucide-react";
import { useState } from "react";
import { getAppBuildInfo } from "../../utils/appBuildInfo";
import { getApiBaseUrl } from "../../services/vpsApiClient";
import AppReleaseNotesDialog from "./AppReleaseNotesDialog";

const MelzFooter = ({ className = "", variant = "default" }) => {
	const isDark = variant === "dark";
	const { environment, version } = getAppBuildInfo();
	const [release, setRelease] = useState(null);
	const [loading, setLoading] = useState(false);

	const showReleaseNotes = async () => {
		setLoading(true);
		try {
			const response = await fetch(`${getApiBaseUrl()}/maintenance/app/version?currentCode=0`, { cache: "no-store", credentials: "include" });
			if (response.ok) setRelease((await response.json())?.release || null);
		} catch {
			setRelease(null);
		} finally {
			setLoading(false);
		}
	};

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
			<button type="button" onClick={showReleaseNotes} disabled={loading} className="inline-flex items-center gap-1 hover:text-blue-600 disabled:opacity-60" title="Ver novidades da versão">
				<Sparkles size={12} />
				v{version} · {environment}
			</button>
			<AppReleaseNotesDialog release={release} onClose={() => setRelease(null)} />
		</footer>
	);
};

export default MelzFooter;

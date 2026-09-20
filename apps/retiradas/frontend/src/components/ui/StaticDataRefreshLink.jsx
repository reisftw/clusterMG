import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { regenerateStaticData } from "../../services/staticDataService";

export default function StaticDataRefreshLink({
	label = "Publicar JSON",
	className = "",
}) {
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState(null);
	const timeoutRef = useRef(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
		};
	}, []);

	async function handlePublish() {
		if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

		setLoading(true);
		setStatus(null);

		try {
			const result = await regenerateStaticData();
			const generatedAt = result?.generatedAt
				? new Date(result.generatedAt).toLocaleString("pt-BR")
				: "agora";

			setStatus({
				type: "success",
				message: `JSON publicado em ${generatedAt}.`,
			});
		} catch (error) {
			setStatus({
				type: "error",
				message: error.message || "Falha ao publicar o JSON.",
			});
		} finally {
			setLoading(false);
			timeoutRef.current = window.setTimeout(() => {
				setStatus(null);
			}, 5000);
		}
	}

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={handlePublish}
				disabled={loading}
				className={className}
			>
				<RefreshCw size={16} className={loading ? "animate-spin" : ""} />
				{loading ? "Publicando..." : label}
			</button>

			{status ? (
				<span className="text-xs font-bold text-red-600">{status.message}</span>
			) : null}
		</div>
	);
}

import { Clock3, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveDataDate } from "../../services/dataDate";
import {
	getInternalStaticDataMeta,
	INTERNAL_STATIC_DATA_UPDATED_EVENT,
	SNAPSHOT_DOMAINS,
} from "../../services/internalStaticDataService";

function formatGeneratedAt(value) {
	const date = resolveDataDate(value);
	if (!date) return null;

	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function InternalStaticDataStatus({
	className = "",
	fallbackIsHealthy = false,
}) {
	const [available, setAvailable] = useState(true);
	const [generatedAt, setGeneratedAt] = useState(null);

	useEffect(() => {
		let active = true;

		async function loadMeta() {
			const meta = await getInternalStaticDataMeta({
				domain: SNAPSHOT_DOMAINS.DASHBOARD,
			});
			if (!active) return;

			setAvailable(meta.available);
			setGeneratedAt(meta.generatedAt);
		}

		loadMeta();

		if (typeof window === "undefined") {
			return () => {
				active = false;
			};
		}

		const handleUpdated = (event) => {
			if (!active) return;

			setAvailable(true);
			setGeneratedAt(event?.detail?.version || new Date().toISOString());
		};

		window.addEventListener(INTERNAL_STATIC_DATA_UPDATED_EVENT, handleUpdated);

		return () => {
			active = false;
			window.removeEventListener(
				INTERNAL_STATIC_DATA_UPDATED_EVENT,
				handleUpdated,
			);
		};
	}, []);

	const formattedDate = formatGeneratedAt(generatedAt);
	const isHealthy = available || fallbackIsHealthy;
	const toneClasses = isHealthy
		? "border-blue-100 bg-blue-50 text-blue-900"
		: "border-amber-200 bg-amber-50 text-amber-900";
	const title = available ? "JSON interno ativo" : "Leitura pela VPS";
	const description = available
		? "Base padrao desta tela: snapshots internos segmentados, com metadados lidos em internal/dashboard.json."
		: fallbackIsHealthy
			? "Esta tela segue operando normalmente com leitura direta pela API da VPS enquanto o snapshot interno segmentado fica indisponivel."
			: "Sem snapshot interno segmentado disponivel agora. Os dados serao lidos pela API da VPS ou pela republicacao dos JSONs internos.";

	return (
		<div
			className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClasses} ${className}`.trim()}
		>
			<div className="flex flex-wrap items-center gap-3">
				<span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
					<Database size={14} />
					{title}
				</span>
				{available && formattedDate ? (
					<span className="inline-flex items-center gap-1 text-xs opacity-80">
						<Clock3 size={13} />
						Ultima atualizacao: {formattedDate}
					</span>
				) : null}
			</div>

			<p className="mt-2 text-sm leading-5">{description}</p>
		</div>
	);
}

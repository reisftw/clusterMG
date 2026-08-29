import { Check, Download, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function isStandaloneMode() {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia?.("(display-mode: standalone)")?.matches ||
		window.navigator?.standalone === true
	);
}

export default function PwaInstallButton({
	className = "",
	labelMode = "full",
}) {
	const [installPrompt, setInstallPrompt] = useState(null);
	const [installed, setInstalled] = useState(isStandaloneMode());

	useEffect(() => {
		const handleBeforeInstallPrompt = (event) => {
			event.preventDefault();
			setInstallPrompt(event);
		};

		const handleInstalled = () => {
			setInstalled(true);
			setInstallPrompt(null);
		};

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleInstalled);

		return () => {
			window.removeEventListener(
				"beforeinstallprompt",
				handleBeforeInstallPrompt,
			);
			window.removeEventListener("appinstalled", handleInstalled);
		};
	}, []);

	const buttonLabel = useMemo(() => {
		if (installed) return "App instalado";
		if (installPrompt) return "Instalar app";
		return "Baixar app";
	}, [installPrompt, installed]);

	const Icon = installed ? Check : installPrompt ? Download : Smartphone;

	const handleInstall = async () => {
		if (installed) return;

		if (installPrompt) {
			installPrompt.prompt();
			const choice = await installPrompt.userChoice.catch(() => null);
			if (choice?.outcome === "accepted") {
				setInstalled(true);
			}
			setInstallPrompt(null);
			return;
		}

		window.alert(
			"Para instalar, abra o menu do navegador e escolha 'Instalar app' ou 'Adicionar a tela inicial'.",
		);
	};

	return (
		<button
			type="button"
			onClick={handleInstall}
			className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
				installed
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: "border-blue-100 bg-blue-50 text-blue-700 hover:border-blue-200 hover:bg-blue-100"
			} ${className}`.trim()}
			title={buttonLabel}
		>
			<Icon size={16} />
			{labelMode === "full" ? (
				<span>{buttonLabel}</span>
			) : (
				<span className="hidden sm:inline">{buttonLabel}</span>
			)}
		</button>
	);
}

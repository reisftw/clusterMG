import { useEffect, useState } from "react";

function collectViewportDiagnostics() {
	const root = document.getElementById("root");
	const main = document.querySelector("main");
	const overflowing = [...document.querySelectorAll("body *")]
		.filter((element) => {
			const rect = element.getBoundingClientRect();
			return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
		})
		.slice(0, 20)
		.map((element) => ({
			tag: element.tagName.toLowerCase(),
			className: String(element.className || "").slice(0, 120),
			left: Math.round(element.getBoundingClientRect().left),
			right: Math.round(element.getBoundingClientRect().right),
			width: Math.round(element.getBoundingClientRect().width),
		}));
	const dimensions = (element) => element ? { width: Math.round(element.getBoundingClientRect().width), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth } : null;
	return {
		innerWidth: window.innerWidth,
		innerHeight: window.innerHeight,
		outerWidth: window.outerWidth,
		screenWidth: window.screen.width,
		screenHeight: window.screen.height,
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
		devicePixelRatio: window.devicePixelRatio,
		visualViewportWidth: window.visualViewport?.width,
		visualViewportHeight: window.visualViewport?.height,
		visualViewportScale: window.visualViewport?.scale,
		standalone: window.matchMedia("(display-mode: standalone)").matches,
		userAgent: navigator.userAgent,
		elements: { html: dimensions(document.documentElement), body: dimensions(document.body), root: dimensions(root), main: dimensions(main) },
		overflowing,
	};
}

export default function ViewportDiagnostics() {
	const enabled = new URLSearchParams(window.location.search).get("debugViewport") === "1";
	const [data, setData] = useState(null);
	useEffect(() => {
		if (!enabled) return undefined;
		const update = () => {
			const next = collectViewportDiagnostics();
			setData(next);
			console.table(next);
			if (next.overflowing.length) console.table(next.overflowing);
		};
		update();
		window.addEventListener("resize", update);
		window.visualViewport?.addEventListener("resize", update);
		return () => {
			window.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("resize", update);
		};
	}, [enabled]);
	if (!enabled || !data) return null;
	return <aside className="fixed bottom-2 left-2 right-2 z-layout-notification max-h-[42dvh] overflow-auto rounded-lg border border-blue-300 bg-slate-950/95 p-3 font-mono text-[11px] text-white shadow-2xl sm:left-auto sm:w-[420px]" aria-label="Diagnóstico de viewport"><strong className="text-cyan-300">Diagnóstico da viewport</strong><pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</pre></aside>;
}

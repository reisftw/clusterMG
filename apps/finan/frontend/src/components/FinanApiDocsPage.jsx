// Roteiro Finan #26 (Fase 4A — API interna oficial /api/v1): documentação
// OpenAPI publicada. Renderiza o Swagger UI no cliente (swagger-ui-dist,
// bundlado pelo Vite — sem depender de CDN externo) em vez de servir a
// página pronta do swagger-ui-express. SEC-004: a sessão do Finan agora
// vive num cookie HttpOnly, não em token Bearer de localStorage — o
// requestInterceptor só precisa garantir que o cookie viaje (mesma
// origem, então o navegador já manda sozinho; withCredentials aqui é
// só reforço explícito).
import { FileCode2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SwaggerUIBundle from "swagger-ui-dist/swagger-ui-bundle.js";
import "swagger-ui-dist/swagger-ui.css";
import { fetchFinanApiV1Spec } from "../api/finanApi";

export default function FinanApiDocsPage() {
	const containerRef = useRef(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const spec = await fetchFinanApiV1Spec();
				if (cancelled || !containerRef.current) return;
				SwaggerUIBundle({
					spec,
					domNode: containerRef.current,
					presets: [SwaggerUIBundle.presets.apis],
					requestInterceptor: (req) => {
						req.credentials = "include";
						return req;
					},
				});
			} catch (err) {
				if (!cancelled) setError(err?.message || "Não foi possível carregar a documentação da API.");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="space-y-6">
			<header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<FileCode2 size={24} />
					</span>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Sistema</p>
						<h1 className="mt-1 text-2xl font-black text-slate-950">API interna do Finan (v1)</h1>
						<p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
							Documentação OpenAPI da API versionada /api/v1 — ainda em migração, convive em paralelo com as rotas
							legadas /api/finan/*. Use "Try it out" para testar direto com sua sessão atual.
						</p>
					</div>
				</div>
			</header>

			{error ? (
				<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
			) : null}

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div ref={containerRef} />
			</div>
		</div>
	);
}

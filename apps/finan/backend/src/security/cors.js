// Allowlist de origens do CORS do Finan.
//
// Antes: `origin: process.env.FINAN_CORS_ORIGIN || true` — sem a env
// configurada, `cors` reflete qualquer Origin recebida (com
// `credentials: true`), o que e o oposto de um allowlist.
//
// Agora: so origens explicitamente configuradas (ou os defaults de
// desenvolvimento local abaixo, quando nada esta configurado) sao aceitas.
// Nunca reflete uma origem arbitraria e nunca usa "*" com credentials.
//
// Variaveis de ambiente suportadas (a primeira que existir vence):
//   FINAN_CORS_ORIGINS = "https://a.com,https://b.com"  (recomendada, lista)
//   FINAN_CORS_ORIGIN  = "https://a.com"                (legado, uma origem)
//
// Na VPS de producao, configure FINAN_CORS_ORIGINS com o dominio real do
// Finan (ex.: FINAN_PUBLIC_URL do .env, que hoje aponta para
// https://finan.retiradas.tech conforme apps/finan/.env.example e
// apps/finan/ops/nginx-finan.conf.example).
const DEFAULT_DEV_ORIGINS = [
	"http://localhost:5174",
	"http://127.0.0.1:5174",
	"http://localhost:4174",
	"http://127.0.0.1:4174",
];

function parseOriginList(value) {
	return String(value || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

/**
 * Resolve a allowlist a partir do ambiente. Funcao pura (recebe `env`
 * explicitamente) para poder ser testada sem mexer em process.env global.
 */
function resolveFinanCorsAllowlist(env = process.env) {
	const explicit = [
		...parseOriginList(env.FINAN_CORS_ORIGINS),
		...parseOriginList(env.FINAN_CORS_ORIGIN),
	];
	if (explicit.length) return Array.from(new Set(explicit));

	// Nada configurado: cai para o dominio publico conhecido (se definido)
	// + origens de desenvolvimento local. Nunca cai para "aceitar tudo".
	const fallback = [...DEFAULT_DEV_ORIGINS];
	if (env.FINAN_PUBLIC_URL) fallback.push(env.FINAN_PUBLIC_URL.replace(/\/$/, ""));
	return Array.from(new Set(fallback));
}

/**
 * Monta as options do middleware `cors` com base na allowlist resolvida.
 * Requisicoes sem cabecalho Origin (curl, health checks, chamadas
 * server-to-server) sao sempre permitidas — elas nao carregam cookies/
 * credenciais de navegador, entao CORS nao se aplica a elas.
 */
function buildFinanCorsOptions(env = process.env) {
	const allowlist = resolveFinanCorsAllowlist(env);
	return {
		credentials: true,
		origin(origin, callback) {
			if (!origin || allowlist.includes(origin)) {
				callback(null, true);
				return;
			}
			callback(new Error(`Origem "${origin}" não permitida pelo CORS do Finan.`));
		},
	};
}

module.exports = { buildFinanCorsOptions, resolveFinanCorsAllowlist, DEFAULT_DEV_ORIGINS };

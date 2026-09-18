// Regra local (sem pacote npm) que flagra rotas async do Express no
// backend do Finan (router.get/post/put/patch/delete) sem try/catch —
// exatamente o padrao encontrado numa auditoria de estabilidade
// (2026-09-09): 22 rotas faziam `await db.query(...)`/argon2/e-mail sem
// try/catch, incluindo o proprio POST /login. Em Express 4, uma promise
// rejeitada sem tratamento vira unhandled rejection e derruba O PROCESSO
// NODE INTEIRO (nao so a requisicao) — foi a causa raiz de um crash loop
// real de producao (27 restarts/24h, 2026-09-05, ver CLAUDE.md secao 11).
//
// O objetivo aqui e ter uma rede de seguranca automatica pra esse padrao
// especifico nao voltar (ate agora so estava documentado por convencao).
//
// ESM (nao CommonJS) porque eslint.config.js na raiz e "type": "module" —
// um arquivo .js dentro deste diretorio herda esse tipo do package.json
// mais proximo (o da raiz), entao `module.exports` aqui seria um erro de
// sintaxe.

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const ROUTER_OBJECT_NAMES = new Set(["router"]);

function isAsyncFunctionNode(node) {
	return (
		Boolean(node) &&
		(node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") &&
		node.async === true
	);
}

// Percorre a AST do corpo do handler procurando um `await` que NAO esteja
// dentro do bloco `try` de um TryStatement. Nao desce em funcoes
// aninhadas (tem seu proprio escopo async, fora do escopo desta regra).
// Dentro de um `try`, tudo (inclusive if/for/switch aninhados) e
// considerado protegido, propagando `insideTry = true` na recursao — o
// catch/finally do PROPRIO try nao fica protegido por ele mesmo, mas pode
// estar protegido por um try mais externo (o `insideTry` recebido).
function hasUnguardedAwait(node, insideTry) {
	if (!node || typeof node !== "object") return false;
	if (Array.isArray(node)) {
		return node.some((child) => hasUnguardedAwait(child, insideTry));
	}
	if (!node.type) return false;

	if (
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionDeclaration"
	) {
		return false;
	}

	if (node.type === "AwaitExpression") {
		if (!insideTry) return true;
		return hasUnguardedAwait(node.argument, insideTry);
	}

	if (node.type === "TryStatement") {
		if (hasUnguardedAwait(node.block, true)) return true;
		if (node.handler && hasUnguardedAwait(node.handler.body, insideTry)) return true;
		if (node.finalizer && hasUnguardedAwait(node.finalizer, insideTry)) return true;
		return false;
	}

	for (const key of Object.keys(node)) {
		if (key === "parent") continue;
		const value = node[key];
		if (value && typeof value === "object" && hasUnguardedAwait(value, insideTry)) {
			return true;
		}
	}
	return false;
}

export default {
	rules: {
		"require-try-catch": {
			meta: {
				type: "problem",
				docs: {
					description:
						"Rotas async do Express (router.get/post/put/patch/delete) com await fora de um try/catch derrubam o processo Node inteiro em caso de erro — ver CLAUDE.md secao 11.",
				},
				schema: [],
				messages: {
					missingTryCatch:
						"Rota async com 'await' fora de um try/catch — um erro aqui (ex.: falha de banco) derruba o Finan inteiro pra todo mundo, nao so essa requisicao (Express 4 nao captura sozinho). Envolva o corpo em try/catch e chame next(error) no catch.",
				},
			},
			create(context) {
				return {
					CallExpression(node) {
						const callee = node.callee;
						if (
							callee.type !== "MemberExpression" ||
							callee.object.type !== "Identifier" ||
							!ROUTER_OBJECT_NAMES.has(callee.object.name) ||
							callee.property.type !== "Identifier" ||
							!ROUTE_METHODS.has(callee.property.name)
						) {
							return;
						}
						const handler = node.arguments[node.arguments.length - 1];
						if (!isAsyncFunctionNode(handler) || handler.body.type !== "BlockStatement") {
							return;
						}
						if (hasUnguardedAwait(handler.body, false)) {
							context.report({ node: handler, messageId: "missingTryCatch" });
						}
					},
				};
			},
		},
	},
};

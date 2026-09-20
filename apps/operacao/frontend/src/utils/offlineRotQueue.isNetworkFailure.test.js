import { isNetworkFailure } from "./offlineRotQueue";

// Etapa 6, Fase 6: confirma que isNetworkFailure diferencia corretamente
// falha real de rede de erro de validacao/autenticacao/servidor — nenhum
// desses ultimos deve entrar na fila offline (ver persist() em
// RompimentosPage.jsx, que so enfileira quando isNetworkFailure(err) e
// true). navigator.onLine precisa ser forcado pra "true" aqui porque o
// ambiente de teste (vitest environment: "node", sem jsdom de proposito)
// nao tem um valor real de conectividade — sem isso, !navigator.onLine
// seria sempre true e mascararia a diferenciacao por tipo de erro.
describe("isNetworkFailure", () => {
	beforeEach(() => {
		globalThis.navigator.onLine = true;
	});

	it("reconhece falha real de rede (TypeError do fetch)", () => {
		const error = new TypeError("Failed to fetch");
		expect(isNetworkFailure(error)).toBe(true);
	});

	it('reconhece mensagem com palavras de rede/conexao mesmo sem TypeError', () => {
		const error = new Error("network error while sending request");
		expect(isNetworkFailure(error)).toBe(true);
	});

	it("trata offline explícito (navigator.onLine=false) como falha de rede independente do erro", () => {
		globalThis.navigator.onLine = false;
		expect(isNetworkFailure(new Error("qualquer coisa"))).toBe(true);
	});

	it("NÃO trata erro de validação (400) como falha de rede", () => {
		const error = Object.assign(new Error("Abra uma tratativa e anexe pelo menos 1 imagem antes de finalizar o rompimento."), { status: 400 });
		expect(isNetworkFailure(error)).toBe(false);
	});

	it("NÃO trata erro de autenticação (401) como falha de rede", () => {
		const error = Object.assign(new Error("Sessão da Operação não autenticada."), { status: 401 });
		expect(isNetworkFailure(error)).toBe(false);
	});

	it("NÃO trata erro de servidor (500, mensagem sanitizada) como falha de rede", () => {
		const error = Object.assign(new Error("Erro interno do servidor."), { status: 500 });
		expect(isNetworkFailure(error)).toBe(false);
	});
});

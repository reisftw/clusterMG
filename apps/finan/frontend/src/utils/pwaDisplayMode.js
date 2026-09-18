// Detecta se o Finan esta rodando como PWA instalado (standalone), em vez
// de uma aba normal de navegador. O bloqueio por PIN so faz sentido no
// primeiro caso — quem usa o Finan como aba de trabalho normal no
// desktop, trocando de aba o dia inteiro, nao pode ser interrompido a
// cada troca de foco; o risco real (alguem pegar o aparelho com o app
// aberto) e do app instalado no celular/desktop como PWA.
export function isFinanStandalonePwa() {
	if (typeof window === "undefined") return false;
	try {
		if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
		// iOS Safari nao suporta a media query display-mode de forma
		// confiavel em todas as versoes; expõe essa flag legada em vez disso.
		if (window.navigator?.standalone === true) return true;
	} catch {
		// matchMedia pode nao existir em ambientes exoticos (SSR/teste) — trata
		// como "nao instalado" nesse caso.
	}
	return false;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchFinanPinStatus, verifyFinanPin } from "../api/finanApi";
import { isFinanStandalonePwa } from "../utils/pwaDisplayMode";
import { useFinanAuth } from "./FinanAuthContext";

const FinanPinLockContext = createContext(null);

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"];

// Persistido em localStorage (nao sessionStorage) pra sobreviver a F5/
// Ctrl+F5 e ate a fechar e reabrir a aba — sem isso, um reload remontava
// o React do zero, o timer de inatividade reiniciava do zero e o usuario
// entrava sem digitar o PIN mesmo depois de estourar os N minutos
// (bug real reportado: F5 depois do PIN aparecer abria o app direto).
const LAST_ACTIVITY_STORAGE_KEY = "finan-pin-last-activity";

function readStoredLastActivity() {
	try {
		const raw = window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
		const value = Number(raw);
		return Number.isFinite(value) && value > 0 ? value : null;
	} catch {
		return null;
	}
}

function persistLastActivity(timestamp) {
	try {
		window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
	} catch {
		// localStorage pode estar indisponivel (modo privado/restrito) — nesse
		// caso o timer so funciona em memoria, sem sobreviver a F5.
	}
}

function clearStoredLastActivity() {
	try {
		window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
	} catch {
		// ignore
	}
}

// mousemove/scroll disparam dezenas de vezes por segundo — gravar no
// localStorage (sincrono) a cada evento causaria jank. So precisamos de
// precisao de segundos aqui (o timeout e em minutos), entao so persiste
// de fato a cada PERSIST_THROTTLE_MS; o ref em memoria (lastActivityRef)
// continua atualizado a cada evento, sem custo.
const PERSIST_THROTTLE_MS = 5000;

export function FinanPinLockProvider({ children }) {
	// `loading` (renomeado aqui pra authLoading) e essencial: useFinanAuth
	// sempre comeca com user=null e so preenche de verdade depois de um
	// fetchFinanMe() assincrono (mesmo com token valido salvo). Sem
	// distinguir "ainda carregando" de "sem usuario mesmo", TODO F5/
	// Ctrl+F5 passava pelo branch de "sem usuario" abaixo enquanto o auth
	// ainda carregava — e esse branch limpava o timestamp de atividade
	// salvo no localStorage ANTES da checagem real (quando o user chegava)
	// poder usa-lo. Isso apagava a propria protecao contra F5 a cada
	// reload, reabrindo o bypass mesmo com a logica de idle correta.
	const { user, logout, loading: authLoading } = useFinanAuth();
	const [pinConfigured, setPinConfigured] = useState(null);
	const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(20);
	const [locked, setLocked] = useState(false);
	const [checking, setChecking] = useState(false);
	const [blockedMessage, setBlockedMessage] = useState("");
	const [secondsRemaining, setSecondsRemaining] = useState(null);
	// Calculado uma vez por sessao de pagina: o modo de exibicao nao muda
	// durante o uso (instalar/desinstalar o PWA exige reabrir o app).
	const isStandalone = useRef(isFinanStandalonePwa()).current;
	const lastActivityRef = useRef(readStoredLastActivity() ?? Date.now());

	const refreshPinStatus = useCallback(async () => {
		if (authLoading) {
			// Auth ainda verificando o token salvo — nem "logado" nem
			// "deslogado" de fato ainda. Nao mexe em nada (nem limpa o
			// timestamp) ate saber o resultado real.
			return;
		}
		if (!user) {
			setPinConfigured(null);
			setLocked(false);
			clearStoredLastActivity();
			return;
		}
		setChecking(true);
		try {
			const status = await fetchFinanPinStatus();
			setPinConfigured(status.configured);
			setIdleTimeoutMinutes(status.idleTimeoutMinutes);

			// Restaura o ultimo momento real de atividade (sobrevive a F5/
			// reabrir a aba) em vez de assumir "acabou de ficar ativo agora" —
			// e o que fecha o bypass do F5: recalcula quanto tempo REALMENTE
			// passou antes de decidir se bloqueia.
			const now = Date.now();
			const storedLastActivity = readStoredLastActivity();
			if (storedLastActivity) {
				lastActivityRef.current = storedLastActivity;
			} else {
				lastActivityRef.current = now;
				persistLastActivity(now);
			}
			const idleMs = Math.max(60, Math.round(status.idleTimeoutMinutes * 60)) * 1000;
			const idleExpired = now - lastActivityRef.current >= idleMs;

			// Exige o PIN assim que loga (ou assim que descobrimos que ja
			// existe um configurado) quando o Finan esta instalado como PWA
			// (standalone). Numa aba de navegador normal, quem trabalha com o
			// Finan o dia inteiro nao pode ser interrompido a cada F5/troca de
			// aba — la o gatilho e mesmo o tempo real de inatividade, checado
			// aqui no mount (pra pegar quem recarregou depois de estourar o
			// prazo) e tambem pelo timer do efeito abaixo (enquanto a aba
			// continua aberta).
			if (status.configured && (isStandalone || idleExpired)) setLocked(true);
		} catch {
			setPinConfigured(null);
		} finally {
			setChecking(false);
		}
	}, [user, isStandalone, authLoading]);

	useEffect(() => {
		refreshPinStatus();
	}, [refreshPinStatus]);

	// PWA instalado (celular/desktop): relock imediato ao voltar do
	// background, sem tolerancia de tempo.
	useEffect(() => {
		if (!user || !isStandalone) return undefined;

		function relockIfNeeded() {
			if (pinConfigured) setLocked(true);
		}
		function onVisibilityChange() {
			if (document.visibilityState === "visible") relockIfNeeded();
		}
		function onPageShow(event) {
			// bfcache (voltar/avançar do navegador restaurando a pagina
			// congelada sem remontar o React) tambem precisa relockar.
			if (event.persisted) relockIfNeeded();
		}

		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("pageshow", onPageShow);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("pageshow", onPageShow);
		};
	}, [user, pinConfigured, isStandalone]);

	// Aba de navegador normal (nao instalado): bloqueia so depois de N
	// minutos sem nenhuma atividade (mouse/teclado/scroll), configuravel
	// pelos administradores. Troca de aba sozinha nao bloqueia nada.
	useEffect(() => {
		if (!user || isStandalone || !pinConfigured || locked) {
			setSecondsRemaining(null);
			return undefined;
		}

		const totalSeconds = Math.max(60, Math.round(idleTimeoutMinutes * 60));
		// Nao reseta lastActivityRef aqui — ele ja reflete o ultimo momento
		// real de atividade (restaurado do localStorage no mount por
		// refreshPinStatus, ou atualizado pelo listener abaixo). Resetar
		// incondicionalmente a cada vez que este efeito reinicia (ex.: todo
		// F5) era o bug: um reload "esquecia" quanto tempo tinha passado e
		// dava mais N minutos de graca de graca.
		const elapsedNow = Math.floor((Date.now() - lastActivityRef.current) / 1000);
		setSecondsRemaining(Math.max(0, totalSeconds - elapsedNow));

		let lastPersistAt = 0;
		function onActivity() {
			const now = Date.now();
			lastActivityRef.current = now;
			if (now - lastPersistAt >= PERSIST_THROTTLE_MS) {
				lastPersistAt = now;
				persistLastActivity(now);
			}
		}
		for (const eventName of ACTIVITY_EVENTS) {
			window.addEventListener(eventName, onActivity, { passive: true });
		}

		const intervalId = window.setInterval(() => {
			const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
			const remaining = Math.max(0, totalSeconds - elapsed);
			setSecondsRemaining(remaining);
			if (remaining <= 0) {
				setLocked(true);
			}
		}, 1000);

		return () => {
			for (const eventName of ACTIVITY_EVENTS) {
				window.removeEventListener(eventName, onActivity);
			}
			window.clearInterval(intervalId);
		};
	}, [user, isStandalone, pinConfigured, idleTimeoutMinutes, locked]);

	const verifyPin = useCallback(
		async (pin) => {
			try {
				await verifyFinanPin(pin);
				setLocked(false);
				const now = Date.now();
				lastActivityRef.current = now;
				persistLastActivity(now);
				return { ok: true };
			} catch (err) {
				if (err?.status === 423) {
					setBlockedMessage(
						err.message || "Conta bloqueada por tentativas de PIN inválidas.",
					);
					// O backend ja revogou as sessoes ao bloquear a conta — so
					// limpamos o estado local (o proprio logout() chama
					// /auth/logout, que e inofensivo mesmo com sessao ja revogada).
					clearStoredLastActivity();
					await logout();
					return { ok: false, locked: true, message: err.message };
				}
				return {
					ok: false,
					locked: false,
					message: err?.message || "PIN inválido.",
					attemptsRemaining: err?.data?.attemptsRemaining,
				};
			}
		},
		[logout],
	);

	const lockNow = useCallback(() => {
		if (pinConfigured) setLocked(true);
	}, [pinConfigured]);

	const value = useMemo(
		() => ({
			pinConfigured,
			idleTimeoutMinutes,
			locked,
			checking,
			blockedMessage,
			isStandalone,
			secondsRemaining,
			verifyPin,
			lockNow,
			refreshPinStatus,
		}),
		[
			pinConfigured,
			idleTimeoutMinutes,
			locked,
			checking,
			blockedMessage,
			isStandalone,
			secondsRemaining,
			verifyPin,
			lockNow,
			refreshPinStatus,
		],
	);

	return (
		<FinanPinLockContext.Provider value={value}>{children}</FinanPinLockContext.Provider>
	);
}

export function useFinanPinLock() {
	const context = useContext(FinanPinLockContext);
	if (!context) {
		throw new Error("useFinanPinLock deve ser usado no FinanPinLockProvider.");
	}
	return context;
}

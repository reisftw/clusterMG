// Copia self-contida do padrao de som de notificacao do Retiradas
// (src/services/notificationSoundSettings.js) — o Finan nao pode importar
// nada do workspace do app principal (regra do projeto, ver CLAUDE.md
// secao "O que NAO fazer"), entao esta e uma implementacao propria com o
// mesmo comportamento, chave de localStorage e evento proprios do Finan.
export const FINAN_NOTIFICATION_SOUND_STORAGE_KEY = "finan-notification-sound";

export const FINAN_NOTIFICATION_SOUNDS = [
	{ value: "ping", label: "Ping suave" },
	{ value: "double", label: "Duplo toque" },
	{ value: "alert", label: "Alerta curto" },
	{ value: "none", label: "Sem som" },
];

export function getFinanNotificationSound() {
	if (typeof window === "undefined") return "ping";
	const saved = window.localStorage.getItem(FINAN_NOTIFICATION_SOUND_STORAGE_KEY);
	return FINAN_NOTIFICATION_SOUNDS.some((item) => item.value === saved)
		? saved
		: "ping";
}

export function setFinanNotificationSound(value) {
	if (typeof window === "undefined") return;
	const nextValue = FINAN_NOTIFICATION_SOUNDS.some((item) => item.value === value)
		? value
		: "ping";
	window.localStorage.setItem(FINAN_NOTIFICATION_SOUND_STORAGE_KEY, nextValue);
	window.dispatchEvent(
		new CustomEvent("finan:notification-sound-updated", {
			detail: { sound: nextValue },
		}),
	);
}

function createTone(audioContext, frequency, start, duration, gainNode) {
	const oscillator = audioContext.createOscillator();
	oscillator.type = "sine";
	oscillator.frequency.value = frequency;
	oscillator.connect(gainNode);
	oscillator.start(audioContext.currentTime + start);
	oscillator.stop(audioContext.currentTime + start + duration);
}

export function playFinanNotificationSound(sound = getFinanNotificationSound()) {
	if (sound === "none") return;
	try {
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) return;
		const audioContext = new AudioContextClass();
		const gain = audioContext.createGain();
		gain.connect(audioContext.destination);
		gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.03);
		gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.5);

		if (sound === "double") {
			createTone(audioContext, 760, 0, 0.14, gain);
			createTone(audioContext, 920, 0.2, 0.16, gain);
		} else if (sound === "alert") {
			createTone(audioContext, 980, 0, 0.12, gain);
			createTone(audioContext, 680, 0.13, 0.16, gain);
		} else {
			createTone(audioContext, 880, 0, 0.22, gain);
		}
	} catch {
		// O navegador pode bloquear som antes da primeira interacao do usuario.
	}
}

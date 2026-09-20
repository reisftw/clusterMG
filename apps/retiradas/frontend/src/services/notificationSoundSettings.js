export const NOTIFICATION_SOUND_STORAGE_KEY = "retiradas-notification-sound";

export const NOTIFICATION_SOUNDS = [
	{ value: "ping", label: "Ping suave" },
	{ value: "double", label: "Duplo toque" },
	{ value: "alert", label: "Alerta curto" },
	{ value: "none", label: "Sem som" },
];

export function getNotificationSound() {
	if (typeof window === "undefined") return "ping";
	const saved = window.localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY);
	return NOTIFICATION_SOUNDS.some((item) => item.value === saved)
		? saved
		: "ping";
}

export function setNotificationSound(value) {
	if (typeof window === "undefined") return;
	const nextValue = NOTIFICATION_SOUNDS.some((item) => item.value === value)
		? value
		: "ping";
	window.localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, nextValue);
	window.dispatchEvent(
		new CustomEvent("retiradas:notification-sound-updated", {
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

export function playSelectedNotificationSound(sound = getNotificationSound()) {
	if (sound === "none") return;
	try {
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) return;
		const audioContext = new AudioContextClass();
		const gain = audioContext.createGain();
		gain.connect(audioContext.destination);
		gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
		gain.gain.exponentialRampToValueAtTime(
			0.16,
			audioContext.currentTime + 0.03,
		);
		gain.gain.exponentialRampToValueAtTime(
			0.0001,
			audioContext.currentTime + 0.5,
		);

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
		// O navegador pode bloquear som antes da primeira interação do usuário.
	}
}

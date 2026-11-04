export const APPOINTMENT_NOTICE_SOUND_MODES = [
	{ value: "christmas", label: "Natalino" },
	{ value: "original", label: "Original" },
];

export function normalizeAppointmentNoticeSound(value) {
	return APPOINTMENT_NOTICE_SOUND_MODES.some((item) => item.value === value)
		? value
		: "christmas";
}

export function playChristmasAppointmentTone(audioContext) {
	if (!audioContext) return false;
	try {
		if (audioContext.state === "suspended") {
			audioContext.resume().catch(() => {});
		}

		const notes = [
			[783.99, 0],
			[987.77, 0.12],
			[1174.66, 0.24],
			[1567.98, 0.38],
			[1174.66, 0.54],
		];
		notes.forEach(([frequency, delay], index) => {
			const start = audioContext.currentTime + delay;
			const gain = audioContext.createGain();
			gain.connect(audioContext.destination);
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(index === 3 ? 0.2 : 0.14, start + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);

			const oscillator = audioContext.createOscillator();
			oscillator.type = "sine";
			oscillator.frequency.value = frequency;
			oscillator.connect(gain);
			oscillator.start(start);
			oscillator.stop(start + 0.5);
		});
		return true;
	} catch {
		return false;
	}
}

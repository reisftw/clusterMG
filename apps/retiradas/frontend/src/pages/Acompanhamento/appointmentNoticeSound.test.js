import { describe, expect, it, vi } from "vitest";
import {
	normalizeAppointmentNoticeSound,
	playChristmasAppointmentTone,
} from "./appointmentNoticeSound";

function createAudioContext() {
	const oscillators = [];
	return {
		context: {
			currentTime: 10,
			state: "running",
			destination: {},
			createGain: () => ({
				connect: vi.fn(),
				gain: {
					setValueAtTime: vi.fn(),
					exponentialRampToValueAtTime: vi.fn(),
				},
			}),
			createOscillator: () => {
				const oscillator = {
					connect: vi.fn(),
					frequency: { value: 0 },
					start: vi.fn(),
					stop: vi.fn(),
					type: "",
				};
				oscillators.push(oscillator);
				return oscillator;
			},
		},
		oscillators,
	};
}

describe("appointmentNoticeSound", () => {
	it("usa o som natalino como padrão", () => {
		expect(normalizeAppointmentNoticeSound()).toBe("christmas");
		expect(normalizeAppointmentNoticeSound("invalido")).toBe("christmas");
		expect(normalizeAppointmentNoticeSound("original")).toBe("original");
	});

	it("agenda um toque natalino curto", () => {
		const { context, oscillators } = createAudioContext();

		expect(playChristmasAppointmentTone(context)).toBe(true);
		expect(oscillators).toHaveLength(5);
		expect(oscillators.map((item) => item.frequency.value)).toEqual([
			783.99,
			987.77,
			1174.66,
			1567.98,
			1174.66,
		]);
		expect(oscillators.every((item) => item.type === "sine")).toBe(true);
	});
});

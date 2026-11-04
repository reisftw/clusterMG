import { describe, expect, it } from "vitest";
import {
	ACOMPANHAMENTO_SOUND_MAX_BYTES,
	ACOMPANHAMENTO_SOUND_MIN_BYTES,
	uploadAcompanhamentoSound,
} from "./acompanhamentoConfigService";

function audioFile(name, size) {
	return new File([new Uint8Array(size)], name, { type: "audio/mpeg" });
}

describe("uploadAcompanhamentoSound", () => {
	it("aceita MP3 dentro do limite e preserva o nome informado", async () => {
		const result = await uploadAcompanhamentoSound({
			blob: audioFile("alerta.mp3", ACOMPANHAMENTO_SOUND_MIN_BYTES),
			name: "Alerta da equipe",
		});

		expect(result).toMatchObject({
			name: "Alerta da equipe",
			fileName: "alerta.mp3",
			mimeType: "audio/mpeg",
			size: ACOMPANHAMENTO_SOUND_MIN_BYTES,
		});
		expect(result.src).toMatch(/^data:audio\/mpeg;base64,/);
	});

	it("rejeita formato e tamanho fora dos limites", async () => {
		await expect(
			uploadAcompanhamentoSound({
				blob: audioFile("alerta.txt", ACOMPANHAMENTO_SOUND_MIN_BYTES),
				name: "Alerta",
			}),
		).rejects.toThrow("MP3, WAV ou OGG");

		await expect(
			uploadAcompanhamentoSound({
				blob: audioFile("alerta.mp3", ACOMPANHAMENTO_SOUND_MAX_BYTES + 1),
				name: "Alerta",
			}),
		).rejects.toThrow("1 MB");
	});
});

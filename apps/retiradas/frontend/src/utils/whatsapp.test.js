import { describe, expect, it } from "vitest";
import { selectWhatsappUrl } from "./whatsapp";

const contact = {
	whatsappUrl: "https://wa.me/5531999990000",
	whatsappNormalUrl: "intent://normal",
	whatsappBusinessUrl: "intent://business",
};

describe("selectWhatsappUrl", () => {
	it("usa o link universal no iPhone e iPadOS", () => {
		expect(selectWhatsappUrl(contact, "business", { userAgent: "iPhone" }))
			.toBe(contact.whatsappUrl);
		expect(selectWhatsappUrl(contact, "normal", { userAgent: "Macintosh", maxTouchPoints: 5 }))
			.toBe(contact.whatsappUrl);
	});

	it("mantem a escolha entre WhatsApp comum e Business no Android", () => {
		expect(selectWhatsappUrl(contact, "normal", { userAgent: "Android" }))
			.toBe(contact.whatsappNormalUrl);
		expect(selectWhatsappUrl(contact, "business", { userAgent: "Android" }))
			.toBe(contact.whatsappBusinessUrl);
	});
});

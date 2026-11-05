export function selectWhatsappUrl(contact = {}, preference, platform = {}) {
	const userAgent = String(platform.userAgent || "");
	const isIos = /iPad|iPhone|iPod/i.test(userAgent)
		|| (/Macintosh/i.test(userAgent) && Number(platform.maxTouchPoints || 0) > 1);
	if (isIos) return contact.whatsappUrl || "";
	return preference === "business"
		? contact.whatsappBusinessUrl || contact.whatsappUrl || ""
		: contact.whatsappNormalUrl || contact.whatsappUrl || "";
}

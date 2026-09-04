const nodemailer = require("nodemailer");

function hasSmtpConfig() {
	return Boolean(process.env.FINAN_SMTP_HOST);
}

function createTransporter() {
	if (!hasSmtpConfig()) return null;
	return nodemailer.createTransport({
		host: process.env.FINAN_SMTP_HOST,
		port: Number(process.env.FINAN_SMTP_PORT || 587),
		secure: String(process.env.FINAN_SMTP_SECURE || "false") === "true",
		auth: process.env.FINAN_SMTP_USER
			? {
					user: process.env.FINAN_SMTP_USER,
					pass: process.env.FINAN_SMTP_PASS || "",
				}
			: undefined,
	});
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
	const transporter = createTransporter();
	if (!transporter) return { sent: false, reason: "smtp_not_configured" };
	await transporter.sendMail({
		from: process.env.FINAN_EMAIL_FROM || "financeiro@retirada.tech",
		to,
		subject: "Recuperação de senha - Finan",
		text: [
			`Olá, ${name || "usuário"}.`,
			"",
			"Recebemos uma solicitação para redefinir sua senha no Finan.",
			`Acesse: ${resetUrl}`,
			"",
			"Se você não pediu essa alteração, ignore este e-mail.",
		].join("\n"),
	});
	return { sent: true };
}

module.exports = {
	sendPasswordResetEmail,
};

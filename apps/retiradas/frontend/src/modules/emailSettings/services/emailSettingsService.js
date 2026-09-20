import { requestVpsApi } from "../../../services/vpsApiClient";

export const DEFAULT_EMAIL_TEMPLATES = {
	welcome_user: {
		label: "Criação de conta",
		subject: "Seu acesso ao sistema Retiradas",
		title: "Bem-vindo ao Retiradas",
		preview:
			"Sua conta no sistema Retiradas foi criada. Defina sua senha para começar.",
		actionLabel: "Definir minha senha",
		body: "Olá, {nome}.\n\nSua conta foi criada no sistema Retiradas. Para ativar o acesso com segurança, defina sua senha pelo botão abaixo.\n\nE-mail: {email}\nPerfil: {role}\nRegional: {regional}\n\nO link expira em 30 minutos.",
	},
	password_reset: {
		label: "Redefinição de senha",
		subject: "Redefinição de senha - Retiradas",
		title: "Redefinição de senha",
		preview: "Use o link seguro para redefinir sua senha.",
		actionLabel: "Redefinir minha senha",
		body: "Olá, {nome}.\n\nRecebemos uma solicitação para redefinir a senha da sua conta.\n\nClique no botão abaixo para criar uma nova senha. O link expira em 30 minutos.",
	},
	password_changed: {
		label: "Senha alterada",
		subject: "Senha alterada - Retiradas",
		title: "Senha alterada com sucesso",
		preview: "Sua senha foi alterada com sucesso.",
		actionLabel: "",
		body: "Olá, {nome}.\n\nSua senha do sistema Retiradas foi alterada com sucesso.\n\nSe você não reconhece esta ação, avise a administração.",
	},
	mfa_login_code: {
		label: "Código MFA por e-mail",
		subject: "Código de segurança - Retiradas",
		title: "Confirme seu acesso",
		preview: "Use o código de segurança para concluir o login.",
		actionLabel: "",
		body: "Olá, {nome}.\n\nRecebemos uma tentativa de login na sua conta do sistema Retiradas.\n\nSeu código de segurança é: {codigo}\n\nEste código expira em {minutos} minutos. Se você não reconhece esta tentativa, avise a administração.",
	},
	smtp_test: {
		label: "Teste SMTP",
		subject: "Teste de e-mail - Retiradas",
		title: "E-mail configurado com sucesso",
		preview: "O SMTP do sistema Retiradas está funcionando.",
		actionLabel: "",
		body: "Este e-mail confirma que o SMTP está autenticando e enviando mensagens pelo sistema Retiradas.\n\nRemetente: {fromEmail}\nResponder para: {replyTo}",
	},
	system_notice: {
		label: "Aviso do sistema",
		subject: "Aviso do sistema Retiradas",
		title: "Aviso importante",
		preview: "Comunicado automático do sistema Retiradas.",
		actionLabel: "Acessar sistema",
		body: "Olá, {nome}.\n\nEste é um aviso automático do sistema Retiradas.\n\nMensagem: {mensagem}\n\nAcesse o sistema para acompanhar os detalhes.",
	},
	insumos_low_stock: {
		label: "Estoque baixo de insumo",
		subject: "Estoque baixo: {produto}",
		title: "Estoque baixo identificado",
		preview: "{produto} chegou ao estoque baixo.",
		actionLabel: "Abrir insumos",
		body: "Olá, {nome}.\n\nO sistema identificou que o item {produto} chegou ao nível de estoque baixo.\n\nEstoque atual: {estoque_atual} {unidade}\nEstoque mínimo: {estoque_minimo} {unidade}\nCategoria: {categoria}\nObservação: {observacao}\n\nRevise a necessidade de compra ou reposição para evitar falta do material.",
	},
	insumos_request_approved: {
		label: "Requisição de insumo aprovada",
		subject: "Requisição aprovada: {protocolo}",
		title: "Sua requisição foi aprovada",
		preview: "O material solicitado foi reservado por 24 horas para retirada.",
		actionLabel: "Abrir requisição",
		body: "Olá, {nome}.\n\nSua requisição de insumo foi aprovada e o material já está reservado para retirada.\n\nProtocolo: {protocolo}\nItem: {produto}\nQuantidade: {quantidade} {unidade}\nAprovado por: {aprovado_por}\nPrazo para retirada: {prazo}\n\nImportante: se o item não for retirado em até 24 horas, a requisição será encerrada automaticamente e o material voltará ao estoque.",
	},
};

export const DEFAULT_EMAIL_CONFIG = {
	enabled: true,
	smtpHost: "smtp.hostinger.com",
	smtpPort: 465,
	smtpSecure: true,
	smtpUser: "administracao@retiradas.tech",
	smtpPassword: "",
	fromName: "Retiradas",
	fromEmail: "naoresponda@retiradas.tech",
	replyTo: "administracao@retiradas.tech",
	appUrl: "https://retiradas.tech",
	mfaEmailEnabled: false,
	mfaEmailTtlMinutes: 10,
	hasPassword: false,
	templates: DEFAULT_EMAIL_TEMPLATES,
};

function mergeTemplates(templates = {}) {
	return Object.fromEntries(
		Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([key, defaults]) => [
			key,
			{ ...defaults, ...(templates?.[key] || {}), label: defaults.label },
		]),
	);
}

function normalizeConfig(config = {}) {
	return {
		...DEFAULT_EMAIL_CONFIG,
		...config,
		smtpPassword: "",
		templates: mergeTemplates(config.templates),
	};
}

export async function buscarConfigEmailSistema() {
	const response = await requestVpsApi("/admin/email/config");
	return normalizeConfig(response?.config || {});
}

export async function salvarConfigEmailSistema(config) {
	const response = await requestVpsApi("/admin/email/config", {
		method: "PUT",
		body: JSON.stringify({
			...config,
			smtpPort: Number(config.smtpPort || 465),
			smtpSecure: Boolean(config.smtpSecure),
			mfaEmailEnabled: Boolean(config.mfaEmailEnabled),
			mfaEmailTtlMinutes: Number(config.mfaEmailTtlMinutes || 10),
		}),
	});
	return normalizeConfig(response?.config || {});
}

export async function enviarTesteEmailSistema(to) {
	return requestVpsApi("/admin/email/test", {
		method: "POST",
		body: JSON.stringify({ to }),
	});
}

export async function listarLogsEmailSistema({
	limit = 20,
	offset = 0,
	status = "",
	type = "",
	q = "",
} = {}) {
	const params = new URLSearchParams();
	params.set("limit", String(limit));
	params.set("offset", String(offset));
	if (status) params.set("status", status);
	if (type) params.set("type", type);
	if (q) params.set("q", q);
	return requestVpsApi(`/admin/email/logs?${params.toString()}`);
}

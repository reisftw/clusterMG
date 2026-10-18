const crypto = require("node:crypto");
const argon2 = require("argon2");
const db = require("../db");
const emailService = require("../emailService");
const { onlyDigits } = require("./cep");

function validCpf(value) {
	const cpf = onlyDigits(value);
	if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
	const digit = (slice, weight) => { let sum = 0; for (let index = 0; index < slice.length; index += 1) sum += Number(slice[index]) * (weight - index); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
	return digit(cpf.slice(0, 9), 10) === Number(cpf[9]) && digit(cpf.slice(0, 10), 11) === Number(cpf[10]);
}
function validCnpj(value) {
	const cnpj = onlyDigits(value);
	if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
	const digit = (base) => { let weight = base.length === 12 ? 5 : 6; let sum = 0; for (const number of base) { sum += Number(number) * weight; weight = weight === 2 ? 9 : weight - 1; } const rest = sum % 11; return rest < 2 ? 0 : 11 - rest; };
	return digit(cnpj.slice(0, 12)) === Number(cnpj[12]) && digit(cnpj.slice(0, 13)) === Number(cnpj[13]);
}
function registrationError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error; }
function assertPassword(password) { if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) throw registrationError("Use uma senha com ao menos 10 caracteres, letras e números."); }
function normalizeAddress(payload) {
	const address = payload.endereco || {}; const cep = onlyDigits(address.cep); const uf = String(address.uf || "").trim().toUpperCase();
	if (!/^\d{8}$/.test(cep) || !address.logradouro || !address.numero || !address.bairro || !address.cidade || !/^[A-Z]{2}$/.test(uf)) throw registrationError("Informe o endereço completo: CEP, logradouro, número, bairro, cidade e UF.");
	return { cep, logradouro: String(address.logradouro).trim(), numero: String(address.numero).trim(), complemento: String(address.complemento || "").trim() || null, bairro: String(address.bairro).trim(), cidade: String(address.cidade).trim(), uf, codigoIbge: String(address.codigoIbge || "").trim() || null, origemConsulta: ["MANUAL", "VIACEP", "CEP_BRASIL"].includes(address.origemConsulta) ? address.origemConsulta : "MANUAL" };
}
function createToken() { return crypto.randomBytes(32).toString("base64url"); }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
async function createVerification(account, appUrl) {
	const raw = createToken();
	await db.query("update mercado_email_verifications set used_at=now() where account_id=$1 and used_at is null", [account.id]);
	await db.query("insert into mercado_email_verifications(account_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')", [account.id, hash(raw)]);
	const url = `${String(appUrl || process.env.PUBLIC_APP_URL || "").replace(/\/$/, "")}/mercado/verificar-email?token=${encodeURIComponent(raw)}`;
	await emailService.sendWelcomeUserEmail({ user: { uid: account.id, email: account.email, display_name: account.display_name, role: "Prestador Mercado" }, resetUrl: url });
}
async function register(payload = {}, { appUrl } = {}) {
	const type = String(payload.tipoPessoa || "").toUpperCase(); const document = onlyDigits(payload.cpfCnpj); const email = String(payload.email || "").trim().toLowerCase(); const password = String(payload.password || ""); const name = String(type === "PJ" ? payload.razaoSocial : payload.nomeCompleto || "").trim();
	if (!["PF", "PJ"].includes(type)) throw registrationError("Selecione Pessoa Física ou Jurídica.");
	if (type === "PF" ? !validCpf(document) : !validCnpj(document)) throw registrationError(`${type === "PF" ? "CPF" : "CNPJ"} inválido.`);
	if (!name || !email || !String(payload.telefone || "").trim()) throw registrationError("Preencha os dados obrigatórios.");
	if (type === "PJ" && (!String(payload.responsavelNome || "").trim() || !validCpf(payload.responsavelCpf))) throw registrationError("Informe o nome e CPF válido do responsável legal.");
	assertPassword(password); if (payload.aceiteTermos !== true || payload.aceitePrivacidade !== true) throw registrationError("É necessário aceitar os termos e a política de privacidade.");
	const address = normalizeAddress(payload); const client = await db.connect();
	try {
		await client.query("begin");
		const prestador = await client.query(`insert into mercado_prestadores (tipo_pessoa,nome_exibicao,razao_social,nome_fantasia,responsavel_nome,responsavel_cpf,responsavel_cpf_normalizado,responsavel_email,cpf_cnpj,cpf_cnpj_normalizado,email,email_normalizado,telefone,termos_aceitos_em,privacidade_aceita_em) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$10,$11,now(),now()) returning *`, [type, name, type === "PJ" ? name : null, String(payload.nomeFantasia || "").trim() || null, String(payload.responsavelNome || "").trim() || null, type === "PJ" ? onlyDigits(payload.responsavelCpf) : null, type === "PJ" ? onlyDigits(payload.responsavelCpf) : null, String(payload.responsavelEmail || "").trim().toLowerCase() || null, document, email, String(payload.telefone).trim()]);
		await client.query(`insert into mercado_enderecos(prestador_id,cep,logradouro,numero,complemento,bairro,cidade,uf,codigo_ibge,origem_consulta) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [prestador.rows[0].id, address.cep, address.logradouro, address.numero, address.complemento, address.bairro, address.cidade, address.uf, address.codigoIbge, address.origemConsulta]);
		const account = await client.query("insert into mercado_accounts(email,display_name,password_hash,prestador_id) values($1,$2,$3,$4) returning id,email,display_name", [email, name, await argon2.hash(password, { type: argon2.argon2id }), prestador.rows[0].id]);
		await client.query("commit"); await createVerification(account.rows[0], appUrl); return { prestadorId: prestador.rows[0].id, email };
	} catch (error) { await client.query("rollback").catch(() => {}); if (error.code === "23505") throw registrationError("CPF/CNPJ ou e-mail já cadastrado.", 409); throw error; } finally { client.release(); }
}
async function verifyEmail(token) {
	const result = await db.query(`select ev.id,ev.account_id,a.prestador_id from mercado_email_verifications ev join mercado_accounts a on a.id=ev.account_id where ev.token_hash=$1 and ev.used_at is null and ev.expires_at>now()`, [hash(token)]); const row = result.rows[0]; if (!row) throw registrationError("Link de verificação inválido ou expirado.");
	await db.query("update mercado_email_verifications set used_at=now() where id=$1", [row.id]); await db.query("update mercado_accounts set email_verified_at=now() where id=$1", [row.account_id]); await db.query("update mercado_prestadores set email_verified_at=now(), status_cadastro='CADASTRO_COMPLETO', updated_at=now() where id=$1", [row.prestador_id]); return { ok: true };
}
module.exports = { register, verifyEmail, createVerification, validCpf, validCnpj, registrationError, assertPassword };

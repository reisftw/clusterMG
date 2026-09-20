// Construtor de schema leve para DTOs do backend principal (Fase C —
// docs/TECHNICAL-AUDIT.md). Mesmo padrao ja usado e comprovado no backend
// do Finan (apps/finan/backend/src/dtos/schema.js) — nenhuma lib de
// validacao (Joi/Zod/Yup/express-validator) existe no backend principal
// (vps/api), e os payloads sao pequenos o suficiente pra um construtor
// proprio continuar compensando em vez de adicionar uma dependencia nova.
// Reavaliar Zod se algum modulo futuro precisar de validacao condicional
// entre campos que este arquivo nao cubra bem.
//
// Protecao contra mass assignment "por construcao": `object()` SEMPRE
// monta o resultado campo a campo a partir do shape declarado — uma chave
// fora do shape nunca chega ao resultado. `unknownKeys: "reject"` vai alem:
// rejeita a requisicao inteira se vier qualquer campo fora do shape (usar
// em endpoints criticos — ver exemplo de `isAdmin`/`regionalId` colado no
// body em docs/TECHNICAL-AUDIT.md).
const { ValidationError } = require("./errors");

function ok(value) {
	return { value, error: null };
}

function fail(message) {
	return { value: undefined, error: message };
}

function isPresent(raw) {
	return raw !== undefined && raw !== null;
}

function string({
	required = false,
	trim = true,
	allowEmpty = false,
	minLength,
	maxLength,
	pattern,
} = {}) {
	return (raw) => {
		if (!isPresent(raw)) {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		if (typeof raw !== "string") return fail("Deve ser um texto.");
		const value = trim ? raw.trim() : raw;
		if (value === "" && !allowEmpty) {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		if (minLength !== undefined && value.length < minLength) {
			return fail(`Deve ter no minimo ${minLength} caractere(s).`);
		}
		if (maxLength !== undefined && value.length > maxLength) {
			return fail(`Deve ter no maximo ${maxLength} caractere(s).`);
		}
		if (pattern && !pattern.test(value)) return fail("Formato invalido.");
		return ok(value);
	};
}

function enumField(allowed, { required = false } = {}) {
	const values = Array.isArray(allowed) ? allowed : [];
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		if (!values.includes(raw)) {
			return fail(`Valor invalido. Use um de: ${values.join(", ")}.`);
		}
		return ok(raw);
	};
}

function boolean({ required = false } = {}) {
	return (raw) => {
		if (!isPresent(raw)) return required ? fail("Campo obrigatorio.") : ok(undefined);
		if (typeof raw !== "boolean") return fail("Deve ser verdadeiro ou falso.");
		return ok(raw);
	};
}

function integer({ required = false, min, max } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		const num = Number(raw);
		if (!Number.isFinite(num) || !Number.isInteger(num)) return fail("Deve ser um numero inteiro.");
		if (min !== undefined && num < min) return fail(`Deve ser maior ou igual a ${min}.`);
		if (max !== undefined && num > max) return fail(`Deve ser menor ou igual a ${max}.`);
		return ok(num);
	};
}

// Data em formato YYYY-MM-DD — mesma convencao ja usada pra colunas `date`
// do dominio (agendamentos.data, ordens_import_runs.periodo_inicio/fim).
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function dateOnly({ required = false } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		if (typeof raw !== "string" || !DATE_ONLY_PATTERN.test(raw)) {
			return fail("Deve ser uma data no formato AAAA-MM-DD.");
		}
		return ok(raw);
	};
}

// Hora em formato HH:MM ou HH:MM:SS — usado por agendamentos.hora (coluna
// `time`, separada de `data`).
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;
function timeOnly({ required = false } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		if (typeof raw !== "string" || !TIME_PATTERN.test(raw)) {
			return fail("Deve ser um horario no formato HH:MM.");
		}
		return ok(raw);
	};
}

// Timestamp ISO 8601 (ex.: new Date().toISOString(), que o frontend ja
// manda hoje em criado_em/atualizado_em de agendamentos) — aceita
// qualquer string que o Date consiga parsear e que, ao rodar toISOString()
// de volta, ainda pareca uma data valida (rejeita lixo tipo "abc").
function isoDateTime({ required = false } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatorio.") : ok(undefined);
		}
		if (typeof raw !== "string") return fail("Deve ser uma data/hora em texto (ISO 8601).");
		const parsed = new Date(raw);
		if (Number.isNaN(parsed.getTime())) return fail("Deve ser uma data/hora valida (ISO 8601).");
		return ok(raw);
	};
}

// ID de texto (documentId/PK text usado em todo o dominio normalizado —
// agendamentos, ordens_servico, etc.) — nunca vazio, charset restrito.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
function id({ required = true } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Identificador obrigatorio.") : ok(undefined);
		}
		if (typeof raw !== "string" || !ID_PATTERN.test(raw)) return fail("Identificador invalido.");
		return ok(raw);
	};
}

function arrayOf(itemValidator, { required = false, maxLength = 500 } = {}) {
	return (raw) => {
		if (!isPresent(raw)) return required ? fail("Campo obrigatorio.") : ok(undefined);
		if (!Array.isArray(raw)) return fail("Deve ser uma lista.");
		if (raw.length > maxLength) return fail(`Deve ter no maximo ${maxLength} item(ns).`);
		const values = [];
		for (let index = 0; index < raw.length; index += 1) {
			const { value, error } = itemValidator(raw[index]);
			if (error) return fail(`Item ${index + 1}: ${error}`);
			if (value !== undefined) values.push(value);
		}
		return ok(values);
	};
}

function jsonObject({ required = false, maxBytes = 200_000 } = {}) {
	return (raw) => {
		if (!isPresent(raw)) return required ? fail("Campo obrigatorio.") : ok(undefined);
		if (typeof raw !== "object" || Array.isArray(raw)) return fail("Deve ser um objeto.");
		let size = 0;
		try {
			size = Buffer.byteLength(JSON.stringify(raw), "utf8");
		} catch {
			return fail("Objeto invalido.");
		}
		if (size > maxBytes) return fail(`Objeto excede o tamanho maximo permitido (${maxBytes} bytes).`);
		return ok(raw);
	};
}

/**
 * Monta um schema de objeto a partir de `{ campo: validador }`.
 * `unknownKeys`: "strip" (padrao, chaves fora do shape sao ignoradas) ou
 * "reject" (chaves fora do shape fazem a requisicao inteira falhar com
 * 400 — usar em endpoints criticos).
 */
function object(shape, { unknownKeys = "strip" } = {}) {
	const keys = Object.keys(shape);
	return function parse(raw, { partial = false } = {}) {
		const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
		const fieldErrors = {};

		if (unknownKeys === "reject") {
			const extra = Object.keys(input).filter((key) => !keys.includes(key));
			for (const key of extra) fieldErrors[key] = "Campo nao permitido.";
		}

		const result = {};
		for (const key of keys) {
			if (partial && input[key] === undefined) continue;
			const { value, error } = shape[key](input[key]);
			if (error) {
				fieldErrors[key] = error;
				continue;
			}
			if (value !== undefined) result[key] = value;
		}

		if (Object.keys(fieldErrors).length > 0) throw new ValidationError(fieldErrors);
		return result;
	};
}

module.exports = {
	string,
	enumField,
	boolean,
	integer,
	dateOnly,
	timeOnly,
	isoDateTime,
	id,
	arrayOf,
	jsonObject,
	object,
};

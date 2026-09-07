// Construtor de schema leve para DTOs do Finan.
//
// Por que nao Zod/Joi/Yup: nenhuma lib de validacao existia no backend do
// Finan antes deste modulo (confirmado por grep em `package.json` e em todo
// `src/`). O padrao mais proximo que ja existia era
// `financeiroEquipeRepository.js` (`normalizeXInput` — funcao pura, sem I/O,
// que valida e devolve um objeto limpo, lancando erro de negocio com
// `.status`). Este modulo generaliza esse padrao em vez de introduzir uma
// dependencia nova: e pouco codigo, sem API a mais para aprender, e já seria
// suficiente pro tamanho real dos payloads do Finan (poucos campos por
// endpoint). Se o projeto crescer para schemas bem mais complexos (unions,
// validacao condicional entre campos, etc.), Zod passa a valer a pena — vale
// reavaliar nesse momento, nao adiantar agora.
//
// Cada "validador de campo" e uma funcao `(rawValue) => { value, error }`.
// `object(shape)` combina varios campos em um schema completo, com
// `.parse(input, { partial })` que lanca `ValidationError` (ver `errors.js`)
// listando TODOS os campos invalidos de uma vez (nao para no primeiro erro),
// no formato `{ campo: "mensagem" }` usado pelo restante do backend.
//
// Protecao contra mass assignment "por construcao": `object()` SEMPRE monta
// o resultado campo a campo a partir do `shape` declarado — uma chave que
// nao esta no shape nunca e copiada para o resultado, independente de
// `unknownKeys`. A opcao `unknownKeys: "reject"` (usada nos DTOs de
// endpoints criticos) vai alem disso: rejeita a requisicao inteira se o
// client mandar qualquer campo fora do shape (ex.: alguem tentando colar
// `is_admin`/`empresaId` em um payload que nao declara esses campos) — ver
// `docs/DTO-MAPPING.md` para o exemplo completo.
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
			return required ? fail("Campo obrigatório.") : ok(undefined);
		}
		if (typeof raw !== "string") return fail("Deve ser um texto.");
		const value = trim ? raw.trim() : raw;
		if (value === "" && !allowEmpty) {
			return required ? fail("Campo obrigatório.") : ok(undefined);
		}
		if (minLength !== undefined && value.length < minLength) {
			return fail(`Deve ter no mínimo ${minLength} caractere(s).`);
		}
		if (maxLength !== undefined && value.length > maxLength) {
			return fail(`Deve ter no máximo ${maxLength} caractere(s).`);
		}
		if (pattern && !pattern.test(value)) return fail("Formato inválido.");
		return ok(value);
	};
}

function enumField(allowed, { required = false } = {}) {
	const values = Array.isArray(allowed) ? allowed : [];
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatório.") : ok(undefined);
		}
		if (!values.includes(raw)) {
			return fail(`Valor inválido. Use um de: ${values.join(", ")}.`);
		}
		return ok(raw);
	};
}

function boolean({ required = false } = {}) {
	return (raw) => {
		if (!isPresent(raw)) return required ? fail("Campo obrigatório.") : ok(undefined);
		if (typeof raw !== "boolean") return fail("Deve ser verdadeiro ou falso.");
		return ok(raw);
	};
}

function integer({ required = false, min, max } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatório.") : ok(undefined);
		}
		const num = Number(raw);
		if (!Number.isFinite(num) || !Number.isInteger(num)) return fail("Deve ser um número inteiro.");
		if (min !== undefined && num < min) return fail(`Deve ser maior ou igual a ${min}.`);
		if (max !== undefined && num > max) return fail(`Deve ser menor ou igual a ${max}.`);
		return ok(num);
	};
}

// Valor monetario: aceita number ou string numerica, rejeita
// NaN/Infinity/-Infinity e (por padrao) valores negativos — cobre o
// requisito explicito de "-1, NaN, Infinity, 'abc' devem dar erro".
function money({ required = false, allowNegative = false, max = 1e12 } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatório.") : ok(undefined);
		}
		if (typeof raw !== "number" && typeof raw !== "string") return fail("Valor monetário inválido.");
		const num = Number(raw);
		if (!Number.isFinite(num)) return fail("Valor monetário inválido.");
		if (!allowNegative && num < 0) return fail("Não pode ser negativo.");
		if (Math.abs(num) > max) return fail("Valor fora do intervalo permitido.");
		return ok(Math.round(num * 100) / 100);
	};
}

// Data em formato YYYY-MM-DD (mesma convencao ja estabelecida e testada em
// `calendario/routes.js` — string ISO curta, nunca `Date`/`toISOString()`,
// para evitar o bug de fuso horario ja documentado neste projeto).
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function dateOnly({ required = false } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Campo obrigatório.") : ok(undefined);
		}
		if (typeof raw !== "string" || !DATE_ONLY_PATTERN.test(raw)) {
			return fail("Deve ser uma data no formato AAAA-MM-DD.");
		}
		return ok(raw);
	};
}

// ID de texto do Finan (`randomId()` de `secureRandom.js`, UUID de
// `crypto.randomUUID()`, ou slug de cargo) — nunca vazio, charset restrito
// (letras/numeros/`_`/`-`), tamanho limitado. Nao garante que o ID exista no
// banco (isso continua sendo responsabilidade do `WHERE id = $1` +
// checagem de `rows.length`), só garante que o formato é seguro/plausível
// antes de a query rodar.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
function id({ required = true } = {}) {
	return (raw) => {
		if (!isPresent(raw) || raw === "") {
			return required ? fail("Identificador obrigatório.") : ok(undefined);
		}
		if (typeof raw !== "string" || !ID_PATTERN.test(raw)) return fail("Identificador inválido.");
		return ok(raw);
	};
}

function arrayOf(itemValidator, { required = false, maxLength = 500 } = {}) {
	return (raw) => {
		if (!isPresent(raw)) return required ? fail("Campo obrigatório.") : ok(undefined);
		if (!Array.isArray(raw)) return fail("Deve ser uma lista.");
		if (raw.length > maxLength) return fail(`Deve ter no máximo ${maxLength} item(ns).`);
		const values = [];
		for (let index = 0; index < raw.length; index += 1) {
			const { value, error } = itemValidator(raw[index]);
			if (error) return fail(`Item ${index + 1}: ${error}`);
			if (value !== undefined) values.push(value);
		}
		return ok(values);
	};
}

// Objeto "opaco" (JSON livre) — usado quando o campo e de fato um blob de
// configuracao (ex.: config de integracao). Ainda assim NAO e "aceita
// qualquer coisa": limita profundidade/tamanho serializado para evitar
// payloads absurdos, e sempre rejeita array/null/tipos primitivos no lugar
// de objeto.
function jsonObject({ required = false, maxBytes = 200_000 } = {}) {
	return (raw) => {
		if (!isPresent(raw)) return required ? fail("Campo obrigatório.") : ok(undefined);
		if (typeof raw !== "object" || Array.isArray(raw)) return fail("Deve ser um objeto.");
		let size = 0;
		try {
			size = Buffer.byteLength(JSON.stringify(raw), "utf8");
		} catch {
			return fail("Objeto inválido.");
		}
		if (size > maxBytes) return fail(`Objeto excede o tamanho máximo permitido (${maxBytes} bytes).`);
		return ok(raw);
	};
}

/**
 * Monta um schema de objeto a partir de `{ campo: validador }`.
 * `unknownKeys`:
 *   - "strip" (padrao): chaves fora do shape sao simplesmente ignoradas
 *     (nunca chegam ao resultado — ja e proteção contra mass assignment).
 *   - "reject": chaves fora do shape fazem a requisicao inteira falhar com
 *     400, listando os campos não permitidos. Use em endpoints críticos
 *     (ex.: cargos/permissões, dados de usuário) onde um campo extra
 *     inesperado é sinal de tentativa de manipulação, não de payload
 *     desatualizado do front.
 */
function object(shape, { unknownKeys = "strip" } = {}) {
	const keys = Object.keys(shape);
	return function parse(raw, { partial = false } = {}) {
		const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
		const fieldErrors = {};

		if (unknownKeys === "reject") {
			const extra = Object.keys(input).filter((key) => !keys.includes(key));
			for (const key of extra) fieldErrors[key] = "Campo não permitido.";
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
	money,
	dateOnly,
	id,
	arrayOf,
	jsonObject,
	object,
};

// DTO de seção de configuração genérica (`finan_settings`, chave/valor
// JSON — `settings/routes.js`). `value` continua sendo um objeto livre
// (cada seção tem um shape diferente: `geral`, `notificacoes`, `email`,
// `pin_lock`, etc. — não modularizado por seção hoje); o DTO garante forma
// (objeto, não array/string/null) e tamanho limitado.
const { string, object, jsonObject } = require("./schema");

const SECTION_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;

const SectionParamDTO = object(
	{ key: string({ required: true, maxLength: 64, pattern: SECTION_KEY_PATTERN }) },
	{ unknownKeys: "strip" },
);

const SectionUpdateDTO = object(
	{ value: jsonObject({ required: true, maxBytes: 50_000 }) },
	{ unknownKeys: "reject" },
);

module.exports = { SectionParamDTO, SectionUpdateDTO };

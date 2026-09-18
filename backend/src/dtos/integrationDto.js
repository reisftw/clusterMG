// DTOs de configuração de integração (`finan_integration_configs` e os
// blobs equivalentes gravados em `finan_settings` pela rota legada de
// OAuth/`admin/{provider}/config` em `compat/routes.js`).
//
// `config` continua sendo um objeto livre (cada provedor tem campos
// diferentes: `baseUrl`, `clientId`, `token`, etc. — não modularizado por
// provedor hoje, e não é escopo deste DTO inventar esse contrato). O que o
// DTO garante: é de fato um objeto (não array/string/null), com tamanho
// limitado, e que `status`/`name` (quando presentes) têm forma válida — o
// mesmo padrão de `financeiroEquipeRepository.js`.
const { string, enumField, object, jsonObject } = require("./schema");

const STATUS_VALUES = ["ativo", "planejado", "pausado", "erro"];
const PROVIDER_PATTERN = /^[a-z0-9_-]{1,64}$/;

const ProviderParamDTO = object(
	{ provider: string({ required: true, maxLength: 64, pattern: PROVIDER_PATTERN }) },
	{ unknownKeys: "strip" },
);

const IntegrationConfigUpdateDTO = object(
	{
		config: jsonObject({ required: true, maxBytes: 50_000 }),
		status: enumField(STATUS_VALUES),
		name: string({ maxLength: 160 }),
	},
	{ unknownKeys: "reject" },
);

// Rotas legadas (`compat/routes.js`) que hoje gravam o `req.body` inteiro
// como config (sem envelope `{ config, status, name }`) — usadas para
// `admin/oauth/:provider` e `admin/{hubsoft,cvortex,senior}/config`. Mesma
// garantia de forma (objeto, tamanho limitado), sem exigir um shape interno
// específico porque cada provedor tem campos próprios.
const RawIntegrationConfigDTO = jsonObject({ required: true, maxBytes: 50_000 });

module.exports = {
	ProviderParamDTO,
	IntegrationConfigUpdateDTO,
	RawIntegrationConfigDTO,
	STATUS_VALUES,
};

// DTOs de usuário (`finan_users`) — cadastro/edição feitos por um admin.
// Cobrem `users/routes.js` (`PATCH /:id`, rota "nova") e
// `compat/routes.js` (`PUT /admin/users/:id`, rota legada com nomes de
// campo alternativos em português — mantidos aqui como aliases explícitos
// em vez de aceitar qualquer chave).
//
// Nenhum destes DTOs aceita `is_admin`/`permissions`/`empresa_id` — edição
// de permissão é sempre via cargo (`roleDto.js`), nunca campo solto no
// usuário. Isso por si só fecha a rota mais óbvia de mass assignment aqui:
// mesmo que um client mande `{ "isAdmin": true }` junto do payload, a chave
// não está no shape e `unknownKeys: "reject"` faz a requisição inteira
// falhar em vez de ignorar silenciosamente.
const { string, boolean, enumField, id, object } = require("./schema");

const STATUS_VALUES = ["ativo", "inativo"];

const IdParamDTO = object(
	{ id: id({ required: true }) },
	{ unknownKeys: "strip" }, // req.params so tem essa chave nas rotas onde e usado
);

const UserPatchDTO = object(
	{
		role_id: id({ required: false }),
		status: enumField(STATUS_VALUES),
		mfa_enabled: boolean(),
	},
	{ unknownKeys: "reject" },
);

// `compat/routes.js` aceita nomes alternativos (legado em portugues/inglês
// misturado) para os mesmos campos — o DTO valida a FORMA de cada alias
// possível; a resolução "qual alias venceu" continua no handler, que já
// fazia isso (`payload.nome || payload.name`).
// avatarUrl/avatar_url: o avatar do Finan é salvo como data URI base64
// inline (POST /admin/avatars monta `data:${mimetype};base64,${...}` e
// devolve isso pro form — não sobe pra storage separado, ver linha
// ~250). O multer de upload permite ate 700KB de imagem original, que em
// base64 vira ~960KB de string (+33% do encoding) — maxLength precisa
// cobrir isso, senão TODA edição de um usuário com avatar customizado
// (mesmo trocando só o cargo, sem mexer na foto) falha com "Dados
// inválidos.", porque o form reenvia o avatarUrl atual junto do payload.
const AVATAR_DATA_URL_MAX_LENGTH = 1_200_000;

const AdminUserUpdateDTO = object(
	{
		nome: string({ maxLength: 160 }),
		name: string({ maxLength: 160 }),
		email: string({ maxLength: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
		role: id({ required: false }),
		role_id: id({ required: false }),
		cargo: id({ required: false }),
		status: enumField(STATUS_VALUES),
		mfa_enabled: boolean(),
		avatarUrl: string({ maxLength: AVATAR_DATA_URL_MAX_LENGTH }),
		avatar_url: string({ maxLength: AVATAR_DATA_URL_MAX_LENGTH }),
	},
	{ unknownKeys: "reject" },
);

module.exports = { IdParamDTO, UserPatchDTO, AdminUserUpdateDTO, STATUS_VALUES };

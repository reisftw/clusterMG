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
		avatarUrl: string({ maxLength: 2000 }),
		avatar_url: string({ maxLength: 2000 }),
	},
	{ unknownKeys: "reject" },
);

module.exports = { IdParamDTO, UserPatchDTO, AdminUserUpdateDTO, STATUS_VALUES };

// DTOs de cargo/perfil (`finan_roles`). Usados por `users/routes.js`
// (`POST /roles`, `PATCH /roles/:id`) e por `compat/routes.js`
// (`PUT /admin/roles/:id`, rota legada que grava na mesma tabela) — os dois
// lugares que hoje aceitam `permissions`/`is_admin`/`hierarchy_level` vindos
// do client.
//
// Por que rejeitar chaves desconhecidas aqui (`unknownKeys: "reject"`): este
// é exatamente o tipo de endpoint citado na especificação do DTO — controla
// `is_admin` (acesso total) e `permissions` (RBAC). Um campo extra
// inesperado no body (ex.: `hierarchy_level: -1` disfarçado de outro nome,
// ou uma chave nova que alguém tentando escalar privilégio adicionou) deve
// falhar alto, não ser silenciosamente ignorado.
//
// O que este DTO NÃO faz (fica a cargo do handler, que já existe e não foi
// alterado): decidir se o ATOR pode marcar `is_admin: true` — isso é regra
// de negócio (ex.: só um admin pode criar outro admin), não formato. O DTO
// garante que os valores enviados têm o tipo/forma certos e que
// `permissions` só contém strings realmente catalogadas.
const { string, boolean, integer, arrayOf, enumField, object } = require("./schema");
const { PERMISSION_CATALOG } = require("../rbac/permissionCatalog");

const PERMISSION_IDS = PERMISSION_CATALOG.map((item) => item.id);
const ROLE_ID_PATTERN = /^[a-z0-9_]{1,80}$/;

const permissionsField = arrayOf(enumField(PERMISSION_IDS, { required: true }), { maxLength: 100 });

const RoleCreateDTO = object(
	{
		id: string({ trim: true, maxLength: 80, pattern: ROLE_ID_PATTERN }),
		name: string({ required: true, maxLength: 120 }),
		description: string({ maxLength: 500, allowEmpty: true }),
		permissions: permissionsField,
		is_admin: boolean(),
		hierarchy_level: integer({ min: 0, max: 999 }),
	},
	{ unknownKeys: "reject" },
);

const RoleUpdateDTO = object(
	{
		name: string({ maxLength: 120 }),
		description: string({ maxLength: 500, allowEmpty: true }),
		permissions: permissionsField,
		is_admin: boolean(),
		active: boolean(),
		hierarchy_level: integer({ min: 0, max: 999 }),
	},
	{ unknownKeys: "reject" },
);

// `compat/routes.js#PUT /admin/roles/:id` e rota legada equivalente a
// `POST/PATCH /usuarios/roles` (mesma tabela `finan_roles`), mas com
// semantica de PUT (grava tudo de novo, sem `coalesce`) e sem
// `hierarchy_level` no payload (a tela legada nao tem esse campo). Schema
// dedicado para nao forcar a rota nova e a legada a aceitarem exatamente o
// mesmo shape.
const LegacyRoleUpsertDTO = object(
	{
		name: string({ maxLength: 120 }),
		description: string({ maxLength: 500, allowEmpty: true }),
		permissions: permissionsField,
		is_admin: boolean(),
		active: boolean(),
	},
	{ unknownKeys: "reject" },
);

module.exports = { RoleCreateDTO, RoleUpdateDTO, LegacyRoleUpsertDTO, PERMISSION_IDS };

// DTO de atualizacao de usuario administrado (Fase C —
// docs/TECHNICAL-AUDIT.md). Cobre exatamente os campos que
// app.js#updateLocalUser e app.js#mergeUserProfileExtras de fato
// consomem (incluindo os aliases camelCase/snake_case que ja existiam) —
// nao inventa nem restringe nenhum campo alem do que ja era aceito.
//
// `unknownKeys: "strip"` (nao "reject") de proposito aqui: este endpoint
// tem uma superficie de aliases grande e ja estabelecida, e o objetivo
// desta fase e fechar mass assignment (ex.: alguem colando `isAdmin`/
// `role_id` inventado no body), nao arriscar quebrar um alias legitimo que
// eu possa ter deixado de fora ao mapear o codigo. `object()` ja monta o
// resultado campo a campo a partir do shape — uma chave fora do shape
// NUNCA chega em `req.validated.body`, com ou sem "reject". A regra de
// negocio de quem pode alterar o que (admin/supervisor/supervisor
// administrativo) continua inteiramente em
// app.js#assertCanUpdateManagedUser — este DTO so garante forma/tipo.
const { string, boolean, arrayOf, object } = require("./schema");

const UserAdminUpdateDTO = object(
	{
		email: string({ maxLength: 254 }),
		nome: string({ maxLength: 160 }),
		role: string({ maxLength: 80 }),
		regional: string({ maxLength: 120, allowEmpty: true }),
		disabled: boolean(),
		trocar_senha: boolean(),
		empresaId: string({ maxLength: 200, allowEmpty: true }),
		empresa_id: string({ maxLength: 200, allowEmpty: true }),
		empresaNome: string({ maxLength: 200, allowEmpty: true }),
		empresa_nome: string({ maxLength: 200, allowEmpty: true }),
		avatarUrl: string({ maxLength: 500, allowEmpty: true }),
		avatar_url: string({ maxLength: 500, allowEmpty: true }),
		insumosBaseId: string({ maxLength: 200, allowEmpty: true }),
		insumos_base_id: string({ maxLength: 200, allowEmpty: true }),
		baseInsumosId: string({ maxLength: 200, allowEmpty: true }),
		insumosBaseNome: string({ maxLength: 200, allowEmpty: true }),
		insumos_base_nome: string({ maxLength: 200, allowEmpty: true }),
		baseInsumosNome: string({ maxLength: 200, allowEmpty: true }),
		insumosCategoriasVer: arrayOf(string({ maxLength: 120 }), { maxLength: 200 }),
		insumosCategoriasSolicitar: arrayOf(string({ maxLength: 120 }), { maxLength: 200 }),
	},
	{ unknownKeys: "strip" },
);

module.exports = { UserAdminUpdateDTO };

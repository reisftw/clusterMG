import { ROLES } from "../constants/roles";

export const text = (value) => String(value || "").trim();

export const normalizeList = (items = []) =>
	[...new Set(items.map(text).filter(Boolean))].sort((a, b) =>
		a.localeCompare(b),
	);

export const normalizeId = (value) =>
	text(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const getBaseName = (baseId, bases = []) =>
	bases.find((base) => base.id === baseId)?.nome || "";

export const getUserBaseId = (user = {}) =>
	text(
		user.insumosBaseId ||
			user.baseInsumosId ||
			user.base_id ||
			user.baseId ||
			user.insumos_base_id ||
			user.base ||
			user.cidade,
	);

export const isGlobalInsumosAdmin = (user = {}) =>
	user?.isAdmin === true ||
	String(user?.role || "").toLowerCase() === ROLES.ADMIN;

export const getPermissionKey = (user = {}) =>
	text(user.id || user.uid || user.email);

export const getAllowedInsumosCategories = (
	config = {},
	user = {},
	action = "ver",
) => {
	const categorias = normalizeList(config?.categorias || []);
	if (isGlobalInsumosAdmin(user)) return categorias;

	const userKey = getPermissionKey(user);
	const role = String(user?.role || "").toLowerCase();
	const fromUser =
		config?.permissoesCategoria?.usuarios?.[userKey]?.[action] ||
		user[`insumosCategorias${action === "solicitar" ? "Solicitar" : "Ver"}`];
	const fromRole = config?.permissoesCategoria?.perfis?.[role]?.[action];
	const allowed = normalizeList([
		...(Array.isArray(fromRole) ? fromRole : []),
		...(Array.isArray(fromUser) ? fromUser : []),
	]);

	return allowed.length ? allowed : categorias;
};

export const canUseInsumosCategory = (item, allowed = []) => {
	const categoria = text(item?.categoria) || "Outros";
	return !allowed.length || allowed.includes(categoria);
};

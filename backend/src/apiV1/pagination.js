// Roteiro Finan #26 (API interna oficial /api/v1): paginação real
// (page/pageSize + total via COUNT), padrão único — resolve a
// inconsistência #3 do inventário (só 2 de ~150 rotas legadas paginavam
// de verdade; o resto usava LIMIT fixo sem total, ou nada).
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

function parsePagination(query = {}, { defaultPageSize = DEFAULT_PAGE_SIZE } = {}) {
	const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
	const rawPageSize = Math.trunc(Number(query.pageSize)) || defaultPageSize;
	const pageSize = Math.min(Math.max(1, rawPageSize), MAX_PAGE_SIZE);
	const offset = (page - 1) * pageSize;
	return { page, pageSize, offset, limit: pageSize };
}

function buildMeta({ page, pageSize, total }) {
	const safeTotal = Math.max(0, Number(total) || 0);
	return {
		page,
		pageSize,
		total: safeTotal,
		totalPages: safeTotal ? Math.ceil(safeTotal / pageSize) : 0,
	};
}

module.exports = { parsePagination, buildMeta, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

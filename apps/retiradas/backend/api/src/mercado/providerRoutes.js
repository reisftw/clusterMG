const crypto = require("node:crypto");
const express = require("express");
const db = require("../db");
const service = require("./service");
const { requireMercadoAuth } = require("./auth");
const { canAccessOs } = require("./progressivePrivacy");

const terminal = ["SUBMITTED", "APPROVED", "REJECTED", "CORRECTION_REQUESTED", "CANCELED"];
const MARKET_SERVICE_TYPES = ["RETIRADA FTTH", "CANCELAMENTO FTTH", "RETIRADA", "CANCELAMENTO", "CANCELAMENTO LOJA"];
const OCCUPYING_LOTE_STATUSES = ["DRAFT", "AVAILABLE", "ACCEPTED", "IN_EXECUTION", "SUBMITTED"];
const marketServiceTypeSql = "upper(trim(coalesce(nullif(os.tipo,''), nullif(os.servico,''))))";
const safeText = (value) => String(value ?? "").trim();
const quantityOf = (value) => Number.parseInt(value, 10);
const providerUser = (user) => ({
	uid: user.id,
	email: user.email,
	role: String(user.role || "PRESTADOR").toLowerCase(),
	empresaId: user.empresaId,
	empresaNome: user.empresaNome,
	permissions: [],
	profile: { displayName: user.displayName, empresaId: user.empresaId, empresaNome: user.empresaNome },
});
function error(message, status = 400) { const value = new Error(message); value.status = status; value.statusCode = status; return value; }
function asyncRoute(handler) { return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next); }
function requireSameOrigin(req, res, next) {
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
	const expected = String(process.env.MERCADO_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
	const origin = String(req.get("origin") || "").replace(/\/$/, "");
	if (!expected || origin === expected) return next();
	return res.status(403).json({ error: "Origem não permitida para o Mercado." });
}

async function assertEligibleAccount(user) {
	if (!user.prestadorId) return;
	if (!user.emailVerifiedAt) throw error("Confirme seu e-mail antes de operar no Mercado.", 403);
	if (user.statusHabilitacao !== "HABILITADO") throw error("Seu cadastro está em análise e ainda não está habilitado para lotes.", 403);
	const enabled = await db.query("select enabled from mercado_empresa_habilitacoes where empresa_id=$1", [user.empresaId]);
	if (enabled.rows[0] && !enabled.rows[0].enabled) throw error("Empresa desabilitada para o Mercado.", 403);
	const suspended = await db.query("select 1 from mercado_suspensoes where empresa_id=$1 and status='ACTIVE' and (end_at is null or end_at > now()) limit 1", [user.empresaId]);
	if (suspended.rows[0]) throw error("Empresa suspensa para novos lotes.", 403);
}

async function aggregateCities(query = {}) {
	const filter = safeText(query.q);
	const result = await db.query(
		`select os.cidade, ${marketServiceTypeSql} as equipamento_tipo, count(*)::int as total
		   from ordens_servico os
		  where nullif(trim(coalesce(os.cidade,'')),'') is not null
		    and coalesce(os.status,'') not ilike '%fech%'
		    and not exists (select 1 from mercado_lote_os mlo join mercado_lotes ml on ml.id=mlo.lote_id
		                    where mlo.ordem_servico_id=os.id and ml.status = any($1::text[]))
		    and ${marketServiceTypeSql} = any($2::text[])
		    and ($3 = '' or os.cidade ilike '%' || $3 || '%')
		  group by os.cidade, ${marketServiceTypeSql}
		 having count(*) >= 15
		  order by total desc, os.cidade asc
		  limit 500`,
		[OCCUPYING_LOTE_STATUSES, MARKET_SERVICE_TYPES, filter],
	);
	const byCity = new Map();
	for (const row of result.rows) {
		const city = safeText(row.cidade);
		const item = byCity.get(city) || { cidade: city, total: 0, equipamentos: [] };
		item.total += Number(row.total || 0);
		item.equipamentos.push({ tipo: row.equipamento_tipo, total: Number(row.total || 0) });
		byCity.set(city, item);
	}
	return { items: [...byCity.values()].sort((a, b) => b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR")) };
}

async function selection(client, { cidade, equipamentoTipo, quantidade }) {
	const rows = await client.query(
		`select os.* from ordens_servico os
		  where lower(trim(os.cidade))=lower(trim($1))
		    and ${marketServiceTypeSql} = upper(trim($2))
		    and coalesce(os.status,'') not ilike '%fech%'
		    and not exists (select 1 from mercado_lote_os mlo join mercado_lotes ml on ml.id=mlo.lote_id
		                    where mlo.ordem_servico_id=os.id and ml.status = any($3::text[]))
		    and ${marketServiceTypeSql} = any($4::text[])
		  order by os.data_abertura asc nulls last, os.bairro asc nulls last, os.id asc
		  limit $5 for update skip locked`,
		[cidade, equipamentoTipo, OCCUPYING_LOTE_STATUSES, MARKET_SERVICE_TYPES, quantidade],
	);
	return rows.rows;
}

function safePreview(rows, config, payload) {
	const pricing = service.simulatePricing(config.config, { quantidade: rows.length, dificuldade: payload.dificuldade });
	return {
		cidade: payload.cidade,
		equipamentoTipo: payload.equipamentoTipo,
		quantidadeOs: rows.length,
		bairros: [...new Set(rows.map((row) => safeText(row.bairro)).filter(Boolean))].slice(0, 12),
		valorEstimado: pricing.total,
		valorPorOs: pricing.valorPorOs,
		slaHours: Number(config.config.prazos.slaHoras || 72),
	};
}

function createProviderRouter() {
	const router = express.Router();
	router.use(requireMercadoAuth);
	router.use(requireSameOrigin);
	router.get("/dashboard", asyncRoute(async (req, res) => {
		const user = req.mercadoUser;
		const totals = await db.query(`select status, count(*)::int as total, coalesce(sum(valor_contratado),0)::numeric as valor from mercado_lotes where coalesce(accepted_by_prestador_id::text, accepted_by_empresa_id)=$1 group by status`, [user.empresaId]);
		const releases = await db.query(`select count(*)::int as total, count(*) filter (where liberada_em is not null)::int as liberadas from mercado_lote_os os join mercado_lotes l on l.id=os.lote_id where coalesce(l.accepted_by_prestador_id::text, l.accepted_by_empresa_id)=$1`, [user.empresaId]);
		res.json({ user, lotes: totals.rows, liberacao: { total: Number(releases.rows[0]?.total || 0), liberadas: Number(releases.rows[0]?.liberadas || 0) }, cidades: await aggregateCities(req.query) });
	}));
	router.get("/cidades", asyncRoute(async (req, res) => res.json(await aggregateCities(req.query))));
	router.get("/lotes", asyncRoute(async (req, res) => {
		const rows = await db.query("select * from mercado_lotes where coalesce(accepted_by_prestador_id::text, accepted_by_empresa_id)=$1 order by accepted_at desc nulls last, created_at desc limit 100", [req.mercadoUser.empresaId]);
		res.json({ items: rows.rows.map((row) => ({ id: row.id, codigo: row.codigo, status: row.status, cidade: row.cidade, equipamentoTipo: row.equipamento_tipo, quantidadeOs: Number(row.quantidade_os), valorContratado: Number(row.valor_contratado || row.valor_potencial || 0), acceptedAt: row.accepted_at })) });
	}));
	router.get("/lotes/:id", asyncRoute(async (req, res) => {
		const lote = await db.query("select * from mercado_lotes where id=$1 and coalesce(accepted_by_prestador_id::text, accepted_by_empresa_id)=$2", [req.params.id, req.mercadoUser.empresaId]);
		if (!lote.rows[0]) throw error("Lote não encontrado.", 404);
		const os = await db.query(`select id,num_os,codigo_cliente,nome_cliente,telefone,endereco,bairro,cidade,equipamento_tipo,status,desfecho,sla_due_at,grupo_liberacao,ordem_execucao,liberada_em
		 from mercado_lote_os where lote_id=$1 and liberada_em is not null order by ordem_execucao`, [req.params.id]);
		const blocked = await db.query("select count(*)::int as total from mercado_lote_os where lote_id=$1 and liberada_em is null", [req.params.id]);
		const allowed = os.rows.filter((row) => canAccessOs({ ...row, accepted_by_empresa_id: req.mercadoUser.empresaId }, req.mercadoUser.empresaId));
		res.json({ item: lote.rows[0], os: allowed, progressiveRelease: { groupSize: 3, available: allowed.length, blocked: Number(blocked.rows[0]?.total || 0) } });
	}));
	router.post("/montagem/preview", asyncRoute(async (req, res) => {
		const quantity = quantityOf(req.body?.quantidade);
		if (![15, 25, 35].includes(quantity)) throw error("Escolha 15, 25 ou 35 OS.");
		const cidade = safeText(req.body?.cidade); const equipamentoTipo = safeText(req.body?.equipamentoTipo);
		if (!cidade || !equipamentoTipo) throw error("Cidade e equipamento são obrigatórios.");
		const config = await service.getCurrentConfig();
		const rows = await db.query(`select os.* from ordens_servico os where lower(trim(os.cidade))=lower(trim($1)) and ${marketServiceTypeSql}=upper(trim($2)) and coalesce(os.status,'') not ilike '%fech%' and not exists (select 1 from mercado_lote_os mlo join mercado_lotes ml on ml.id=mlo.lote_id where mlo.ordem_servico_id=os.id and ml.status=any($3::text[])) and ${marketServiceTypeSql}=any($4::text[]) order by os.data_abertura asc nulls last, os.bairro asc nulls last limit $5`, [cidade, equipamentoTipo, OCCUPYING_LOTE_STATUSES, MARKET_SERVICE_TYPES, quantity]);
		if (rows.rows.length !== quantity) throw error("Não há OS elegíveis suficientes para a quantidade selecionada.", 409);
		res.json({ preview: safePreview(rows.rows, config, { cidade, equipamentoTipo, dificuldade: req.body?.dificuldade }) });
	}));
	router.post("/montagem/confirmar", asyncRoute(async (req, res) => {
		const quantity = quantityOf(req.body?.quantidade); const cidade = safeText(req.body?.cidade); const equipamentoTipo = safeText(req.body?.equipamentoTipo);
		if (![15, 25, 35].includes(quantity) || !cidade || !equipamentoTipo) throw error("Dados de montagem inválidos.");
		const user = req.mercadoUser; await assertEligibleAccount(user);
		const config = await service.getCurrentConfig(); const client = await db.connect();
		try {
			await client.query("begin"); await client.query("select pg_advisory_xact_lock(hashtext($1))", [`mercado:empresa:${user.empresaId}`]);
			const active = await client.query("select cidade from mercado_lotes where coalesce(accepted_by_prestador_id::text, accepted_by_empresa_id)=$1 and status=any($2::text[])", [user.empresaId, ["ACCEPTED", "IN_EXECUTION"]]);
			if (active.rows.length >= Number(config.config.lotes.maxLotesSimultaneosPorEmpresa || 3)) throw error("Limite de lotes ativos atingido.", 409);
			if (active.rows.some((row) => safeText(row.cidade).toLowerCase() === cidade.toLowerCase())) throw error("Sua empresa já possui lote ativo nesta cidade.", 409);
			const rows = await selection(client, { cidade, equipamentoTipo, quantidade: quantity });
			if (rows.length !== quantity) throw error("As OS foram atualizadas por outra operação. Revise a prévia.", 409);
			const preview = safePreview(rows, config, { cidade, equipamentoTipo, dificuldade: req.body?.dificuldade });
			const code = `MRC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
			const lote = await client.query(`insert into mercado_lotes(codigo,status,cidade,bairros,equipamento_tipo,quantidade_os,dificuldade,valor_potencial,valor_contratado,sla_hours,regularization_days,config_version_id,config_snapshot,pricing_snapshot,accepted_by_prestador_id,accepted_by_empresa_id,accepted_by_empresa_nome,accepted_by_uid,accepted_by_name,accepted_at,withdraw_deadline_at) values($1,'ACCEPTED',$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$13,$14,$15,$16,now(),now()+($17 * interval '1 minute')) returning *`, [code,cidade,preview.bairros,equipamentoTipo,quantity,safeText(req.body?.dificuldade || "NORMAL").toUpperCase(),preview.valorEstimado,preview.slaHours,Number(config.config.prazos.regularizacaoDias || 7),config.id,JSON.stringify(config.config),JSON.stringify(preview),user.empresaId,user.empresaNome,user.id,user.displayName,Number(config.config.prazos.desistenciaMinutos || 60)]);
			for (const [index, order] of rows.entries()) { const group = Math.floor(index / 3) + 1; await client.query(`insert into mercado_lote_os(lote_id,ordem_servico_id,num_os,codigo_cliente,nome_cliente,telefone,endereco,bairro,cidade,equipamento_tipo,mac_addr,status,valor_contratado,ordem_execucao,grupo_liberacao,liberada_em,sla_due_at,source_payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'IN_PROGRESS',$12,$13,$14,case when $14=1 then now() else null end,case when $14=1 then now()+($15 * interval '1 hour') else null end,$16::jsonb)`, [lote.rows[0].id,order.id,order.num_os,order.codigo_cliente,order.nome_cliente,order.telefone,order.endereco || order.endereco_resumo,order.bairro,order.cidade,equipamentoTipo,order.mac_addr || order.phy_addr,preview.valorPorOs,index+1,group,preview.slaHours,JSON.stringify(order.source_payload || {})]); }
			await client.query("insert into mercado_lote_liberacoes(lote_id,grupo,motivo,created_by_id) values($1,1,'ACEITE_LOTE',$2) on conflict do nothing", [lote.rows[0].id,user.id]);
			await client.query("insert into mercado_lote_eventos(lote_id,tipo,descricao,payload,created_by_uid,created_by_name) values($1,'LOTE_MONTADO','Lote montado e aceito pelo prestador.',$2::jsonb,$3,$4)", [lote.rows[0].id,JSON.stringify({ cidade,equipamentoTipo,quantidade }),user.id,user.displayName]);
			await client.query("commit"); res.status(201).json({ lote: { id:lote.rows[0].id, codigo:code }, preview });
		} catch (err) { await client.query("rollback").catch(() => {}); throw err; } finally { client.release(); }
	}));
	for (const method of ["execucao", "tentativas", "agendamentos", "evidencias"]) router.post(`/os/:id/${method}`, asyncRoute(async (req, res) => {
		const user = providerUser(req.mercadoUser); const fn = { execucao: service.updateOsExecution, tentativas: service.addTentativa, agendamentos: service.addAgendamento, evidencias: service.addEvidencia }[method];
		const data = await fn(req.params.id, req.body || {}, user); res.status(method === "execucao" ? 200 : 201).json(data);
	}));
	return router;
}
module.exports = createProviderRouter;

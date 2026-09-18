const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { randomId } = require("../secureRandom");
const { requireRotAuth, scopeRegionalFilter, userHasRotPermission } = require("../auth/middleware");
const { noStore } = require("../security/noStore");
const { APR_PHOTO_UPLOAD_LIMITS, imageFileFilter } = require("../security/uploadFilters");
const { validateApr, validatePhoto } = require("./validation");
const router = express.Router();
router.use(requireRotAuth, noStore);
const upload = multer({ storage: multer.memoryStorage(), limits: APR_PHOTO_UPLOAD_LIMITS, fileFilter: imageFileFilter });
const createLimit = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false });
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }

// Both regional scope and ownership/role are checked, including photo downloads.
function access(req) {
 const scope = scopeRegionalFilter(req);
 const broad = userHasRotPermission(req.rotUser, ["rot.apr.view", "rot.apr.manage"]);
 return { sql: `($1::text is null or a.regional_id = $1)
 and (a.author_id = $2 or $3::boolean or exists (
 select 1 from regional_responsaveis rr
 where rr.regional_id = a.regional_id and rr.source_payload->>'userId' = $2
 and rr.tipo in ('supervisor_field','supervisor_rot')))`,
 params: [scope, req.rotUser.id, broad] };
}
async function managers(client, regionalId) {
 const { rows: refRows } = await client.query(
  `select tipo, source_payload from regional_responsaveis where regional_id = $1 and tipo in ('supervisor_field','supervisor_rot')`,
  [regionalId],
 );
 const refs = refRows.map((row) => ({ type: row.tipo, userId: row.source_payload?.userId }));
 const ids = [...new Set(refs.map(p => p.userId).filter(Boolean))];
 const { rows } = await client.query(`select u.id, u.name from rot_users u join rot_roles r on r.id=u.role_id
 where u.id = any($1::text[]) and u.status='ativo' and r.active=true`, [ids]);
 const fieldIds = refs.filter(p => p.type === "supervisor_field").map(p => p.userId);
 const field = rows.filter(u => fieldIds.includes(u.id));
 return field.length ? field : rows;
}
router.get("/metadata", async (req,res,next) => {
 try {
  const scope = scopeRegionalFilter(req);
  const { rows } = await db.query("select id, nome as name from regionais where ($1::text is null or id=$1) and ativo=true order by nome", [scope]);
  const items = [];
  for (const r of rows) items.push({ id:r.id, name:r.name, managers:await managers(db,r.id) });
  res.json({ok:true, items});
 } catch(e) { next(e); }
});
router.get("/alerts", async (req,res,next) => {
 try {
  const s=access(req);
  const {rows} = await db.query(`select a.id,a.ticket,a.author_name,a.risk_status,a.created_at from rot_apr_alerts n
   join rot_aprs a on a.id=n.apr_id where n.user_id=$2 and n.read_at is null and ${s.sql}
   order by a.created_at desc limit 50`, s.params);
  res.json({ok:true,items:rows});
 } catch(e) { next(e); }
});
router.post("/:id/acknowledge", async (req,res,next) => {
 try {
  const s=access(req);
  await db.query(`update rot_apr_alerts n set read_at=now() from rot_aprs a
    where n.apr_id=a.id and n.user_id=$2 and a.id=$4 and ${s.sql}`, [...s.params,req.params.id]);
  res.json({ok:true});
 } catch(e) { next(e); }
});
router.get("/", async (req,res,next) => {
 try {
  const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
  if (!Number.isInteger(page)) fail(400,"Página inválida.");
  const s=access(req);
  const regional = String(req.query.regionalId || "");
  const {rows} = await db.query(`select a.id,a.author_name,a.regional_name,a.ticket,a.activity_date,
   a.risk_status,a.manager_names,a.created_at,a.latitude,a.longitude,
   (select count(*)::int from rot_apr_photos p where p.apr_id=a.id) as photo_count
   from rot_aprs a where ${s.sql} and ($4='' or a.regional_id=$4)
   order by a.created_at desc,a.id desc limit 10 offset $5`, [...s.params,regional,(page-1)*10]);
  const {rows:counts} = await db.query(`select count(*)::int as total from rot_aprs a where ${s.sql} and ($4='' or a.regional_id=$4)`, [...s.params,regional]);
  res.json({ok:true,items:rows,total:counts[0].total,page});
 } catch(e) { next(e); }
});
router.get("/:id/photos/:photoId", async(req,res,next) => {
 try {
  const s=access(req);
  const {rows} = await db.query(`select p.mime,p.data from rot_apr_photos p join rot_aprs a on a.id=p.apr_id
   where ${s.sql} and a.id=$4 and p.id=$5`, [...s.params,req.params.id,req.params.photoId]);
  if(!rows[0]) fail(404,"Foto não encontrada.");
  res.set("Content-Type",rows[0].mime).set("X-Content-Type-Options","nosniff").send(rows[0].data);
 } catch(e) { next(e); }
});
router.get("/:id", async(req,res,next) => {
 try {
  const s=access(req);
  const {rows} = await db.query(`select a.* from rot_aprs a where ${s.sql} and a.id=$4`, [...s.params,req.params.id]);
  if(!rows[0]) fail(404,"APR não encontrada.");
  const {rows:photos} = await db.query("select id,mime from rot_apr_photos where apr_id=$1 order by created_at,id",[req.params.id]);
  res.json({ok:true,item:{...rows[0],photos}});
 } catch(e) { next(e); }
});
router.post("/", createLimit, (req,res,next) => upload.array("photos",10)(req,res,e => {
 if(e) return res.status(400).json({ok:false,error:"Envie de 1 a 10 fotos JPEG/PNG, de até 4 MB cada."});
 next();
}), async(req,res,next) => {
 let client;
 try {
  let body; try { body=JSON.parse(req.body.payload); } catch { fail(400,"Formulário inválido."); }
  const value=validateApr(body);
  const photos=(req.files || []).map(file => ({file,mime:validatePhoto(file)}));
  if(!photos.length) fail(400,"Anexe pelo menos 1 imagem na APR.");
  const scope=scopeRegionalFilter(req);
  const regionalId=scope || String(body.regionalId || "");
  if (scope && body.regionalId !== scope) fail(403,"Regional não autorizada.");
  client=await db.connect();
  await client.query("begin");
  const {rows:regionals}=await client.query("select id, nome as name from regionais where id=$1",[regionalId]);
  if(!regionals[0]) fail(400,"Regional inválida.");
  const leads=await managers(client,regionals[0].id);
  const id=randomId("apr");
  await client.query(`insert into rot_aprs
   (id,author_id,author_name,regional_id,regional_name,manager_ids,manager_names,participants,activity_date,ticket,answers,missing_ppe,observations,latitude,longitude,accuracy,location_at,risk_status)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18)`,
   [id,req.rotUser.id,req.rotUser.name,regionalId,regionals[0].name,leads.map(u=>u.id),leads.map(u=>u.name),
    value.participants,value.date,value.ticket,JSON.stringify(value.answers),JSON.stringify(value.missing),value.observations,
    value.location.lat,value.location.lng,value.location.accuracy,value.location.capturedAt,value.status]);
  for(const {file,mime} of photos) await client.query("insert into rot_apr_photos(id,apr_id,mime,data) values($1,$2,$3,$4)",[randomId("photo"),id,mime,file.buffer]);
  let recipients=leads.map(u=>u.id);
  if(!recipients.length) {
   const {rows}=await client.query("select id from rot_users where role_id='site_admin' and status='ativo'");
   recipients=rows.map(u=>u.id);
  }
  for(const recipient of recipients) await client.query("insert into rot_apr_alerts(apr_id,user_id) values($1,$2) on conflict do nothing",[id,recipient]);
  await client.query(`insert into rot_audit_logs(user_id,user_name,action,entity,entity_id,after_data)
   values($1,$2,'create','rot_aprs',$3,$4::jsonb)`,[req.rotUser.id,req.rotUser.name,id,JSON.stringify({riskStatus:value.status,regionalId,photoCount:photos.length})]);
  await client.query("commit");
  res.status(201).json({ok:true,id,riskStatus:value.status,managerMissing:!leads.length});
 } catch(e) { if(client) await client.query("rollback").catch(()=>{}); next(e); }
 finally { client?.release(); }
});
module.exports = router;
module.exports.access = access;

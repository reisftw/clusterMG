// Explicit opt-in: all schema/data changes are rolled back in an isolated transaction.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const db=require("../src/db");
async function main(){
 if(process.env.ROT_APR_TEST_TRANSACTION!=="1")throw new Error("Set ROT_APR_TEST_TRANSACTION=1 to run isolated tests.");
 const client=await db.connect();let server;const originalQuery=db.query,originalConnect=db.connect;
 try{
  await client.query("begin");
  const schema="apr_validation_"+process.pid;
  await client.query('create schema "'+schema+'"');
  await client.query('set local search_path to "'+schema+'"');
  await client.query(`create table rot_roles(id text primary key,active boolean);
   create table rot_users(id text primary key,name text,role_id text,status text);
   create table rot_regionals(id text primary key,name text,responsaveis jsonb);
   create table rot_audit_logs(user_id text,user_name text,action text,entity text,entity_id text,after_data jsonb);
   insert into rot_roles values('staff',true),('site_admin',true);
   insert into rot_users values('author','Autor Teste','staff','ativo'),('manager','Gestor Teste','staff','ativo'),('other','Outro','staff','ativo');
   insert into rot_regionals values('r1','Regional Teste','[{"type":"supervisor_field","userId":"manager"}]'),('r2','Outra Regional','[]');`);
  await client.query(await fs.readFile(path.join(__dirname,"../sql/015_rot_apr.sql"),"utf8"));
  db.query=(...args)=>client.query(...args);
  db.connect=async()=>({query:(sql,params)=>client.query(sql==="begin"?"savepoint request_test":sql==="commit"?"release savepoint request_test":sql==="rollback"?"rollback to savepoint request_test":sql,params),release(){}});
  const auth=require("../src/auth/middleware");
  const actors={
   author:{id:"author",name:"Autor Teste",regional_id:"r1",permissions:[]},
   manager:{id:"manager",name:"Gestor Teste",regional_id:"r1",permissions:[]},
   other:{id:"other",name:"Outro",regional_id:"r1",permissions:[]},
   foreign:{id:"other",name:"Outro",regional_id:"r2",permissions:["rot.apr.view"]},
  };
  auth.requireRotAuth=(req,res,next)=>{req.rotUser=actors[req.headers["x-test-actor"]||"author"];next();};
  const express=require("express");const app=express();app.use(express.json());app.use("/apr",require("../src/apr/routes"));
  app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
  const base="http://127.0.0.1:"+server.address().port+"/apr";
  const checklist=require("../"+"../shared/aprChecklist.json");
  const payload={regionalId:"r1",author_id:"forged",manager_ids:["forged"],participants:"Time de teste",date:"2026-09-13",ticket:"TEST-APR",
   answers:{...Object.fromEntries(checklist.questions.map(q=>[q.id,q.id==="rain"?1:0])),fallEquipment:["Cinto de segurança","Talabartes","Trava-quedas"]},missingPpe:[],observations:"",location:{lat:-19,lng:-44,accuracy:5,capturedAt:new Date().toISOString()},confirmed:true};
  async function post(body){const form=new FormData();form.set("payload",JSON.stringify(body));form.append("photos",new Blob([Buffer.from([255,216,255,217])],{type:"image/jpeg"}),"test.jpg");return fetch(base,{method:"POST",body:form});}
  let r=await post({...payload,regionalId:"r2"});assert.equal(r.status,403);
  r=await post(payload);assert.equal(r.status,201,await r.clone().text());const {id}=await r.json();
  r=await fetch(base+"/"+id);assert.equal(r.status,200);const {item}=await r.json();
  assert.equal(item.author_id,"author");assert.deepEqual(item.manager_ids,["manager"]);assert.equal(item.photos.length,1);
  for(const actor of ["other","foreign"]){r=await fetch(base+"/"+id,{headers:{"x-test-actor":actor}});assert.equal(r.status,404);}
  r=await fetch(base+"/"+id,{headers:{"x-test-actor":"manager"}});assert.equal(r.status,200);
  r=await fetch(base+"/alerts",{headers:{"x-test-actor":"manager"}});assert.equal((await r.json()).items.length,1);
  r=await fetch(base+"/"+id+"/photos/"+item.photos[0].id,{headers:{"x-test-actor":"other"}});assert.equal(r.status,404);
  r=await fetch(base+"/"+id+"/photos/"+item.photos[0].id);assert.equal(r.status,200);
  r=await fetch(base+"/"+id+"/acknowledge",{method:"POST",headers:{"x-test-actor":"manager"}});assert.equal(r.status,200);
  r=await fetch(base+"/alerts",{headers:{"x-test-actor":"manager"}});assert.equal((await r.json()).items.length,0);
  const row=await client.query("select count(*)::int as count from rot_audit_logs");assert.equal(row.rows[0].count,1);
  console.log("PASS PostgreSQL/API: schema, transaction, author/manager identity, regional isolation, private photos, alerts and audit.");
 } finally {
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  db.query=originalQuery;db.connect=originalConnect;
  await client.query("rollback");client.release();await db.closePool();
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});


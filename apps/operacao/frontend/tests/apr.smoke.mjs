import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const root=path.join(os.tmpdir(),"rot-apr-smoke");await fs.mkdir(root,{recursive:true});
const checklist=JSON.parse(await fs.readFile(new URL("../../shared/aprChecklist.json",import.meta.url),"utf8"));
const browser=await chromium.launch({headless:true,channel:"chrome"});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},geolocation:{latitude:-19.92,longitude:-43.94,accuracy:8},permissions:["geolocation"],acceptDownloads:true});
 await context.addInitScript(()=>localStorage.setItem("rot-auth-token","local-test-only"));
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 let saved=null;let rompimento=null;
 const photo=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=400;c.height=250;const x=c.getContext("2d");x.fillStyle="#075985";x.fillRect(0,0,400,250);x.fillStyle="white";x.font="28px sans-serif";x.fillText("FOTO DE TESTE APR",30,125);return c.toDataURL("image/png").split(",")[1];});
 await page.route("http://localhost:5185/api/**",async route=>{
  const url=new URL(route.request().url());let data={ok:true,items:[],config:{}};
  if(url.pathname==="/api/auth/me")data={ok:true,user:{id:"test-author",name:"Colaborador Teste APR",isAdmin:true,isGlobal:true,regionalId:"r1",permissions:["*"]}};
  if(url.pathname==="/api/admin/apr/metadata")data={ok:true,items:[{id:"r1",name:"Regional Teste",managers:[{id:"manager",name:"Gestor Teste"}]}]};
  if(url.pathname==="/api/admin/apr"&&route.request().method()==="POST"){
   const body=route.request().postData();const match=body.match(/name="payload"\r\n\r\n([\s\S]*?)\r\n--/);assert.ok(match,"multipart payload");
   const p=JSON.parse(match[1]);assert.equal(p.location.lat,-19.92);assert.equal(p.answers.rain,1);
   saved={id:"apr-test",author_name:"Colaborador Teste APR",regional_name:"Regional Teste",manager_names:["Gestor Teste"],participants:p.participants,activity_date:p.date,ticket:p.ticket,answers:p.answers,missing_ppe:p.missingPpe,observations:p.observations,latitude:p.location.lat,longitude:p.location.lng,accuracy:8,location_at:p.location.capturedAt,created_at:new Date().toISOString(),risk_status:"sem_impedimento_informado",photos:[{id:"photo-test",mime:"image/png"}],photo_count:1};
   data={ok:true,id:saved.id};
  } else if(url.pathname==="/api/admin/apr")data={ok:true,items:saved?[saved]:[],total:saved?1:0};
  if(url.pathname==="/api/admin/apr/apr-test")data={ok:true,item:saved};
  if(url.pathname.endsWith("/photos/photo-test"))return route.fulfill({status:200,contentType:"image/png",body:Buffer.from(photo,"base64")});
  if(url.pathname==="/api/admin/regionals")data={ok:true,items:[{id:"r1",name:"Regional Teste"}]};
  if(url.pathname==="/api/admin/rompimentos"&&route.request().method()==="POST"){rompimento=route.request().postDataJSON();data={ok:true,rompimento:{...rompimento,id:"test-romp",createdAt:new Date().toISOString(),distanciaBase:0}};}
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
 });
 await page.goto("http://localhost:5185/apr");
 await page.waitForLoadState("networkidle");
 await page.getByRole("button",{name:"Preencher APR",exact:true}).click();
 await page.getByLabel("Número do TICKET").fill("APR-TESTE-123");
 await page.getByLabel("Nome completo dos colaboradores").fill("Colaborador Teste APR; Participante Dois");
 await page.getByRole("button",{name:"Capturar minha localização"}).click();
 await page.getByText("precisão ±8 m",{exact:false}).waitFor();
 for(const q of checklist.questions)await page.locator('input[name="'+q.id+'"]').nth(q.id==="rain"?1:0).check();
 for(const name of ["Cinto de segurança","Talabartes","Trava-quedas"])await page.getByRole("checkbox",{name,exact:true}).check();
 await page.getByLabel("Observações adicionais").fill("Teste de exportação e segurança.");
 await page.locator('input[type="file"]').setInputFiles({name:"teste.png",mimeType:"image/png",buffer:Buffer.from(photo,"base64")});
 await page.getByRole("checkbox",{name:"Li as orientações",exact:false}).check();
 await page.screenshot({path:path.join(root,"apr-form-desktop.png"),fullPage:true});
 await page.getByRole("button",{name:"Registrar APR",exact:true}).click();
 await page.getByRole("button",{name:"Baixar PDF",exact:true}).waitFor();
 for(const format of ["PDF","DOCX"]){
  const wait=page.waitForEvent("download");await page.getByRole("button",{name:"Baixar "+format,exact:true}).click();const d=await wait;await d.saveAs(path.join(root,"apr-test."+format.toLowerCase()));
 }
 await page.screenshot({path:path.join(root,"apr-detail-desktop.png"),fullPage:true});
 await page.setViewportSize({width:375,height:812});
 await page.screenshot({path:path.join(root,"apr-detail-mobile.png"),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"mobile overflow");
 await page.getByRole("button",{name:"Fechar",exact:true}).click();
 await page.getByRole("button",{name:"Preencher APR",exact:true}).click();
 await page.locator('input[name="rain"]').first().check();
 await page.getByRole("status").filter({hasText:"INTERROMPER A ATIVIDADE"}).waitFor();
 await page.screenshot({path:path.join(root,"apr-risk-mobile.png"),fullPage:true});
 await page.getByRole("button",{name:"Cancelar",exact:true}).click();
 await page.goto("http://localhost:5185/rompimentos");
 await page.getByRole("button",{name:"Novo Rompimento"}).click();
 await page.getByLabel("Cliente",{exact:true}).fill("Teste Pontos A e B");
 await page.getByRole("button",{name:"Marcar ponto A (início)",exact:true}).click();
 await page.getByRole("button",{name:"Marcar novamente ponto A",exact:true}).waitFor();
 await context.setGeolocation({latitude:-19.93,longitude:-43.95,accuracy:8});
 await page.getByRole("button",{name:"Marcar ponto B (fim)",exact:true}).click();
 await page.getByRole("button",{name:"Marcar novamente ponto B",exact:true}).waitFor();
 await page.getByRole("button",{name:"Criar rompimento",exact:true}).click();
 await page.getByRole("link",{name:"Rota entre A e B"}).waitFor();
 assert.equal(rompimento.pontoA.lat,-19.92);assert.equal(rompimento.pontoB.lat,-19.93);
 assert.deepEqual(errors,[]);
 console.log("PASS: APR form, GPS, photos, PDF/DOCX, mobile risk and original A/B GPS workflow. Artifacts: "+root);
} finally {await browser.close();}

const {test}=require("node:test");
const assert=require("node:assert/strict");
const {validateApr,validatePhoto}=require("./validation");
const checklist=require("../../../shared/aprChecklist.json");
function fixture(){return {participants:"Colaborador de teste",ticket:"APR-TEST",date:"2026-09-13",answers:{...Object.fromEntries(checklist.questions.map(q=>[q.id,q.id==="rain"?1:0])),fallEquipment:["Cinto de segurança","Talabartes","Trava-quedas"]},missingPpe:[],observations:"",location:{lat:-19,lng:-44,accuracy:8,capturedAt:new Date().toISOString()},confirmed:true};}
test("complete checklist records without claiming approval",()=>assert.equal(validateApr(fixture()).status,"sem_impedimento_informado"));
test("every immediate-stop answer is enforced by backend",()=>{
 for(const q of checklist.questions)for(const answer of q.stop){const f=fixture();f.answers[q.id]=answer;assert.equal(validateApr(f).status,"interromper",q.id);}
});
test("every required verification is enforced",()=>{
 for(const q of checklist.questions)for(const answer of q.verify){const f=fixture();f.answers[q.id]=answer;if(q.id==="allPpe")f.missingPpe=[checklist.ppe[0]];assert.equal(validateApr(f).status,"verificar",q.id);}
});
test("rejects missing answers, false dates, fabricated status and unverified fall protection",()=>{
 const f=fixture();f.date="2026-02-30";assert.throws(()=>validateApr(f),{status:400});
 const g=fixture();delete g.answers.training;assert.throws(()=>validateApr(g),{status:400});
 const h=fixture();h.answers.fallEquipment=[];assert.throws(()=>validateApr(h),{status:400});
 const k=fixture();k.status="approved";k.answers.rain=0;assert.equal(validateApr(k).status,"interromper");
});
test("missing PPE selection is mandatory and cannot contradict having all PPE",()=>{
 const f=fixture();f.answers.allPpe=1;assert.throws(()=>validateApr(f),{status:400});
 f.missingPpe=[checklist.ppe[0]];assert.equal(validateApr(f).missing.length,1);
 f.answers.allPpe=0;assert.throws(()=>validateApr(f),{status:400});
});
test("GPS must be finite, bounded and fresh; acknowledgements mandatory",()=>{
 for(const location of [null,{lat:91,lng:0,accuracy:1},{lat:0,lng:0,accuracy:1,capturedAt:"2020-01-01"}]){const f=fixture();f.location=location;assert.throws(()=>validateApr(f),{status:400});}
 const f=fixture();f.confirmed=false;assert.throws(()=>validateApr(f),{status:400});
});
test("photo validation rejects disguised executable and oversize data",()=>{
 assert.throws(()=>validatePhoto({buffer:Buffer.from("<script>"),size:8}),{status:400});
 assert.equal(validatePhoto({buffer:Buffer.from([255,216,255,217]),size:4}),"image/jpeg");
 assert.throws(()=>validatePhoto({buffer:Buffer.from([255,216,255,217]),size:4194305}),{status:400});
});
module.exports={fixture};


import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, ShieldCheck, MapPin, Download, FileText, RefreshCw, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useRotAuth } from "../../state/RotAuthContext";
import ModalShell from "../../components/ui/ModalShell";
import { createApr, getApr, getAprMetadata, listAprs, getAprPhoto, acknowledgeApr } from "../../api/aprApi";
import { captureLocation } from "../../utils/captureLocation";
import { enqueueAprOffline, flushQueuedAprs, isNetworkFailure, queuedAprCount } from "../../utils/offlineAprQueue";
import checklist from "../../../../shared/aprChecklist.json";

const APR_METADATA_CACHE_KEY = "rot-apr-metadata-cache";
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm min-w-0";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50";
export const statusLabels = { interromper:"INTERROMPER A ATIVIDADE", verificar:"VERIFICAR ANTES DE INICIAR", sem_impedimento_informado:"Sem impedimento informado" };
const tones = { interromper:"border-red-300 bg-red-50 text-red-800", verificar:"border-amber-300 bg-amber-50 text-amber-900", sem_impedimento_informado:"border-emerald-300 bg-emerald-50 text-emerald-900" };
function today() { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
function Field({label,children}) { return <label className="block min-w-0 space-y-1"><span className="block text-sm font-semibold text-slate-700">{label}</span>{children}</label>; }
function Risk({status}) { return <div role="status" className={"rounded-lg border p-3 font-bold " + tones[status]}>{statusLabels[status]}<p className="mt-1 text-xs font-normal">O registro da APR não substitui a autorização para executar a atividade.</p></div>; }
export default function AprPage() {
 const [search,setSearch]=useSearchParams();
 const [items,setItems]=useState([]), [regions,setRegions]=useState([]), [page,setPage]=useState(1), [total,setTotal]=useState(0);
 const [regional,setRegional]=useState(""), [loading,setLoading]=useState(true), [error,setError]=useState(""), [info,setInfo]=useState(""), [newApr,setNewApr]=useState(false), [revision,setRevision]=useState(0), [queued,setQueued]=useState(0);
 useEffect(()=>{
  getAprMetadata().then(d=>{setRegions(d.items);window.localStorage.setItem(APR_METADATA_CACHE_KEY,JSON.stringify(d.items));}).catch(e=>{
   const cached=JSON.parse(window.localStorage.getItem(APR_METADATA_CACHE_KEY)||"[]");
   if(cached.length){setRegions(cached);setInfo("Você está offline. Usando regionais salvas neste aparelho.");}
   else setError(e.message);
  });
 },[]);
 useEffect(()=>{
  let active=true;
  const refresh=()=>queuedAprCount().then(count=>{if(active)setQueued(count);});
  const sync=()=>flushQueuedAprs(createApr).then(({sent,pending})=>{if(!active)return;setQueued(pending);if(sent){setInfo(`${sent} APR(s) offline sincronizada(s).`);setRevision(v=>v+1);}}).catch(()=>refresh());
  refresh();sync();
  window.addEventListener("online",sync);
  window.addEventListener("rot-apr-offline-queue-changed",refresh);
  return()=>{active=false;window.removeEventListener("online",sync);window.removeEventListener("rot-apr-offline-queue-changed",refresh);};
 },[]);
 useEffect(()=>{if(search.get("novo")==="1"||search.get("new")==="1")setNewApr(true);},[search]);
 useEffect(()=>{
  let active=true; setLoading(true); setError("");
  listAprs(page,regional).then(d=>{if(active){setItems(d.items);setTotal(d.total);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[page,regional,revision]);
 return <div className="space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="flex items-center gap-2 text-2xl font-black"><ShieldCheck/> APR</h1><p className="text-sm text-slate-600">Análise Preliminar de Risco</p></div>
   <div className="flex flex-wrap gap-2"><button title="Atualizar" className={buttonClass} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={18}/></button><button className={buttonClass+" rot-apr-primary-button"} onClick={()=>setNewApr(true)}><Plus size={18}/><span>Preencher APR</span></button></div>
  </header>
  <select aria-label="Filtrar regional" className={inputClass+" sm:max-w-xs"} value={regional} onChange={e=>{setRegional(e.target.value);setPage(1);}}><option value="">Todas as regionais permitidas</option>{regions.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
  {error && <p role="alert" className="text-red-700">{error}</p>}
  {info && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{info}</p>}
  {queued>0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{queued} APR(s) salva(s) offline aguardando internet para sincronizar.</p>}
  {loading ? <p>Carregando APRs...</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(a=><article key={a.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
   <div><h2 className="font-bold break-words">Ticket {a.ticket}</h2><p className="text-sm break-words">{a.author_name}</p><p className="text-xs text-slate-500">{a.regional_name} · {String(a.activity_date).slice(0,10).split("-").reverse().join("/")}</p></div>
   <Risk status={a.risk_status}/><p className="text-sm">Gestor: {a.manager_names.join(", ") || "Não cadastrado — administração alertada"}</p>
   <div className="flex flex-wrap gap-3 text-sm"><a className="text-blue-700 underline" href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer">Localização</a><span>{a.photo_count} foto(s)</span></div>
   <button className={buttonClass+" w-full"} onClick={()=>setSearch({apr:a.id})}><FileText size={16}/>Ver APR / baixar PDF e DOCX</button>
  </article>)}</div>}
  {!loading && !items.length && <p className="py-8 text-center text-slate-500">Nenhuma APR disponível neste filtro.</p>}
  <div className="flex items-center justify-end gap-3 text-sm"><span>{total} registro(s) · Página {page}</span><button title="Página anterior" className={buttonClass} disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><button title="Próxima página" className={buttonClass} disabled={page*10>=total} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div>
  {newApr && <AprForm regions={regions} onClose={()=>setNewApr(false)} onSaved={id=>{setNewApr(false);setPage(1);setRevision(v=>v+1);setSearch({apr:id});}} onQueued={()=>{setNewApr(false);setInfo("APR salva offline. Ela será enviada automaticamente quando a internet voltar.");queuedAprCount().then(setQueued);}}/>}
  {search.get("apr") && <AprDetail id={search.get("apr")} onClose={()=>setSearch({})}/>}
 </div>;
}
function AprForm({regions,onClose,onSaved,onQueued}) {
 const {user}=useRotAuth();
 const [participants,setParticipants]=useState(""), [date,setDate]=useState(today()), [regionalId,setRegionalId]=useState(user.regionalId || regions[0]?.id || "");
 const [ticket,setTicket]=useState(""), [answers,setAnswers]=useState({}), [missingPpe,setMissingPpe]=useState([]), [observations,setObservations]=useState("");
 const [location,setLocation]=useState(null), [gps,setGps]=useState(false), [photos,setPhotos]=useState([]), [confirmed,setConfirmed]=useState(false);
 const [saving,setSaving]=useState(false), [error,setError]=useState("");
 const managerNames=regions.find(r=>r.id===regionalId)?.managers.map(u=>u.name).join(", ");
 let status="sem_impedimento_informado";
 for(const q of checklist.questions){if(q.stop.includes(answers[q.id]))status="interromper";else if(q.verify.includes(answers[q.id])&&status!=="interromper")status="verificar";}
 const answered=checklist.questions.filter(q=>answers[q.id]!==undefined).length;
 async function locate(){setGps(true);setError("");try{setLocation(await captureLocation());}catch(e){setError(e.message);}finally{setGps(false);}}
 async function submit(e){
  e.preventDefault();setError("");
  if(!location){setError("Capture a localização antes de registrar.");return;}
  if(!photos.length){setError("Anexe pelo menos 1 imagem na APR.");return;}
  if(answers.allPpe===1&&!missingPpe.length){setError("Marque os EPIs que não possui.");return;}
  setSaving(true);
  const payload={participants,date,regionalId,ticket,answers,missingPpe,observations,location,confirmed};
  try{const result=await createApr(payload,photos);onSaved(result.id);}
  catch(e){if(isNetworkFailure(e)){await enqueueAprOffline(payload,photos);onQueued();return;}setError(e.message);}finally{setSaving(false);}
 }
 return <ModalShell open title="Preencher APR" size="4xl" onClose={saving?()=>{}:onClose}>
  <form onSubmit={submit} className="space-y-5">
   <fieldset disabled={saving} className="space-y-5 min-w-0">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Nome completo de quem preenche"><input className={inputClass+" bg-slate-100"} readOnly value={user.name}/></Field>
     <Field label="Data *"><input className={inputClass} type="date" required value={date} onChange={e=>setDate(e.target.value)}/></Field>
     <Field label="Regional *"><select className={inputClass} required value={regionalId} onChange={e=>setRegionalId(e.target.value)}><option value="">Selecione</option>{regions.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
     <Field label="Gestor imediato"><input readOnly className={inputClass+" bg-slate-100"} value={managerNames || "Não cadastrado — administração será alertada"}/></Field>
     <Field label="Número do TICKET *"><input className={inputClass} maxLength={100} required value={ticket} onChange={e=>setTicket(e.target.value)}/></Field>
    </div>
    <Field label="Nome completo dos colaboradores ou time participante: inclua todos os envolvidos *"><textarea className={inputClass} required maxLength={2000} rows={3} value={participants} onChange={e=>setParticipants(e.target.value)}/></Field>
    <div className="rounded-lg border border-slate-200 p-3"><button type="button" className={buttonClass} disabled={gps} onClick={locate}><MapPin size={18}/>{gps?"Obtendo GPS...":"Capturar minha localização"}</button>{location&&<p className="mt-2 text-sm break-words">{location.lat.toFixed(6)}, {location.lng.toFixed(6)} · precisão ±{Math.round(location.accuracy)} m · {new Date(location.capturedAt).toLocaleTimeString("pt-BR")}</p>}</div>
    {checklist.questions.map((q,index)=><fieldset key={q.id} className="space-y-2 border-b border-slate-200 pb-4">
     <legend className="mb-2 font-semibold text-slate-900">{index+1}. {q.label} *</legend>
     {q.help&&<p className="text-sm font-medium text-red-700">{q.help}</p>}
     {q.options.map((option,i)=><label key={i} className="flex cursor-pointer items-start gap-2 text-sm"><input className="mt-1 shrink-0" type="radio" name={q.id} required checked={answers[q.id]===i} onChange={()=>{setAnswers(a=>({...a,[q.id]:i}));if(q.id==="allPpe"&&i===0)setMissingPpe([]);}}/><span>{option}</span></label>)}
     {q.id==="fallProtection"&&answers.fallProtection===0&&<div className="space-y-2 pl-4">{["Cinto de segurança","Talabartes","Trava-quedas"].map(p=><label key={p} className="flex gap-2 text-sm"><input type="checkbox" required checked={(answers.fallEquipment||[]).includes(p)} onChange={e=>setAnswers(a=>({...a,fallEquipment:e.target.checked?[...(a.fallEquipment||[]),p]:(a.fallEquipment||[]).filter(v=>v!==p)}))}/>{p}</label>)}</div>}
     {q.id==="allPpe"&&(answers.allPpe===1?<div className="mt-3 space-y-2 border-l-2 border-amber-400 pl-3"><p className="text-sm font-bold">Marque os EPIs que não possui *</p>{checklist.ppe.map(p=><label key={p} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={missingPpe.includes(p)} onChange={e=>setMissingPpe(v=>e.target.checked?[...v,p]:v.filter(x=>x!==p))}/>{p}</label>)}</div>:answers.allPpe===0?<p className="text-sm text-emerald-700">Tenho todos corretamente.</p>:null)}
    </fieldset>)}
    <Field label="Observações adicionais / risco imediato (opcional)"><textarea rows={3} className={inputClass} maxLength={4000} value={observations} onChange={e=>setObservations(e.target.value)}/></Field>
    <Field label="Anexar fotos * (1 a 10, JPEG/PNG, 4 MB cada)"><input className={inputClass} type="file" multiple accept="image/jpeg,image/png" onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length+photos.length>10||files.some(f=>f.size>4194304)){setError("Limite: 10 fotos de até 4 MB cada.");e.target.value="";return;}setPhotos(p=>[...p,...files]);e.target.value="";}}/></Field>
    {!photos.length&&<p className="text-sm font-bold text-red-700">Obrigatório anexar pelo menos 1 imagem.</p>}
    <div className="space-y-1">{photos.map((p,i)=><div key={i} className="flex items-center justify-between gap-2 text-sm"><span className="break-all">{p.name}</span><button type="button" title="Remover foto" className={buttonClass} onClick={()=>setPhotos(v=>v.filter((_,n)=>n!==i))}><X size={15}/></button></div>)}</div>
    {answered>0&&<Risk status={status}/>}
    <p className="text-sm font-bold">{checklist.notice}</p>
    <label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/><span>Li as orientações e estou ciente das interrupções e verificações indicadas.</span></label>
   </fieldset>
   {error&&<p role="alert" className="text-red-700 font-semibold">{error}</p>}
   <div className="flex flex-wrap justify-end gap-2 border-t pt-3"><button type="button" className={buttonClass} disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className={buttonClass+" rot-apr-primary-button"} disabled={saving||gps}><span>{saving?"Registrando...":status==="interromper"?"Registrar APR — atividade interrompida":"Registrar APR"}</span></button></div>
  </form>
 </ModalShell>;
}
function AprDetail({id,onClose}) {
 const [item,setItem]=useState(null), [error,setError]=useState(""), [busy,setBusy]=useState(""), [mapOpen,setMapOpen]=useState(false);
 useEffect(()=>{let active=true;getApr(id).then(d=>{if(active)setItem(d.item);return acknowledgeApr(id);}).then(()=>window.dispatchEvent(new Event("rot-apr-alerts"))).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
 async function download(format){setBusy(format);setError("");try{const {exportApr}=await import("../../utils/exportApr");await exportApr(item,format);}catch(e){setError(e.message||"Falha ao exportar.");}finally{setBusy("");}}
 return <ModalShell title={item?"APR · Ticket "+item.ticket:"APR"} size="4xl" onClose={onClose}>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {!item?<p>Carregando...</p>:<div className="space-y-4">
   <Risk status={item.risk_status}/>
   <div className="grid gap-2 text-sm sm:grid-cols-2"><p><b>Preenchido por:</b> {item.author_name}</p><p><b>Data:</b> {String(item.activity_date).slice(0,10)}</p><p><b>Regional:</b> {item.regional_name}</p><p><b>Gestor:</b> {item.manager_names.join(", ")||"Não cadastrado"}</p></div>
   <p className="whitespace-pre-wrap text-sm"><b>Participantes:</b> {item.participants}</p>
   <button type="button" className={buttonClass+" text-blue-700"} onClick={()=>setMapOpen(true)}><MapPin size={16}/>Localização: {item.latitude}, {item.longitude} (±{Math.round(item.accuracy)} m)</button>
   <p className="text-xs text-slate-500">Capturada em {new Date(item.location_at).toLocaleString("pt-BR")} · Registro em {new Date(item.created_at).toLocaleString("pt-BR")}</p>
   <dl className="space-y-3">{checklist.questions.map(q=><div key={q.id} className="border-b pb-2"><dt className="text-sm font-semibold">{q.label}</dt><dd className="text-sm mt-1">{q.options[item.answers[q.id]]}</dd></div>)}</dl>
   <p className="text-sm"><b>EPIs ausentes:</b> {item.missing_ppe.join(", ")||"Tenho todos corretamente."}</p>
   <p className="whitespace-pre-wrap text-sm"><b>Observações:</b> {item.observations||"Nenhuma."}</p>
   <div className="grid gap-3 sm:grid-cols-2">{item.photos.map(p=><AprPhoto key={p.id} aprId={item.id} photoId={p.id}/>)}</div>
   <p className="text-sm font-bold">{checklist.notice}</p>
   <div className="flex flex-wrap gap-2">{["pdf","docx"].map(f=><button key={f} disabled={!!busy} className={buttonClass} onClick={()=>download(f)}><Download size={16}/>{busy===f?"Gerando...":"Baixar "+f.toUpperCase()}</button>)}</div>
  </div>}
  {item&&mapOpen&&<AprMapModal item={item} onClose={()=>setMapOpen(false)}/>}
 </ModalShell>;
}
function AprMapModal({item,onClose}) {
 const lat=Number(item.latitude), lng=Number(item.longitude);
 const query=`${lat},${lng}`;
 const mapsUrl=`https://www.google.com/maps?q=${encodeURIComponent(query)}`;
 const embedUrl=`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=17&output=embed`;
 return <ModalShell open title="Localização da APR" description={`Ticket ${item.ticket} · precisão ±${Math.round(item.accuracy)} m`} size="3xl" onClose={onClose}>
  <div className="space-y-3">
   <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
    <iframe title="Mapa da localização da APR" src={embedUrl} className="h-[min(62vh,480px)] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"/>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <p className="font-semibold text-slate-700">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
    <a className={buttonClass+" text-blue-700"} href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Abrir no Google Maps</a>
   </div>
  </div>
 </ModalShell>;
}
function AprPhoto({aprId,photoId}) {
 const [src,setSrc]=useState(""),[error,setError]=useState(false);
 useEffect(()=>{let active=true,url;getAprPhoto(aprId,photoId).then(b=>{if(active){url=URL.createObjectURL(b);setSrc(url);}}).catch(()=>setError(true));return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[aprId,photoId]);
 return error?<p>Foto indisponível.</p>:src?<img src={src} alt="Foto anexada à APR" className="h-64 w-full rounded-lg border object-contain"/>:<p>Carregando foto...</p>;
}

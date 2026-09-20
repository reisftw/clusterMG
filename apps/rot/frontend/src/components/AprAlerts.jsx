import { useEffect,useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { getAprAlerts } from "../api/aprApi";
export default function AprAlerts(){
 const [items,setItems]=useState([]),[open,setOpen]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;
  const load=()=>{if(document.hidden)return;getAprAlerts().then(d=>{if(active){setItems(d.items);setFailed(false);}}).catch(()=>{if(active)setFailed(true);});};
  load();const timer=setInterval(load,30000);window.addEventListener("rot-apr-alerts",load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener("rot-apr-alerts",load);};
 },[]);
 return <div className="relative shrink-0">
  <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label="Alertas de APR" title="Alertas de APR" className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-blue-900"><ShieldAlert size={21}/>{items.length>0&&<span className="absolute -top-1 -right-1 rounded-full bg-red-600 px-1 text-xs text-white">{items.length===50?"50+":items.length}</span>}</button>
  {open&&<><div className="absolute right-0 top-12 z-50 w-[min(19rem,calc(100vw-2rem))] max-h-80 overflow-y-auto rounded-lg border bg-white p-3 shadow-xl">
   <h3 className="font-bold mb-2">APRs recebidas</h3>{failed&&<p role="alert" className="text-sm text-red-700">Não foi possível atualizar os alertas.</p>}{!items.length&&!failed&&<p className="text-sm text-slate-500">Nenhum alerta pendente.</p>}
   {items.map(a=><Link key={a.id} onClick={()=>setOpen(false)} to={"/apr?apr="+encodeURIComponent(a.id)} className="block border-t py-3 text-sm"><b className="block break-words">{a.author_name}</b><span>Ticket {a.ticket}</span>{a.risk_status!=="sem_impedimento_informado"&&<span className="block text-red-700 font-bold">{a.risk_status==="interromper"?"Interromper atividade":"Verificação pendente"}</span>}</Link>)}
  </div></>}
 </div>;
}

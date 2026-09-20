import checklist from "../../../shared/aprChecklist.json";
import { getAprPhoto } from "../api/aprApi";
const LOGO_URL="/sempre-logo-documento.webp";
const statusLabels={interromper:"INTERROMPER A ATIVIDADE",verificar:"VERIFICAR ANTES DE INICIAR",sem_impedimento_informado:"Sem impedimento informado"};
const statusColors={interromper:[220,38,38],verificar:[217,119,6],sem_impedimento_informado:[5,150,105]};
function save(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function imageData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
async function dimensions(src){const img=new Image();img.src=src;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};}
function short(value,max=120){const text=String(value||"").replace(/\s+/g," ").trim();return text.length>max?text.slice(0,max-1)+"…":text;}
function formatDate(value){return String(value||"").slice(0,10).split("-").reverse().join("/");}
async function loadLogo(){
 const response=await fetch(LOGO_URL,{cache:"force-cache"});
 if(!response.ok)throw new Error("Logo da Sempre nao encontrada para gerar o documento.");
 const blob=await response.blob();
 const data=await imageData(blob);
 return {blob,data,...await dimensions(data)};
}
export async function exportApr(item,format){
 const logo=await loadLogo();
 const photos=[];
 for(const p of item.photos){const blob=await getAprPhoto(item.id,p.id);const data=await imageData(blob);photos.push({blob,data,...await dimensions(data)});}
 const filename="APR-"+item.id;
 if(format==="pdf"){
  const {jsPDF}=await import("jspdf");const doc=new jsPDF({unit:"mm",format:"a4"});
  const pageWidth=210,margin=12,contentWidth=pageWidth-margin*2,statusColor=statusColors[item.risk_status]||statusColors.sem_impedimento_informado;
  doc.setFillColor(248,250,252);doc.rect(0,0,210,297,"F");
  doc.setFillColor(255,255,255);doc.roundedRect(margin,10,contentWidth,274,4,4,"F");
  doc.setDrawColor(226,232,240);doc.roundedRect(margin,10,contentWidth,274,4,4,"S");
  const logoWidth=22;const logoHeight=logo.height*(logoWidth/logo.width);
  doc.addImage(logo.data,logo.blob.type==="image/png"?"PNG":"JPEG",22,13,logoWidth,logoHeight);
  doc.setFont("helvetica","bold");doc.setFontSize(18);doc.setTextColor(15,23,42);doc.text("APR",55,23);
  doc.setFontSize(10);doc.setFont("helvetica","normal");doc.setTextColor(71,85,105);doc.text("Análise Preliminar de Risco · Operação",55,29);
  doc.setFillColor(...statusColor);doc.roundedRect(134,17,56,12,6,6,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(7.5);
  doc.text(statusLabels[item.risk_status],162,24.8,{align:"center",maxWidth:50});
  doc.setDrawColor(...statusColor);doc.setLineWidth(0.8);doc.line(margin,38,pageWidth-margin,38);

  const info=[
   ["Ticket",item.ticket],["Registro","#"+item.id],["Data",formatDate(item.activity_date)],["Regional",item.regional_name],
   ["Preenchido por",item.author_name],["Gestor",item.manager_names.join(", ")||"Não cadastrado"],["Participantes",item.participants],
   ["Localização",`${item.latitude}, ${item.longitude} · ±${Math.round(item.accuracy)} m`]
  ];
  const cardW=(contentWidth-8)/2;let y=45;
  for(let i=0;i<info.length;i++){
   const x=margin+6+(i%2)*(cardW+8);if(i%2===0&&i>0)y+=18;
   doc.setFillColor(248,250,252);doc.roundedRect(x,y,cardW,14,3,3,"F");
   doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(100,116,139);doc.text(info[i][0].toUpperCase(),x+3,y+5);
   doc.setFont("helvetica","bold");doc.setFontSize(8.3);doc.setTextColor(15,23,42);doc.text(short(info[i][1],48),x+3,y+10.2,{maxWidth:cardW-6});
  }

  y+=23;doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(15,23,42);doc.text("Checklist de segurança",margin+6,y);
  y+=5;const colW=(contentWidth-16)/2;const rowH=13.5;
  checklist.questions.forEach((q,index)=>{
   const col=index%2;const row=Math.floor(index/2);const x=margin+6+col*(colW+8);const yy=y+row*rowH;
   const answer=q.options[item.answers[q.id]]||"-";const isStop=q.stop.includes(item.answers[q.id]);const isVerify=q.verify.includes(item.answers[q.id]);
   doc.setFillColor(isStop?254:248,isStop?242:250,isStop?242:252);doc.setDrawColor(isStop?252:isVerify?253:226,isStop?165:isVerify?186:232,isStop?165:isVerify?116:240);
   doc.roundedRect(x,yy,colW,rowH-1.5,2,2,"FD");
   doc.setFont("helvetica","bold");doc.setFontSize(6.3);doc.setTextColor(51,65,85);doc.text(`${index+1}. ${short(q.label,62)}`,x+2,yy+4,{maxWidth:colW-4});
   doc.setFont("helvetica","normal");doc.setFontSize(6.1);doc.setTextColor(isStop?185:isVerify?146:15,isStop?28:isVerify?64:118,isStop?28:isVerify?14:110);
   doc.text(short(answer,76),x+2,yy+8.4,{maxWidth:colW-4});
  });
  y+=Math.ceil(checklist.questions.length/2)*rowH+4;
  const ppe=(item.answers.fallEquipment||[]).join(", ")||"Não verificados";
  const missing=item.missing_ppe.join(", ")||"Tenho todos corretamente.";
  const obs=item.observations||"Nenhuma.";
  const lowerY=Math.max(y,218);
  const notes=[["Proteção contra quedas",ppe],["EPIs ausentes",missing],["Observações",obs]];
  notes.forEach(([label,value],index)=>{
   const x=margin+6;const yy=lowerY+index*13;
   doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(71,85,105);doc.text(label.toUpperCase(),x,yy);
   doc.setFont("helvetica","normal");doc.setFontSize(7.2);doc.setTextColor(15,23,42);doc.text(short(value,82),x,yy+4.5,{maxWidth:86});
  });
  if(photos.length){
   const photoY=lowerY;
   const photoX=margin+106;
   doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(15,23,42);doc.text(`Fotos anexadas: ${photos.length}`,photoX,photoY);
   const thumbs=photos.slice(0,2);thumbs.forEach((p,index)=>{
    const x=photoX+index*32;const scale=Math.min(28/p.width,20/p.height);doc.addImage(p.data,p.blob.type==="image/png"?"PNG":"JPEG",x,photoY+4,p.width*scale,p.height*scale);
   });
   if(photos.length>2){doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(71,85,105);doc.text(`+${photos.length-2} foto(s) adicionais disponíveis no sistema.`,photoX,photoY+30);}
  }
  doc.setFillColor(239,246,255);doc.roundedRect(margin+6,263,contentWidth-12,12,3,3,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(6.8);doc.setTextColor(30,64,175);doc.text("SUA SEGURANÇA SEMPRE EM PRIMEIRO LUGAR.",margin+9,268);
  doc.setFont("helvetica","normal");doc.setFontSize(6.2);doc.text("Este registro documenta as respostas informadas pelo colaborador e não substitui a autorização para executar a atividade.",margin+9,272,{maxWidth:contentWidth-18});
  doc.setFontSize(6);doc.setTextColor(100,116,139);doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} · APR ${item.id}`,pageWidth-margin,291,{align:"right"});
  doc.save(filename+".pdf");return;
 }
 const {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel,Table,TableRow,TableCell,WidthType,AlignmentType,BorderStyle}=await import("docx");
 const docxBorder={style:BorderStyle.SINGLE,size:1,color:"E2E8F0"};
 const docxCell=(children,fill="FFFFFF",width=50)=>new TableCell({width:{size:width,type:WidthType.PERCENTAGE},margins:{top:80,bottom:80,left:100,right:100},shading:{fill},borders:{top:docxBorder,bottom:docxBorder,left:docxBorder,right:docxBorder},children});
 const docxText=(text,options={})=>new TextRun({text:String(text||""),font:"Arial",...options});
 const infoRows=[
  [["Ticket",item.ticket],["Registro","#"+item.id]],
  [["Data",formatDate(item.activity_date)],["Regional",item.regional_name]],
  [["Preenchido por",item.author_name],["Gestor",item.manager_names.join(", ")||"Não cadastrado"]],
  [["Participantes",short(item.participants,120)],["Localização",`${item.latitude}, ${item.longitude} · ±${Math.round(item.accuracy)} m`]]
 ];
 const checklistRows=[];
 for(let i=0;i<checklist.questions.length;i+=2)checklistRows.push([checklist.questions[i],checklist.questions[i+1]].filter(Boolean));
 const infoTable=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:infoRows.map(row=>new TableRow({children:row.flatMap(([label,value])=>[
  docxCell([new Paragraph({children:[docxText(label.toUpperCase(),{bold:true,size:14,color:"64748B"})]})],"F8FAFC",18),
  docxCell([new Paragraph({children:[docxText(short(value,70),{bold:true,size:16,color:"0F172A"})]})],"FFFFFF",32)
 ])}))});
 const checklistTable=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:checklistRows.map(row=>new TableRow({children:row.flatMap(q=>{
  const answer=q.options[item.answers[q.id]]||"-";const stop=q.stop.includes(item.answers[q.id]);const verify=q.verify.includes(item.answers[q.id]);
  return [
   docxCell([new Paragraph({children:[docxText(short(q.label,80),{bold:true,size:13,color:"334155"})]})],stop?"FEF2F2":verify?"FFFBEB":"F8FAFC",32),
   docxCell([new Paragraph({children:[docxText(short(answer,90),{size:13,color:stop?"B91C1C":verify?"92400E":"0F766E"})]})],"FFFFFF",18)
  ];
 })}))});
 const children=[
  new Paragraph({alignment:AlignmentType.CENTER,children:[new ImageRun({type:logo.blob.type==="image/png"?"png":"jpg",data:new Uint8Array(await logo.blob.arrayBuffer()),transformation:{width:120,height:Math.round(logo.height*(120/logo.width))}})]}),
  new Paragraph({heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER,spacing:{before:80,after:20},children:[docxText("APR - Análise Preliminar de Risco",{bold:true,size:28,color:"0F172A"})]}),
  new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:180},children:[docxText(statusLabels[item.risk_status],{bold:true,size:18,color:item.risk_status==="interromper"?"DC2626":item.risk_status==="verificar"?"D97706":"059669"})]}),
  infoTable,
  new Paragraph({spacing:{before:220,after:80},children:[docxText("Checklist de segurança",{bold:true,size:18,color:"0F172A"})]}),
  checklistTable,
  new Paragraph({spacing:{before:180,after:60},children:[docxText("Complementos",{bold:true,size:18,color:"0F172A"})]}),
  new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
   new TableRow({children:[docxCell([new Paragraph({children:[docxText("Proteção contra quedas",{bold:true,size:14,color:"64748B"})]})],"F8FAFC",28),docxCell([new Paragraph({children:[docxText(short((item.answers.fallEquipment||[]).join(", ")||"Não verificados",110),{size:14,color:"0F172A"})]})],"FFFFFF",72)]}),
   new TableRow({children:[docxCell([new Paragraph({children:[docxText("EPIs ausentes",{bold:true,size:14,color:"64748B"})]})],"F8FAFC",28),docxCell([new Paragraph({children:[docxText(short(item.missing_ppe.join(", ")||"Tenho todos corretamente.",120),{size:14,color:"0F172A"})]})],"FFFFFF",72)]}),
   new TableRow({children:[docxCell([new Paragraph({children:[docxText("Observações",{bold:true,size:14,color:"64748B"})]})],"F8FAFC",28),docxCell([new Paragraph({children:[docxText(short(item.observations||"Nenhuma.",140),{size:14,color:"0F172A"})]})],"FFFFFF",72)]})
  ]})
 ];
 if(photos.length){
  children.push(new Paragraph({spacing:{before:180,after:80},children:[docxText(`Fotos anexadas: ${photos.length}`,{bold:true,size:16,color:"0F172A"})]}));
  const photoRuns=[];
  for(const p of photos.slice(0,2)){const scale=Math.min(190/p.width,120/p.height);photoRuns.push(new ImageRun({type:p.blob.type==="image/png"?"png":"jpg",data:new Uint8Array(await p.blob.arrayBuffer()),transformation:{width:Math.round(p.width*scale),height:Math.round(p.height*scale)}}));photoRuns.push(docxText("  "));}
  children.push(new Paragraph({children:photoRuns}));
  if(photos.length>2)children.push(new Paragraph({children:[docxText(`+${photos.length-2} foto(s) adicionais disponíveis no sistema.`,{size:13,color:"64748B"})]}));
 }
 children.push(new Paragraph({spacing:{before:160},children:[docxText("SUA SEGURANÇA SEMPRE EM PRIMEIRO LUGAR.",{bold:true,size:14,color:"1D4ED8"})]}));
 children.push(new Paragraph({children:[docxText("Este registro documenta as respostas informadas pelo colaborador e não substitui a autorização para executar a atividade.",{size:12,color:"475569"})]}));
 const doc=new Document({sections:[{properties:{page:{margin:{top:520,bottom:520,left:520,right:520}}},children}]});
 save(await Packer.toBlob(doc),filename+".docx");
}

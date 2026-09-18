import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, FileText, Users } from "lucide-react";
import { fetchDssExecution, fetchRotAttachments } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { EXECUTION_STATUS_BADGE, EXECUTION_STATUS_LABEL } from "./DssScheduleDetailPage";

function ContentBlocksView({ blocks }) {
	if (!blocks?.length) return <p className="text-sm font-semibold text-slate-400">Sem conteúdo cadastrado.</p>;
	return (
		<div className="space-y-3">
			{blocks.map((block, index) => {
				if (block.type === "titulo") return <h3 key={index} className="text-lg font-black text-slate-900">{block.text}</h3>;
				if (block.type === "subtitulo") return <h4 key={index} className="text-sm font-black uppercase tracking-wide text-slate-600">{block.text}</h4>;
				if (block.type === "lista") return (
					<ul key={index} className="list-disc space-y-1 pl-5 text-sm font-semibold text-slate-700">
						{(block.items || []).filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}
					</ul>
				);
				if (block.type === "destaque") return <p key={index} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">{block.text}</p>;
				if (block.type === "conclusao") return <p key={index} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{block.text}</p>;
				return <p key={index} className="text-sm font-semibold leading-relaxed text-slate-700">{block.text}</p>;
			})}
		</div>
	);
}

function ThemePdfLink({ themeId }) {
	const [items, setItems] = useState([]);
	useEffect(() => {
		fetchRotAttachments("DSS_THEME", themeId).then((data) => setItems(data.items || [])).catch(() => setItems([]));
	}, [themeId]);
	if (!items.length) return <p className="text-sm font-semibold text-slate-400">PDF do tema ainda não disponível.</p>;
	return (
		<a href={items[0].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-orange-700 hover:border-orange-300">
			<FileText size={16} /> Abrir PDF do tema
		</a>
	);
}

const PRESENCE_LABEL = { pendente: "Pendente", presente: "Presente", ausente: "Ausente" };
const PRESENCE_BADGE = { pendente: "bg-slate-100 text-slate-500", presente: "bg-emerald-50 text-emerald-700", ausente: "bg-red-50 text-red-700" };

export default function DssExecutionDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [execution, setExecution] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		setLoading(true);
		setError("");
		fetchDssExecution(id)
			.then(setExecution)
			.catch((err) => setError(err?.message || "Não foi possível carregar a execução."))
			.finally(() => setLoading(false));
	}, [id]);

	if (loading) return <Spinner />;
	if (!execution) return <p className="text-sm font-bold text-red-600">{error || "Execução não encontrada."}</p>;

	return (
		<div className="space-y-6">
			<button type="button" onClick={() => navigate("/seguranca-trabalho/dss/execucoes")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
				<ArrowLeft size={15} /> Voltar para execuções
			</button>

			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><ClipboardCheck size={24} /></span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">{execution.themeTitle}</h1>
						<p className="text-sm font-semibold text-slate-500">{execution.weekLabel} · {execution.operationType} · {execution.regionalName}{execution.baseName ? ` · ${execution.baseName}` : ""}</p>
					</div>
				</div>
				<span className={`rounded-full px-3 py-1.5 text-xs font-black ${EXECUTION_STATUS_BADGE[execution.status] || ""}`}>{EXECUTION_STATUS_LABEL[execution.status] || execution.status}</span>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-4">
				<div><p className="text-xs font-black uppercase text-slate-400">Prazo</p><p className="font-bold text-slate-800">{new Date(execution.dueDate).toLocaleDateString("pt-BR")}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Responsável</p><p className="font-bold text-slate-800">{execution.responsibleName || "Não identificado"}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Previstos</p><p className="font-bold text-slate-800">{execution.previstosCount}</p></div>
				<div><p className="text-xs font-black uppercase text-slate-400">Presentes / Ausentes</p><p className="font-bold text-slate-800">{execution.presentesCount} / {execution.ausentesCount}</p></div>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
				<h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Conteúdo do DSS</h2>
				{execution.content?.contentType === "pdf" ? <ThemePdfLink themeId={execution.themeId} /> : <ContentBlocksView blocks={execution.content?.contentBlocks} />}
			</section>

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
				<h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500">
					<Users size={16} /> Equipe prevista ({(execution.members || []).length})
				</h2>
				<table className="w-full min-w-[560px] text-left text-sm">
					<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
						<tr>
							<th className="px-4 py-3">Colaborador</th>
							<th className="px-4 py-3">Cargo</th>
							<th className="px-4 py-3">Presença</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{(execution.members || []).map((member) => (
							<tr key={member.id}>
								<td className="px-4 py-3 font-bold text-slate-900">{member.name}</td>
								<td className="px-4 py-3 font-bold text-slate-600">{member.role || "—"}</td>
								<td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${PRESENCE_BADGE[member.presenceStatus] || ""}`}>{PRESENCE_LABEL[member.presenceStatus] || member.presenceStatus}</span></td>
							</tr>
						))}
					</tbody>
				</table>
				{!(execution.members || []).length ? <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum colaborador na equipe prevista.</p> : null}
			</section>

			<p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
				Registro de presença, envio de evidência e validação chegam em uma próxima fase — esta tela ainda é somente leitura.
			</p>
		</div>
	);
}

export default function PublicPageLoading({
  title = "Carregando dados",
  description = "Aguarde enquanto buscamos as informacoes da pagina.",
}) {
  return (
    <div className="flex justify-center py-16 sm:py-20">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600" />
        <h2 className="mt-5 text-lg font-black text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

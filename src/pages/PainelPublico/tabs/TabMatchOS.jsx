import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  MapPin,
  Route,
  Star,
} from "lucide-react";
import { buildMatchOSData } from "../../Mapa/utils/matchOs";

function SummaryCard({ label, value, helper, color }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{helper}</div>
    </div>
  );
}

function InfoLabel({ children, className }) {
  return <span className={`font-extrabold ${className}`}>{children}</span>;
}

function HighlightValue({ children }) {
  return <span className="font-bold italic text-gray-900">{children}</span>;
}

function MatchCard({ grupo, cidade, match, isAgente = false }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(match.copyText);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            className={`flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] ${
              isAgente ? "text-amber-700" : "text-blue-600"
            }`}
          >
            {isAgente ? <Star size={12} /> : null}
            <span>{grupo}</span>
            <span>&bull;</span>
            <span>{cidade}</span>
          </div>
          <div className="mt-1 text-base font-bold text-gray-900">
            {match.principal.tipo}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {match.principal.nome_cliente || "-"} &bull;{" "}
            <InfoLabel className="text-orange-600">COD</InfoLabel>{" "}
            <HighlightValue>{match.principal.codigo_cliente || "-"}</HighlightValue>
          </div>
          <div className="text-sm text-gray-500">
            O.S {match.principal.num_os || "-"} &bull;{" "}
            <InfoLabel className="text-blue-700">Técnico</InfoLabel>:{" "}
            <HighlightValue>
              {match.principal.tecnico || "Nao informado"}
            </HighlightValue>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {match.principal.endereco_resumo ||
              match.principal.endereco ||
              "Endereco nao informado"}
          </div>
        </div>

        <button
          type="button"
          onClick={copiar}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
            copiado
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          }`}
        >
          {copiado ? <Check size={15} /> : <Copy size={15} />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          Retiradas proximas
        </div>
        <div className="space-y-2">
          {match.relacionadas.map((ordem) => (
            <div
              key={ordem.id || ordem.num_os}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-gray-800">
                  {ordem.tipo}
                </span>
                <span className="rounded-full border border-orange-100 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  {ordem.distanceMeters}m
                </span>
                {ordem.sameStreet ? (
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    mesma rua
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-gray-700">
                {ordem.nome_cliente || "-"} &bull;{" "}
                <InfoLabel className="text-orange-600">COD</InfoLabel>{" "}
                <HighlightValue>{ordem.codigo_cliente || "-"}</HighlightValue>{" "}
                &bull; O.S{" "}
                {ordem.num_os || "-"}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {ordem.endereco_resumo ||
                  ordem.endereco ||
                  "Endereco nao informado"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <textarea
        readOnly
        value={match.copyText}
        className="mt-3 min-h-[108px] w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-700 outline-none"
      />
    </div>
  );
}

function CidadeSection({ grupo, cidade, isAgente = false }) {
  const [aberta, setAberta] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setAberta((valor) => !valor)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 transition-all hover:bg-gray-50"
      >
        <div className="text-left">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            {isAgente ? <Star size={14} className="text-amber-500" /> : null}
            <span>{cidade.cidade}</span>
          </div>
          <div className="text-xs text-gray-500">
            {cidade.totalMatches} match(es) &bull;{" "}
            {cidade.totalRetiradasRelacionadas} retirada(s) relacionada(s)
          </div>
        </div>
        {aberta ? (
          <ChevronUp size={18} className="text-gray-400" />
        ) : (
          <ChevronDown size={18} className="text-gray-400" />
        )}
      </button>

      {aberta ? (
        <div className="space-y-4 border-t border-gray-100 bg-slate-50 p-4">
          {cidade.matches.map((match) => (
            <MatchCard
              key={match.id}
              grupo={grupo}
              cidade={cidade.cidade}
              match={match}
              isAgente={isAgente}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GrupoSection({ item, isAgente = false }) {
  const [aberta, setAberta] = useState(true);

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAberta((valor) => !valor)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 transition-all hover:bg-gray-50"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            {isAgente ? (
              <Star size={16} className="text-amber-500" />
            ) : (
              <MapPin size={16} className="text-blue-600" />
            )}
            <span className="text-base font-black text-gray-900">
              {item.regional}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {item.totalCidades} cidade(s) com match &bull; {item.totalMatches}{" "}
            match(es)
          </div>
        </div>
        {aberta ? (
          <ChevronUp size={18} className="text-gray-400" />
        ) : (
          <ChevronDown size={18} className="text-gray-400" />
        )}
      </button>

      {aberta ? (
        <div className="space-y-3 border-t border-gray-100 bg-slate-50 p-4">
          {item.cidades.map((cidade) => (
            <CidadeSection
              key={`${item.regional}-${cidade.cidade}`}
              grupo={item.regional}
              cidade={cidade}
              isAgente={isAgente}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionBlock({
  title,
  helper,
  items,
  isAgente = false,
  emptyText,
}) {
  return (
    <section className="space-y-4">
      <div
        className={`rounded-3xl border px-5 py-4 text-sm ${
          isAgente
            ? "border-amber-100 bg-amber-50 text-amber-900"
            : "border-blue-100 bg-blue-50 text-blue-900"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-base font-black">
          {isAgente ? <Star size={16} /> : <MapPin size={16} />}
          <span>{title}</span>
        </div>
        <div className="mt-1 text-sm opacity-90">{helper}</div>
      </div>

      {items.length ? (
        <div className="space-y-4">
          {items.map((item) => (
            <GrupoSection
              key={item.regional}
              item={item}
              isAgente={isAgente}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          {emptyText}
        </div>
      )}
    </section>
  );
}

export default function TabMatchOS({
  ordens = [],
  mode = "all",
  note = null,
  dataOverride = null,
}) {
  const dados = useMemo(
    () => dataOverride || buildMatchOSData(ordens),
    [dataOverride, ordens],
  );
  const agentesOnly = mode === "agentes-only";
  const totalMatches = agentesOnly
    ? dados.agentes.reduce((sum, item) => sum + item.totalMatches, 0)
    : dados.resumo.totalMatches;
  const totalCidades = agentesOnly
    ? dados.agentes.reduce((sum, item) => sum + item.totalCidades, 0)
    : dados.resumo.totalCidades;
  const totalAgentes = dados.agentes.reduce(
    (sum, item) => sum + item.totalCidades,
    0,
  );

  if (!totalMatches) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {!agentesOnly ? (
            <SummaryCard
              label="Regionais"
              value="0"
              helper="Nenhuma regional com match"
              color="text-blue-700"
            />
          ) : null}
          <SummaryCard
            label="Agentes"
            value="0"
            helper="Nenhuma cidade de agente com match"
            color="text-amber-600"
          />
          <SummaryCard
            label="Cidades"
            value="0"
            helper="Nenhuma cidade com match"
            color="text-orange-600"
          />
          <SummaryCard
            label="Matches"
            value="0"
            helper="Nenhum servico proximo de retirada"
            color="text-green-700"
          />
        </div>

        <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <div className="mb-4 flex justify-center">
            <Route size={30} className="text-blue-500" />
          </div>
          <div className="text-lg font-bold text-gray-900">
            Nenhum Match - OS encontrado
          </div>
          <div className="mt-2 text-sm text-gray-500">
            {agentesOnly
              ? "Nenhuma cidade de agente autorizado teve servicos proximos de retirada ou cancelamento."
              : "O painel compara servicos de campo com retiradas e cancelamentos proximos nas cidades cadastradas."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {!agentesOnly ? (
          <SummaryCard
            label="Regionais"
            value={String(dados.resumo.totalRegionais)}
            helper="Grupos regionais com match"
            color="text-blue-700"
          />
        ) : null}
        <SummaryCard
          label="Agentes"
          value={String(totalAgentes)}
          helper="Cidades de agente autorizado com match"
          color="text-amber-600"
        />
        <SummaryCard
          label="Cidades"
          value={String(totalCidades)}
          helper="Com servicos proximos de retirada"
          color="text-orange-600"
        />
        <SummaryCard
          label="Matches"
          value={String(totalMatches)}
          helper={`Raio maximo de ${dados.resumo.distanciaMaximaMetros}m`}
          color="text-green-700"
        />
      </div>

      {note ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
          {note}
        </div>
      ) : null}

      {!agentesOnly ? (
        <SectionBlock
          title="Regionais"
          helper="Matches agrupados por regional e depois por cidade."
          items={dados.regionais}
          emptyText="Nenhuma regional cadastrada teve match neste carregamento."
        />
      ) : null}

      <SectionBlock
        title="Agentes Autorizados"
        helper="Cidades de agente aparecem em bloco proprio, com destaque visual."
        items={dados.agentes}
        isAgente
        emptyText="Nenhuma cidade de agente autorizado teve match neste carregamento."
      />
    </div>
  );
}

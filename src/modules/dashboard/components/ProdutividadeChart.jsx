import { useMemo, useEffect, useState, useRef } from "react";
import { BarChart2 } from "lucide-react";
import { buscarComissoesPorAno } from "../../comissao/services/comissaoService";
import { useColaboradores } from "../../colaboradores/hooks/useColaboradores";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const COLORS = [
  "bg-blue-500","bg-green-500","bg-purple-500","bg-amber-500","bg-red-500",
  "bg-pink-500","bg-cyan-500","bg-orange-500","bg-teal-500","bg-indigo-500",
];

const DOT_COLORS = [
  "bg-blue-500","bg-green-500","bg-purple-500","bg-amber-500","bg-red-500",
  "bg-pink-500","bg-cyan-500","bg-orange-500","bg-teal-500","bg-indigo-500",
];

const ProdutividadeChart = () => {
  const { colaboradores } = useColaboradores({ preferStatic: true });
  const [registros, setRegistros] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth();

  useEffect(() => {
    buscarComissoesPorAno(anoAtual).then(setRegistros).catch(() => {});
  }, [anoAtual]);

  const mesesExibir = useMemo(
    () => Array.from({ length: mesAtual + 1 }, (_, i) => i),
    [mesAtual]
  );

  const tecnicos = useMemo(
    () => colaboradores.filter((c) => {
      const cargo = c.cargo?.toLowerCase() ?? "";
      return (
        cargo.includes("técnico") &&
        !cargo.includes("líder") &&
        !cargo.includes("lider") &&
        (c.status === "Ativo" || c.status === "Em Experiência")
      );
    }),
    [colaboradores]
  );

  const dados = useMemo(
    () => mesesExibir.map((mes) => {
      const ponto = { mes: MESES[mes] };
      tecnicos.forEach((tec) => {
        const reg = registros.find((r) => r.colaborador_id === tec.id && r.mes === mes);
        ponto[tec.id] = reg?.servicos ?? 0;
      });
      return ponto;
    }),
    [mesesExibir, tecnicos, registros]
  );

  const maxVal = Math.max(1, ...dados.flatMap((d) => tecnicos.map((t) => d[t.id] ?? 0)));
  const primeiroNome = (nome) => nome?.split(" ")[0] ?? "?";

  const handleMouseEnter = (e, nome, valor) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const barRect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      x: barRect.left - (rect?.left ?? 0) + barRect.width / 2,
      y: barRect.top - (rect?.top ?? 0) - 8,
      texto: `${nome}: ${valor} serviço${valor !== 1 ? "s" : ""}`,
    });
  };

  if (!tecnicos.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Nenhum técnico encontrado.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <BarChart2 size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Produtividade dos Técnicos</p>
            <p className="text-xs text-gray-400">{anoAtual}</p>
          </div>
        </div>
        {/* Legenda */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end max-w-xs">
          {tecnicos.map((tec, i) => (
            <div key={tec.id} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
              <span className="text-[10px] text-gray-500 font-medium">{primeiroNome(tec.nome).toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {tooltip && (
          <div
            className="absolute z-10 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.texto}
          </div>
        )}
        <div className="flex items-end gap-3 overflow-x-auto pb-2">
          {dados.map((ponto) => (
            <div key={ponto.mes} className="flex flex-col items-center gap-1 min-w-[56px]">
              <div className="flex items-end gap-0.5 h-32">
                {tecnicos.map((tec, i) => {
                  const valor = ponto[tec.id] ?? 0;
                  const altura = maxVal > 0 ? (valor / maxVal) * 100 : 0;
                  return (
                    <div
                      key={tec.id}
                      className={`w-4 rounded-t-md ${COLORS[i % COLORS.length]} opacity-80 hover:opacity-100 cursor-pointer transition-all`}
                      style={{ height: `${Math.max(altura, valor > 0 ? 4 : 0)}%` }}
                      onMouseEnter={(e) => handleMouseEnter(e, primeiroNome(tec.nome), valor)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] text-gray-400 font-medium">{ponto.mes}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProdutividadeChart;

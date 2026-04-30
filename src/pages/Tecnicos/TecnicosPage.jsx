import React, { useState } from "react";
import { useTecnicos } from "./hooks/useTecnicos";
import { useRegionais } from "./hooks/useRegionais";
import { useAnalises } from "./hooks/useAnalises";
import TecnicosDashboard from "./components/TecnicosDashboard";
import TecnicosCadastro from "./components/TecnicosCadastro";
import TecnicosAnalise from "./components/TecnicosAnalise";
import TecnicosHistorico from "./components/TecnicosHistorico";
import TecnicosRegionais from "./components/TecnicosRegionais";
import TecnicosRelatorios from "./components/TecnicosRelatorios";
import InternalStaticDataStatus from "../../components/ui/InternalStaticDataStatus";

const ABAS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tecnicos", label: "Técnicos" },
  { id: "analise", label: "Análise de OS" },
  { id: "historico", label: "Histórico" },
  { id: "regionais", label: "Regionais" },
  { id: "relatorios", label: "Relatórios" }, // ← NOVO
];

export default function TecnicosPage() {
  const [aba, setAba] = useState("dashboard");
  const { tecnicos, loading, salvarTecnico, excluirTecnico } = useTecnicos();
  const { regionais, salvarRegional, excluirRegional } = useRegionais();
  const analises = useAnalises();

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          🛠️ Gestão de Técnicos
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Controle de capacidade operacional e ociosidade
        </p>
      </div>

      <InternalStaticDataStatus className="mb-6 max-w-xl" />

      {/* Abas */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit mb-6 flex-wrap">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              aba === a.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === "dashboard" && (
        <TecnicosDashboard tecnicos={tecnicos} analises={analises} />
      )}
      {aba === "tecnicos" && (
        <TecnicosCadastro
          tecnicos={tecnicos}
          regionais={regionais}
          onSalvar={salvarTecnico}
          onExcluir={excluirTecnico}
          loading={loading}
        />
      )}
      {aba === "relatorios" && (
        <TecnicosRelatorios tecnicos={tecnicos} analises={analises} />
      )}
      {aba === "analise" && (
        <TecnicosAnalise
          tecnicos={tecnicos}
          analises={analises}
          onIrHistorico={() => setAba("historico")}
        />
      )}
      {aba === "historico" && <TecnicosHistorico analises={analises} />}
      {aba === "regionais" && (
        <TecnicosRegionais
          regionais={regionais}
          tecnicos={tecnicos}
          onSalvar={salvarRegional}
          onExcluir={excluirRegional}
        />
      )}
    </div>
  );
}

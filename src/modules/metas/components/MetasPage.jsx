import { useState, useMemo } from "react";
import {
  Target,
  BarChart2,
  Calendar,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import { hasPermission } from "../../../constants/roles";
import { useMetas } from "../hooks/useMetas";
import MetasExportButton from "./MetasExportButton";
import MetasExportPDF from "./MetasExportPDF";
import MetasUpload from "./MetasUpload";
import MetasResumoMensal from "./MetasResumoMensal";
import MetasSaldoDiario from "./MetasSaldoDiario";
import MetasMultas from "./MetasMultas";
import MetasPerformance from "./MetasPerformance";
import MetasAuditoria from "./MetasAuditoria";
import Spinner from "../../../components/ui/Spinner";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const ABAS = [
  { id: "resumo", label: "Resumo Mensal", icon: BarChart2 },
  { id: "performance", label: "Performance", icon: Target },
  { id: "saldo", label: "Saldo Diário", icon: Calendar },
  { id: "multas", label: "Multas", icon: AlertTriangle },
  { id: "auditoria", label: "Auditoria", icon: ShieldAlert },
];

const MetasPage = () => {
  const { currentUser } = useAuthContext();
  const podeGerenciar = hasPermission(currentUser?.role, "manage_metas");

  const {
    allData,
    dadosMes,
    loading,
    uploading,
    lastUpdate,
    mesSelecionado,
    setMesSelecionado,
    processarPlanilha,
    carregar,
    feriadosExtras,
  } = useMetas();

  // Converte array MM-DD para Set, memoizado
  const feriadosSet = useMemo(
    () => new Set(feriadosExtras ?? []),
    [feriadosExtras],
  );

  const [aba, setAba] = useState("resumo");

  const tabClass = (id) =>
    `flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
      aba === id
        ? "bg-blue-600 text-white shadow-sm"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    }`;

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Retirada FTTH · 2026
          </h1>
          {lastUpdate && (
            <p className="text-xs text-gray-400 mt-0.5">{lastUpdate}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {podeGerenciar && (
            <MetasUpload onUpload={processarPlanilha} uploading={uploading} />
          )}
          <MetasExportButton allData={allData} />
          <MetasExportPDF
            allData={allData}
            dadosMes={dadosMes}
            feriadosSet={feriadosSet}
          />
        </div>
      </div>

      {/* Sem dados */}
      {Object.keys(allData).length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center">
          <BarChart2 size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">
            Nenhum dado carregado.
          </p>
          {podeGerenciar && (
            <p className="text-xs text-gray-300 mt-1">
              Clique em <strong>Atualizar Planilha</strong> para importar os
              dados.
            </p>
          )}
        </div>
      )}

      {Object.keys(allData).length > 0 && (
        <>
          {/* Seletor de mês */}
          {aba !== "auditoria" && (
            <div className="flex flex-wrap items-center gap-2">
              {MESES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMesSelecionado(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    mesSelecionado === m
                      ? "bg-blue-600 text-white"
                      : allData[m]
                        ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        : "bg-gray-50 text-gray-300 cursor-default"
                  }`}
                  disabled={!allData[m] && mesSelecionado !== m}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Abas */}
          <div className="flex flex-wrap gap-1 bg-white rounded-2xl border border-gray-100 p-2">
            {ABAS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                className={tabClass(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          {aba === "resumo" && (
            <MetasResumoMensal
              allData={allData}
              mesSelecionado={mesSelecionado}
              onSelectMes={setMesSelecionado}
              feriadosSet={feriadosSet}
            />
          )}
          {aba === "performance" && (
            <MetasPerformance dados={dadosMes} mes={mesSelecionado} />
          )}
          {aba === "saldo" && (
            <MetasSaldoDiario dados={dadosMes} feriadosSet={feriadosSet} />
          )}
          {aba === "multas" && (
            <MetasMultas dados={dadosMes} mes={mesSelecionado} />
          )}
          {aba === "auditoria" && <MetasAuditoria />}
        </>
      )}
    </div>
  );
};

export default MetasPage;

import { useState } from "react";
import TabRegionais from "./tabs/TabRegionais";
import TabMensal from "./tabs/TabMensal";
import TabDiario from "./tabs/TabDiario";
import TabMedia from "./tabs/TabMedia";
import TabDevolucoesDia from "./tabs/TabDevolucoesDia";
import TabDevolucoesMes from "./tabs/TabDevolucoesMes";
import TabOSAberto from "./tabs/TabOSAberto";
import TabMultas from "./tabs/TabMultas";
import TabCancelamento from "./tabs/TabCancelamento";
import TabCancelamentoAvaliacao from "./tabs/TabCancelamentoAvaliacao";
import TabCancelamentosMes from "./tabs/TabCancelamentosMes";
import TabEquipServico from "./tabs/TabEquipServico";
import TabEmailFechamento from "./tabs/TabEmailFechamento";
import TabMesInicial from "./tabs/TabMesInicial";
import TabEntregaLoja from "./tabs/TabEntregaLoja";

const TABS = [
  { id: "regionais", label: "Regionais" },
  { id: "mensal", label: "Análise Mensal" },
  { id: "diario", label: "O.S do Dia" },
  { id: "media", label: "Análise Média" },
  { id: "dvd", label: "Devoluções Diárias" },
  { id: "dvm", label: "Devoluções Mês" },
  { id: "osaberto", label: "O.S em Aberto" },
  { id: "multas", label: "Multas" },
  { id: "cancelamento", label: "Cancelamento" },
  { id: "cancelamentomes", label: "Cancelamentos Mês" },
  { id: "cancelamentoavaliacao", label: "Cancelamento Avaliação" },
  { id: "equipservico", label: "Equip. por Serviço" },
  { id: "entregaloja", label: "Entrega Loja" },
  { id: "mesinicial", label: "MES INICIAL" },
  { id: "email", label: "E-mail Fechamento" },
];

const FerramentasPage = () => {
  const [tab, setTab] = useState("regionais");

  const renderTab = () => {
    switch (tab) {
      case "regionais":
        return <TabRegionais />;
      case "mensal":
        return <TabMensal />;
      case "diario":
        return <TabDiario />;
      case "media":
        return <TabMedia />;
      case "dvd":
        return <TabDevolucoesDia />;
      case "dvm":
        return <TabDevolucoesMes />;
      case "osaberto":
        return <TabOSAberto />;
      case "multas":
        return <TabMultas />;
      case "cancelamento":
        return <TabCancelamento />;
      case "cancelamentomes":
        return <TabCancelamentosMes />;
      case "cancelamentoavaliacao":
        return <TabCancelamentoAvaliacao />;
      case "equipservico":
        return <TabEquipServico />;
      case "entregaloja":
        return <TabEntregaLoja />;
      case "mesinicial":
        return <TabMesInicial />;
      case "email":
        return <TabEmailFechamento />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Ferramentas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Análise de planilhas de O.S, devoluções, regionais e relatórios
        </p>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:border-orange-400 hover:text-orange-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteudo da aba */}
      <div>{renderTab()}</div>
    </div>
  );
};

export default FerramentasPage;


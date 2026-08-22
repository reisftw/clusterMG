import { useState } from "react";
import { useFerramentasRegionais } from "../../hooks/useFerramentasRegionais";
import { Trash2, ChevronDown, ChevronRight, Plus } from "lucide-react";
import RetorninhoLoader from "../../../../components/ui/RetorninhoLoader";

const TabRegionais = () => {
  const {
    regionais,
    config,
    loading,
    criar,
    atualizar,
    remover,
    salvarConfig,
  } = useFerramentasRegionais();

  // Estado global de tecnicos e metas (lidos da primeira regional como referencia global)
  const tecnicosGlobais = config.tecnicos || [];
  const metaAtiva = config.metaAtiva ?? 110;
  const metaRetirada = config.metaRetirada ?? 110;

  const [novaReg, setNovaReg] = useState("");
  const [novaCidade, setNovaCidade] = useState({});
  const [isAgente, setIsAgente] = useState({});
  const [novoTec, setNovoTec] = useState("");
  const [novaMetaAtiva, setNovaMetaAtiva] = useState("");
  const [novaMetaRet, setNovaMetaRet] = useState("");
  const [expanded, setExpanded] = useState({});

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // -- Salva tecnicos e metas em TODAS as regionais (padrao global) ----------
  const addTecnico = async () => {
    const nome = novoTec.trim();
    if (!nome) return;
    const tecnicos = [...tecnicosGlobais, { nome }];
    await salvarConfig({ tecnicos });
    setNovoTec("");
  };

  const removeTecnico = async (idx) => {
    const tecnicos = tecnicosGlobais.filter((_, i) => i !== idx);
    await salvarConfig({ tecnicos });
  };

  const saveMetas = async () => {
    await salvarConfig({
      metaAtiva: Number(novaMetaAtiva || metaAtiva),
      metaRetirada: Number(novaMetaRet || metaRetirada),
    });
  };

  // -- Regionais e cidades ---------------------------------------------------
  const addRegional = async () => {
    if (!novaReg.trim()) return;
    // Ao criar, ja herda tecnicos e metas globais
    await criar(novaReg.trim(), tecnicosGlobais, metaAtiva, metaRetirada);
    setNovaReg("");
  };

  const addCidade = async (reg) => {
    const nome = novaCidade[reg.id]?.trim();
    if (!nome) return;
    const cidades = [
      ...(reg.cidades || []),
      { nome, agente: !!isAgente[reg.id] },
    ];
    await atualizar(reg.id, { cidades });
    setNovaCidade((p) => ({ ...p, [reg.id]: "" }));
    setIsAgente((p) => ({ ...p, [reg.id]: false }));
  };

  const removeCidade = async (reg, idx) => {
    const cidades = reg.cidades.filter((_, i) => i !== idx);
    await atualizar(reg.id, { cidades });
  };

  const toggleAgente = async (reg, idx) => {
    const cidades = reg.cidades.map((c, i) =>
      i === idx ? { ...c, agente: !c.agente } : c,
    );
    await atualizar(reg.id, { cidades });
  };

  if (loading)
    return <RetorninhoLoader compact title="Carregando..." />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* -- Coluna Esquerda — Formularios globais -- */}
      <div className="space-y-4">
        {/* Nova Regional */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Nova Regional
          </p>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Ex: Centro-Oeste"
              value={novaReg}
              onChange={(e) => setNovaReg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRegional()}
            />
            <button
              onClick={addRegional}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600"
            >
              Criar
            </button>
          </div>
        </div>

        {/* Adicionar Cidade */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Adicionar Cidade
          </p>
          <div className="mb-2">
            <label className="text-xs text-gray-500 block mb-1">Regional</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              id="sel-reg-cidade"
            >
              <option value="">Selecione</option>
              {regionais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-2">
            <label className="text-xs text-gray-500 block mb-1">
              Nome da Cidade
            </label>
            <input
              id="inp-cidade"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Ex: Formiga"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const regId = document.getElementById("sel-reg-cidade").value;
                  const reg = regionais.find((r) => r.id === regId);
                  if (reg) {
                    const nome = e.target.value.trim();
                    const ag = document.getElementById("chk-agente").checked;
                    if (nome) {
                      const cidades = [
                        ...(reg.cidades || []),
                        { nome, agente: ag },
                      ];
                      atualizar(reg.id, { cidades }).then(() => {
                        e.target.value = "";
                        document.getElementById("chk-agente").checked = false;
                      });
                    }
                  }
                }
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mb-3">
            <input
              id="chk-agente"
              type="checkbox"
              className="accent-orange-500"
            />
            Agente Autorizado
          </label>
          <button
            onClick={() => {
              const regId = document.getElementById("sel-reg-cidade").value;
              const reg = regionais.find((r) => r.id === regId);
              const nome = document.getElementById("inp-cidade").value.trim();
              const ag = document.getElementById("chk-agente").checked;
              if (reg && nome) {
                const cidades = [...(reg.cidades || []), { nome, agente: ag }];
                atualizar(reg.id, { cidades }).then(() => {
                  document.getElementById("inp-cidade").value = "";
                  document.getElementById("chk-agente").checked = false;
                });
              }
            }}
            className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
          >
            Adicionar Cidade
          </button>
        </div>

        {/* Tecnicos de Retirada (global) */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Tecnicos de Retirada
          </p>
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Ex: Joao Silva"
              value={novoTec}
              onChange={(e) => setNovoTec(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTecnico()}
            />
            <button
              onClick={addTecnico}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tecnicosGlobais.length === 0 && (
              <p className="text-xs text-gray-400">
                Nenhum tecnico cadastrado.
              </p>
            )}
            {tecnicosGlobais.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5"
              >
                <span className="text-sm text-gray-700">{t.nome}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-100 text-blue-600 font-bold px-2 py-0.5 rounded-full">
                    Retirada
                  </span>
                  <button
                    onClick={() => removeTecnico(i)}
                    className="text-gray-300 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metas globais */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            Metas Globais
          </p>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">
              Meta Ativa (O.S/mes)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                defaultValue={metaAtiva}
                onChange={(e) => setNovaMetaAtiva(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">
              Meta Retirada (O.S/mes)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                defaultValue={metaRetirada}
                onChange={(e) => setNovaMetaRet(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={saveMetas}
            className="w-full py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600"
          >
            Salvar Metas
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Meta atual: <strong>{metaAtiva}</strong> O.S/mes · Retirada:{" "}
            <strong>{metaRetirada}</strong>
          </p>
        </div>
      </div>

      {/* -- Coluna Direita — Lista de Regionais -- */}
      <div className="lg:col-span-2 space-y-3">
        {regionais.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🗺️</p>
            <p className="text-sm">Nenhuma regional ainda. Crie ao lado.</p>
          </div>
        )}
        {regionais.map((reg) => (
          <div
            key={reg.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden"
          >
            {/* Cabecalho */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-orange-50 transition-colors"
              onClick={() => toggle(reg.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(reg.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center gap-3">
                {expanded[reg.id] ? (
                  <ChevronDown size={16} className="text-gray-400" />
                ) : (
                  <ChevronRight size={16} className="text-gray-400" />
                )}
                <span className="font-semibold text-gray-800 text-sm">
                  {reg.nome}
                </span>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {reg.cidades?.length || 0} cidades
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remover(reg.id);
                }}
                className="text-gray-300 hover:text-red-500 transition-colors p-1"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Cidades expandidas */}
            {expanded[reg.id] && (
              <div className="border-t border-gray-100 px-4 py-3">
                {/* Adicionar cidade inline */}
                <div className="flex gap-2 mb-3">
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400"
                    placeholder="Nova cidade..."
                    value={novaCidade[reg.id] || ""}
                    onChange={(e) =>
                      setNovaCidade((p) => ({ ...p, [reg.id]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && addCidade(reg)}
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={!!isAgente[reg.id]}
                      onChange={(e) =>
                        setIsAgente((p) => ({
                          ...p,
                          [reg.id]: e.target.checked,
                        }))
                      }
                      className="accent-orange-500"
                    />
                    Ag. Aut.
                  </label>
                  <button
                    onClick={() => addCidade(reg)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Lista de cidades */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(reg.cidades || []).map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{c.nome}</span>
                        {c.agente && (
                          <button
                            onClick={() => toggleAgente(reg, i)}
                            className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full border border-orange-200 hover:bg-orange-200 transition-colors"
                          >
                            Agente Aut.
                          </button>
                        )}
                        {!c.agente && (
                          <button
                            onClick={() => toggleAgente(reg, i)}
                            className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200 hover:border-orange-400 hover:text-orange-500 transition-colors"
                          >
                            Comum
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => removeCidade(reg, i)}
                        className="text-gray-300 hover:text-red-500 ml-2"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabRegionais;


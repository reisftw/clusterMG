import { useState } from "react";
import { X, MapPin, Plus, Trash2 } from "lucide-react";
import { TIPOS_CIDADE } from "../hooks/useRegionais";
import PessoaFields from "./PessoaFields";

const emptyPessoa = () => ({ nome: "", telefone: "", email: "" });

const buildInitialState = (regional) => {
  const backoffices =
    Array.isArray(regional?.backoffices) && regional.backoffices.length
      ? regional.backoffices
      : regional?.backoffice?.nome
        ? [regional.backoffice]
        : [emptyPessoa()];

  return {
    nome: regional?.nome || "",
    cidades:
      regional?.cidades?.length ? regional.cidades : [{ nome: "", tipo: "Comum" }],
    supervisor: regional?.supervisor || emptyPessoa(),
    lider: regional?.lider || emptyPessoa(),
    backoffices,
  };
};

const RegionalModalContent = ({ regional, onSalvar, onClose }) => {
  const editando = !!regional;
  const initialState = buildInitialState(regional);

  const [nome, setNome] = useState(initialState.nome);
  const [cidades, setCidades] = useState(initialState.cidades);
  const [supervisor, setSupervisor] = useState(initialState.supervisor);
  const [lider, setLider] = useState(initialState.lider);
  const [backoffices, setBackoffices] = useState(initialState.backoffices);
  const [saving, setSaving] = useState(false);
  const [aba, setAba] = useState("info");

  const addCidade = () => setCidades((c) => [...c, { nome: "", tipo: "Comum" }]);
  const removeCidade = (i) => setCidades((c) => c.filter((_, idx) => idx !== i));
  const setCidadeField = (i, field, val) =>
    setCidades((c) => c.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));

  const addBackoffice = () => setBackoffices((b) => [...b, emptyPessoa()]);
  const removeBackoffice = (i) => setBackoffices((b) => b.filter((_, idx) => idx !== i));
  const setBackofficeField = (i, val) =>
    setBackoffices((b) => b.map((item, idx) => (idx === i ? val : item)));

  const handleSalvar = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    await onSalvar({
      nome: nome.trim().toUpperCase(),
      cidades: cidades.filter((c) => c.nome.trim()),
      supervisor,
      lider,
      backoffices: backoffices.filter((b) => b.nome.trim()),
    });
    setSaving(false);
    onClose();
  };

  const tabClass = (t) =>
    `px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
      aba === t
        ? "bg-blue-600 text-white shadow-sm"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    }`;

  const cidadesValidas = cidades.filter((c) => c.nome.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <MapPin size={16} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {editando ? "Editar Regional" : "Nova Regional"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4 bg-gray-50/50">
          <button className={tabClass("info")} onClick={() => setAba("info")}>
            Informacoes
          </button>
          <button className={tabClass("cidades")} onClick={() => setAba("cidades")}>
            Cidades
            <span
              className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
                aba === "cidades" ? "bg-white/20" : "bg-gray-200 text-gray-500"
              }`}
            >
              {cidadesValidas}
            </span>
          </button>
          <button className={tabClass("equipe")} onClick={() => setAba("equipe")}>
            Equipe
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {aba === "info" && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Nome da Regional *
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: CENTRAL MINEIRA"
                className="input-field"
              />
            </div>
          )}

          {aba === "cidades" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500">
                  {cidadesValidas} cidade(s)
                </p>
                <button
                  onClick={addCidade}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Plus size={13} /> Adicionar cidade
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {cidades.map((cidade, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={cidade.nome}
                      onChange={(e) => setCidadeField(i, "nome", e.target.value.toUpperCase())}
                      placeholder="Nome da cidade"
                      className="input-field flex-1"
                    />
                    <select
                      value={cidade.tipo}
                      onChange={(e) => setCidadeField(i, "tipo", e.target.value)}
                      className="input-field w-auto shrink-0 text-xs"
                    >
                      {TIPOS_CIDADE.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeCidade(i)}
                      disabled={cidades.length === 1}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aba === "equipe" && (
            <div className="space-y-5">
              <PessoaFields label="Supervisor" value={supervisor} onChange={setSupervisor} />
              <PessoaFields label="Líder Técnico" value={lider} onChange={setLider} />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      BackOffice ({backoffices.filter((b) => b.nome.trim()).length})
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-gray-400">
                      A confirmação de agendamentos escala na ordem: BackOffice 01, BackOffice 02,
                      Líder Técnico e Supervisor.
                    </p>
                  </div>
                  <button
                    onClick={addBackoffice}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Plus size={13} /> Adicionar BackOffice
                  </button>
                </div>
                {backoffices.map((b, i) => (
                  <div
                    key={i}
                    className="relative border border-gray-100 rounded-xl p-4 space-y-2 bg-gray-50/50"
                  >
                    {backoffices.length > 1 && (
                      <button
                        onClick={() => removeBackoffice(i)}
                        className="absolute top-3 right-3 p-1 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <p className="text-[11px] font-semibold text-gray-400">
                      BackOffice {String(i + 1).padStart(2, "0")}
                    </p>
                    <input
                      type="text"
                      placeholder="Nome completo"
                      value={b.nome || ""}
                      onChange={(e) => setBackofficeField(i, { ...b, nome: e.target.value })}
                      className="input-field"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Telefone"
                        value={b.telefone || ""}
                        onChange={(e) =>
                          setBackofficeField(i, { ...b, telefone: e.target.value })
                        }
                        className="input-field"
                      />
                      <input
                        type="email"
                        placeholder="E-mail"
                        value={b.email || ""}
                        onChange={(e) =>
                          setBackofficeField(i, { ...b, email: e.target.value })
                        }
                        className="input-field"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving || !nome.trim()}
            className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Salvando..." : editando ? "Salvar alteracoes" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
};

const RegionalModal = (props) => (
  <RegionalModalContent key={props.regional?.id ?? "nova-regional"} {...props} />
);

export default RegionalModal;


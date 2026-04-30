import { useState } from "react";
import { X, Copy, Check, Pencil } from "lucide-react";

const STATUS_STYLES = {
  Ativo: "bg-green-100 text-green-700",
  "Em Experiência": "bg-yellow-100 text-yellow-700",
  Desligado: "bg-red-100 text-red-600",
};

const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

const gerarTextoCopiavel = (c) => {
  const linhas = [
    `Colaborador: ${c.nome}`,
    `Cargo: ${c.cargo ?? "—"}`,
    `Matrícula: ${c.matricula ?? "—"}`,
    `Status: ${c.status ?? "—"}`,
    `Base: ${c.base_operacional || "—"}`,
    `Contratação: ${formatarData(c.data_contratacao)}`,
    `Nascimento: ${formatarData(c.data_nascimento)}`,
    `E-mail: ${c.email || "—"}`,
    `Cel. Pessoal: ${c.celular_pessoal || "—"}`,
    `Cel. Corporativo: ${c.celular_corporativo || "—"}`,
    `Endereço: ${c.endereco || "—"}`,
  ];

  if (c.status === "Desligado") {
    linhas.push(`Desligamento: ${formatarData(c.data_desligamento)}`);
    if (c.motivo_desligamento) {
      linhas.push(`Motivo: ${c.motivo_desligamento}`);
    }
  }

  return linhas.join("\n");
};

const Campo = ({ label, valor }) => (
  <div>
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
      {label}
    </p>
    <p className="text-sm text-gray-800 font-medium">{valor || "—"}</p>
  </div>
);

const ColaboradorDetalheModal = ({ colaborador: c, onClose, onEditar }) => {
  const [copiado, setCopiado] = useState(false);

  const copiar = () => {
    navigator.clipboard.writeText(gerarTextoCopiavel(c));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white font-bold">{c.nome?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">{c.nome}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{c.cargo}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status ?? "Ativo"]}`}
                >
                  {c.status ?? "Ativo"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={copiar}
              className="p-2 rounded-xl text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              title="Copiar dados"
            >
              {copiado ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            </button>
            {onEditar && (
              <button
                onClick={onEditar}
                className="p-2 rounded-xl text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors"
                title="Editar"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1">
              <span className="w-4 h-px bg-blue-200 inline-block" /> Dados Profissionais
            </p>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <Campo label="Matrícula" valor={c.matricula} />
              <Campo label="Base Operacional" valor={c.base_operacional} />
              <Campo label="Contratação" valor={formatarData(c.data_contratacao)} />
              <Campo label="Regional" valor={c.regional} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1">
              <span className="w-4 h-px bg-blue-200 inline-block" /> Dados Pessoais
            </p>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
              <Campo label="Nascimento" valor={formatarData(c.data_nascimento)} />
              <Campo label="E-mail" valor={c.email} />
              <Campo label="Cel. Pessoal" valor={c.celular_pessoal} />
              <Campo label="Cel. Corporativo" valor={c.celular_corporativo} />
              <div className="col-span-2">
                <Campo label="Endereço" valor={c.endereco} />
              </div>
            </div>
          </div>

          {c.status === "Desligado" && (
            <div>
              <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <span className="w-4 h-px bg-red-200 inline-block" /> Desligamento
              </p>
              <div className="bg-red-50 rounded-xl p-4 border border-red-100 space-y-3">
                <Campo label="Data de Desligamento" valor={formatarData(c.data_desligamento)} />
                {c.motivo_desligamento && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                      Motivo
                    </p>
                    <p className="text-sm text-gray-700 italic">"{c.motivo_desligamento}"</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColaboradorDetalheModal;

import { useState } from "react";
import { CalendarClock, Trash2, X } from "lucide-react";
import { AGENDAMENTO_STATUS, AGENDAMENTO_TURNOS } from "../constants";
import { useEffect, useRef } from "react";
import { buscarClienteAgendamentoPorCodigo } from "../services/agendamentosService";

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all";

const buildInitialForm = (agendamento) => ({
  tecnico_nome: agendamento?.tecnico_nome || "",
  codigo_cliente: agendamento?.codigo_cliente || "",
  cliente_nome: agendamento?.cliente_nome || "",
  cidade: agendamento?.cidade || "",
  data: agendamento?.data || "",
  turno: agendamento?.turno || "Manha",
  hora: agendamento?.hora || "",
  status: agendamento?.status || "Aguardando dia",
  observacao: agendamento?.observacao || "",
});

const AgendamentoModal = ({
  agendamento,
  tecnicos = [],
  onSalvar,
  onClose,
  onExcluir,
}) => {
  const editando = !!agendamento;
  const [form, setForm] = useState(() => buildInitialForm(agendamento));
  const [saving, setSaving] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteStatus, setClienteStatus] = useState("");
  const [erro, setErro] = useState("");
  const lastLookupCodeRef = useRef("");

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (editando) return undefined;
    const codigo = String(form.codigo_cliente || "").replace(/\D/g, "");
    if (codigo.length < 3) {
      setClienteStatus("");
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      if (lastLookupCodeRef.current === codigo) return;
      lastLookupCodeRef.current = codigo;
      setBuscandoCliente(true);
      setClienteStatus("");

      try {
        const cliente = await buscarClienteAgendamentoPorCodigo(codigo);
        if (!cliente) {
          setClienteStatus("Cliente não encontrado no mapa atual.");
          return;
        }

        setForm((prev) => {
          if (String(prev.codigo_cliente || "").replace(/\D/g, "") !== codigo) return prev;
          return {
            ...prev,
            cliente_nome: prev.cliente_nome || cliente.cliente_nome || "",
            cidade: prev.cidade || cliente.cidade || "",
            observacao:
              prev.observacao ||
              [cliente.num_os ? `O.S ${cliente.num_os}` : "", cliente.regional || ""]
                .filter(Boolean)
                .join(" - "),
          };
        });
        setClienteStatus(
          cliente.cliente_nome
            ? `Dados preenchidos: ${cliente.cliente_nome}${cliente.cidade ? ` • ${cliente.cidade}` : ""}.`
            : "Cliente localizado no mapa atual.",
        );
      } catch (error) {
        setClienteStatus(
          /404|nao encontrado|não encontrado/i.test(String(error?.message || ""))
            ? "Cliente não encontrado no mapa atual."
            : "Não foi possível buscar os dados do cliente.",
        );
      } finally {
        setBuscandoCliente(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [editando, form.codigo_cliente]);

  const handleSalvar = async () => {
    setErro("");

    if (!form.tecnico_nome.trim() || !form.codigo_cliente.trim() || !form.data) {
      setErro("Informe tecnico, codigo do cliente e data.");
      return;
    }

    if (!/^\d+$/.test(form.codigo_cliente.trim())) {
      setErro("O codigo do cliente deve conter apenas numeros.");
      return;
    }

    setSaving(true);
    try {
      await onSalvar({
        ...form,
        tecnico_nome: form.tecnico_nome.trim(),
        codigo_cliente: form.codigo_cliente.trim(),
        cliente_nome: form.cliente_nome.trim(),
        cidade: form.cidade.trim(),
        hora: form.hora,
        observacao: form.observacao.trim(),
      });
      onClose();
    } catch {
      setErro("Erro ao salvar agendamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <CalendarClock size={16} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {editando ? "Editar Agendamento" : "Novo Agendamento"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">
              Tecnico *
            </label>
            <input
              list="tecnicos-retirada"
              className={inputClass}
              placeholder="Selecione ou digite o tecnico"
              value={form.tecnico_nome}
              onChange={(event) => set("tecnico_nome", event.target.value)}
            />
            <datalist id="tecnicos-retirada">
              {tecnicos.map((tecnico) => (
                <option key={tecnico} value={tecnico} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Codigo do cliente *
              </label>
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="Ex: 326723"
                value={form.codigo_cliente}
                onChange={(event) =>
                  set("codigo_cliente", event.target.value.replace(/\D/g, ""))
                }
              />
              {(buscandoCliente || clienteStatus) && (
                <p className="mt-1.5 text-xs font-semibold text-blue-700">
                  {buscandoCliente ? "Buscando cliente..." : clienteStatus}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Nome do cliente
              </label>
              <input
                className={inputClass}
                placeholder="Nome do cliente"
                value={form.cliente_nome}
                onChange={(event) => set("cliente_nome", event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Cidade
              </label>
              <input
                className={inputClass}
                placeholder="Cidade"
                value={form.cidade}
                onChange={(event) => set("cidade", event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Data *
              </label>
              <input
                type="date"
                className={inputClass}
                value={form.data}
                onChange={(event) => set("data", event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Turno
              </label>
              <select
                className={inputClass}
                value={form.turno}
                onChange={(event) => set("turno", event.target.value)}
              >
                {AGENDAMENTO_TURNOS.map((turno) => (
                  <option key={turno} value={turno}>
                    {turno}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Horario especifico
              </label>
              <input
                type="time"
                className={inputClass}
                value={form.hora}
                onChange={(event) => set("hora", event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">
              Status
            </label>
            <select
              className={inputClass}
              value={form.status}
              onChange={(event) => set("status", event.target.value)}
            >
              {AGENDAMENTO_STATUS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">
              Observacao
            </label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Detalhes importantes para a tratativa"
              value={form.observacao}
              onChange={(event) => set("observacao", event.target.value)}
            />
          </div>

          {erro && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {erro}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {editando && onExcluir ? (
              <button
                type="button"
                onClick={() => onExcluir(agendamento)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 size={16} />
                Excluir
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={saving}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Salvando..." : editando ? "Salvar alteracoes" : "Criar agendamento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgendamentoModal;


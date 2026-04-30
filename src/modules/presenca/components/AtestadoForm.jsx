import { useState, useRef, useCallback } from 'react';
import { X, Search, FileText } from 'lucide-react';
import { buscarCID } from '../services/atestadoService';

const CAMPOS_INICIAIS = {
  colaborador_id: '', data_atestado: '', dias_afastamento: '1',
  cid: '', cid_descricao: '', medico: '', crm: '', observacao: '',
};

const AtestadoForm = ({ colaboradores, onSubmit, onClose, inicial = null }) => {
  const [form,          setForm]          = useState(inicial ?? CAMPOS_INICIAIS);
  const [cidBusca,      setCidBusca]      = useState(inicial?.cid ?? '');
  const [resultadosCid, setResultados]    = useState([]);
  const [buscandoCid,   setBuscandoCid]   = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [erro,          setErro]          = useState('');
  const debounceRef = useRef(null);

  const handle = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleCidInput = useCallback((e) => {
    const val = e.target.value;
    setCidBusca(val);
    setForm((p) => ({ ...p, cid: val, cid_descricao: '' }));
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setResultados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscandoCid(true);
      const res = await buscarCID(val);
      setResultados(res);
      setBuscandoCid(false);
    }, 400);
  }, []);

  const selecionarCid = (item) => {
    const codigo = item.codigo ?? item.code ?? item.cid ?? '';
    const desc   = item.descricao ?? item.description ?? item.nome ?? '';
    setCidBusca(codigo);
    setForm((p) => ({ ...p, cid: codigo, cid_descricao: desc }));
    setResultados([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (!form.colaborador_id) { setErro('Selecione o colaborador.'); return; }
    if (!form.cid)            { setErro('Informe o CID.'); return; }
    setIsSubmitting(true);
    try {
      await onSubmit({ ...form, dias_afastamento: Number(form.dias_afastamento) });
      onClose();
    } catch {
      setErro('Erro ao salvar atestado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const colaboradoresAtivos = colaboradores.filter(
    (c) => c.status === 'Ativo' || c.status === 'Em Experiência'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText size={16} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {inicial ? 'Editar Atestado' : 'Novo Atestado'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Colaborador */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Colaborador *</label>
            <select name="colaborador_id" value={form.colaborador_id} onChange={handle} className="input-field">
              <option value="">Selecione...</option>
              {colaboradoresAtivos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          {/* Data + Dias */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Data do Atestado *</label>
              <input type="date" name="data_atestado" value={form.data_atestado} onChange={handle} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Dias de Afastamento</label>
              <input type="number" min="1" name="dias_afastamento" value={form.dias_afastamento} onChange={handle} className="input-field" />
            </div>
          </div>

          {/* CID com autocomplete */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">CID *</label>
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Digite o código ou descrição..."
                value={cidBusca}
                onChange={handleCidInput}
                className="input-field pl-9"
              />
              {buscandoCid && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {resultadosCid.length > 0 && (
                <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {resultadosCid.map((item, i) => {
                    const codigo = item.codigo ?? item.code ?? item.cid ?? '';
                    const desc   = item.descricao ?? item.description ?? item.nome ?? '';
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => selecionarCid(item)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors"
                        >
                          <span className="text-xs font-bold text-blue-600 mr-2">{codigo}</span>
                          <span className="text-xs text-gray-600">{desc}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {form.cid_descricao && (
              <p className="text-xs text-green-600 font-medium mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {form.cid_descricao}
              </p>
            )}
          </div>

          {/* Médico + CRM */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Médico</label>
              <input type="text" name="medico" value={form.medico} onChange={handle} placeholder="Nome do médico" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">CRM</label>
              <input type="text" name="crm" value={form.crm} onChange={handle} placeholder="CRM/UF" className="input-field" />
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Observação</label>
            <textarea
              name="observacao"
              value={form.observacao}
              onChange={handle}
              rows={3}
              placeholder="Observações adicionais..."
              className="input-field resize-none"
            />
          </div>

          {erro && (
            <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{erro}</div>
          )}

        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Salvando...' : inicial ? 'Salvar alterações' : 'Registrar Atestado'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AtestadoForm;

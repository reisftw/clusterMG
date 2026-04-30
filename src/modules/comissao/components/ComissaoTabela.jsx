import { useState } from 'react';
import { Pencil } from 'lucide-react';
import ComissaoLancamentoModal from './ComissaoLancamentoModal';

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const ComissaoTabela = ({ tabela, config, onLancar, podeEditar }) => {
  const [modal, setModal] = useState(null);

  if (!tabela.length) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
      <p className="text-gray-400 text-sm">Nenhum técnico encontrado.</p>
    </div>
  );

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                  Técnico
                </th>
                {MESES_LABEL.map((m) => (
                  <th key={m} colSpan={2} className="text-center px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-l border-gray-100">
                    {m}
                  </th>
                ))}
                <th colSpan={2} className="text-center px-4 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wide border-l border-blue-100 bg-blue-50">
                  Resumo Anual
                </th>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="sticky left-0 bg-gray-50/50 z-10" />
                {MESES_LABEL.map((_, i) => (
                  <th key={`sub-${i}`} colSpan={2} className="border-l border-gray-100 p-0">
                    <div className="flex">
                      <span className="flex-1 text-center px-1 py-1.5 text-[10px] text-gray-400 font-medium">Serv.</span>
                      <span className="flex-1 text-center px-1 py-1.5 text-[10px] text-gray-400 font-medium">Com.</span>
                    </div>
                  </th>
                ))}
                <th className="text-center px-2 py-1.5 text-[10px] text-blue-500 font-medium border-l border-blue-100 bg-blue-50">Serv.</th>
                <th className="text-center px-2 py-1.5 text-[10px] text-blue-500 font-medium bg-blue-50">Com.</th>
              </tr>
            </thead>
            <tbody>
              {tabela.map((item) => {
                const { colab, meses, totalServicos, totalComissao } = item;
                const nome     = colab?.nome ?? '';
                const partes   = nome.split(' ');
                const inicial  = (partes[0] ?? '').charAt(0).toUpperCase() || '?';
                const nomeExib = `${partes[0] ?? ''} ${partes[1] ?? ''}`.trim() || '—';

                return (
                  <tr key={colab?.id ?? Math.random()} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-2.5 sticky left-0 bg-white z-10 border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-[9px] font-bold">{inicial}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-xs">{nomeExib}</p>
                          <p className="text-[10px] text-gray-400">{colab?.cargo ?? ''}</p>
                        </div>
                      </div>
                    </td>

                    {meses.map((m, i) => (
                      <td key={`${colab?.id}-mes-${i}`} colSpan={2} className="border-l border-gray-100 p-0">
                        <div className="flex">
                          <div className="flex-1 flex items-center justify-center py-2.5 px-1">
                            {podeEditar ? (
                              <button
                                onClick={() => setModal({ colaborador: colab, mesIdx: i, valorAtual: m.servicos })}
                                className="group flex items-center gap-0.5 text-gray-600 hover:text-blue-600 font-semibold transition-colors"
                              >
                                <span>{m.servicos || '—'}</span>
                                <Pencil size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            ) : (
                              <span className="text-gray-600 font-medium">{m.servicos || '—'}</span>
                            )}
                          </div>
                          <div className="flex-1 flex items-center justify-center py-2.5 px-1">
                            <span className={m.servicos > 0 ? 'text-green-600 font-semibold' : 'text-gray-300'}>
                              {m.servicos > 0 ? `R$${m.comissao.toFixed(0)}` : '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                    ))}

                    <td className="text-center px-2 py-2.5 border-l border-blue-100 bg-blue-50/40">
                      <span className="font-bold text-blue-700">{totalServicos || '—'}</span>
                    </td>
                    <td className="text-center px-2 py-2.5 bg-blue-50/40">
                      <span className={totalComissao > 0 ? 'font-bold text-green-600' : 'text-gray-300'}>
                        {totalComissao > 0 ? `R$${totalComissao.toFixed(0)}` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Totais */}
              {(() => {
                const totServ = tabela.reduce((s, i) => s + (i.totalServicos || 0), 0);
                const totCom  = tabela.reduce((s, i) => s + (i.totalComissao || 0), 0);
                return (
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="px-4 py-3 text-xs font-bold text-gray-700 sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                      TOTAL GERAL
                    </td>
                    {MESES_LABEL.map((_, i) => {
                      const mServ = tabela.reduce((s, item) => s + (item.meses[i]?.servicos || 0), 0);
                      const mCom  = tabela.reduce((s, item) => s + (item.meses[i]?.comissao || 0), 0);
                      return (
                        <td key={`total-mes-${i}`} colSpan={2} className="border-l border-gray-200 p-0">
                          <div className="flex">
                            <div className="flex-1 text-center py-3 px-1 text-gray-700">{mServ || '—'}</div>
                            <div className="flex-1 text-center py-3 px-1 text-green-600">
                              {mCom > 0 ? `R$${mCom.toFixed(0)}` : '—'}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-3 border-l border-blue-200 bg-blue-50 text-blue-700">
                      {totServ || '—'}
                    </td>
                    <td className="text-center px-2 py-3 bg-blue-50 text-green-600">
                      {totCom > 0 ? `R$${totCom.toFixed(0)}` : '—'}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ComissaoLancamentoModal
          colaborador={modal.colaborador}
          mesIdx={modal.mesIdx}
          valorAtual={modal.valorAtual}
          config={config}
          onSalvar={onLancar}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
};

export default ComissaoTabela;

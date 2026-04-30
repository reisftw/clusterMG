import { useState, useEffect } from "react";
import {
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Archive,
  Send,
  MessageSquare,
  Download,
} from "lucide-react";
import { useAuthContext } from "../../../context/AuthContext";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const STATUS_CONFIG = {
  aberta: {
    label: "Aberta",
    style: "bg-red-50 text-red-600 border-red-100",
    icon: <AlertTriangle size={13} />,
  },
  em_analise: {
    label: "Em Análise",
    style: "bg-yellow-50 text-yellow-600 border-yellow-100",
    icon: <Clock size={13} />,
  },
  resolvida: {
    label: "Resolvida",
    style: "bg-green-50 text-green-700 border-green-100",
    icon: <CheckCircle2 size={13} />,
  },
  arquivada: {
    label: "Arquivada",
    style: "bg-gray-100 text-gray-500 border-gray-200",
    icon: <Archive size={13} />,
  },
};

const PRIORIDADE_CONFIG = {
  baixa: "bg-gray-100 text-gray-500 border-gray-200",
  media: "bg-blue-50 text-blue-600 border-blue-100",
  alta: "bg-orange-50 text-orange-600 border-orange-100",
  critica: "bg-red-50 text-red-600 border-red-100",
};

const PRIORIDADE_LABEL = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const Campo = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
      {label}
    </p>
    <p className="text-sm text-gray-700">{value || "—"}</p>
  </div>
);

const comentarioCacheKey = (id) => `fs-reclamacoes:comentarios:${id}`;

const FSReclamacaoDetalheModal = ({
  reclamacao: r,
  onClose,
  onEditar,
  onDeletar,
  onAtualizarStatus,
  onExportarPDF,
}) => {
  const { currentUser } = useAuthContext();
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [comentarios, setComentarios] = useState([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [loadingComentarios, setLoadingComentarios] = useState(true);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let ativo = true;

    const carregar = async () => {
      setLoadingComentarios(true);
      try {
        const { data } = await getOrLoadCachedValue(
          comentarioCacheKey(r.id),
          async () => {
            const snap = await getDocs(
              query(
                collection(db, "fs_reclamacoes", r.id, "comentarios"),
                orderBy("criado_em", "asc"),
                limit(100),
              ),
            );
            logFirestoreRead({
              source: "FSReclamacaoDetalheModal",
              operation: "getDocs",
              path: `fs_reclamacoes/${r.id}/comentarios`,
              count: snap.size,
              details: "limit=100",
            });
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          },
          { ttlMs: 5 * 60 * 1000 },
        );

        if (ativo) setComentarios(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (ativo) setLoadingComentarios(false);
      }
    };

    carregar();
    return () => {
      ativo = false;
    };
  }, [r.id]);

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    setEnviando(true);
    try {
      const ref = await addDoc(
        collection(db, "fs_reclamacoes", r.id, "comentarios"),
        {
          texto: novoComentario.trim(),
          autor: currentUser?.nome || currentUser?.email || "Usuário",
          criado_em: serverTimestamp(),
        },
      );

      invalidateCache(comentarioCacheKey(r.id));
      setComentarios((prev) => [
        ...prev,
        {
          id: ref.id,
          texto: novoComentario.trim(),
          autor: currentUser?.nome || currentUser?.email || "Usuário",
          criado_em: new Date(),
        },
      ]);
      setNovoComentario("");
    } catch (e) {
      console.error(e);
    } finally {
      setEnviando(false);
    }
  };

  const fmt = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return (
      d.toLocaleDateString("pt-BR") +
      " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const fmtData = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("pt-BR");
  };

  const status = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.aberta;

  const colaboradores = Array.isArray(r.colaboradores_envolvidos)
    ? r.colaboradores_envolvidos
    : r.colaborador_envolvido
      ? [{ nome: r.colaborador_envolvido }]
      : [];

  const handleExportar = async () => {
    setExportando(true);
    try {
      await onExportarPDF(r);
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar PDF");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${status.style}`}>
                {status.icon} {status.label}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${PRIORIDADE_CONFIG[r.prioridade] ?? ""}`}>
                {PRIORIDADE_LABEL[r.prioridade] ?? "—"}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${r.tipo === "interna" ? "bg-purple-50 text-purple-600 border-purple-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}>
                {r.tipo === "interna" ? "Interna" : "Externa"}
              </span>
            </div>
            <h3 className="font-bold text-gray-900 text-base leading-tight">{r.titulo}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5 border-b border-gray-100">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Atualizar Status</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => onAtualizarStatus(r.id, key)}
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                      r.status === key
                        ? cfg.style + " ring-2 ring-offset-1 ring-blue-300"
                        : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                    }`}
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Categoria" value={r.categoria} />
              <Campo label="Regional" value={r.regional} />
              <Campo label="Reclamante" value={r.reclamante} />
              <Campo label="Data do Ocorrido" value={r.data_ocorrido} />
              <Campo label="Registrado em" value={fmtData(r.criado_em)} />
              <Campo label="Atualizado em" value={fmtData(r.atualizado_em)} />
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Colaboradores Envolvidos</p>
              {colaboradores.length === 0 ? (
                <p className="text-sm text-gray-400">—</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {colaboradores.map((col, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-semibold"
                    >
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                        {col.nome?.charAt(0)?.toUpperCase() ?? "?"}
                      </span>
                      {col.nome}
                      {col.avulso && (
                        <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">externo</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Descrição</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                {r.descricao || "—"}
              </p>
            </div>

            {r.resolucao && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Resolução / Parecer</p>
                <p className="text-sm text-gray-700 bg-green-50 rounded-xl p-3 leading-relaxed whitespace-pre-wrap border border-green-100">
                  {r.resolucao}
                </p>
              </div>
            )}
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-gray-400" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tratativas & Comentários</p>
              {comentarios.length > 0 && (
                <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                  {comentarios.length}
                </span>
              )}
            </div>

            {loadingComentarios ? (
              <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
            ) : comentarios.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum comentário ainda. Adicione a primeira tratativa.</p>
            ) : (
              <div className="space-y-3">
                {comentarios.map((c, i) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">
                          {c.autor?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      {i < comentarios.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-700">{c.autor}</span>
                        <span className="text-[10px] text-gray-400">{fmt(c.criado_em)}</span>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
                        {c.texto}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <textarea
                value={novoComentario}
                onChange={(e) => setNovoComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarComentario();
                  }
                }}
                placeholder="Adicione uma tratativa ou comentário... (Enter para enviar)"
                rows={2}
                className="input-field flex-1 resize-none text-sm"
              />
              <button
                onClick={enviarComentario}
                disabled={!novoComentario.trim() || enviando}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleExportar}
            disabled={exportando}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 border border-blue-100 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            <Download size={14} /> {exportando ? "Gerando..." : "Baixar PDF"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDelConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-red-500 border border-red-100 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} /> Excluir
            </button>
            <button
              onClick={() => {
                onEditar(r);
                onClose();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Pencil size={14} /> Editar
            </button>
          </div>
        </div>
      </div>

      {showDelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">Excluir reclamação?</p>
                <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDelConfirm(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      onDeletar(r.id);
                      onClose();
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FSReclamacaoDetalheModal;

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Pencil, Trash2, RefreshCw, Plus, X, KeyRound } from "lucide-react";
import { db, functions } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import { ROLES } from "../../../constants/roles";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import EditarUsuarioModal from "./EditarUsuarioModal";
import Spinner from "../../../components/ui/Spinner";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const ROLE_STYLES = {
  [ROLES.ADMIN]: "bg-red-100 text-red-700",
  [ROLES.GESTOR]: "bg-blue-100 text-blue-700",
  [ROLES.TECNICO]: "bg-green-100 text-green-700",
};

const CACHE_KEY = "usuarios:lista";
const CACHE_TTL = 10 * 60 * 1000;
const USUARIOS_MAX = 300;
const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

function criarUsuarioCallable() {
  return httpsCallable(functions, "criarUsuario");
}

function deletarUsuarioCallable() {
  return httpsCallable(functions, "deletarUsuario");
}

function getCallableErrorMessage(error, fallbackMessage) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (
    code === "functions/already-exists" ||
    message.includes("already-exists") ||
    message.includes("ja cadastrado")
  ) {
    return "E-mail ja cadastrado.";
  }

  if (
    code === "functions/permission-denied" ||
    message.includes("Permissao insuficiente")
  ) {
    return "Voce nao tem permissao para executar esta acao.";
  }

  if (
    code === "functions/unauthenticated" ||
    message.includes("Autenticacao obrigatoria")
  ) {
    return "Sua sessao expirou. Entre novamente para continuar.";
  }

  if (code === "functions/invalid-argument" && message) {
    return message;
  }

  return message || fallbackMessage;
}

const NovoUsuarioModal = ({ onClose, onCriado }) => {
  const { regionais } = useRegionais();
  const [form, setForm] = useState({
    nome: "",
    email: "",
    role: ROLES.TECNICO,
    regional: "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [resultadoCriacao, setResultadoCriacao] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const set = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  const handleCriar = async () => {
    if (!form.nome.trim() || !form.email.trim()) {
      setErro("Preencha nome e e-mail.");
      return;
    }

    setSaving(true);
    setErro("");
    setCopiado(false);

    try {
      const response = await criarUsuarioCallable()({
        email: form.email.trim().toLowerCase(),
        nome: form.nome.trim(),
        role: form.role,
        regional: form.regional,
      });
      const result = response?.data || {};

      invalidateCache(CACHE_KEY);
      onCriado();
      setResultadoCriacao({
        email: form.email.trim().toLowerCase(),
        passwordResetLink: result.passwordResetLink || "",
      });
    } catch (error) {
      setErro(getCallableErrorMessage(error, "Erro ao criar usuario."));
    } finally {
      setSaving(false);
    }
  };

  const handleCopiarLink = async () => {
    if (!resultadoCriacao?.passwordResetLink || !navigator?.clipboard) return;

    await navigator.clipboard.writeText(resultadoCriacao.passwordResetLink);
    setCopiado(true);
  };

  if (resultadoCriacao) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
              <KeyRound size={22} />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h2 className="font-bold text-gray-900">Primeiro acesso gerado</h2>
            <p className="text-sm text-gray-600">
              Compartilhe o link abaixo com{" "}
              <strong>{resultadoCriacao.email}</strong> por um canal seguro.
            </p>
          </div>

          <textarea
            readOnly
            value={resultadoCriacao.passwordResetLink}
            className="w-full h-28 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700"
          />

          {!resultadoCriacao.passwordResetLink ? (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              O usuario deve verificar o e-mail para definir a senha inicial.
            </p>
          ) : null}

          {copiado ? (
            <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              Link copiado com sucesso.
            </p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
            >
              Fechar
            </button>
            <button
              onClick={handleCopiarLink}
              disabled={!resultadoCriacao.passwordResetLink}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 text-sm"
            >
              Copiar link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <div className="flex justify-center">
          <img
            src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
            alt="Logo"
            className="h-8 object-contain"
          />
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Novo Usuario</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {erro ? (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {erro}
          </p>
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nome *
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={(event) => set("nome", event.target.value)}
              placeholder="Nome completo"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              E-mail *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
              placeholder="email@exemplo.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Primeiro acesso
            </label>
            <p className="text-[10px] text-amber-600 mt-1">
              O backend cria uma senha temporaria aleatoria e devolve um link seguro para definicao da senha pessoal.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Role *
              </label>
              <select
                value={form.role}
                onChange={(event) => set("role", event.target.value)}
                className={inputClass}
              >
                {Object.values(ROLES).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Regional
              </label>
              <select
                value={form.regional}
                onChange={(event) => set("regional", event.target.value)}
                className={inputClass}
              >
                <option value="">- Nenhuma -</option>
                {regionais.map((regional) => (
                  <option key={regional.id} value={regional.nome}>
                    {regional.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleCriar}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 text-sm"
          >
            {saving ? "Criando..." : "Criar Usuario"}
          </button>
        </div>
      </div>
    </div>
  );
};

const UsuariosPage = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [erroPagina, setErroPagina] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErroPagina("");

    try {
      const { data } = await getOrLoadCachedValue(
        CACHE_KEY,
        async () => {
          const snap = await getDocs(
            query(
              collection(db, COLLECTIONS.USUARIOS),
              orderBy("nome"),
              limit(USUARIOS_MAX),
            ),
          );

          logFirestoreRead({
            source: "UsuariosPage",
            operation: "getDocs",
            path: COLLECTIONS.USUARIOS,
            count: snap.size,
          });

          return snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
        },
        { ttlMs: CACHE_TTL },
      );

      setUsuarios(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const deletar = async (uid) => {
    if (!confirm("Deseja remover este usuario do sistema?")) return;

    setErroPagina("");

    try {
      await deletarUsuarioCallable()({ uid });
      invalidateCache(CACHE_KEY);
      setUsuarios((current) => current.filter((item) => item.id !== uid));
    } catch (error) {
      setErroPagina(getCallableErrorMessage(error, "Erro ao remover usuario."));
    }
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Usuarios</h2>
          <p className="text-sm text-gray-500">
            {usuarios.length} usuario(s) cadastrado(s)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={carregar}
            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setModalNovo(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> Novo Usuario
          </button>
        </div>
      </div>

      {erroPagina ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroPagina}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Nome
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  E-mail
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Regional
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((usuario) => (
                <tr key={usuario.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {usuario.nome}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{usuario.email}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {usuario.regional || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_STYLES[usuario.role] ?? ""}`}
                    >
                      {usuario.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditando(usuario)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => deletar(usuario.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalNovo ? (
        <NovoUsuarioModal
          onClose={() => setModalNovo(false)}
          onCriado={() => {
            invalidateCache(CACHE_KEY);
            carregar();
          }}
        />
      ) : null}

      {editando ? (
        <EditarUsuarioModal
          usuario={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            invalidateCache(CACHE_KEY);
            carregar();
          }}
        />
      ) : null}
    </div>
  );
};

export default UsuariosPage;

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  orderBy,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { db, firebaseConfig } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import { ROLES } from "../../../constants/roles";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import { Pencil, Trash2, RefreshCw, Plus, X, KeyRound } from "lucide-react";
import EditarUsuarioModal from "./EditarUsuarioModal";
import Spinner from "../../../components/ui/Spinner";
import {
  getOrLoadCachedValue,
  invalidateCache,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const ROLE_STYLES = {
  ADMIN: "bg-red-100 text-red-700",
  GESTOR: "bg-blue-100 text-blue-700",
  TECNICO: "bg-green-100 text-green-700",
};

const SENHA_PADRAO = "Sempre#2026";
const CACHE_KEY = "usuarios:lista";
const CACHE_TTL = 10 * 60 * 1000;
const USUARIOS_MAX = 300;
const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

const NovoUsuarioModal = ({ onClose, onCriado }) => {
  const { regionais } = useRegionais();
  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: SENHA_PADRAO,
    role: ROLES.TECNICO,
    regional: "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const handleCriar = async () => {
    if (!form.nome.trim() || !form.email.trim() || !form.senha.trim()) {
      setErro("Preencha nome, e-mail e senha.");
      return;
    }
    if (form.senha.length < 6) {
      setErro("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      const adminAuth = getAuth();
      const adminEmail = adminAuth.currentUser?.email;
      const adminSenha = prompt(
        "Confirme sua senha de administrador para continuar:",
      );
      if (!adminSenha) {
        setSaving(false);
        return;
      }

      const appName = `criacao-${Date.now()}`;
      const appSecundario = initializeApp(firebaseConfig, appName);
      const authSecundario = getAuth(appSecundario);

      const cred = await createUserWithEmailAndPassword(
        authSecundario,
        form.email.trim(),
        form.senha,
      );

      await setDoc(doc(db, COLLECTIONS.USUARIOS, cred.user.uid), {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        regional: form.regional,
        trocar_senha: form.senha === SENHA_PADRAO,
      });

      await deleteApp(appSecundario);
      await signInWithEmailAndPassword(adminAuth, adminEmail, adminSenha);

      invalidateCache(CACHE_KEY);
      onCriado();
      onClose();
    } catch (e) {
      if (
        e.code === "auth/email-already-in-use" ||
        e.message?.includes("email-already-in-use")
      )
        setErro("E-mail já cadastrado.");
      else if (e.code === "auth/invalid-email") setErro("E-mail inválido.");
      else if (
        e.code === "auth/wrong-password" ||
        e.code === "auth/invalid-credential"
      )
        setErro("Senha de administrador incorreta.");
      else setErro("Erro ao criar usuário: " + e.message);
    } finally {
      setSaving(false);
    }
  };

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
          <h2 className="font-bold text-gray-900">Novo Usuário</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {erro && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {erro}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nome *
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
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
              onChange={(e) => set("email", e.target.value)}
              placeholder="email@exemplo.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Senha *{" "}
              <span className="text-gray-400 font-normal">
                (padrão: {SENHA_PADRAO})
              </span>
            </label>
            <input
              type="text"
              value={form.senha}
              onChange={(e) => set("senha", e.target.value)}
              className={inputClass}
            />
            <p className="text-[10px] text-amber-600 mt-1">
              ⚠️ O usuário será obrigado a trocar a senha no primeiro acesso se
              usar a senha padrão.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Role *
              </label>
              <select
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                className={inputClass}
              >
                {Object.values(ROLES).map((r) => (
                  <option key={r} value={r}>
                    {r}
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
                onChange={(e) => set("regional", e.target.value)}
                className={inputClass}
              >
                <option value="">— Nenhuma —</option>
                {regionais.map((r) => (
                  <option key={r.id} value={r.nome}>
                    {r.nome}
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
            {saving ? "Criando..." : "Criar Usuário"}
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

  const carregar = useCallback(async () => {
    setLoading(true);
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
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    if (!confirm("Deseja remover este usuário do sistema?")) return;
    try {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, COLLECTIONS.USUARIOS, uid));
      invalidateCache(CACHE_KEY);
      setUsuarios((prev) => prev.filter((item) => item.id !== uid));
    } catch (e) {
      alert("Erro ao deletar: " + e.message);
    }
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Usuários</h2>
          <p className="text-sm text-gray-500">
            {usuarios.length} usuário(s) cadastrado(s)
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
            <Plus size={16} /> Novo Usuário
          </button>
        </div>
      </div>

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
                  Senha
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.nome}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.regional || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_STYLES[u.role] ?? ""}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.trocar_senha ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <KeyRound size={12} /> Padrão
                      </span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium">
                        ✓ Personalizada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditando(u)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => deletar(u.id)}
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

      {modalNovo && (
        <NovoUsuarioModal
          onClose={() => setModalNovo(false)}
          onCriado={() => {
            invalidateCache(CACHE_KEY);
            carregar();
          }}
        />
      )}
      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            invalidateCache(CACHE_KEY);
            carregar();
          }}
        />
      )}
    </div>
  );
};

export default UsuariosPage;

import { useState } from "react";
import { X, User } from "lucide-react";
import { atualizarUsuarioAdmin } from "../services/authService";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import { ROLES } from "../../../constants/roles";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

const EditarUsuarioModal = ({ usuario, onClose, onSalvo }) => {
  const { regionais } = useRegionais();
  const [form, setForm] = useState({
    nome: usuario.nome || "",
    email: usuario.email || "",
    role: usuario.role || ROLES.TECNICO,
    regional: usuario.regional || "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const handleSalvar = async () => {
    if (!form.nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      await atualizarUsuarioAdmin(usuario.id, {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        regional: form.regional,
      });
      onSalvo();
      onClose();
    } catch (e) {
      setErro("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 space-y-4">
        <div className="flex justify-center">
          <img
            src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
            alt="Logo"
            className="h-8 object-contain"
          />
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <User size={17} /> Editar Usuário
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {erro && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {erro}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Nome *
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              className={inputClass}
              placeholder="Nome completo"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass}
              placeholder="email@exemplo.com"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              * Alterar e-mail só atualiza o Firestore. Para alterar no Auth, o
              próprio usuário deve fazer pelo perfil.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
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
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
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
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 text-sm"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditarUsuarioModal;

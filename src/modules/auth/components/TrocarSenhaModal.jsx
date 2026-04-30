import { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { trocarSenha, atualizarPerfilFirestore } from "../services/authService";
import { useAuthContext } from "../../../context/AuthContext";

const TrocarSenhaModal = ({ obrigatorio = false, onClose }) => {
  const { currentUser, refreshUser } = useAuthContext();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showAtual, setShowAtual] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10";

  const handleSalvar = async () => {
    setErro("");
    if (!senhaAtual) {
      setErro("Informe a senha atual.");
      return;
    }
    if (novaSenha.length < 6) {
      setErro("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setErro("As senhas não coincidem.");
      return;
    }
    if (novaSenha === "Sempre#2026") {
      setErro("Escolha uma senha diferente da senha padrão.");
      return;
    }

    setSaving(true);
    try {
      await trocarSenha(senhaAtual, novaSenha);
      await atualizarPerfilFirestore(currentUser.id, { trocar_senha: false });
      await refreshUser();
      onClose?.();
    } catch (e) {
      if (
        e.code === "auth/wrong-password" ||
        e.code === "auth/invalid-credential"
      ) {
        setErro("Senha atual incorreta.");
      } else {
        setErro("Erro ao trocar senha: " + e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 space-y-4">
        <div className="text-center space-y-1">
          {/* Logo da empresa */}
          <div className="flex justify-center mb-2">
            <img
              src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
              alt="Logo"
              className="h-8 object-contain"
            />
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
            <KeyRound size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="font-bold text-gray-900 dark:text-white">
            {obrigatorio ? "Troque sua senha" : "Alterar senha"}
          </h2>
          {obrigatorio && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Por segurança, crie uma senha pessoal antes de continuar.
            </p>
          )}
        </div>

        {erro && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {erro}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Senha atual
            </label>
            <div className="relative">
              <input
                type={showAtual ? "text" : "password"}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className={inputClass}
                placeholder="Senha atual"
              />
              <button
                type="button"
                onClick={() => setShowAtual((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showAtual ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showNova ? "text" : "password"}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className={inputClass}
                placeholder="Mínimo 6 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowNova((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showNova ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Confirmar nova senha
            </label>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className={inputClass.replace("pr-10", "")}
              placeholder="Repita a nova senha"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          {!obrigatorio && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSalvar}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 text-sm"
          >
            {saving ? "Salvando..." : "Salvar senha"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrocarSenhaModal;

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../../services/firebase";

const ADMIN_USER = {
  email: "admin@sempreinternet.com.br",
  password: "Admin@2025",
  nome: "Rodrigo Reis",
  role: "ADMIN",
  regional: "Brumadinho",
};

const SeedPage = () => {
  const [status, setStatus] = useState("idle");
  const [uid, setUid] = useState("");

  const handleSeed = async () => {
    setStatus("loading");
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        ADMIN_USER.email,
        ADMIN_USER.password,
      );

      await setDoc(doc(db, "usuarios", credential.user.uid), {
        nome: ADMIN_USER.nome,
        email: ADMIN_USER.email,
        role: ADMIN_USER.role,
        regional: ADMIN_USER.regional,
      });

      setUid(credential.user.uid);
      setStatus("success");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setStatus("exists");
      } else {
        setStatus("error");
      }
    }
  };

  const messages = {
    idle: {
      text: "Clique para criar o usuário ADMIN inicial.",
      color: "text-gray-500",
    },
    loading: { text: "Criando usuário...", color: "text-blue-500" },
    success: { text: `✅ ADMIN criado! UID: ${uid}`, color: "text-green-500" },
    error: {
      text: "❌ Erro ao criar usuário. Veja o console.",
      color: "text-red-500",
    },
    exists: {
      text: "⚠️ Usuário já existe. Pode fazer login.",
      color: "text-yellow-500",
    },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 text-center">
        {/* Logo da empresa */}
        <div className="flex justify-center mb-6">
          <img
            src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
            alt="Logo"
            className="h-10 object-contain"
          />
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Setup Inicial
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Cria o primeiro usuário <strong>ADMIN</strong> no Firebase.
          <br />
          <span className="text-red-400 text-xs">
            Remova esta rota após o uso.
          </span>
        </p>

        <div className="text-left text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 space-y-1">
          <p>
            <span className="text-gray-400">E-mail:</span>{" "}
            <strong className="text-gray-900 dark:text-white">
              {ADMIN_USER.email}
            </strong>
          </p>
          <p>
            <span className="text-gray-400">Senha:</span>{" "}
            <strong className="text-gray-900 dark:text-white">
              {ADMIN_USER.password}
            </strong>
          </p>
          <p>
            <span className="text-gray-400">Role:</span>{" "}
            <strong className="text-green-500">{ADMIN_USER.role}</strong>
          </p>
          <p>
            <span className="text-gray-400">Regional:</span>{" "}
            <strong className="text-gray-900 dark:text-white">
              {ADMIN_USER.regional}
            </strong>
          </p>
        </div>

        <p className={`text-sm mb-4 ${messages[status].color}`}>
          {messages[status].text}
        </p>

        <button
          onClick={handleSeed}
          disabled={status === "loading" || status === "success"}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
        >
          {status === "loading" ? "Criando..." : "Criar ADMIN"}
        </button>
      </div>
    </div>
  );
};

export default SeedPage;

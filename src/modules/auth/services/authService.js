import { COLLECTIONS } from "../../../constants/dataCollections";
import {
  clearVpsAuthSession,
  getVpsAuthSession,
  setVpsAuthSession,
  subscribeToVpsAuthSession,
} from "../../../services/vpsAuthSession";
import {
  getApiBaseUrl,
  getVpsDocument,
  listVpsDocuments,
  requestVpsApi,
  updateVpsDocument,
} from "../../../services/vpsApiClient";

async function requestPublicAuth(path, body) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Erro HTTP ${response.status}.`);
  }

  return data;
}

function buildCredentialUser(user = {}) {
  return {
    ...user,
    uid: user.id || user.uid,
    email: user.email,
  };
}

export const loginWithEmail = async (email, password) => {
  const session = await requestPublicAuth("/auth/login", { email, password });
  if (session?.mfaRequired) {
    return {
      mfaRequired: true,
      method: session.method || "email",
      challengeId: session.challengeId,
      maskedEmail: session.maskedEmail,
      expiresAt: session.expiresAt,
      ttlMinutes: session.ttlMinutes,
    };
  }
  if (!session?.user?.id) {
    throw new Error(session?.error || "E-mail ou senha invalidos.");
  }
  setVpsAuthSession(session);
  return {
    user: buildCredentialUser(session.user),
  };
};

export const verificarMfaEmail = async ({ challengeId, code }) => {
  const session = await requestPublicAuth("/auth/mfa/email/verify", { challengeId, code });
  if (!session?.user?.id) {
    throw new Error(session?.error || "Código MFA inválido.");
  }
  setVpsAuthSession(session);
  return {
    user: buildCredentialUser(session.user),
  };
};

export const obterConfigGoogleLogin = async () => {
  const response = await fetch(`${getApiBaseUrl()}/auth/google/config`, {
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Erro HTTP ${response.status}.`);
  return data || { enabled: false, clientId: "" };
};

export const obterConfigOktaLogin = async () => {
  const response = await fetch(`${getApiBaseUrl()}/auth/okta/config`, {
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Erro HTTP ${response.status}.`);
  return data || { enabled: false, issuer: "", clientId: "", redirectUri: "" };
};

export const loginWithGoogleCredential = async (credential) => {
  const session = await requestPublicAuth("/auth/google", { credential });
  if (!session?.user?.id) {
    throw new Error(session?.error || "Não foi possível entrar com Google.");
  }
  setVpsAuthSession(session);
  return {
    user: buildCredentialUser(session.user),
  };
};

export const loginWithOktaCredential = async ({ credential, nonce }) => {
  const session = await requestPublicAuth("/auth/okta", { credential, nonce });
  if (!session?.user?.id) {
    throw new Error(session?.error || "Não foi possível entrar com Okta.");
  }
  setVpsAuthSession(session);
  return {
    user: buildCredentialUser(session.user),
  };
};

export const solicitarRedefinicaoSenha = async (email) =>
  requestPublicAuth("/auth/forgot-password", { email });

export const redefinirSenhaComToken = async (token, password) =>
  requestPublicAuth("/auth/reset-password", { token, password });

export const logout = async () => {
  await requestVpsApi("/auth/logout", { method: "POST" }).catch(() => null);
  clearVpsAuthSession();
};

export const subscribeToAuthChanges = (callback) =>
  subscribeToVpsAuthSession((user) => {
    callback(user ? buildCredentialUser(user) : null);
  });

export const fetchUserProfile = async (uid) => {
  const response = await requestVpsApi("/auth/me");
  if (response?.user) {
    setVpsAuthSession({
      ...getVpsAuthSession(),
      csrfToken: response.csrfToken || "",
      token: response.token || getVpsAuthSession()?.token || "",
      user: response.user,
    });
    return response.user;
  }

  if (!uid) throw new Error("Perfil nao encontrado");
  const profile = await getVpsDocument(`${COLLECTIONS.USUARIOS}/${uid}`);
  if (!profile) throw new Error("Perfil nao encontrado");
  return profile;
};

export const refreshUser = async (uid = getVpsAuthSession()?.user?.id) => {
  if (!uid) throw new Error("Usuario nao autenticado");
  return fetchUserProfile(uid);
};

export const reautenticar = async () => true;

export const trocarSenha = async (senhaAtual, novaSenha) => {
  await requestVpsApi("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: senhaAtual,
      nextPassword: novaSenha,
    }),
  });
};

export const atualizarEmailAuth = async (_senhaAtual, novoEmail) => {
  const uid = getVpsAuthSession()?.user?.id;
  if (!uid) throw new Error("Usuario nao autenticado.");
  await requestVpsApi(`/admin/users/${encodeURIComponent(uid)}`, {
    method: "PUT",
    body: JSON.stringify({ email: novoEmail }),
  });
};

export const atualizarPerfilVps = async (uid, dados) => {
  await updateVpsDocument(`${COLLECTIONS.USUARIOS}/${uid}`, {
    ...dados,
    atualizado_em: new Date().toISOString(),
  });
};

export const atualizarAvatarPerfil = async (file) => {
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await requestVpsApi("/auth/avatar", {
    method: "PUT",
    body: formData,
  });
  if (response?.user) {
    setVpsAuthSession({
      ...getVpsAuthSession(),
      csrfToken: response.csrfToken || getVpsAuthSession()?.csrfToken || "",
      user: response.user,
    });
  }
  return response?.user;
};

export const enviarAvatarAdmin = async (file) => {
  const formData = new FormData();
  formData.append("avatar", file);
  const response = await requestVpsApi("/admin/avatars", {
    method: "POST",
    body: formData,
  });
  return response?.avatarUrl || "";
};

export const atualizarUsuarioAdmin = async (uid, dados) => {
  await requestVpsApi(`/admin/users/${encodeURIComponent(uid)}`, {
    method: "PUT",
    body: JSON.stringify(dados || {}),
  });
};

export const listarUsuariosAdmin = async () => {
  const response = await requestVpsApi("/admin/users");
  return {
    items: response?.items || [],
    stats: response?.stats || {},
    total: response?.total || 0,
  };
};

export const criarUsuarioAdmin = async (dados) =>
  requestVpsApi("/admin/users", {
    method: "POST",
    body: JSON.stringify(dados || {}),
  });

export const deletarUsuarioAdmin = async (uid) =>
  requestVpsApi(`/admin/users/${encodeURIComponent(uid)}`, {
    method: "DELETE",
  });

export const gerarLinkPrimeiroAcessoAdmin = async (uid) =>
  requestVpsApi(`/admin/users/${encodeURIComponent(uid)}/first-access`, {
    method: "POST",
  });

export const listarRegionaisAdmin = async () => {
  const response = await requestVpsApi("/admin/regionais");
  return (response?.regionais || [])
    .map((regional) => {
      if (typeof regional === "string") {
        return { id: regional, nome: regional };
      }
      return {
        id: regional?.id || regional?.nome || regional?.documentId || "",
        nome: regional?.nome || regional?.id || regional?.documentId || "",
      };
    })
    .filter((regional) => regional.nome);
};

export const listarEmpresasAdmin = async () => {
  return (await listVpsDocuments(COLLECTIONS.EMPRESAS_TECNICOS, { limit: 1000 }))
    .map((empresa) => ({
      id: empresa.id,
      nome: empresa.nome || empresa.empresa || "",
      regional: empresa.regional || empresa.regionais?.[0] || "",
    }))
    .filter((empresa) => empresa.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

export const listarCargosAdmin = async () => {
  const response = await requestVpsApi("/admin/roles");
  return (response?.roles || [])
    .filter((role) => role.active !== false)
    .map((role) => ({
      value: role.id,
      label: role.name || role.id,
      permissions: role.permissions || [],
    }));
};

export const obterConfigGoogleOAuthAdmin = async () => {
  const response = await requestVpsApi("/admin/oauth/google");
  return response?.config || {
    enabled: false,
    clientId: "",
    allowedDomains: "",
    autoProvision: false,
    defaultRole: "visitante",
  };
};

export const salvarConfigGoogleOAuthAdmin = async (config) => {
  const response = await requestVpsApi("/admin/oauth/google", {
    method: "PUT",
    body: JSON.stringify(config || {}),
  });
  return response?.config || {};
};

export const obterConfigOktaOAuthAdmin = async () => {
  const response = await requestVpsApi("/admin/oauth/okta");
  return response?.config || {
    enabled: false,
    issuer: "",
    clientId: "",
    redirectUri: "",
    allowedDomains: "",
    autoProvision: false,
    defaultRole: "visitante",
  };
};

export const salvarConfigOktaOAuthAdmin = async (config) => {
  const response = await requestVpsApi("/admin/oauth/okta", {
    method: "PUT",
    body: JSON.stringify(config || {}),
  });
  return response?.config || {};
};


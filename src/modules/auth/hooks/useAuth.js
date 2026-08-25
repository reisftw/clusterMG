import { useState, useEffect, useCallback } from "react";
import {
  loginWithEmail,
  loginWithGoogleCredential,
  loginWithOktaCredential,
  logout,
  fetchUserProfile,
  subscribeToAuthChanges,
  verificarMfaEmail,
} from "../services/authService";

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trocarSenhaObrigatorio, setTrocarSenhaObrigatorio] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (sessionUser) => {
      if (sessionUser) {
        try {
          const profile = await fetchUserProfile(sessionUser.uid);
          setCurrentUser(profile);
          setTrocarSenhaObrigatorio(!!profile.trocar_senha);
        } catch (err) {
          console.error("Erro ao buscar perfil:", err);
          setCurrentUser(sessionUser);
          setTrocarSenhaObrigatorio(!!sessionUser.trocar_senha);
        }
      } else {
        setCurrentUser(null);
        setTrocarSenhaObrigatorio(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email, password, turnstileToken = "") => {
    setError(null);
    setLoading(true);

    try {
      const credential = await loginWithEmail(email, password, turnstileToken);
      if (credential?.mfaRequired) {
        return credential;
      }
      let profile = credential.user;
      try {
        profile = await fetchUserProfile(credential.user.uid);
      } catch (profileError) {
        console.error("Erro ao buscar perfil após login:", profileError);
      }
      setCurrentUser(profile);
      setTrocarSenhaObrigatorio(!!profile.trocar_senha);
      return null;
    } catch (err) {
      const message = err?.message || "Não foi possível entrar.";
      setError(message);
      setCurrentUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyEmailMfa = useCallback(async ({ challengeId, code, turnstileToken = "" }) => {
    setError(null);
    setLoading(true);

    try {
      const credential = await verificarMfaEmail({ challengeId, code, turnstileToken });
      let profile = credential.user;
      try {
        profile = await fetchUserProfile(credential.user.uid);
      } catch (profileError) {
        console.error("Erro ao buscar perfil após MFA:", profileError);
      }
      setCurrentUser(profile);
      setTrocarSenhaObrigatorio(!!profile.trocar_senha);
    } catch (err) {
      setError(err?.message || "Código MFA inválido.");
      setCurrentUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async (credential, turnstileToken = "") => {
    setError(null);
    setLoading(true);

    try {
      const googleCredential = await loginWithGoogleCredential(credential, turnstileToken);
      let profile = googleCredential.user;
      try {
        profile = await fetchUserProfile(googleCredential.user.uid);
      } catch (profileError) {
        console.error("Erro ao buscar perfil após login Google:", profileError);
      }
      setCurrentUser(profile);
      setTrocarSenhaObrigatorio(!!profile.trocar_senha);
    } catch (err) {
      setError(err?.message || "Não foi possível entrar com Google.");
      setCurrentUser(null);
      throw new Error("google login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithOkta = useCallback(async ({ credential, nonce, turnstileToken = "" }) => {
    setError(null);
    setLoading(true);

    try {
      const oktaCredential = await loginWithOktaCredential({ credential, nonce, turnstileToken });
      let profile = oktaCredential.user;
      try {
        profile = await fetchUserProfile(oktaCredential.user.uid);
      } catch (profileError) {
        console.error("Erro ao buscar perfil após login Okta:", profileError);
      }
      setCurrentUser(profile);
      setTrocarSenhaObrigatorio(!!profile.trocar_senha);
    } catch (err) {
      setError(err?.message || "Não foi possível entrar com Okta.");
      setCurrentUser(null);
      throw new Error("okta login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
      setCurrentUser(null);
    } catch {
      setError("Erro ao encerrar sessao.");
    }
  }, []);

  const refreshUser = async () => {
    if (!currentUser?.id) return;

    const profile = await fetchUserProfile(currentUser.id);
    setCurrentUser(profile);
    setTrocarSenhaObrigatorio(!!profile.trocar_senha);
  };

  return {
    currentUser,
    loading,
    error,
    login,
    verifyEmailMfa,
    loginWithGoogle,
    loginWithOkta,
    signOut,
    trocarSenhaObrigatorio,
    refreshUser,
  };
};


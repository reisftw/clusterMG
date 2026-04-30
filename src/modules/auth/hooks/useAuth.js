import { useState, useEffect, useCallback } from 'react';
import {
  loginWithEmail, logout,
  fetchUserProfile, subscribeToAuthChanges,
} from '../services/authService';

export const useAuth = () => {
  const [currentUser, setCurrentUser]           = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState(null);
  const [trocarSenhaObrigatorio, setTrocarSenha] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await fetchUserProfile(firebaseUser.uid);
          setCurrentUser(profile);
          // Força troca de senha se flag ativa
          setTrocarSenha(!!profile.trocar_senha);
        } catch (err) {
          console.error('Erro ao buscar perfil:', err);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
        setTrocarSenha(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      await loginWithEmail(email, password);
    } catch {
      setError('E-mail ou senha inválidos.');
      throw new Error('login failed');
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
      setCurrentUser(null);
    } catch {
      setError('Erro ao encerrar sessão.');
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!currentUser?.id) return;
    const profile = await fetchUserProfile(currentUser.id);
    setCurrentUser(profile);
    setTrocarSenha(!!profile.trocar_senha);
  }, [currentUser?.id]);

  return { currentUser, loading, error, login, signOut, trocarSenhaObrigatorio, refreshUser };
};

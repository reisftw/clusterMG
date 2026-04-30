// src/modules/auth/services/authService.js

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase'; // ← MUDOU
import { COLLECTIONS } from '../../../constants/firestoreCollections';

// ← REMOVEU: const auth = getAuth();

export const loginWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const logout = () => firebaseSignOut(auth);

export const subscribeToAuthChanges = (callback) =>
  onAuthStateChanged(auth, callback);

export const fetchUserProfile = async (uid) => {
  const snap = await getDoc(doc(db, COLLECTIONS.USUARIOS, uid));
  if (!snap.exists()) throw new Error('Perfil não encontrado');
  return { id: snap.id, ...snap.data() };
};

export const reautenticar = (senha) => {
  const user       = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, senha);
  return reauthenticateWithCredential(user, credential);
};

export const trocarSenha = async (senhaAtual, novaSenha) => {
  await reautenticar(senhaAtual);
  await updatePassword(auth.currentUser, novaSenha);
};

export const atualizarEmailAuth = async (senhaAtual, novoEmail) => {
  await reautenticar(senhaAtual);
  await updateEmail(auth.currentUser, novoEmail);
};

export const atualizarPerfilFirestore = async (uid, dados) => {
  await updateDoc(doc(db, COLLECTIONS.USUARIOS, uid), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

export const atualizarUsuarioAdmin = async (uid, dados) => {
  await updateDoc(doc(db, COLLECTIONS.USUARIOS, uid), {
    ...dados,
    atualizado_em: serverTimestamp(),
  });
};

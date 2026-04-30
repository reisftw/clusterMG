const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();


// Cria usuário sem deslogar o admin
exports.criarUsuario = functions.https.onCall(async (data, context) => {
  const { email, senha, nome, role, regional, trocar_senha } = data;
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password: senha,
      displayName: nome,
    });

    await admin.firestore()
      .collection('usuarios')
      .doc(userRecord.uid)
      .set({ nome, email, role, regional, trocar_senha });

    return { uid: userRecord.uid };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'E-mail já cadastrado.');
    }
    throw new functions.https.HttpsError('internal', err.message);
  }
});


// Deleta usuário do Auth + Firestore
exports.deletarUsuario = functions.https.onCall(async (data, context) => {
  const { uid } = data;
  try {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('usuarios').doc(uid).delete();
    return { success: true };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});


// ─── generateStaticData: gera data.json no Storage ───────────────────────────
const staticData = require("./src/generateStaticData");
Object.assign(exports, staticData);
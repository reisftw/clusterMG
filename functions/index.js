const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { randomBytes } = require("node:crypto");
const staticData = require("./src/generateStaticData");

admin.initializeApp();

const ALLOWED_ROLES = ["admin", "gestor", "tecnico"];
const CALLABLE_ERROR_CODES = new Set([
  "cancelled",
  "unknown",
  "invalid-argument",
  "deadline-exceeded",
  "not-found",
  "already-exists",
  "permission-denied",
  "resource-exhausted",
  "failed-precondition",
  "aborted",
  "out-of-range",
  "unimplemented",
  "internal",
  "unavailable",
  "data-loss",
  "unauthenticated",
]);

async function assertAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Autenticacao obrigatoria.",
    );
  }

  const userDoc = await admin
    .firestore()
    .collection("usuarios")
    .doc(context.auth.uid)
    .get();

  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Permissao insuficiente.",
    );
  }
}

exports.criarUsuario = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const email = typeof data?.email === "string" ? data.email.trim() : "";
  const displayName =
    typeof data?.displayName === "string"
      ? data.displayName.trim()
      : typeof data?.nome === "string"
        ? data.nome.trim()
        : "";
  const role = typeof data?.role === "string" ? data.role.trim() : "";
  const regional = data?.regional;
  const nome = displayName;

  if (!email) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "O campo email e obrigatorio.",
    );
  }

  if (!displayName) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "O campo nome e obrigatorio.",
    );
  }

  if (!ALLOWED_ROLES.includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Role invalida.",
    );
  }

  const auth = admin.auth();
  let userRecord = null;

  try {
    const temporaryPassword = randomBytes(16).toString("hex");

    userRecord = await auth.createUser({
      email,
      password: temporaryPassword,
      displayName,
    });

    const passwordResetLink = await auth.generatePasswordResetLink(email);

    await admin
      .firestore()
      .collection("usuarios")
      .doc(userRecord.uid)
      .set({ nome, email, role, regional });

    return { uid: userRecord.uid, passwordResetLink };
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError(
        "already-exists",
        "E-mail ja cadastrado.",
      );
    }

    if (userRecord?.uid) {
      await admin
        .firestore()
        .collection("usuarios")
        .doc(userRecord.uid)
        .delete()
        .catch(() => {});
      await auth.deleteUser(userRecord.uid).catch(() => {});
    }

    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.deletarUsuario = functions.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const uid = typeof data?.uid === "string" ? data.uid.trim() : "";

  if (!uid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "O campo uid e obrigatorio.",
    );
  }

  try {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection("usuarios").doc(uid).delete();
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.generateStaticDataHttp = staticData.generateStaticDataHttp;

exports.generateStaticDataCallable = functions.https.onCall(
  async (data, context) => {
    await assertAdmin(context);

    try {
      return await staticData.generateStaticDataCallable.run({
        auth: { uid: context.auth.uid },
        data: data || {},
      });
    } catch (error) {
      const code =
        typeof error?.code === "string"
          ? error.code.replace(/^functions\//, "")
          : null;

      if (code && CALLABLE_ERROR_CODES.has(code)) {
        throw new functions.https.HttpsError(
          code,
          error.message,
          error.details,
        );
      }

      throw new functions.https.HttpsError(
        "internal",
        error?.message || "Erro ao gerar JSON estatico.",
      );
    }
  },
);

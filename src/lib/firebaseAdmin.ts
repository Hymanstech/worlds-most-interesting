// src/lib/firebaseAdmin.ts
import admin from "firebase-admin";

function getProjectId() {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    undefined
  );
}

function initAdmin() {
  if (admin.apps.length) return;

  const projectId = getProjectId();
  const raw = process.env.FIREBASE_ADMIN_JSON;

  if (raw) {
    const serviceAccount = JSON.parse(raw);

    // ✅ Important: env vars often escape newlines in private_key
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });

    return;
  }

  // Fallback only works in environments with Google ADC (NOT DigitalOcean by default)
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  if (!projectId) {
    console.warn(
      "[firebaseAdmin] No projectId detected. Set FIREBASE_PROJECT_ID or FIREBASE_ADMIN_JSON."
    );
  }
}

initAdmin();

// ✅ Exports
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminFieldValue = admin.firestore.FieldValue;

export default admin;

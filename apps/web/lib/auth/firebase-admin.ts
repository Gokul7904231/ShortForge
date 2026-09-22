/**
 * Firebase Admin SDK & Server-Side Security Manager — ShortForge v1
 */

import * as admin from "firebase-admin";
import { AdminUser, UserRole } from "./types";
import { ALLOWED_BOOTSTRAP_OWNER_EMAIL } from "./constants";
import { UnauthorizedError } from "./errors";

const hasAdminCredentials = !!(
  process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
) && !!(
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
) && !!(
  process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
);

if (!admin.apps.length && hasAdminCredentials) {
  try {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
    const privateKey = rawPrivateKey?.replace(/^"|"$/g, "").replace(/\\n/g, "\n");

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
    });
  } catch (error: any) {
    console.error("[FirebaseAdmin] Initialization warning:", error.message);
  }
}

// In-Memory Fallback Store for Development & Vitest Suites
const mockAdminsStore = new Map<string, AdminUser>();

// Pre-seed mock store with initial Owner for dev/testing
mockAdminsStore.set("mock_owner_uid", {
  uid: "mock_owner_uid",
  email: ALLOWED_BOOTSTRAP_OWNER_EMAIL,
  role: "OWNER",
  active: true,
  disabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const adminAuth = admin.apps.length ? admin.auth() : null;

export const db = (admin.apps.length
  ? admin.firestore()
  : null) as admin.firestore.Firestore | null;

/**
 * Get or Bootstrap Admin Profile by Firebase UID
 */
export async function getAdminByUid(uid: string, email: string): Promise<AdminUser | null> {
  const normalizedEmail = email.toLowerCase().trim();

  if (db) {
    try {
      const docRef = db.collection("admins").doc(uid);
      const doc = await docRef.get();

      if (doc.exists) {
        return doc.data() as AdminUser;
      }

      // Check if any OWNER exists in the collection
      const ownerQuery = await db.collection("admins").where("role", "==", "OWNER").limit(1).get();

      const isBootstrapOwner = ownerQuery.empty && normalizedEmail === ALLOWED_BOOTSTRAP_OWNER_EMAIL;
      const newUser: AdminUser = {
        uid,
        email: normalizedEmail,
        role: isBootstrapOwner ? "OWNER" : "EDITOR",
        active: true,
        disabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      await docRef.set(newUser);
      console.log(`[FirebaseAdmin] Registered user: ${normalizedEmail} with role: ${newUser.role}`);
      return newUser;
    } catch (err: any) {
      console.error("[FirebaseAdmin] Firestore error fetching admin:", err.message);
    }
  }

  // Fallback to Mock Store for Dev / Test Mode
  let adminUser = Array.from(mockAdminsStore.values()).find((u) => u.uid === uid || u.email === normalizedEmail);

  if (!adminUser) {
    const isBootstrapOwner = normalizedEmail === ALLOWED_BOOTSTRAP_OWNER_EMAIL;
    adminUser = {
      uid,
      email: normalizedEmail,
      role: isBootstrapOwner ? "OWNER" : "EDITOR",
      active: true,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };
    mockAdminsStore.set(uid, adminUser);
  }

  return adminUser || null;
}

/**
 * Verify ID Token Server-Side
 */
export async function verifyIdTokenServer(idToken: string): Promise<{ uid: string; email: string }> {
  if (adminAuth) {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email || "" };
  }

  // Dev / Vitest Mock Verification
  if (idToken.startsWith("mock_token_") || idToken === "simulated_id_token") {
    return { uid: "mock_owner_uid", email: ALLOWED_BOOTSTRAP_OWNER_EMAIL };
  }

  if (idToken.includes("user_uid_")) {
    const parts = idToken.split("_");
    const uid = parts[1] || "mock_uid";
    const email = parts[2] ? `${parts[2]}@factoryos.pro` : ALLOWED_BOOTSTRAP_OWNER_EMAIL;
    return { uid, email };
  }

  throw new Error("Invalid or unverified Firebase ID token");
}

/**
 * Create Session Cookie (Firebase Admin SDK or Dev Mock)
 */
export async function createSessionCookieServer(idToken: string, expiresInMs: number): Promise<string> {
  if (adminAuth) {
    return await adminAuth.createSessionCookie(idToken, { expiresIn: expiresInMs });
  }
  // Mock Session Cookie String
  return `mock_session_cookie_${Date.now()}`;
}

import { verifySignedSessionToken } from "./jwt-session";

/**
 * Verify Session Cookie Server-Side
 */
export async function verifySessionCookieServer(sessionCookie: string): Promise<{ uid: string; email: string; sessionRole?: UserRole }> {
  // 1. Check signed FactoryOS session token
  const signedPayload = verifySignedSessionToken(sessionCookie);
  if (signedPayload) {
    return { uid: signedPayload.uid, email: signedPayload.email, sessionRole: signedPayload.role };
  }

  // 2. Check Firebase Admin SDK session cookie if configured (non-fos tokens)
  if (adminAuth && !sessionCookie.startsWith("fos_")) {
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      return { uid: decoded.uid, email: decoded.email || "" };
    } catch {
      // Fall through to mock verification if applicable
    }
  }

  // 3. Dev / Vitest Mock Verification (Strictly non-production only)
  if (
    process.env.NODE_ENV !== "production" &&
    (sessionCookie.startsWith("mock_session_cookie_") || sessionCookie.includes("simulated_admin_token"))
  ) {
    return { uid: "mock_owner_uid", email: ALLOWED_BOOTSTRAP_OWNER_EMAIL, sessionRole: "OWNER" };
  }

  throw new UnauthorizedError("Invalid or expired session cookie");
}

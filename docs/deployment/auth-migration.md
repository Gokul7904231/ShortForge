# 🚀 Authentication Migration & Setup Guide — FactoryOS v1

This document outlines the environment configuration, Firebase project setup, and admin bootstrapping steps for deploying FactoryOS v1 with production authentication.

---

## 1. 🔑 Environment Variables Setup

Configure the following variables in your `gen-v/.env` or `.env.local` file:

```env
# Client-Side Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK Configuration (Server-Side)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxx@your_project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Session Duration & Internal Service Security
AUTH_SESSION_DURATION_HOURS=168
INTERNAL_API_SECRET_KEY=your_secure_internal_service_api_key
```

---

## 2. 🛡️ Firebase Console Setup

1. **Enable Authentication Providers**:
   - Go to [Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Sign-in method**.
   - Enable **Email/Password**.
   - Enable **Google Sign-In**.

2. **Firestore Rules**:
   - Configure security rules for the `admins` and `auth_audit` collections:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /admins/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == "OWNER";
    }
    match /auth_audit/{id} {
      allow read, write: if false; // Server-side admin SDK access only
    }
  }
}
```

---

## 3. 👤 Initial Admin Bootstrapping

1. Create a user account in Firebase Auth or sign in via Google with `gokul32499@gmail.com`.
2. On first successful sign-in, FactoryOS automatically bootstraps `gokul32499@gmail.com` as document `admins/<firebase_uid>` with the `OWNER` role.
3. Subsequent admin accounts can be granted roles (`ADMIN`, `EDITOR`, `VIEWER`) directly in Firestore by the `OWNER`.

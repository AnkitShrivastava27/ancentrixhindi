// src/lib/firebase.ts
// Firebase client SDK init — the ONLY place `firebase/app` and
// `firebase/auth` get imported. store/index.ts (login/register/logout)
// and lib/api.ts (indirectly, via store's refreshToken) are the only
// consumers of this module.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// getApps().length guard — Next.js hot-reload and multiple imports would
// otherwise call initializeApp() more than once, which throws.
const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)
export default app

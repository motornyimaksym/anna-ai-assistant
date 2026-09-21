import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth'; import { initializeApp } from 'firebase/app';
const app = initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID });
export const auth = getAuth(app); export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());


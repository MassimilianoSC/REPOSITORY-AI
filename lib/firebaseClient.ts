import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only on client-side
function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error('Firebase can only be initialized on the client side');
  }
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApps()[0];
  }

// Lazy getters to ensure client-side only access
let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    
    // ⚠️ FIX CRITICO: Configura persistenza LOCAL per mantenere la sessione
    // anche dopo chiusura browser (l'utente NON deve rifare login ogni volta!)
    setPersistence(authInstance, browserLocalPersistence).catch((error) => {
      console.error('❌ Errore configurazione persistenza Firebase Auth:', error);
    });
  }
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}

export function getFirebaseFunctions(): Functions {
  return getFunctions(getFirebaseApp(), 'europe-west1');
}

// Legacy exports for backwards compatibility (will throw on SSR)
export const auth = typeof window !== 'undefined' ? getFirebaseAuth() : ({} as Auth);
export const db = typeof window !== 'undefined' ? getFirebaseDb() : ({} as Firestore);
export const storage = typeof window !== 'undefined' ? getFirebaseStorage() : ({} as FirebaseStorage);
export const functions = typeof window !== 'undefined' ? getFirebaseFunctions() : ({} as Functions);

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth and Firestore
export const auth = getAuth(app);
export const firestoreDatabaseId =
  (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-7307e839-8cac-42cb-afec-819af1e398d6';

// Initialize Firestore with long-polling to prevent stream disconnections in sandboxed / iframe environments
initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firestoreDatabaseId);

export const db = getFirestore(app, firestoreDatabaseId); /* CRITICAL: The app will break without this line */

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope(GOOGLE_DRIVE_SCOPE);

// In-memory access token cache (required: never persist to localStorage)
let cachedGoogleAccessToken: string | null = null;

export const setCachedGoogleAccessToken = (token: string | null) => {
  cachedGoogleAccessToken = token;
};

export const getCachedGoogleAccessToken = () => cachedGoogleAccessToken;

// Clear cached token if user logs out
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGoogleAccessToken = null;
  }
});

// Auth helpers
export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedGoogleAccessToken = credential.accessToken;
  }
  return result;
};

export const requestGoogleDriveAccess = async (): Promise<string> => {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedGoogleAccessToken = credential.accessToken;
    return credential.accessToken;
  }
  throw new Error('Failed to acquire Google Drive access token.');
};

export const loginWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);

export const logout = async () => {
  cachedGoogleAccessToken = null;
  return signOut(auth);
};

export type { User };

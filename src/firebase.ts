import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth and Firestore
export const auth = getAuth(app);
export const firestoreDatabaseId =
  (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-7307e839-8cac-42cb-afec-819af1e398d6';
export const db = getFirestore(app, firestoreDatabaseId);

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope(GOOGLE_DRIVE_SCOPE);

// Persistent & auto-refreshing Drive token integration
import {
  getActiveDriveToken,
  setDriveAccessToken,
  authenticateGoogleDrive,
  initializeDriveConnection,
  disconnectGoogleDrive,
  subscribeToDriveToken,
  getDriveTokenMetadata,
} from './lib/googleDriveAuth';

export {
  getActiveDriveToken,
  setDriveAccessToken,
  authenticateGoogleDrive,
  initializeDriveConnection,
  disconnectGoogleDrive,
  subscribeToDriveToken,
  getDriveTokenMetadata,
};

export const setCachedGoogleAccessToken = (token: string | null) => {
  setDriveAccessToken(token);
};

export const getCachedGoogleAccessToken = () => getActiveDriveToken();

// Auto-rehydrate or clear token based on auth state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Automatically rehydrate Google Drive connection upon page reload/session restore
    try {
      await initializeDriveConnection();
    } catch (err) {
      console.warn('Failed to auto-rehydrate Google Drive connection:', err);
    }
  } else {
    // User logged out: clear memory and persistent storage
    await disconnectGoogleDrive();
  }
});

// Auth helpers
export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    await setDriveAccessToken(credential.accessToken, 3600, result.user?.email || undefined);
  }
  return result;
};

export const requestGoogleDriveAccess = async (): Promise<string> => {
  return await authenticateGoogleDrive(true);
};

export const loginWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);

export const logout = async () => {
  await disconnectGoogleDrive();
  return signOut(auth);
};

export type { User };

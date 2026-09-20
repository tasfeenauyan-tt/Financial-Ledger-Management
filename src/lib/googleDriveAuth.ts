import { auth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import {
  savePersistentDriveToken,
  loadPersistentDriveToken,
  clearPersistentDriveToken,
} from './driveTokenStorage';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// In-memory active session token & metadata
let memoryAccessToken: string | null = null;
let tokenExpiresAt: number = 0;
let connectedUserEmail: string | null = null;

// Event listeners for token state changes
type TokenListener = (token: string | null, metadata?: { expiresAt: number; email: string | null }) => void;
const listeners = new Set<TokenListener>();

export function subscribeToDriveToken(listener: TokenListener): () => void {
  listeners.add(listener);
  // Emit immediately with current state
  listener(memoryAccessToken, { expiresAt: tokenExpiresAt, email: connectedUserEmail });
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const meta = { expiresAt: tokenExpiresAt, email: connectedUserEmail };
  listeners.forEach((fn) => {
    try {
      fn(memoryAccessToken, meta);
    } catch (e) {
      console.error('Error in drive token listener:', e);
    }
  });
}

/**
 * Commit token to both memory and IndexedDB vault
 */
export async function setDriveAccessToken(
  token: string | null,
  expiresInSeconds: number = 3600,
  email?: string
): Promise<void> {
  if (!token) {
    memoryAccessToken = null;
    tokenExpiresAt = 0;
    connectedUserEmail = null;
    await clearPersistentDriveToken();
    notifyListeners();
    return;
  }

  memoryAccessToken = token;
  tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
  connectedUserEmail = email || auth.currentUser?.email || connectedUserEmail || null;

  // Persist to IndexedDB
  await savePersistentDriveToken(token, expiresInSeconds, connectedUserEmail || undefined);

  notifyListeners();
}

/**
 * Synchronous in-memory token getter
 */
export function getActiveDriveToken(): string | null {
  // Check if current memory token is still valid (at least 30s remaining)
  if (memoryAccessToken && tokenExpiresAt > Date.now() + 30 * 1000) {
    return memoryAccessToken;
  }
  return null;
}

/**
 * Synchronous metadata getter
 */
export function getDriveTokenMetadata() {
  const activeToken = getActiveDriveToken();
  return {
    token: activeToken,
    expiresAt: tokenExpiresAt,
    email: connectedUserEmail || auth.currentUser?.email || null,
    isConnected: !!activeToken,
  };
}

/**
 * Request Google Drive authorization via Firebase OAuth popup
 * Must ONLY be called on explicit user interaction (e.g. button click)
 */
export async function authenticateGoogleDrive(interactive: boolean = true): Promise<string> {
  if (!interactive) {
    const existing = getActiveDriveToken();
    if (existing) return existing;
    throw new Error('Google Drive connection requires interactive authorization.');
  }

  const userEmail = auth.currentUser?.email || undefined;
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);

  if (credential?.accessToken) {
    const email = result.user?.email || userEmail;
    await setDriveAccessToken(credential.accessToken, 3600, email);
    return credential.accessToken;
  }

  throw new Error('Failed to acquire Google Drive access token from Google.');
}

/**
 * Initialize and rehydrate Google Drive connection on app load or auth state change
 * Reads silently from persistent IndexedDB vault. NEVER triggers popups automatically.
 */
export async function initializeDriveConnection(): Promise<string | null> {
  // 1. Check in-memory token
  if (memoryAccessToken && tokenExpiresAt > Date.now() + 30 * 1000) {
    return memoryAccessToken;
  }

  // 2. Try loading from persistent IndexedDB vault
  try {
    const stored = await loadPersistentDriveToken();
    if (stored && stored.accessToken && stored.expiresAt > Date.now() + 30 * 1000) {
      memoryAccessToken = stored.accessToken;
      tokenExpiresAt = stored.expiresAt;
      connectedUserEmail = stored.userEmail || auth.currentUser?.email || null;
      notifyListeners();
      return stored.accessToken;
    }
  } catch (err) {
    console.warn('Failed to load token from IndexedDB vault:', err);
  }

  // If expired or not found, safely reset state without any popups
  if (memoryAccessToken) {
    memoryAccessToken = null;
    tokenExpiresAt = 0;
    notifyListeners();
  }

  return null;
}

/**
 * Disconnect Google Drive
 */
export async function disconnectGoogleDrive(): Promise<void> {
  await setDriveAccessToken(null);
}

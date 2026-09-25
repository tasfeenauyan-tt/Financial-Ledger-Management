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
let isDriveLinked: boolean = false;

// Event listeners for token state changes
type TokenListener = (token: string | null, metadata?: { expiresAt: number; email: string | null; isConnected: boolean; isExpired: boolean }) => void;
const listeners = new Set<TokenListener>();

export function subscribeToDriveToken(listener: TokenListener): () => void {
  listeners.add(listener);
  // Emit immediately with current state
  const isExp = !memoryAccessToken || (tokenExpiresAt > 0 && tokenExpiresAt <= Date.now());
  listener(memoryAccessToken, {
    expiresAt: tokenExpiresAt,
    email: connectedUserEmail,
    isConnected: Boolean(isDriveLinked || connectedUserEmail || memoryAccessToken),
    isExpired: isExp,
  });
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const isExp = !memoryAccessToken || (tokenExpiresAt > 0 && tokenExpiresAt <= Date.now());
  const meta = {
    expiresAt: tokenExpiresAt,
    email: connectedUserEmail,
    isConnected: Boolean(isDriveLinked || connectedUserEmail || memoryAccessToken),
    isExpired: isExp,
  };
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
    isDriveLinked = false;
    await clearPersistentDriveToken();
    notifyListeners();
    return;
  }

  memoryAccessToken = token;
  tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
  connectedUserEmail = email || auth.currentUser?.email || connectedUserEmail || null;
  isDriveLinked = true;

  // Persist to IndexedDB vault
  await savePersistentDriveToken(token, expiresInSeconds, connectedUserEmail || undefined);

  notifyListeners();
}

/**
 * Synchronous in-memory token getter
 * Returns the cached token without discarding connection state on expiration
 */
export function getActiveDriveToken(): string | null {
  return memoryAccessToken;
}

/**
 * Check if the current in-memory token is expired or close to expiring (< 30s)
 */
export function isDriveTokenExpired(): boolean {
  if (!memoryAccessToken) return true;
  return tokenExpiresAt > 0 && tokenExpiresAt <= Date.now() + 30 * 1000;
}

/**
 * Retrieve a valid drive access token if currently active and unexpired,
 * or rehydrate from persistent store.
 */
export async function getValidDriveAccessToken(requireValid: boolean = false): Promise<string | null> {
  if (memoryAccessToken && !isDriveTokenExpired()) {
    return memoryAccessToken;
  }
  const token = await initializeDriveConnection();
  if (token && !isDriveTokenExpired()) {
    return token;
  }
  if (requireValid) {
    throw new Error('Google Drive token is expired or requires authorization.');
  }
  return token || memoryAccessToken || null;
}

/**
 * Synchronous metadata getter with durable connection awareness
 */
export function getDriveTokenMetadata() {
  const isExpired = !memoryAccessToken || (tokenExpiresAt > 0 && tokenExpiresAt <= Date.now() + 30 * 1000);
  const isConnected = Boolean(isDriveLinked || connectedUserEmail || memoryAccessToken);
  return {
    token: memoryAccessToken,
    expiresAt: tokenExpiresAt,
    email: connectedUserEmail || auth.currentUser?.email || null,
    isLinked: isConnected,
    isConnected,
    isExpired,
  };
}

/**
 * Request Google Drive authorization via Firebase OAuth popup
 * Must ONLY be called on explicit user interaction (e.g. button click)
 */
export async function authenticateGoogleDrive(interactive: boolean = true): Promise<string> {
  if (!interactive) {
    const existing = getActiveDriveToken();
    if (existing && !isDriveTokenExpired()) return existing;
    throw new Error('Google Drive connection requires interactive authorization.');
  }

  const userEmail = connectedUserEmail || auth.currentUser?.email || undefined;
  if (userEmail) {
    googleProvider.setCustomParameters({
      login_hint: userEmail,
      prompt: 'select_account',
    });
  }

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
 * Ensures the app remains "All Time Connected" without dropping user link state.
 */
export async function initializeDriveConnection(): Promise<string | null> {
  // 1. Check in-memory token
  if (memoryAccessToken) {
    isDriveLinked = true;
    return memoryAccessToken;
  }

  // 2. Load from persistent IndexedDB vault
  try {
    const stored = await loadPersistentDriveToken();
    if (stored && (stored.accessToken || stored.isLinked)) {
      memoryAccessToken = stored.accessToken || null;
      tokenExpiresAt = stored.expiresAt || 0;
      connectedUserEmail = stored.userEmail || auth.currentUser?.email || null;
      isDriveLinked = true;
      notifyListeners();
      return memoryAccessToken;
    }
  } catch (err) {
    console.warn('Failed to load token from IndexedDB vault:', err);
  }

  return null;
}

/**
 * Disconnect Google Drive explicitly
 */
export async function disconnectGoogleDrive(): Promise<void> {
  await setDriveAccessToken(null);
}

// Secure IndexedDB storage for Google Drive OAuth token
// Complies with security policies (does NOT use localStorage or sessionStorage)
// Automatically purges on user logout

const DB_NAME = 'triloytech_auth_vault';
const STORE_NAME = 'auth_tokens';
const DRIVE_TOKEN_KEY = 'gdrive_token_session';

export interface StoredDriveToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
  userEmail?: string;
  isLinked?: boolean;
  savedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePersistentDriveToken(
  token: string,
  expiresInSeconds: number = 3600,
  userEmail?: string
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const data: StoredDriveToken = {
        accessToken: token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
        userEmail: userEmail || '',
        isLinked: true,
        savedAt: Date.now(),
      };
      const putRequest = store.put(data, DRIVE_TOKEN_KEY);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  } catch (err) {
    console.warn('Failed to persist Drive token to IndexedDB:', err);
  }
}

export async function loadPersistentDriveToken(): Promise<StoredDriveToken | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(DRIVE_TOKEN_KEY);

      getRequest.onsuccess = () => {
        const result = getRequest.result as StoredDriveToken | undefined;
        if (!result || !result.accessToken) {
          resolve(null);
          return;
        }

        // Do NOT delete the token on expiration!
        // Preserving the token and link metadata allows the app to maintain
        // an uninterrupted "All-Time Connected" integration state.
        resolve(result);
      };

      getRequest.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Failed to load Drive token from IndexedDB:', err);
    return null;
  }
}

export async function clearPersistentDriveToken(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const deleteRequest = store.delete(DRIVE_TOKEN_KEY);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to clear Drive token from IndexedDB:', err);
  }
}

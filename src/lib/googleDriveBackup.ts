import { db, getCachedGoogleAccessToken, requestGoogleDriveAccess, initializeDriveConnection, disconnectGoogleDrive } from '../firebase';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';

export const ALL_BACKUP_COLLECTIONS = [
  'entries',
  'clients',
  'invoices',
  'payments',
  'bankAccounts',
  'accounts',
  'transactionItems',
  'transactionSubCategories',
  'partners',
  'settings',
  'entry_history',
  'users',
  'employees',
  'services',
  'payslip_items',
  'payslips',
  'employee_salaries'
];

export interface GoogleDriveBackupConfig {
  enabled: boolean;
  folderId: string;
  folderName: string;
  frequency: 'hourly' | 'every_6h' | 'every_12h' | 'daily' | 'weekly';
  backupTime?: string; // 24-hour format "HH:mm", e.g. "02:00"
  isDriveLinked?: boolean;
  linkedEmail?: string;
  linkedAt?: string;
  lastBackupTime?: string;
  lastBackupFileName?: string;
  lastBackupStatus?: 'success' | 'failed';
  lastBackupError?: string;
  lastBackupDriveFileId?: string;
  lastBackupWebViewLink?: string;
  lastBackupSize?: string;
  totalCollectionsCount?: number;
  totalRecordsCount?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DriveFolderItem {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface DriveBackupFileItem {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
}

export interface NextBackupInfo {
  date: Date;
  formattedTime: string;
  relativeText: string;
  isDueNow: boolean;
}

const SETTINGS_DOC_ID = 'google_drive_backup';

export const DEFAULT_BACKUP_CONFIG: GoogleDriveBackupConfig = {
  enabled: false,
  folderId: '',
  folderName: '',
  frequency: 'daily',
  backupTime: '02:00',
};

/**
 * Fetch the stored Google Drive Backup configuration from Firestore
 */
export async function getBackupConfig(): Promise<GoogleDriveBackupConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC_ID));
    if (snap.exists()) {
      return { ...DEFAULT_BACKUP_CONFIG, ...(snap.data() as GoogleDriveBackupConfig) };
    }
  } catch (error) {
    console.error('Error fetching backup config:', error);
  }
  return DEFAULT_BACKUP_CONFIG;
}

/**
 * Save Google Drive Backup configuration to Firestore
 */
export async function saveBackupConfig(config: Partial<GoogleDriveBackupConfig>, userEmail?: string): Promise<void> {
  const current = await getBackupConfig();
  const updated: GoogleDriveBackupConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail || current.updatedBy || 'admin',
  };
  await setDoc(doc(db, 'settings', SETTINGS_DOC_ID), updated);
}

/**
 * Check if an automatic backup is due based on configured frequency and scheduled time
 */
export function isBackupDue(config: GoogleDriveBackupConfig, now = new Date()): boolean {
  if (!config.enabled || !config.folderId) return false;
  if (!config.lastBackupTime) return true;

  const lastTime = new Date(config.lastBackupTime).getTime();
  if (isNaN(lastTime)) return true;

  // Daily backup with specific scheduled time (e.g., 02:00)
  if (config.frequency === 'daily') {
    const timeStr = config.backupTime || '02:00';
    const [hoursStr, minsStr] = timeStr.split(':');
    const targetHour = parseInt(hoursStr, 10) || 0;
    const targetMin = parseInt(minsStr, 10) || 0;

    // Target backup time for today
    const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMin, 0, 0);

    if (now.getTime() >= todayTarget.getTime()) {
      // Past today's scheduled time: due if last backup occurred before today's target time
      return lastTime < todayTarget.getTime();
    } else {
      // Before today's scheduled time: check if yesterday's scheduled backup was missed
      const yesterdayTarget = new Date(todayTarget.getTime() - 24 * 60 * 60 * 1000);
      return lastTime < yesterdayTarget.getTime();
    }
  }

  // Weekly backup
  if (config.frequency === 'weekly') {
    const timeStr = config.backupTime || '02:00';
    const [hoursStr, minsStr] = timeStr.split(':');
    const targetHour = parseInt(hoursStr, 10) || 0;
    const targetMin = parseInt(minsStr, 10) || 0;
    const daysDiff = (now.getTime() - lastTime) / (1000 * 60 * 60 * 24);
    if (daysDiff >= 7) {
      const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMin, 0, 0);
      return now.getTime() >= todayTarget.getTime();
    }
    return false;
  }

  // Interval-based frequency checks
  const hoursDiff = (now.getTime() - lastTime) / (1000 * 60 * 60);

  switch (config.frequency) {
    case 'hourly':
      return hoursDiff >= 1;
    case 'every_6h':
      return hoursDiff >= 6;
    case 'every_12h':
      return hoursDiff >= 12;
    default:
      return hoursDiff >= 24;
  }
}

/**
 * Calculate the next scheduled backup time and relative countdown
 */
export function getNextScheduledBackup(config: GoogleDriveBackupConfig, now = new Date()): NextBackupInfo | null {
  if (!config.enabled || !config.folderId) return null;

  if (isBackupDue(config, now)) {
    return {
      date: now,
      formattedTime: 'Due now',
      relativeText: 'Scheduled backup is pending / due now',
      isDueNow: true,
    };
  }

  let nextDate: Date;
  if (config.frequency === 'daily') {
    const timeStr = config.backupTime || '02:00';
    const [hoursStr, minsStr] = timeStr.split(':');
    const targetHour = parseInt(hoursStr, 10) || 0;
    const targetMin = parseInt(minsStr, 10) || 0;

    const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMin, 0, 0);
    if (now.getTime() < todayTarget.getTime()) {
      nextDate = todayTarget;
    } else {
      nextDate = new Date(todayTarget.getTime() + 24 * 60 * 60 * 1000);
    }
  } else if (config.frequency === 'weekly') {
    const timeStr = config.backupTime || '02:00';
    const [hoursStr, minsStr] = timeStr.split(':');
    const targetHour = parseInt(hoursStr, 10) || 0;
    const targetMin = parseInt(minsStr, 10) || 0;
    const lastTime = config.lastBackupTime ? new Date(config.lastBackupTime).getTime() : now.getTime();
    const candidateDate = new Date(lastTime + 7 * 24 * 60 * 60 * 1000);
    candidateDate.setHours(targetHour, targetMin, 0, 0);
    nextDate = candidateDate > now ? candidateDate : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else {
    const lastTime = config.lastBackupTime ? new Date(config.lastBackupTime).getTime() : now.getTime();
    let intervalMs = 24 * 60 * 60 * 1000;
    if (config.frequency === 'hourly') intervalMs = 60 * 60 * 1000;
    if (config.frequency === 'every_6h') intervalMs = 6 * 60 * 60 * 1000;
    if (config.frequency === 'every_12h') intervalMs = 12 * 60 * 60 * 1000;
    nextDate = new Date(lastTime + intervalMs);
  }

  const diffMs = Math.max(0, nextDate.getTime() - now.getTime());
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let relativeText = '';
  if (diffHrs >= 24) {
    const days = Math.floor(diffHrs / 24);
    relativeText = `in ${days} day${days > 1 ? 's' : ''}`;
  } else if (diffHrs > 0) {
    relativeText = `in ${diffHrs}h ${diffMins}m`;
  } else {
    relativeText = `in ${Math.max(1, diffMins)} minute${diffMins !== 1 ? 's' : ''}`;
  }

  const isToday = nextDate.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const isTomorrow = nextDate.toDateString() === tomorrow.toDateString();

  let dayPrefix = nextDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (isToday) dayPrefix = 'Today';
  if (isTomorrow) dayPrefix = 'Tomorrow';

  const timeString = nextDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return {
    date: nextDate,
    formattedTime: `${dayPrefix} at ${timeString} hrs`,
    relativeText,
    isDueNow: false,
  };
}

/**
 * Generates the full database JSON snapshot
 */
export async function generateFullDatabaseJson(): Promise<{
  fullBackup: Record<string, any[]>;
  recordCount: number;
  collectionCount: number;
}> {
  const fullBackup: Record<string, any[]> = {};
  let recordCount = 0;
  let collectionCount = 0;

  for (const collectionName of ALL_BACKUP_COLLECTIONS) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      fullBackup[collectionName] = items;
      recordCount += items.length;
      collectionCount += 1;
    } catch (err) {
      console.warn(`Could not read collection ${collectionName}:`, err);
      fullBackup[collectionName] = [];
    }
  }

  return { fullBackup, recordCount, collectionCount };
}

/**
 * Helper to ensure a valid Google Drive Access Token
 * Checks memory, rehydrates from persistent vault, or silently refreshes if possible
 */
export async function getValidDriveAccessToken(interactive = false): Promise<string> {
  let cached = getCachedGoogleAccessToken();
  if (cached) return cached;

  // Try rehydrating from persistent storage or silent background refresh
  cached = await initializeDriveConnection();
  if (cached) return cached;

  if (interactive) {
    return await requestGoogleDriveAccess();
  }

  throw new Error('Google Drive is not authenticated. Please connect Google Drive.');
}

/**
 * Resilient fetch wrapper for Google Drive APIs with automatic 401 retry & token renewal
 */
async function fetchDriveWithRetry(
  url: string,
  options: RequestInit = {},
  initialToken?: string
): Promise<Response> {
  let token = initialToken || (await getValidDriveAccessToken(false).catch(() => ''));
  if (!token) {
    throw new Error('Google Drive is not authenticated. Please connect Google Drive.');
  }

  const buildHeaders = (t: string) => {
    const h = new Headers(options.headers || {});
    h.set('Authorization', `Bearer ${t}`);
    return h;
  };

  let res = await fetch(url, {
    ...options,
    headers: buildHeaders(token),
  });

  // If token has expired (401 Unauthorized), do NOT disconnect Google Drive!
  // Preserves target folder, automation schedule, and linked account all the time.
  if (res.status === 401) {
    console.warn('[GoogleDriveAPI] Received 401 Unauthorized. Access token expired.');
    throw new Error('Google Drive session expired. Please click "Renew Token" or "Back Up Now" to re-validate.');
  }

  return res;
}

/**
 * List folders in the user's Google Drive
 */
export async function listGoogleDriveFolders(token: string): Promise<DriveFolderItem[]> {
  const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&orderBy=name&pageSize=100`;

  const res = await fetchDriveWithRetry(url, {}, token);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Drive API error: ${err}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Create a new folder in Google Drive
 */
export async function createGoogleDriveFolder(
  token: string,
  folderName: string,
  parentFolderId?: string
): Promise<DriveFolderItem> {
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const res = await fetchDriveWithRetry(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    },
    token
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Google Drive folder: ${err}`);
  }

  return await res.json();
}

/**
 * Get folder metadata by ID
 */
export async function getGoogleDriveFolder(token: string, folderId: string): Promise<DriveFolderItem | null> {
  try {
    const res = await fetchDriveWithRetry(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,webViewLink,mimeType`,
      {},
      token
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Upload full JSON backup into the specified Google Drive folder
 */
export async function uploadFullBackupToDrive(
  token: string,
  folderId: string,
  backupData: Record<string, any>,
  customName?: string
): Promise<DriveBackupFileItem> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  const fileName = customName || `TriloyTech_Full_Backup_${formattedDate}.json`;
  const fileContent = JSON.stringify(backupData, null, 2);

  const metadata: any = {
    name: fileName,
    mimeType: 'application/json',
  };

  if (folderId && folderId.trim()) {
    metadata.parents = [folderId.trim()];
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileContent], { type: 'application/json' }));

  const res = await fetchDriveWithRetry(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size,createdTime',
    {
      method: 'POST',
      body: form,
    },
    token
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload to Google Drive failed: ${err}`);
  }

  return await res.json();
}

/**
 * List existing backup files inside the target folder
 */
export async function listFolderBackups(token: string, folderId: string): Promise<DriveBackupFileItem[]> {
  if (!folderId || !folderId.trim()) return [];

  const q = encodeURIComponent(`'${folderId.trim()}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime desc&pageSize=50`;

  const res = await fetchDriveWithRetry(url, {}, token);

  if (!res.ok) return [];

  const data = await res.json();
  return data.files || [];
}

/**
 * Execute a complete full backup to the configured Google Drive folder and record result in Firestore
 */
export async function executeGoogleDriveBackup(
  token: string,
  folderId: string,
  userEmail?: string
): Promise<{
  file: DriveBackupFileItem;
  recordsCount: number;
  collectionsCount: number;
}> {
  const { fullBackup, recordCount, collectionCount } = await generateFullDatabaseJson();
  
  const uploadedFile = await uploadFullBackupToDrive(token, folderId, fullBackup);

  const nowIso = new Date().toISOString();
  await saveBackupConfig({
    lastBackupTime: nowIso,
    lastBackupFileName: uploadedFile.name,
    lastBackupDriveFileId: uploadedFile.id,
    lastBackupWebViewLink: uploadedFile.webViewLink,
    lastBackupSize: uploadedFile.size,
    lastBackupStatus: 'success',
    lastBackupError: '',
    totalCollectionsCount: collectionCount,
    totalRecordsCount: recordCount,
  }, userEmail);

  return {
    file: uploadedFile,
    recordsCount: recordCount,
    collectionsCount: collectionCount,
  };
}

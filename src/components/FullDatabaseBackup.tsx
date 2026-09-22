import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth, getCachedGoogleAccessToken, setCachedGoogleAccessToken, requestGoogleDriveAccess } from '../firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import {
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Database,
  Folder,
  FolderPlus,
  RefreshCw,
  ExternalLink,
  Clock,
  Check,
  Calendar,
  Cloud,
  HardDrive,
  Settings2,
  FileJson
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  ALL_BACKUP_COLLECTIONS,
  GoogleDriveBackupConfig,
  DriveFolderItem,
  DriveBackupFileItem,
  getBackupConfig,
  saveBackupConfig,
  isBackupDue,
  getNextScheduledBackup,
  listGoogleDriveFolders,
  createGoogleDriveFolder,
  getGoogleDriveFolder,
  executeGoogleDriveBackup,
  listFolderBackups
} from '../lib/googleDriveBackup';

interface FullDatabaseBackupProps {
  userRole: string;
}

export default function FullDatabaseBackup({ userRole }: FullDatabaseBackupProps) {
  const isAdmin = userRole === 'admin';
  const COLLECTIONS = ALL_BACKUP_COLLECTIONS;

  // Local JSON states
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);
  const [restoreSource, setRestoreSource] = useState<string>('Uploaded JSON');

  // Google Drive state
  const [driveToken, setDriveToken] = useState<string | null>(getCachedGoogleAccessToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [config, setConfig] = useState<GoogleDriveBackupConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isBackingUpToDrive, setIsBackingUpToDrive] = useState(false);
  const [scheduledTimeInput, setScheduledTimeInput] = useState<string>('02:00');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Folder selection state
  const [availableFolders, setAvailableFolders] = useState<DriveFolderItem[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [folderMode, setFolderMode] = useState<'select' | 'create' | 'custom'>('select');
  const [newFolderName, setNewFolderName] = useState('TriloyTech Financial Backups');
  const [customFolderInput, setCustomFolderInput] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isValidatingFolder, setIsValidatingFolder] = useState(false);

  // Drive folder files list
  const [folderBackups, setFolderBackups] = useState<DriveBackupFileItem[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoringFromDrive, setIsRestoringFromDrive] = useState<string | null>(null);

  const autoBackupRunningRef = useRef(false);

  // Load config on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const conf = await getBackupConfig();
        if (mounted) {
          setConfig(conf);
          if (conf.folderId) {
            setCustomFolderInput(conf.folderId);
          }
          if (conf.backupTime) {
            setScheduledTimeInput(conf.backupTime);
          }
        }
      } catch (err) {
        console.error('Failed to load backup config:', err);
      } finally {
        if (mounted) setIsLoadingConfig(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Update clock every 30s to keep next scheduled backup display accurate
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(clock);
  }, []);

  // Update drive token if cached token changes
  useEffect(() => {
    const checkToken = () => {
      const tok = getCachedGoogleAccessToken();
      if (tok !== driveToken) {
        setDriveToken(tok);
      }
    };
    checkToken();
    const interval = setInterval(checkToken, 3000);
    return () => clearInterval(interval);
  }, [driveToken]);

  // Load folder backups when token and folderId are available
  const loadBackups = useCallback(async (token: string, folderId: string) => {
    if (!folderId) return;
    setIsLoadingBackups(true);
    try {
      const files = await listFolderBackups(token, folderId);
      setFolderBackups(files);
    } catch (err) {
      console.error('Failed to load folder backups:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    if (driveToken && config?.folderId) {
      loadBackups(driveToken, config.folderId);
    }
  }, [driveToken, config?.folderId, loadBackups]);

  // Load available Drive folders for dropdown
  const loadDriveFolders = useCallback(async (token: string) => {
    setIsLoadingFolders(true);
    try {
      const folders = await listGoogleDriveFolders(token);
      setAvailableFolders(folders);
    } catch (err) {
      console.error('Failed to load folders:', err);
      setStatus({ type: 'error', message: 'Could not fetch Google Drive folders. Please check connection permissions.' });
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  // Automated background backup check
  useEffect(() => {
    if (!driveToken || !config || !config.enabled || !config.folderId || !isAdmin) return;

    const checkAndRunAutoBackup = async () => {
      if (autoBackupRunningRef.current) return;

      if (isBackupDue(config)) {
        autoBackupRunningRef.current = true;
        try {
          console.log('Automated Google Drive backup due. Executing now...');
          const result = await executeGoogleDriveBackup(
            driveToken,
            config.folderId,
            auth.currentUser?.email || 'automated-system'
          );

          // Refresh config and backups
          const updatedConf = await getBackupConfig();
          setConfig(updatedConf);
          loadBackups(driveToken, config.folderId);

          setStatus({
            type: 'success',
            message: `Automated backup completed: "${result.file.name}" saved to Google Drive.`
          });
        } catch (err: any) {
          console.error('Automated backup failed:', err);
          await saveBackupConfig({
            lastBackupStatus: 'failed',
            lastBackupError: err.message || 'Auto-backup failed',
          });
        } finally {
          autoBackupRunningRef.current = false;
        }
      }
    };

    // Run check initially
    checkAndRunAutoBackup();

    // Check periodically every 1 minute while app is running
    const timer = setInterval(checkAndRunAutoBackup, 60 * 1000);
    return () => clearInterval(timer);
  }, [driveToken, config, isAdmin, loadBackups]);

  // Connect Google Drive
  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    setStatus(null);
    try {
      const token = await requestGoogleDriveAccess();
      setCachedGoogleAccessToken(token);
      setDriveToken(token);
      setStatus({ type: 'success', message: 'Successfully connected to Google Drive!' });
      // Preload folders
      loadDriveFolders(token);
    } catch (err: any) {
      console.error('Failed to connect to Google Drive:', err);
      setStatus({ type: 'error', message: err.message || 'Google Drive authentication failed or was cancelled.' });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  // Create a new folder
  const handleCreateFolder = async () => {
    if (!driveToken || !newFolderName.trim()) return;
    setIsCreatingFolder(true);
    setStatus(null);
    try {
      const folder = await createGoogleDriveFolder(driveToken, newFolderName.trim());
      await saveBackupConfig({
        folderId: folder.id,
        folderName: folder.name,
      }, auth.currentUser?.email || undefined);

      const updated = await getBackupConfig();
      setConfig(updated);
      setFolderMode('select');
      loadDriveFolders(driveToken);
      loadBackups(driveToken, folder.id);

      setStatus({ type: 'success', message: `Created and selected folder "${folder.name}" for backups.` });
    } catch (err: any) {
      console.error('Error creating folder:', err);
      setStatus({ type: 'error', message: err.message || 'Failed to create folder in Google Drive.' });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Validate and select custom folder ID or URL
  const handleSaveCustomFolder = async () => {
    if (!driveToken || !customFolderInput.trim()) return;
    setIsValidatingFolder(true);
    setStatus(null);

    // Extract ID if full URL pasted
    let folderId = customFolderInput.trim();
    const urlMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch && urlMatch[1]) {
      folderId = urlMatch[1];
    }

    try {
      const folderMeta = await getGoogleDriveFolder(driveToken, folderId);
      const name = folderMeta?.name || `Folder (${folderId})`;

      await saveBackupConfig({
        folderId,
        folderName: name,
      }, auth.currentUser?.email || undefined);

      const updated = await getBackupConfig();
      setConfig(updated);
      loadBackups(driveToken, folderId);
      setStatus({ type: 'success', message: `Target folder set to "${name}".` });
    } catch (err: any) {
      console.error('Failed to validate folder:', err);
      setStatus({ type: 'error', message: 'Could not find or access the specified Google Drive folder.' });
    } finally {
      setIsValidatingFolder(false);
    }
  };

  // Select existing folder
  const handleSelectFolder = async (folderId: string) => {
    if (!folderId) return;
    const found = availableFolders.find(f => f.id === folderId);
    const folderName = found ? found.name : folderId;

    try {
      await saveBackupConfig({
        folderId,
        folderName,
      }, auth.currentUser?.email || undefined);

      const updated = await getBackupConfig();
      setConfig(updated);
      if (driveToken) {
        loadBackups(driveToken, folderId);
      }
      setStatus({ type: 'success', message: `Target folder set to "${folderName}".` });
    } catch (err: any) {
      console.error('Failed to save folder selection:', err);
      setStatus({ type: 'error', message: 'Failed to update folder settings.' });
    }
  };

  // Toggle auto backup
  const handleToggleAutoBackup = async (enabled: boolean) => {
    if (!config?.folderId && enabled) {
      setStatus({ type: 'error', message: 'Please select or create a Google Drive target folder before enabling auto-backup.' });
      return;
    }

    setIsSavingConfig(true);
    try {
      await saveBackupConfig({ enabled }, auth.currentUser?.email || undefined);
      const updated = await getBackupConfig();
      setConfig(updated);
      setStatus({
        type: 'success',
        message: enabled ? 'Automatic Google Drive backup enabled!' : 'Automatic backup disabled.'
      });
    } catch (err: any) {
      console.error('Error toggling auto backup:', err);
      setStatus({ type: 'error', message: 'Failed to update auto-backup status.' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Change frequency
  const handleChangeFrequency = async (frequency: GoogleDriveBackupConfig['frequency']) => {
    setIsSavingConfig(true);
    try {
      await saveBackupConfig({ frequency }, auth.currentUser?.email || undefined);
      const updated = await getBackupConfig();
      setConfig(updated);
      setStatus({ type: 'success', message: `Backup frequency updated to ${frequency.replace('_', ' ')}.` });
    } catch (err: any) {
      console.error('Error saving frequency:', err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Change scheduled backup time (e.g., "02:00")
  const handleSaveBackupTime = async (timeValue: string) => {
    setScheduledTimeInput(timeValue);
    setIsSavingConfig(true);
    try {
      await saveBackupConfig({ backupTime: timeValue }, auth.currentUser?.email || undefined);
      const updated = await getBackupConfig();
      setConfig(updated);
      setStatus({ type: 'success', message: `Daily backup time set to ${timeValue} hrs.` });
    } catch (err: any) {
      console.error('Error saving backup time:', err);
      setStatus({ type: 'error', message: 'Failed to update backup time.' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Trigger immediate manual backup to Drive
  const handleManualDriveBackup = async () => {
    if (!driveToken) {
      await handleConnectDrive();
      return;
    }
    if (!config?.folderId) {
      setStatus({ type: 'error', message: 'Please select or create a target folder first.' });
      return;
    }

    setIsBackingUpToDrive(true);
    setStatus(null);
    try {
      const result = await executeGoogleDriveBackup(
        driveToken,
        config.folderId,
        auth.currentUser?.email || 'admin'
      );

      const updated = await getBackupConfig();
      setConfig(updated);
      await loadBackups(driveToken, config.folderId);

      setStatus({
        type: 'success',
        message: `Successfully backed up database to Google Drive (${result.recordsCount} records across ${result.collectionsCount} collections)!`
      });
    } catch (err: any) {
      console.error('Manual drive backup failed:', err);
      setStatus({ type: 'error', message: err.message || 'Failed to upload backup to Google Drive.' });
    } finally {
      setIsBackingUpToDrive(false);
    }
  };

  // Restore directly from a Google Drive file
  const handleRestoreFromDriveFile = async (file: DriveBackupFileItem) => {
    if (!driveToken || !isAdmin) return;
    setIsRestoringFromDrive(file.id);
    setStatus(null);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${driveToken}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to download backup file from Drive: ${res.statusText}`);
      }
      const data = await res.json();
      const hasRequiredCollections = COLLECTIONS.some(col => Array.isArray(data[col]));
      if (!hasRequiredCollections) {
        throw new Error('Downloaded file does not contain valid backup data.');
      }
      setPendingBackupData(data);
      setRestoreSource(`Google Drive: ${file.name}`);
      setShowConfirmRestore(true);
    } catch (err: any) {
      console.error('Failed to load backup from Drive:', err);
      setStatus({ type: 'error', message: err.message || 'Failed to download file from Google Drive.' });
    } finally {
      setIsRestoringFromDrive(null);
    }
  };

  // Local JSON Export
  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const fullBackup: any = {};
      for (const collectionName of COLLECTIONS) {
        const snapshot = await getDocs(collection(db, collectionName));
        fullBackup[collectionName] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TriloyTech_Full_Backup_${formattedDate}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus({ type: 'success', message: 'Full database backup downloaded successfully!' });
    } catch (error) {
      console.error("Export failed:", error);
      setStatus({ type: 'error', message: 'Failed to export backup. Please try again.' });
    } finally {
      setIsExporting(false);
    }
  };

  // Local JSON Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const hasRequiredCollections = COLLECTIONS.some(col => Array.isArray(data[col]));
        if (!hasRequiredCollections) {
          throw new Error("Invalid backup file format.");
        }
        setPendingBackupData(data);
        setRestoreSource(`Local File: ${file.name}`);
        setShowConfirmRestore(true);
      } catch (error) {
        console.error("Invalid JSON:", error);
        setStatus({ type: 'error', message: 'Invalid backup file. Please upload a valid JSON backup.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Execute Restore
  const handleRestore = async () => {
    if (!pendingBackupData || !isAdmin) return;

    setIsImporting(true);
    setShowConfirmRestore(false);
    setStatus(null);

    try {
      for (const collectionName of COLLECTIONS) {
        const dataArray = pendingBackupData[collectionName];
        if (!Array.isArray(dataArray)) continue;

        for (let i = 0; i < dataArray.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = dataArray.slice(i, i + 500);

          chunk.forEach((item: any) => {
            const { id, ...data } = item;
            const docRef = doc(db, collectionName, id);
            batch.set(docRef, data);
          });

          await batch.commit();
        }
      }

      setStatus({ type: 'success', message: 'Database restored successfully! All collections have been updated.' });
      setPendingBackupData(null);
    } catch (error) {
      console.error("Restore failed:", error);
      setStatus({ type: 'error', message: 'Failed to restore database. Some data might be partially updated.' });
    } finally {
      setIsImporting(false);
    }
  };

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '—';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return bytesStr;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDateDisplay = (isoStr?: string) => {
    if (!isoStr) return 'Never';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const nextBackupInfo = config ? getNextScheduledBackup(config, currentTime) : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100/50 flex items-center justify-center text-amber-600 shadow-sm">
              <Database size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-800">Database Backup & Recovery</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Google Drive Cloud Sync
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium">
                Automated continuous backups to Google Drive and full manual JSON exports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!driveToken ? (
              <button
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
                className="flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-700 shadow-sm transition-all disabled:opacity-50"
              >
                {isConnectingDrive ? (
                  <Loader2 size={16} className="animate-spin text-slate-600" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                )}
                <span>{isConnectingDrive ? 'Connecting...' : 'Connect Google Drive'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Google Drive Connected
                </div>
                <button
                  onClick={handleConnectDrive}
                  title="Refresh authorization"
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-100 transition-all"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {status && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-4 rounded-2xl flex items-center gap-3 text-sm font-semibold",
              status.type === 'success'
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : status.type === 'info'
                ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                : "bg-rose-50 text-rose-700 border border-rose-100"
            )}
          >
            {status.type === 'success' ? (
              <CheckCircle2 size={18} className="shrink-0" />
            ) : status.type === 'info' ? (
              <Clock size={18} className="shrink-0" />
            ) : (
              <AlertCircle size={18} className="shrink-0" />
            )}
            <span className="flex-1">{status.message}</span>
          </motion.div>
        )}
      </div>

      {/* Primary Section: Google Drive Automated Backup Hub */}
      <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/50">
              <Cloud size={22} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-lg">Google Drive Automated Backup</h4>
              <p className="text-xs text-slate-500">
                Schedules full JSON snapshots directly to your designated Google Drive folder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {config?.folderId && (
              <button
                onClick={handleManualDriveBackup}
                disabled={isBackingUpToDrive || !driveToken}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isBackingUpToDrive ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
                {isBackingUpToDrive ? 'Uploading to Drive...' : 'Back Up Now to Drive'}
              </button>
            )}
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Target Folder Selector */}
          <div className="lg:col-span-2 p-6 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Folder size={18} className="text-blue-600" />
                <span>Target Google Drive Folder</span>
              </div>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-xs">
                <button
                  onClick={() => {
                    setFolderMode('select');
                    if (driveToken && availableFolders.length === 0) loadDriveFolders(driveToken);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-bold transition-all",
                    folderMode === 'select' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Choose Folder
                </button>
                <button
                  onClick={() => setFolderMode('create')}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-bold transition-all",
                    folderMode === 'create' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Create New
                </button>
                <button
                  onClick={() => setFolderMode('custom')}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-bold transition-all",
                    folderMode === 'custom' ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Folder ID / Link
                </button>
              </div>
            </div>

            {/* Currently active folder pill */}
            {config?.folderId ? (
              <div className="p-3 bg-white rounded-xl border border-blue-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Folder size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {config.folderName || 'Selected Folder'}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      ID: {config.folderId}
                    </p>
                  </div>
                </div>
                <a
                  href={`https://drive.google.com/drive/folders/${config.folderId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 flex items-center gap-1.5 shrink-0 transition-all"
                >
                  <span>Open in Drive</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-600 shrink-0" />
                <span>No Google Drive folder selected yet. Choose, create, or enter a folder below to start auto-backups.</span>
              </div>
            )}

            {/* Folder selection controls based on mode */}
            {folderMode === 'select' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={config?.folderId || ''}
                      onChange={(e) => handleSelectFolder(e.target.value)}
                      disabled={!driveToken || isLoadingFolders}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
                    >
                      <option value="">
                        {!driveToken
                          ? '— Connect Google Drive first —'
                          : isLoadingFolders
                          ? 'Loading folders...'
                          : availableFolders.length === 0
                          ? 'No folders found (Click "Create New")'
                          : 'Select a Google Drive folder...'}
                      </option>
                      {availableFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {driveToken && (
                    <button
                      onClick={() => loadDriveFolders(driveToken)}
                      disabled={isLoadingFolders}
                      title="Refresh folders list"
                      className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={cn(isLoadingFolders && "animate-spin")} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {folderMode === 'create' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder name (e.g. TriloyTech Backups)"
                    disabled={!driveToken || isCreatingFolder}
                    className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={!driveToken || isCreatingFolder || !newFolderName.trim()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                  >
                    {isCreatingFolder ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                    <span>Create & Select</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Creates a dedicated folder directly in your Google Drive root for backups.
                </p>
              </div>
            )}

            {folderMode === 'custom' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customFolderInput}
                    onChange={(e) => setCustomFolderInput(e.target.value)}
                    placeholder="Paste Folder ID or Google Drive URL (https://drive.google.com/drive/folders/...)"
                    disabled={!driveToken || isValidatingFolder}
                    className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                  />
                  <button
                    onClick={handleSaveCustomFolder}
                    disabled={!driveToken || isValidatingFolder || !customFolderInput.trim()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                  >
                    {isValidatingFolder ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>Save Folder</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Schedule & Automation Settings */}
          <div className="p-6 bg-slate-50/70 rounded-2xl border border-slate-100 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <Clock size={18} className="text-indigo-600" />
                  <span>Automation Schedule</span>
                </div>
                {/* Switch toggle */}
                <button
                  onClick={() => handleToggleAutoBackup(!config?.enabled)}
                  disabled={isSavingConfig || !config?.folderId}
                  className={cn(
                    "w-12 h-6 flex items-center rounded-full p-1 transition-all duration-200 focus:outline-none",
                    config?.enabled ? "bg-blue-600" : "bg-slate-300",
                    (!config?.folderId || isSavingConfig) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div
                    className={cn(
                      "bg-white w-4 h-4 rounded-full shadow-md transform transition-all duration-200",
                      config?.enabled ? "translate-x-6" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Backup Frequency
                </label>
                <select
                  value={config?.frequency || 'daily'}
                  onChange={(e) => handleChangeFrequency(e.target.value as any)}
                  disabled={!config?.enabled || isSavingConfig}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
                >
                  <option value="daily">Daily at Scheduled Time (Recommended)</option>
                  <option value="hourly">Every Hour</option>
                  <option value="every_6h">Every 6 Hours</option>
                  <option value="every_12h">Every 12 Hours</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              {/* Time of Day Picker (when Daily or Weekly) */}
              {(config?.frequency === 'daily' || config?.frequency === 'weekly') && (
                <div className="space-y-2.5 pt-2 border-t border-slate-200/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock size={13} className="text-indigo-600" />
                      <span>Scheduled Backup Time (24h)</span>
                    </label>
                    <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">
                      {config?.backupTime || '02:00'} hrs
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={scheduledTimeInput}
                      onChange={(e) => setScheduledTimeInput(e.target.value)}
                      onBlur={() => {
                        if (scheduledTimeInput && scheduledTimeInput !== config?.backupTime) {
                          handleSaveBackupTime(scheduledTimeInput);
                        }
                      }}
                      disabled={!config?.enabled || isSavingConfig}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveBackupTime(scheduledTimeInput)}
                      disabled={!config?.enabled || isSavingConfig || scheduledTimeInput === (config?.backupTime || '02:00')}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40 shrink-0 flex items-center gap-1"
                    >
                      <Check size={13} />
                      <span>Set Time</span>
                    </button>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Quick Time Presets
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { time: '02:00', label: '02:00 hrs (Night)' },
                        { time: '00:00', label: '00:00 hrs (Midnight)' },
                        { time: '06:00', label: '06:00 hrs (Morning)' },
                        { time: '12:00', label: '12:00 hrs (Noon)' },
                        { time: '22:00', label: '22:00 hrs (Late)' },
                      ].map((preset) => {
                        const isSelected = (config?.backupTime || '02:00') === preset.time;
                        return (
                          <button
                            key={preset.time}
                            type="button"
                            onClick={() => handleSaveBackupTime(preset.time)}
                            disabled={!config?.enabled || isSavingConfig}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border",
                              isSelected
                                ? "bg-indigo-600 border-indigo-600 text-white font-bold shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            )}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3.5 bg-white rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Auto-Backup Status:</span>
                  <span className={cn("font-bold flex items-center gap-1.5", config?.enabled ? "text-emerald-600" : "text-slate-400")}>
                    {config?.enabled && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                    {config?.enabled ? 'Active (Continuous)' : 'Disabled'}
                  </span>
                </div>

                {config?.enabled && nextBackupInfo && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                    <span className="text-slate-400 font-medium">Next Backup:</span>
                    <div className="text-right">
                      <span className="font-bold text-indigo-600">
                        {nextBackupInfo.formattedTime}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        ({nextBackupInfo.relativeText})
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <span className="text-slate-400 font-medium">Last Saved Backup:</span>
                  <span className="font-bold text-slate-700">
                    {formatDateDisplay(config?.lastBackupTime)}
                  </span>
                </div>
              </div>
            </div>

            {config?.lastBackupFileName && (
              <div className="pt-2 text-[11px] text-slate-400 truncate">
                Last file: <span className="font-mono text-slate-600">{config.lastBackupFileName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Existing Backups List in Target Folder */}
        {config?.folderId && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h5 className="font-bold text-slate-800 text-sm">
                  Recent Backups in "{config.folderName || 'Selected Folder'}"
                </h5>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">
                  {folderBackups.length}
                </span>
              </div>
              {driveToken && (
                <button
                  onClick={() => loadBackups(driveToken, config.folderId)}
                  disabled={isLoadingBackups}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw size={13} className={cn(isLoadingBackups && "animate-spin")} />
                  <span>Refresh List</span>
                </button>
              )}
            </div>

            {isLoadingBackups ? (
              <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-slate-100">
                <Loader2 size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Checking Google Drive folder for backup files...</p>
              </div>
            ) : folderBackups.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <FileJson size={28} className="text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">No backup files found in this Google Drive folder yet.</p>
                <p className="text-[11px] text-slate-400">
                  Click "Back Up Now to Drive" above to create the initial snapshot!
                </p>
              </div>
            ) : (
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {folderBackups.map((file) => (
                    <div
                      key={file.id}
                      className="p-3.5 hover:bg-slate-50/80 transition-all flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                          <FileJson size={16} />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-slate-800 truncate font-mono">
                            {file.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatDateDisplay(file.createdTime)} • {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Open file in Google Drive"
                          >
                            <ExternalLink size={15} />
                          </a>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleRestoreFromDriveFile(file)}
                            disabled={isRestoringFromDrive === file.id}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            title="Restore database from this snapshot"
                          >
                            {isRestoringFromDrive === file.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Upload size={12} />
                            )}
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Secondary Section: Local Export & Local Import */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local JSON Export */}
        <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/50">
              <Download size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Export Local JSON</h4>
              <p className="text-xs text-slate-400 font-medium">Download full snapshot directly to your computer</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Exports a standalone <code className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">.json</code> file containing all 17 database collections (invoices, payments, clients, accounts, entries, etc.).
          </p>
          <button
            onClick={handleExport}
            disabled={isExporting || isImporting}
            className="w-full py-3 bg-slate-50 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-100 hover:border-indigo-600 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 text-xs"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isExporting ? 'Generating JSON...' : 'Download Full JSON File'}
          </button>
        </div>

        {/* Local JSON Import */}
        <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100/50">
              <Upload size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Restore from Local JSON</h4>
              <p className="text-xs text-slate-400 font-medium">Upload a previously exported database file</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Restore system records from a JSON file. <span className="text-rose-600 font-bold">Admin authorization required.</span> Existing documents with matching IDs will be updated.
          </p>
          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              disabled={isExporting || isImporting || !isAdmin}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <button
              disabled={isExporting || isImporting || !isAdmin}
              className="w-full py-3 bg-slate-50 hover:bg-emerald-600 text-emerald-600 hover:text-white border border-emerald-100 hover:border-emerald-600 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 text-xs"
            >
              {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {isImporting ? 'Restoring Data...' : 'Select & Restore JSON File'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Restore Operations */}
      <AnimatePresence>
        {showConfirmRestore && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50/70">
                <div className="flex items-center gap-3 text-rose-600">
                  <ShieldAlert size={24} />
                  <div>
                    <h2 className="text-lg font-bold text-rose-700">Confirm Database Restoration</h2>
                    <p className="text-xs text-rose-500 font-medium">Source: {restoreSource}</p>
                  </div>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-slate-600 text-sm font-medium leading-relaxed">
                  You are about to restore the full database from this backup snapshot. This will{' '}
                  <span className="font-black text-rose-600 underline">overwrite</span> existing matching records across your financial ledgers and settings.
                </p>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    Collections to be Restored:
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pt-1">
                    {COLLECTIONS.map((col) => {
                      const count = pendingBackupData?.[col]?.length || 0;
                      return (
                        <span
                          key={col}
                          className={cn(
                            "px-2 py-1 rounded text-[11px] font-bold border",
                            count > 0
                              ? "bg-white border-slate-200 text-slate-700"
                              : "bg-slate-100 border-slate-200 text-slate-400"
                          )}
                        >
                          {col}: <span className="text-blue-600">{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowConfirmRestore(false);
                      setPendingBackupData(null);
                    }}
                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRestore}
                    className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all text-xs"
                  >
                    Confirm & Restore Data
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

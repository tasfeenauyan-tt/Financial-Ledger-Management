import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc 
} from 'firebase/firestore';
import { 
  Download, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  ShieldAlert, 
  Database, 
  FileJson, 
  RefreshCw,
  HardDrive,
  Layers,
  FileSpreadsheet,
  Users,
  Wallet,
  Settings,
  Lock
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface FullDatabaseBackupProps {
  userRole: string;
}

const COLLECTIONS_CONFIG = [
  { key: 'entries', label: 'Journal Entries (Ledger)', icon: FileSpreadsheet, category: 'Ledger' },
  { key: 'clients', label: 'Clients & Projects', icon: Users, category: 'Clients & Projects' },
  { key: 'invoices', label: 'Invoices', icon: FileJson, category: 'Clients & Projects' },
  { key: 'payments', label: 'Payment Records', icon: Wallet, category: 'Clients & Projects' },
  { key: 'bankAccounts', label: 'Bank Accounts', icon: HardDrive, category: 'Financial Setup' },
  { key: 'accounts', label: 'Chart of Accounts', icon: Layers, category: 'Financial Setup' },
  { key: 'transactionItems', label: 'Transaction Items', icon: Settings, category: 'Configuration' },
  { key: 'transactionSubCategories', label: 'Transaction Sub-Categories', icon: Settings, category: 'Configuration' },
  { key: 'partners', label: 'Partners Capital', icon: Users, category: 'Configuration' },
  { key: 'settings', label: 'Zakat & System Settings', icon: Settings, category: 'Configuration' },
  { key: 'services', label: 'Services Pool', icon: Layers, category: 'Configuration' },
  { key: 'employees', label: 'Employees Database', icon: Users, category: 'Payroll & HR' },
  { key: 'payslip_items', label: 'Pay Slip Item Pools', icon: Layers, category: 'Payroll & HR' },
  { key: 'payslips', label: 'Generated Pay Slips', icon: FileSpreadsheet, category: 'Payroll & HR' },
  { key: 'employee_salaries', label: 'Employee Salary Profiles', icon: Wallet, category: 'Payroll & HR' },
];

export default function FullDatabaseBackup({ userRole }: FullDatabaseBackupProps) {
  const isAdmin = userRole === 'admin';
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStatusText, setRestoreStatusText] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Live system counts
  const [collectionCounts, setCollectionCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  // Restore Modal State
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [backupStats, setBackupStats] = useState<Record<string, number>>({});

  const fetchLiveCounts = async () => {
    setIsLoadingCounts(true);
    try {
      const counts: Record<string, number> = {};
      for (const col of COLLECTIONS_CONFIG) {
        try {
          const snapshot = await getDocs(collection(db, col.key));
          counts[col.key] = snapshot.size;
        } catch {
          counts[col.key] = 0;
        }
      }
      setCollectionCounts(counts);
    } catch (err) {
      console.error("Failed to load counts", err);
    } finally {
      setIsLoadingCounts(false);
    }
  };

  useEffect(() => {
    fetchLiveCounts();
  }, []);

  // --- Export Full Backup ---
  const handleExportFullBackup = async () => {
    setIsExporting(true);
    setStatus({ type: 'info', message: 'Gathering all database collections for snapshot...' });

    try {
      const fullBackup: any = {
        version: '2.0',
        system: 'TriloyTech Financial & ERP Management',
        exportedAt: new Date().toISOString(),
        exportedBy: auth.currentUser?.email || 'authenticated_user',
        collectionsSummary: {},
        data: {}
      };

      for (const col of COLLECTIONS_CONFIG) {
        try {
          const snapshot = await getDocs(collection(db, col.key));
          const docsData = snapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            return {
              ...data,
              id: docSnapshot.id
            };
          });
          fullBackup.data[col.key] = docsData;
          fullBackup.collectionsSummary[col.key] = docsData.length;
        } catch (colErr) {
          console.warn(`Could not export collection ${col.key}:`, colErr);
          fullBackup.data[col.key] = [];
          fullBackup.collectionsSummary[col.key] = 0;
        }
      }

      // Create download blob
      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      a.href = url;
      a.download = `TriloyTech_Full_Database_Backup_${formattedDate}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalItems = Object.values(fullBackup.collectionsSummary).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
      setStatus({ 
        type: 'success', 
        message: `Comprehensive backup exported successfully! (${totalItems} total records across ${COLLECTIONS_CONFIG.length} sections saved).` 
      });
      fetchLiveCounts();
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to export full backup. ' + (err.message || 'Please try again.') });
    } finally {
      setIsExporting(false);
    }
  };

  // --- Handle File Upload & Verification ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAdmin) {
      setStatus({ 
        type: 'error', 
        message: 'Permission Denied: Only Administrators can restore database backups to prevent unauthorized overwrites.' 
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Normalize data whether payload is nested under .data or directly at root
        const normalizedData: Record<string, any[]> = {};
        const sourceData = parsed.data || parsed;

        let hasValidCollection = false;
        const stats: Record<string, number> = {};

        for (const col of COLLECTIONS_CONFIG) {
          if (Array.isArray(sourceData[col.key])) {
            normalizedData[col.key] = sourceData[col.key];
            stats[col.key] = sourceData[col.key].length;
            if (sourceData[col.key].length > 0) {
              hasValidCollection = true;
            }
          } else {
            stats[col.key] = 0;
          }
        }

        if (!hasValidCollection) {
          throw new Error("No recognized system data collections found in this JSON file. Please ensure it is a valid TriloyTech backup.");
        }

        setPendingBackupData(normalizedData);
        setBackupStats(stats);
        setConfirmInput('');
        setShowConfirmRestore(true);
        setStatus(null);
      } catch (err: any) {
        setStatus({ type: 'error', message: err.message || 'Invalid backup file. Please select a valid JSON backup file.' });
        setPendingBackupData(null);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Perform Full Restore (Admin Only) ---
  const executeRestore = async () => {
    if (!pendingBackupData || !isAdmin) return;

    setIsRestoring(true);
    setShowConfirmRestore(false);
    setStatus({ type: 'info', message: 'Initiating full system restore. Overwriting records...' });
    setRestoreProgress(0);

    try {
      const activeCollections = COLLECTIONS_CONFIG.filter(col => 
        Array.isArray(pendingBackupData[col.key]) && pendingBackupData[col.key].length > 0
      );

      let completedSteps = 0;
      let totalRestoredRecords = 0;

      for (const col of activeCollections) {
        const records = pendingBackupData[col.key];
        setRestoreStatusText(`Restoring ${col.label} (${records.length} records)...`);

        // Chunk in batches of 400 (safe limit below 500)
        const CHUNK_SIZE = 400;
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
          const chunk = records.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);

          chunk.forEach((item: any) => {
            const docId = item.id || `restored_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const itemCopy = { ...item };
            delete itemCopy.id;
            batch.set(doc(db, col.key, docId), { ...itemCopy, id: docId });
          });

          await batch.commit();
        }

        totalRestoredRecords += records.length;
        completedSteps++;
        setRestoreProgress(Math.round((completedSteps / activeCollections.length) * 100));
      }

      setStatus({ 
        type: 'success', 
        message: `System successfully restored! Overwrote ${totalRestoredRecords} records across ${activeCollections.length} collections.` 
      });
      setPendingBackupData(null);
      await fetchLiveCounts();
    } catch (err: any) {
      console.error("Restore failed:", err);
      handleFirestoreError(err, OperationType.WRITE, 'system_restore_batch');
      setStatus({ type: 'error', message: 'Restore encountered an error: ' + (err.message || 'Transaction aborted.') });
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setRestoreStatusText('');
    }
  };

  const totalBackupRecords = Object.values(backupStats).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
              <Database size={13} />
              <span>Full System Snapshot & Disaster Recovery</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">Full Database Management</h2>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Export and restore all critical business data at once—covering the complete financial ledger, clients, invoices, bank accounts, charts of accounts, and system configurations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchLiveCounts}
              disabled={isLoadingCounts}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all border border-white/10 disabled:opacity-50"
              title="Refresh live counts"
            >
              <RefreshCw size={14} className={isLoadingCounts ? "animate-spin" : ""} />
              Refresh Status
            </button>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {status && (
        <div className={`p-4 rounded-2xl flex items-start gap-3 border shadow-sm transition-all ${
          status.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : status.type === 'error' 
            ? 'bg-rose-50 border-rose-200 text-rose-800' 
            : 'bg-indigo-50 border-indigo-200 text-indigo-800'
        }`}>
          {status.type === 'success' && <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />}
          {status.type === 'error' && <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />}
          {status.type === 'info' && <RefreshCw size={20} className="text-indigo-600 shrink-0 mt-0.5 animate-spin" />}
          <div className="text-sm font-semibold flex-1 leading-snug">{status.message}</div>
          <button 
            onClick={() => setStatus(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100 px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Progress Bar while Restoring */}
      {isRestoring && (
        <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-md space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-indigo-700 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-indigo-600" />
              {restoreStatusText || 'Restoring database records...'}
            </span>
            <span className="text-indigo-600 font-mono">{restoreProgress}%</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${restoreProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Card 1: Comprehensive Backups (Export) */}
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                <Download size={24} />
              </div>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                All Roles
              </span>
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-800">1. Comprehensive Backups</h3>
              <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                Export a single JSON file containing everything in your system. This full snapshot is timestamped and ready for offsite storage or disaster recovery.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">What's included in this backup:</p>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li><strong className="text-slate-800">Journal Entries:</strong> The complete general ledger</li>
                <li><strong className="text-slate-800">Client & Project Data:</strong> Clients, Invoices, & Payment tracking</li>
                <li><strong className="text-slate-800">Financial Setup:</strong> Bank Accounts and Chart of Accounts</li>
                <li><strong className="text-slate-800">Configuration:</strong> Zakat Settings, Transaction Items, & Partners</li>
                <li><strong className="text-slate-800">Payroll & HR:</strong> Employees, Pay Slip items, & Saved slips</li>
              </ul>
            </div>
          </div>

          <button
            onClick={handleExportFullBackup}
            disabled={isExporting || isRestoring}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Generating Snapshot...
              </>
            ) : (
              <>
                <Download size={18} />
                Download Full JSON Backup
              </>
            )}
          </button>
        </div>

        {/* Card 2: One-Click Restore */}
        <div className={`bg-white rounded-3xl p-6 md:p-8 border shadow-sm flex flex-col justify-between space-y-6 ${
          isAdmin ? 'border-slate-200/80' : 'border-slate-200 bg-slate-50/50'
        }`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${
                isAdmin ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'
              }`}>
                <Upload size={24} />
              </div>

              {isAdmin ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  <ShieldCheck size={12} />
                  Admin Only
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                  <Lock size={12} />
                  Restricted
                </span>
              )}
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-800">2. One-Click Restore</h3>
              <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                Upload a previously saved backup file to completely rebuild the system state. <span className="text-rose-600 font-bold">Overwrites existing records with backup data.</span>
              </p>
            </div>

            {isAdmin ? (
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span>Safety First: Critical Action Protected</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Before any data changes, an explicit confirmation modal will display the exact record count in each section and require confirmation to avoid accidental overwrites.
                </p>
              </div>
            ) : (
              <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <ShieldAlert size={14} className="text-slate-500" />
                  <span>Admin Security Constraint</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  While anyone with access can download a backup, the Restore capability is strictly reserved for Admins to prevent unauthorized data overwrites.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className={`w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-bold text-sm transition-all ${
              isAdmin && !isRestoring
                ? 'cursor-pointer bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 active:scale-[0.99]'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}>
              <Upload size={18} />
              <span>{isAdmin ? 'Upload JSON & Restore Database' : 'Restore Reserved for Admins'}</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={!isAdmin || isRestoring}
                className="hidden"
              />
            </label>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              Accepts .json backup files generated by TriloyTech
            </p>
          </div>
        </div>

      </div>

      {/* Live System Data Inventory Breakdown */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Current Database Inventory</h3>
            <p className="text-slate-500 text-xs">Live count of active documents currently stored in Firestore</p>
          </div>
          <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
            {Object.values(collectionCounts).reduce((a: number, b: number) => a + b, 0)} Total Records
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {COLLECTIONS_CONFIG.map(col => {
            const Icon = col.icon;
            const count = collectionCounts[col.key] ?? 0;
            return (
              <div 
                key={col.key}
                className="bg-slate-50/70 hover:bg-slate-50 border border-slate-100 rounded-2xl p-4 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-600 shadow-sm">
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {col.category}
                  </span>
                </div>
                <div className="text-xl font-black text-slate-800 font-mono">{count}</div>
                <div className="text-xs font-semibold text-slate-500 truncate" title={col.label}>{col.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Critical Action: Restore Confirmation Modal --- */}
      {showConfirmRestore && pendingBackupData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-rose-100 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200">
                  Critical Action
                </span>
                <h3 className="text-xl font-black text-slate-900">Confirm Full Database Restore</h3>
                <p className="text-xs text-slate-500">
                  You are about to overwrite live system records with the uploaded backup file.
                </p>
              </div>
            </div>

            {/* Warning Message */}
            <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 space-y-2">
              <p className="font-bold">⚠️ Warning: Irreversible Data Overwrite</p>
              <p className="leading-relaxed">
                This process will write records from the backup file into Firestore. Existing records with matching IDs will be overwritten. This action cannot be reversed without another backup.
              </p>
            </div>

            {/* Breakdown of Records to be Restored */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Backup Content Breakdown:</span>
                <span className="font-mono text-indigo-600">{totalBackupRecords} Total Records</span>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-100 bg-slate-50/50 p-1">
                {COLLECTIONS_CONFIG.map(col => {
                  const count = backupStats[col.key] || 0;
                  return (
                    <div key={col.key} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-medium text-slate-700 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        {col.label}
                      </span>
                      <span className={`font-mono font-bold ${count > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {count} records
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Explicit Confirmation Input */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-bold text-slate-700">
                To proceed, type <span className="font-mono text-rose-600 font-black">RESTORE</span> below:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="RESTORE"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-sm uppercase"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmRestore(false);
                  setPendingBackupData(null);
                  setConfirmInput('');
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={confirmInput.trim().toUpperCase() !== 'RESTORE'}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md shadow-rose-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <AlertTriangle size={14} />
                Confirm & Overwrite System Data
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

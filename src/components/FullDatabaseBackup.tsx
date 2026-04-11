import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Download, Upload, AlertCircle, CheckCircle2, ShieldAlert, Loader2, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface FullDatabaseBackupProps {
  userRole: string;
}

const COLLECTIONS = [
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
  'users'
];

export default function FullDatabaseBackup({ userRole }: FullDatabaseBackupProps) {
  const isAdmin = userRole === 'admin';
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);

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

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TriloyTech_Full_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus({ type: 'success', message: 'Full database backup exported successfully!' });
    } catch (error) {
      console.error("Export failed:", error);
      setStatus({ type: 'error', message: 'Failed to export backup. Please try again.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        // Basic validation
        const hasRequiredCollections = COLLECTIONS.some(col => Array.isArray(data[col]));
        if (!hasRequiredCollections) {
          throw new Error("Invalid backup file format.");
        }
        setPendingBackupData(data);
        setShowConfirmRestore(true);
      } catch (error) {
        console.error("Invalid JSON:", error);
        setStatus({ type: 'error', message: 'Invalid backup file. Please upload a valid JSON backup.' });
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!pendingBackupData || !isAdmin) return;
    
    setIsImporting(true);
    setShowConfirmRestore(false);
    setStatus(null);

    try {
      // We'll use batches to restore. Firestore has a 500 operation limit per batch.
      // For a full restore, we might need multiple batches.
      
      for (const collectionName of COLLECTIONS) {
        const dataArray = pendingBackupData[collectionName];
        if (!Array.isArray(dataArray)) continue;

        // Delete existing data in this collection first? 
        // Actually, setDoc will overwrite if ID matches. 
        // But if we want a *true* restore, we should probably clear first.
        // However, clearing is dangerous. Let's stick to overwriting/adding for now.
        
        // Process in chunks of 500
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

      setStatus({ type: 'success', message: 'Database restored successfully! All sections have been updated.' });
      setPendingBackupData(null);
    } catch (error) {
      console.error("Restore failed:", error);
      setStatus({ type: 'error', message: 'Failed to restore database. Some data might be partially updated.' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-sm">
              <Database size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Full Database Management</h3>
              <p className="text-sm text-slate-500 font-medium">Backup or restore all system data at once</p>
            </div>
          </div>
        </div>

        {status && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-4 rounded-2xl flex items-center gap-3 text-sm font-semibold",
              status.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
            )}
          >
            {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {status.message}
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Export Section */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm">
                <Download size={20} />
              </div>
              <h4 className="font-bold text-slate-800">Export Full Backup</h4>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Download a complete snapshot of your entire database including clients, invoices, payments, and settings. 
              <span className="block mt-1 text-xs text-amber-600 font-bold">Note: Requires Admin permissions to read all collections.</span>
            </p>
            <button
              onClick={handleExport}
              disabled={isExporting || isImporting}
              className="w-full py-3 bg-white text-indigo-600 border border-indigo-100 font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {isExporting ? 'Generating Backup...' : 'Download Full JSON'}
            </button>
          </div>

          {/* Import Section */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm">
                <Upload size={20} />
              </div>
              <h4 className="font-bold text-slate-800">Restore from Backup</h4>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Upload a previously exported JSON backup to restore your data. <span className="text-rose-600 font-bold">Warning: This will overwrite existing records.</span>
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
                className="w-full py-3 bg-white text-emerald-600 border border-emerald-100 font-bold rounded-xl hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                {isImporting ? 'Restoring Data...' : 'Upload & Restore'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmRestore && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-50">
                <div className="flex items-center gap-3 text-rose-600">
                  <ShieldAlert size={24} />
                  <h2 className="text-xl font-bold">Critical Action</h2>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-slate-600 font-medium leading-relaxed">
                  You are about to restore the database from a backup file. This will <span className="font-black text-rose-600 underline">overwrite</span> existing data in all sections.
                </p>
                <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Data to be restored:</p>
                  <div className="flex flex-wrap gap-2">
                    {COLLECTIONS.map(col => (
                      <span key={col} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-600">
                        {col} ({pendingBackupData?.[col]?.length || 0})
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowConfirmRestore(false); setPendingBackupData(null); }}
                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRestore}
                    className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all"
                  >
                    Confirm Restore
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

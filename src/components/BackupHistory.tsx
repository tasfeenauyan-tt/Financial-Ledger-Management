import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { History, RotateCcw, CheckCircle2, AlertCircle, Clock, Database, Trash2, FileJson } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { getStorage, ref, getBytes } from 'firebase/storage';

interface HistoryRecord {
  id: string;
  entryId: string;
  action: 'created' | 'updated' | 'deleted';
  timestamp: string;
  storagePath: string;
}

interface BackupHistoryProps {
  userRole: string;
}

export default function BackupHistory({ userRole }: BackupHistoryProps) {
  const isAdmin = userRole === 'admin';
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'entry_history'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as HistoryRecord));
        setHistory(records);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching history:", error);
        setLoading(false);
      });

      return () => unsubscribeSnapshot();
    });

    return () => unsubscribeAuth();
  }, []);

  const handleRestore = async (record: HistoryRecord) => {
    if (!isAdmin) return;
    
    setRestoringId(record.id);
    setStatus(null);

    try {
      // In a real production app, we would call the Cloud Function:
      // const restoreFunc = httpsCallable(functions, 'triggerSingleRestore');
      // await restoreFunc({ storagePath: record.storagePath });
      
      // For this demo environment, we'll implement the restore logic by fetching from Storage
      const storage = getStorage();
      const fileRef = ref(storage, record.storagePath);
      const bytes = await getBytes(fileRef);
      const backupData = JSON.parse(new TextDecoder().decode(bytes));

      const entryRef = doc(db, 'entries', record.entryId);

      if (backupData.after) {
        await setDoc(entryRef, backupData.after);
      } else if (backupData.action === 'deleted' && backupData.before) {
        await setDoc(entryRef, backupData.before);
      }

      setStatus({ type: 'success', message: `Successfully restored version from ${format(new Date(record.timestamp), 'PPp')}` });
    } catch (error) {
      console.error("Restore failed:", error);
      setStatus({ type: 'error', message: "Failed to restore. Ensure Firebase Storage is configured and file exists." });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <History size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Journal History Timeline</h3>
              <p className="text-sm text-slate-500 font-medium">Real-time backups and version control</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
            <Database size={16} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Storage: Firebase</span>
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

        <div className="relative space-y-4">
          {/* Vertical line for timeline */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-100" />

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <Clock size={32} />
              </div>
              <p className="text-slate-400 font-medium italic">No history records found yet.</p>
              <p className="text-xs text-slate-300">Backups are created automatically when you add or edit transactions.</p>
            </div>
          ) : (
            history.map((record, idx) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="relative pl-12 group"
              >
                {/* Timeline dot */}
                <div className={cn(
                  "absolute left-[21px] top-4 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm z-10",
                  record.action === 'created' ? "bg-emerald-500" :
                  record.action === 'updated' ? "bg-indigo-500" : "bg-rose-500"
                )} />

                <div className="bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-100 rounded-2xl p-4 transition-all flex items-center justify-between group-hover:shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      record.action === 'created' ? "bg-emerald-50 text-emerald-600" :
                      record.action === 'updated' ? "bg-indigo-50 text-indigo-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {record.action === 'created' ? <Plus size={20} /> : 
                       record.action === 'updated' ? <RotateCcw size={20} /> : <Trash2 size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 capitalize">Journal {record.action}</span>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ID: {record.entryId.slice(-6)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                        <Clock size={12} />
                        {format(new Date(record.timestamp), 'PPp')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg border border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      <FileJson size={12} />
                      JSON Backup
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleRestore(record)}
                        disabled={restoringId !== null}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm",
                          restoringId === record.id 
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-white text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-100"
                        )}
                      >
                        {restoringId === record.id ? (
                          <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                        ) : (
                          <RotateCcw size={14} />
                        )}
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Daily Backups Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-3 text-emerald-600">
            <CheckCircle2 size={20} />
            <h4 className="font-bold">Daily Full Backups</h4>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            A complete snapshot of all journals is created every day at <span className="font-bold text-slate-700">02:00 AM (Dhaka)</span>. These are stored for 30 days.
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertCircle size={20} />
            <h4 className="font-bold">Retention Policy</h4>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Real-time history records are kept for <span className="font-bold text-slate-700">90 days</span>. Older versions are automatically purged to optimize storage.
          </p>
        </div>
      </div>
    </div>
  );
}

function Plus({ size, className }: { size?: number, className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
}

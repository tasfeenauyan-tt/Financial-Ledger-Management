import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  limit 
} from 'firebase/firestore';
import { 
  History, 
  RotateCcw, 
  Search, 
  Filter, 
  Eye, 
  AlertCircle, 
  CheckCircle2, 
  Download, 
  Clock, 
  User, 
  FileText, 
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import { EntryHistoryItem, LedgerEntry } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface BackupJournalHistoryProps {
  userRole: string;
}

export default function BackupJournalHistory({ userRole }: BackupJournalHistoryProps) {
  const isAdmin = userRole === 'admin';
  const [historyItems, setHistoryItems] = useState<EntryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  
  // Revert confirmation state
  const [selectedForRevert, setSelectedForRevert] = useState<EntryHistoryItem | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  
  // Inspect payload state
  const [inspectedItem, setInspectedItem] = useState<EntryHistoryItem | null>(null);
  
  // Alert/Status
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'entry_history'), 
      orderBy('timestamp', 'desc'),
      limit(250)
    );

    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        const items: EntryHistoryItem[] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        } as EntryHistoryItem));
        setHistoryItems(items);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching entry history:", error);
        handleFirestoreError(error, OperationType.LIST, 'entry_history');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter history
  const filteredItems = historyItems.filter(item => {
    const matchesFilter = filterAction === 'all' || item.action === filterAction;
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (item.details || '').toLowerCase().includes(term) ||
      (item.userEmail || '').toLowerCase().includes(term) ||
      (item.entryId || '').toLowerCase().includes(term) ||
      item.action.toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  });

  // Execute Revert
  const handleExecuteRevert = async () => {
    if (!selectedForRevert || !isAdmin) return;

    setIsReverting(true);
    setStatus(null);

    try {
      const { action, before, after, entryId } = selectedForRevert;
      const historyId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      if (action === 'updated' && before) {
        // Restore previous version
        await setDoc(doc(db, 'entries', entryId), before);
        await setDoc(doc(db, 'entry_history', historyId), {
          id: historyId,
          entryId,
          action: 'reverted',
          timestamp: new Date().toISOString(),
          before: after,
          after: before,
          userEmail: auth.currentUser?.email || 'admin',
          details: `Reverted entry "${before.details || entryId}" to previous state`
        });
        setStatus({ type: 'success', message: `Entry ${entryId} successfully reverted to its previous version.` });
      } else if (action === 'deleted' && before) {
        // Re-create deleted entry
        await setDoc(doc(db, 'entries', entryId), before);
        await setDoc(doc(db, 'entry_history', historyId), {
          id: historyId,
          entryId,
          action: 'reverted',
          timestamp: new Date().toISOString(),
          before: null,
          after: before,
          userEmail: auth.currentUser?.email || 'admin',
          details: `Restored deleted entry "${before.details || entryId}"`
        });
        setStatus({ type: 'success', message: `Deleted entry ${entryId} successfully restored.` });
      } else if (action === 'created') {
        // Remove created entry
        await deleteDoc(doc(db, 'entries', entryId));
        await setDoc(doc(db, 'entry_history', historyId), {
          id: historyId,
          entryId,
          action: 'reverted',
          timestamp: new Date().toISOString(),
          before: after,
          after: null,
          userEmail: auth.currentUser?.email || 'admin',
          details: `Reverted creation of entry "${after?.details || entryId}"`
        });
        setStatus({ type: 'success', message: `Created entry ${entryId} successfully removed.` });
      } else if (action === 'reverted' && before) {
        // Reverse revert
        await setDoc(doc(db, 'entries', entryId), before);
        setStatus({ type: 'success', message: `Reversion undone for entry ${entryId}.` });
      }

      setSelectedForRevert(null);
    } catch (err: any) {
      console.error("Revert error:", err);
      handleFirestoreError(err, OperationType.WRITE, `entries/${selectedForRevert.entryId}`);
      setStatus({ type: 'error', message: 'Failed to revert entry: ' + (err.message || 'Permission denied.') });
    } finally {
      setIsReverting(false);
    }
  };

  // Download Audit Log JSON
  const handleExportAuditLog = () => {
    const blob = new Blob([JSON.stringify(historyItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TriloyTech_Journal_Audit_History_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Format timestamp
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'created':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">Created</span>;
      case 'updated':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">Updated</span>;
      case 'deleted':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">Deleted</span>;
      case 'reverted':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">Reverted</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">{action}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Header Info */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
            <History size={13} />
            <span>Audit Trail & Rollback Control</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Journal Transaction History</h2>
          <p className="text-slate-500 text-xs md:text-sm max-w-xl">
            Real-time tracking of individual journal entry modifications, additions, and deletions with point-in-time rollback capability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportAuditLog}
            disabled={historyItems.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50"
            title="Download audit trail log as JSON"
          >
            <Download size={14} />
            Export Audit Log
          </button>
        </div>
      </div>

      {/* Status Notifications */}
      {status && (
        <div className={`p-4 rounded-2xl flex items-center justify-between border shadow-sm transition-all ${
          status.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2 text-xs font-semibold">
            {status.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
            {status.message}
          </div>
          <button 
            onClick={() => setStatus(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100 px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by details, user email, or entry ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 self-start md:self-auto">
          {['all', 'created', 'updated', 'deleted', 'reverted'].map(type => (
            <button
              key={type}
              onClick={() => setFilterAction(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                filterAction === type
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* History Log List */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Loading transaction history...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <History size={32} className="mx-auto text-slate-300" />
            <h4 className="text-sm font-bold text-slate-700">No History Records Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchTerm || filterAction !== 'all' 
                ? 'No transactions matched your search filters.' 
                : 'Transactions saved, updated, or removed will automatically appear here with full audit trails.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100">
                  <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time & Action</th>
                  <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Transaction Details</th>
                  <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">User / Editor</th>
                  <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map(item => {
                  const entryData = item.after || item.before;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 items-start">
                          {getActionBadge(item.action)}
                          <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock size={11} />
                            {formatTime(item.timestamp)}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-800">
                            {item.details || entryData?.details || 'Ledger Entry'}
                          </div>
                          {entryData?.transactionItemName && (
                            <div className="text-[11px] text-slate-500 font-medium">
                              Category: <span className="text-indigo-600">{entryData.transactionItemName}</span>
                              {entryData.remarks && <> • {entryData.remarks}</>}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-mono">
                            ID: {item.entryId}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <User size={13} className="text-slate-400" />
                          <span className="font-medium text-xs truncate max-w-[180px]">
                            {item.userEmail || 'System'}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setInspectedItem(item)}
                            className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                            title="Inspect Payload"
                          >
                            <Eye size={16} />
                          </button>

                          {isAdmin ? (
                            <button
                              onClick={() => setSelectedForRevert(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-bold transition-all"
                              title="Revert this change"
                            >
                              <RotateCcw size={13} />
                              Revert
                            </button>
                          ) : (
                            <span 
                              className="px-2 py-1 text-[10px] font-bold text-slate-400 bg-slate-50 rounded-lg border border-slate-100"
                              title="Admin required to revert"
                            >
                              Locked
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Modal: Inspect Payload --- */}
      {inspectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Transaction Event Snapshot</h3>
              </div>
              <button 
                onClick={() => setInspectedItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-2xl">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Action</span>
                <span className="font-bold text-slate-800 uppercase">{inspectedItem.action}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Recorded At</span>
                <span className="font-mono text-slate-700">{formatTime(inspectedItem.timestamp)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">User</span>
                <span className="text-slate-700">{inspectedItem.userEmail || 'System'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Target ID</span>
                <span className="font-mono text-slate-700">{inspectedItem.entryId}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">JSON Payload Record:</span>
              <pre className="bg-slate-950 text-emerald-400 p-4 rounded-2xl font-mono text-[11px] overflow-auto max-h-72">
                {JSON.stringify(inspectedItem, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectedItem(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: Confirm Revert --- */}
      {selectedForRevert && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-100 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <RotateCcw size={22} />
              </div>
              <div className="space-y-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                  Rollback Action
                </span>
                <h3 className="text-lg font-black text-slate-800">Confirm Change Reversion</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to revert this transaction change?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Action:</span>
                <span className="font-bold text-slate-800 uppercase">{selectedForRevert.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Entry ID:</span>
                <span className="font-mono text-slate-800">{selectedForRevert.entryId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Details:</span>
                <span className="font-semibold text-slate-800">{selectedForRevert.details || 'N/A'}</span>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              {selectedForRevert.action === 'updated' && 'This will replace the live entry with its state prior to this update.'}
              {selectedForRevert.action === 'deleted' && 'This will restore the deleted entry back to the active ledger.'}
              {selectedForRevert.action === 'created' && 'This will remove the entry that was created in this event.'}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedForRevert(null)}
                disabled={isReverting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRevert}
                disabled={isReverting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} className={isReverting ? "animate-spin" : ""} />
                {isReverting ? 'Reverting...' : 'Confirm Revert'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

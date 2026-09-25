import React, { useState } from 'react';
import { History, Database, Layers, ShieldCheck, Download, HardDrive } from 'lucide-react';
import FullDatabaseBackup from './FullDatabaseBackup';
import BackupJournalHistory from './BackupJournalHistory';

interface BackupManagementProps {
  userRole: string;
}

export default function BackupManagement({ userRole }: BackupManagementProps) {
  const [activeSubTab, setActiveSubTab] = useState<'history' | 'full-database'>('full-database');

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Header Bar */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Navigation Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all w-full sm:w-auto ${
              activeSubTab === 'history'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History size={15} />
            <span>Journal History</span>
          </button>

          <button
            onClick={() => setActiveSubTab('full-database')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all w-full sm:w-auto ${
              activeSubTab === 'full-database'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database size={15} />
            <span>Full Database</span>
          </button>
        </div>

        {/* Section Context Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200/60 rounded-xl text-slate-500 text-xs font-medium">
          <HardDrive size={13} className="text-slate-400" />
          <span>
            {activeSubTab === 'history' 
              ? 'Mode: Granular Audit & Individual Rollback' 
              : 'Mode: System-Wide Snapshot & Disaster Recovery'}
          </span>
        </div>

      </div>

      {/* Render Selected View */}
      {activeSubTab === 'history' ? (
        <BackupJournalHistory userRole={userRole} />
      ) : (
        <FullDatabaseBackup userRole={userRole} />
      )}
    </div>
  );
}

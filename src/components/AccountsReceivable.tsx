import React, { useMemo } from 'react';
import { LedgerEntry, Account } from '../types';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Clock, User, Download, FileText, Briefcase } from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AccountsReceivableProps {
  entries: LedgerEntry[];
  accounts: Account[];
  userRole: string;
}

interface ReceivableProject {
  projectName: string;
  totalReceivable: number;
  totalReceived: number;
  balance: number;
  lastTransactionDate: string;
  transactions: {
    date: string;
    description: string;
    receivable: number;
    received: number;
    balance: number;
  }[];
}

export default function AccountsReceivable({ entries, accounts, userRole }: AccountsReceivableProps) {
  const receivableResults = useMemo(() => {
    // 1. Identify which accounts are "Asset" and likely related to receivables
    // We filter for "Asset" category, but exclude common cash/bank accounts if we can 
    // or just assume any Asset movement with a Remark (Project) that isn't cash is a receivable tracking.
    // However, usually there's a specific "Accounts Receivable" account.
    // Given the previous task request for Payables used the entire Liability category, 
    // I will use the Asset category here but try to be smart if there are multiple.
    // Actually, to be safe and consistent with the Payables implementation:
    const assetAccountIds = accounts
      .filter(acc => acc.category === 'Asset' && acc.name.toLowerCase().includes('receivable'))
      .map(acc => acc.id);
    
    // If no specific "Receivable" account exists, fall back to all Assets (though this might include cash)
    // But typically users creating this kind of ledger WILL have a Receivable account.
    const targetAccountIds = assetAccountIds.length > 0 
      ? assetAccountIds 
      : accounts.filter(acc => acc.category === 'Asset').map(acc => acc.id);

    const projectMap = new Map<string, ReceivableProject>();

    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedEntries.forEach(entry => {
      const projectName = entry.remarks || 'Uncategorized';
      
      (entry.customEntries || []).forEach(ce => {
        if (targetAccountIds.includes(ce.accountId)) {
          if (!projectMap.has(projectName)) {
            projectMap.set(projectName, {
              projectName,
              totalReceivable: 0,
              totalReceived: 0,
              balance: 0,
              lastTransactionDate: entry.date,
              transactions: []
            });
          }

          const project = projectMap.get(projectName)!;
          // For Asset (Receivable): 
          // Debit (Dr) = Increase in receivable (Owed by client)
          // Credit (Cr) = Decrease in receivable (Received from client)
          const receivable = ce.type === 'Dr' ? ce.amount : 0;
          const received = ce.type === 'Cr' ? ce.amount : 0;

          project.totalReceivable += receivable;
          project.totalReceived += received;
          project.balance += (receivable - received);
          project.lastTransactionDate = entry.date;
          
          project.transactions.push({
            date: entry.date,
            description: entry.details || entry.transactionItemName,
            receivable,
            received,
            balance: project.balance
          });
        }
      });
    });

    // Only return projects with a positive balance (pending receivables)
    return Array.from(projectMap.values())
      .filter(p => p.balance > 0.01)
      .sort((a, b) => b.balance - a.balance);
  }, [entries, accounts]);

  const totalPending = receivableResults.reduce((sum, p) => sum + p.balance, 0);

  const downloadXLS = () => {
    const data = receivableResults.map(p => ({
      Project: p.projectName,
      'Total Receivable': p.totalReceivable,
      'Total Received': p.totalReceived,
      'Pending Balance': p.balance,
      'Last Update': p.lastTransactionDate
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Accounts Receivable");
    XLSX.writeFile(wb, `Accounts_Receivable_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Pending Accounts Receivable Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Total Outstanding: ${formatCurrency(totalPending, true)}`, 14, 38);

    const header = [['Project / Remarks', 'Total Receivable', 'Total Received', 'Balance', 'Last Date']];
    const rows = receivableResults.map(p => [
      p.projectName,
      formatCurrency(p.totalReceivable, true),
      formatCurrency(p.totalReceived, true),
      formatCurrency(p.balance, true),
      p.lastTransactionDate
    ]);

    autoTable(doc, {
      startY: 45,
      head: header,
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }, // Emerald color for receivables
    });

    doc.save(`Accounts_Receivable_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Receivable</p>
              <h4 className="text-2xl font-black text-slate-900">{formatCurrency(totalPending)}</h4>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <Briefcase size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Projects</p>
              <h4 className="text-2xl font-black text-slate-900">{receivableResults.length}</h4>
            </div>
          </div>
        </motion.div>

        <div className="flex items-end justify-end gap-3">
          <button 
            onClick={downloadXLS}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-all border border-emerald-100"
          >
            <Download size={18} />
            Export Excel
          </button>
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-sm font-bold transition-all border border-rose-100"
          >
            <FileText size={18} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Project / Remarks</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total Receivable</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total Received</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Pending Balance</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Last Update</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {receivableResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                    No pending accounts receivable found.
                  </td>
                </tr>
              ) : (
                receivableResults.map((project, idx) => (
                  <React.Fragment key={idx}>
                    <tr className="group hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            <Briefcase size={16} />
                          </div>
                          <span className="font-bold text-slate-700">{project.projectName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-600">
                        {formatCurrency(project.totalReceivable)}
                      </td>
                      <td className="p-4 text-right font-medium text-indigo-600">
                        {formatCurrency(project.totalReceived)}
                      </td>
                      <td className="p-4 text-right font-black text-emerald-600">
                        {formatCurrency(project.balance)}
                      </td>
                      <td className="p-4 text-center text-sm font-semibold text-slate-500 uppercase tracking-tight">
                        {project.lastTransactionDate}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                          <Clock size={12} />
                          Awaiting Payment
                        </span>
                      </td>
                    </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <ArrowUpRight className="text-emerald-500" size={20} />
            Receivable Distribution
          </h3>
          <div className="space-y-4">
            {receivableResults.slice(0, 5).map((project, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate-500">{project.projectName}</span>
                  <span className="text-slate-900">{formatCurrency(project.balance)} ({( (project.balance / totalPending) * 100 ).toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(project.balance / totalPending) * 100}%` }}
                    className="h-full bg-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <ArrowDownRight className="text-indigo-500" size={20} />
            Recent Collections Activity
          </h3>
          <div className="space-y-4">
             {entries
              .filter(e => e.customEntries?.some(ce => ce.accountCategory === 'Asset' && ce.type === 'Cr'))
              .slice(0, 5)
              .map((entry, idx) => {
                const receivedAmount = entry.customEntries.reduce((sum, ce) => 
                  ce.accountCategory === 'Asset' && ce.type === 'Cr' ? sum + ce.amount : sum, 0);
                if (receivedAmount === 0) return null;
                return (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-sm font-bold text-slate-700">{entry.remarks || 'General Collection'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{entry.date}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-600">
                      +{formatCurrency(receivedAmount)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

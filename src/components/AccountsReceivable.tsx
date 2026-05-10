import React, { useMemo, useState } from 'react';
import { LedgerEntry, Account } from '../types';
import { formatCurrency } from '../lib/utils';
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  Download, 
  FileText, 
  Briefcase, 
  Eye, 
  X, 
  CheckCircle2, 
  Calendar,
  Layers,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AccountsReceivableProps {
  entries: LedgerEntry[];
  accounts: Account[];
  userRole: string;
}

interface ReceivableTransaction {
  date: string;
  description: string;
  receivable: number;
  received: number;
  balance: number;
}

interface ReceivableProject {
  projectName: string;
  clientId: string;
  totalReceivable: number;
  totalReceived: number;
  balance: number;
  lastTransactionDate: string;
  transactions: ReceivableTransaction[];
}

export default function AccountsReceivable({ entries, accounts, userRole }: AccountsReceivableProps) {
  const [selectedProject, setSelectedProject] = useState<ReceivableProject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const receivableResults = useMemo(() => {
    // 1. Identify which accounts are "Asset" and related to receivables
    const targetAccountIds = accounts
      .filter(acc => {
        const name = acc.name.toLowerCase();
        const isReceivableNamed = name.includes('receiv') || 
                                 name.includes('customer') || 
                                 name.includes('client') ||
                                 name.includes('debtor') ||
                                 name.includes('acc. rec') ||
                                 name.includes('due from') ||
                                 name.includes('arrears') ||
                                 name.includes('unpaid') ||
                                 name.includes('outstanding') ||
                                 name.includes('bill');
        const isCashOrBank = name.includes('cash') || 
                             name.includes('bank') || 
                             name.includes('bk-') || 
                             name.includes('ch-') || 
                             name.includes('petty') ||
                             name.includes('savings') ||
                             name.includes('wallet');
        return acc.category === 'Asset' && isReceivableNamed && !isCashOrBank;
      })
      .map(acc => acc.id);
    
    // Fallback: Broad detection for any Asset that isn't cash/bank or fixed assets
    const effectiveTargetIds = targetAccountIds.length > 0 
      ? targetAccountIds 
      : accounts
          .filter(acc => {
            const name = acc.name.toLowerCase();
            const isCashOrBank = name.includes('cash') || name.includes('bank') || name.includes('bk-') || name.includes('ch-') || name.includes('petty');
            const isFixedAsset = name.includes('land') || name.includes('building') || name.includes('machine') || name.includes('equipment') || name.includes('furniture') || name.includes('vehicle') || name.includes('computer');
            // We also exclude specific "prepaid" or "tax" assets if possible, but keep it broad
            const isOtherAsset = name.includes('tax') || name.includes('prepaid') || name.includes('security deposit');
            return acc.category === 'Asset' && !isCashOrBank && !isFixedAsset && !isOtherAsset;
          })
          .map(acc => acc.id);

    if (effectiveTargetIds.length === 0) return [];

    const projectMap = new Map<string, ReceivableProject>();

    // Sort entries by date for chronological balance tracking
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedEntries.forEach(entry => {
      // Use Remarks as the Project Name source
      const projectName = entry.remarks || 'Uncategorized';
      
      // Extract Client identifier: take everything before the first ")-" and include the ")"
      let clientId = 'N/A';
      const clientMatch = projectName.match(/^(.*?)\)-/);
      if (clientMatch) {
        clientId = clientMatch[1] + ')';
      } else {
        // Fallback for cases where the "-Service" suffix might be missing or different
        const simpleMatch = projectName.match(/^([^-]+)/);
        if (simpleMatch) {
          clientId = simpleMatch[1].trim();
        }
      }

      (entry.customEntries || []).forEach(ce => {
        if (effectiveTargetIds.includes(ce.accountId)) {
          if (!projectMap.has(projectName)) {
            projectMap.set(projectName, {
              projectName,
              clientId,
              totalReceivable: 0,
              totalReceived: 0,
              balance: 0,
              lastTransactionDate: entry.date,
              transactions: []
            });
          }

          const project = projectMap.get(projectName)!;
          // Asset: Debit (Dr) = Receivable Amount (Increase in what is owed)
          // Asset: Credit (Cr) = Received Amount (Full/Partial payment received)
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

    // Display projects with a significant balance or at least some transaction history
    return Array.from(projectMap.values())
      .filter(p => Math.abs(p.balance) > 0.01)
      .sort((a, b) => b.balance - a.balance);
  }, [entries, accounts]);

  const filteredResults = useMemo(() => {
    return receivableResults.filter(p => 
      p.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.clientId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [receivableResults, searchTerm]);

  const totalPending = filteredResults.reduce((sum, p) => sum + p.balance, 0);

  const downloadXLS = () => {
    const data = filteredResults.map(p => ({
      Project: p.projectName,
      'Client Details': p.clientId,
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
    doc.text('Accounts Receivable Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Total Outstanding: ${formatCurrency(totalPending, true)}`, 14, 38);

    const header = [['Project', 'Client Name (ID)', 'Total Receivable', 'Total Received', 'Balance', 'Last Date']];
    const rows = filteredResults.map(p => [
      p.projectName,
      p.clientId,
      formatCurrency(p.totalReceivable, true),
      formatCurrency(p.totalReceived, true),
      formatCurrency(p.balance, true),
      p.lastTransactionDate
    ]);

    autoTable(doc, {
      startY: 45,
      head: header,
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`Accounts_Receivable_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <TrendingUp size={64} className="text-emerald-500" />
          </div>
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Outstanding</p>
            <h4 className="text-3xl font-black text-slate-900 leading-tight">
              {formatCurrency(totalPending)}
            </h4>
            <div className="mt-2 flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
              <CheckCircle2 size={14} />
              <span>Pending from {filteredResults.length} Projects</span>
            </div>
          </div>
        </motion.div>

        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by project or Client ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={downloadXLS}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-all border border-emerald-100"
            >
              <Download size={18} />
              Excel
            </button>
            <button 
              onClick={downloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-sm font-bold transition-all border border-indigo-100"
            >
              <FileText size={18} />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Details (Remark)</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Client Name (ID)</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Receivable</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Received</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance Due</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Last Activity</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 italic">
                      <Briefcase size={40} className="opacity-20" />
                      <p>No pending accounts receivable recorded.</p>
                      <p className="text-[10px] not-italic text-slate-300 max-w-xs mx-auto">
                        Verify your transactions use "Asset" accounts (excluding cash/bank) and have "Remarks" specified for each project movement.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredResults.map((project, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <Briefcase size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 leading-tight">{project.projectName}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Receivable Tracking</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-left">
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-md border border-indigo-100 uppercase tracking-wider">
                        {project.clientId}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <p className="text-xs font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">Invoiced</p>
                      <p className="font-bold text-slate-700">{formatCurrency(project.totalReceivable)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="text-xs font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">Collected</p>
                      <p className="font-bold text-indigo-600">{formatCurrency(project.totalReceived)}</p>
                    </td>
                    <td className="p-4 text-right">
                      <p className="text-xs font-bold text-slate-400 mb-0.5 uppercase tracking-tighter">Outstanding</p>
                      <p className="font-black text-emerald-600">{formatCurrency(project.balance)}</p>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center">
                        <Calendar size={14} className="text-slate-300 mb-1" />
                        <span className="text-[10px] font-bold text-slate-500">{project.lastTransactionDate}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setSelectedProject(project)}
                        className="p-2 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-all border border-slate-200 hover:border-indigo-200 shadow-sm"
                        title="View Detailed Ledger"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Layers className="text-indigo-500" size={20} />
            Highest Outstanding Receivables
          </h3>
          <div className="space-y-4">
            {filteredResults.slice(0, 5).map((project, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{project.projectName}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{project.clientId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">{formatCurrency(project.balance)}</p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                      {((project.balance / totalPending) * 100).toFixed(1)}% of Total
                    </p>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(project.balance / totalPending) * 100}%` }}
                    className="h-full bg-indigo-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-4 animate-bounce">
            <TrendingUp size={32} />
          </div>
          <h3 className="text-lg font-black text-slate-900 mb-2">Monitor Cash Flow</h3>
          <p className="text-sm text-slate-500 max-w-xs">
            Aged receivables impact liquidity. Use the detailed ledger view to track follow-ups and partial payments for specific projects.
          </p>
          <div className="mt-6 flex gap-4">
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Invoiced</p>
              <p className="text-base font-bold text-slate-700">{formatCurrency(filteredResults.reduce((s, p) => s + p.totalReceivable, 0))}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Collected</p>
              <p className="text-base font-bold text-emerald-600">{formatCurrency(filteredResults.reduce((s, p) => s + p.totalReceived, 0))}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Ledger Modal */}
      <AnimatePresence>
        {selectedProject && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProject(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-8"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-x-4 md:inset-x-auto md:w-full md:max-w-4xl top-[10%] bottom-[10%] bg-white rounded-3xl z-[101] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <Briefcase size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-none">{selectedProject.projectName}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase mt-1 tracking-widest">Project Ledger History ({selectedProject.clientId})</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedProject(null)}
                  className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Invoiced</p>
                    <p className="text-xl font-black text-slate-900">{formatCurrency(selectedProject.totalReceivable)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Collected</p>
                    <p className="text-xl font-black text-indigo-600">{formatCurrency(selectedProject.totalReceived)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-indigo-200 ring-2 ring-indigo-500/5">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Current Balance Due</p>
                    <p className="text-xl font-black text-emerald-600">{formatCurrency(selectedProject.balance)}</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Invoiced (Dr)</th>
                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Payment (Cr)</th>
                        <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Project Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {selectedProject.transactions.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 text-sm font-bold text-slate-500 font-mono tracking-tight">{t.date}</td>
                          <td className="p-4 text-sm font-medium text-slate-700">{t.description}</td>
                          <td className="p-4 text-right text-sm">
                            {t.receivable > 0 ? (
                              <span className="font-bold text-slate-700">+{formatCurrency(t.receivable)}</span>
                            ) : '-'}
                          </td>
                          <td className="p-4 text-right text-sm">
                            {t.received > 0 ? (
                              <span className="font-bold text-emerald-600">-{formatCurrency(t.received)}</span>
                            ) : '-'}
                          </td>
                          <td className="p-4 text-right">
                            <span className="inline-block px-2 py-0.5 bg-slate-50 text-slate-900 text-xs font-black rounded border border-slate-200">
                              {formatCurrency(t.balance)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end items-center gap-4">
                <button 
                  onClick={() => setSelectedProject(null)}
                  className="px-6 py-2 bg-white text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-all border border-slate-200 shadow-sm"
                >
                  Close Detailed View
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}


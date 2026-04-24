import { useMemo } from 'react';
import { LedgerEntry, UserRole, Account } from '../types';
import { Download, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TrialBalanceProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
  accounts: Account[];
}

export default function TrialBalance({ entries, userRole, accounts }: TrialBalanceProps) {
  const accountBalances = useMemo(() => {
    const rawBalances: Record<string, { name: string; net: number; category: string }> = {};

    entries.forEach(entry => {
      (entry.customEntries || []).forEach(ce => {
        const key = ce.accountName.trim().toLowerCase();
        if (!rawBalances[key]) {
          const account = accounts.find(a => a.name.toLowerCase() === key);
          rawBalances[key] = { 
            name: ce.accountName, 
            net: 0,
            category: account?.category || 'Equity' // Fallback to Equity if not found
          };
        }

        if (ce.type === 'Dr') {
          rawBalances[key].net += ce.amount;
        } else {
          rawBalances[key].net -= ce.amount;
        }
      });
    });

    const getSortWeight = (item: { name: string; category: string }) => {
      if (item.category === 'Asset') return 10;
      if (item.category === 'Liability') return 20;
      
      // Equity category can contain Revenue, Expenses, or Capital
      const name = item.name.toLowerCase();
      if (name.includes('revenue') || name.includes('income') || name.includes('sales')) return 40;
      if (name.includes('expense') || name.includes('cost')) return 50;
      return 30; // Capital/Other Equity
    };

    return Object.values(rawBalances)
      .map(b => ({
        name: b.name,
        category: b.category,
        debit: b.net > 0 ? b.net : 0,
        credit: b.net < 0 ? Math.abs(b.net) : 0
      }))
      .filter(b => Math.abs(b.debit) > 0.01 || Math.abs(b.credit) > 0.01)
      .sort((a, b) => {
        const weightA = getSortWeight(a);
        const weightB = getSortWeight(b);
        if (weightA !== weightB) return weightA - weightB;
        return a.name.localeCompare(b.name);
      });
  }, [entries, accounts]);

  const totalDebit = accountBalances.reduce((sum, b) => sum + b.debit, 0);
  const totalCredit = accountBalances.reduce((sum, b) => sum + b.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const downloadExcel = () => {
    const data = [
      ['Trial Balance'],
      ['As of ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
      [],
      ['Account Name', 'Debit', 'Credit'],
      ...accountBalances.map(b => [b.name, b.debit || '', b.credit || '']),
      ['TOTAL', totalDebit, totalCredit]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
    XLSX.writeFile(wb, `Trial_Balance_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text('Trial Balance', 14, 22);
    doc.setFontSize(11);
    doc.text(`As of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 14, 30);

    const tableData = [
      ...accountBalances.map(b => [b.name, b.debit > 0 ? formatCurrency(b.debit, true) : '', b.credit > 0 ? formatCurrency(b.credit, true) : '']),
      [{ content: 'TOTAL', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalDebit, true), styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalCredit, true), styles: { fontStyle: 'bold' } }]
    ];

    autoTable(doc, {
      startY: 40,
      head: [['Account Name', 'Debit', 'Credit']],
      body: tableData as any[],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 
        1: { halign: 'right' },
        2: { halign: 'right' }
      }
    });

    doc.save(`Trial_Balance_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">Trial Balance</h2>
          <p className="text-sm text-slate-500 font-medium">As of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-semibold text-sm"
          >
            <Download size={18} />
            Excel
          </button>
          <button
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors font-semibold text-sm"
          >
            <FileText size={18} />
            PDF
          </button>
        </div>
      </div>

      {isBalanced ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700">
          <CheckCircle2 size={20} />
          <p className="text-sm font-bold">
            Trial Balance is Balanced: Total Debits = Total Credits
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 animate-pulse">
          <AlertCircle size={20} />
          <p className="text-sm font-bold">
            Trial Balance Mismatch: Debits ({formatCurrency(totalDebit)}) ≠ Credits ({formatCurrency(totalCredit)})
          </p>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Account Name</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Debit</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accountBalances.map((balance, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 text-sm text-slate-700 font-medium group-hover:text-indigo-600 transition-colors">{balance.name}</td>
                  <td className="p-4 text-sm text-slate-900 text-right font-mono">
                    {balance.debit > 0 ? formatCurrency(balance.debit) : '-'}
                  </td>
                  <td className="p-4 text-sm text-slate-900 text-right font-mono">
                    {balance.credit > 0 ? formatCurrency(balance.credit) : '-'}
                  </td>
                </tr>
              ))}
              {accountBalances.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-400 italic text-sm">No accounts found in transactions</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
              <tr>
                <td className="p-4 text-sm text-slate-900 uppercase tracking-widest">Total</td>
                <td className="p-4 text-sm text-indigo-600 text-right font-mono">{formatCurrency(totalDebit)}</td>
                <td className="p-4 text-sm text-indigo-600 text-right font-mono">{formatCurrency(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

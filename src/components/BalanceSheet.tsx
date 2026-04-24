import { useMemo } from 'react';
import { LedgerEntry, UserRole } from '../types';
import { Download, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BalanceSheetProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
}

export default function BalanceSheet({ entries, userRole }: BalanceSheetProps) {
  const accountTotals = useMemo(() => {
    const totals: Record<string, { name: string; amount: number; category: 'Asset' | 'Liability' | 'Equity' }> = {};
    
    entries.forEach(entry => {
      (entry.customEntries || []).forEach(ce => {
        // Use a combination of name and category as the key to merge accounts with the same name
        const key = `${ce.accountName.trim().toLowerCase()}-${ce.accountCategory}`;
        if (!totals[key]) {
          totals[key] = { name: ce.accountName, amount: 0, category: ce.accountCategory };
        }
        
        if (ce.accountCategory === 'Asset') {
          totals[key].amount += ce.type === 'Dr' ? ce.amount : -ce.amount;
        } else if (ce.accountCategory === 'Liability') {
          totals[key].amount += ce.type === 'Cr' ? ce.amount : -ce.amount;
        } else if (ce.accountCategory === 'Equity') {
          totals[key].amount += ce.type === 'Cr' ? ce.amount : -ce.amount;
        }
      });
    });
    
    return Object.values(totals);
  }, [entries]);

  const assets = accountTotals.filter(a => a.category === 'Asset' && Math.abs(a.amount) > 0.01);
  const liabilities = accountTotals.filter(a => a.category === 'Liability' && Math.abs(a.amount) > 0.01);
  const equity = useMemo(() => {
    const list = accountTotals.filter(a => a.category === 'Equity' && Math.abs(a.amount) > 0.01);
    const order = ['revenue', 'expense', 'owner'];
    return [...list].sort((a, b) => {
      const getIndex = (name: string) => {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('revenue')) return 0;
        if (lowerName.includes('expense')) return 1;
        if (lowerName.includes('owner')) return 2;
        return 3;
      };
      
      const idxA = getIndex(a.name);
      const idxB = getIndex(b.name);
      
      if (idxA !== idxB) return idxA - idxB;
      return a.name.localeCompare(b.name);
    });
  }, [accountTotals]);

  const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
  const totalEquity = equity.reduce((sum, e) => sum + e.amount, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

  const downloadExcel = () => {
    const data = [
      ['Balance Sheet'],
      ['As of ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
      [],
      ['ASSETS'],
      ...assets.map(a => [a.name, a.amount]),
      ['TOTAL ASSETS', totalAssets],
      [],
      ['LIABILITIES'],
      ...liabilities.map(l => [l.name, l.amount]),
      ['TOTAL LIABILITIES', totalLiabilities],
      [],
      ['EQUITY'],
      ...equity.map(e => [e.name, e.amount]),
      ['TOTAL EQUITY', totalEquity],
      [],
      ['TOTAL LIABILITIES AND EQUITY', totalLiabilitiesAndEquity],
      [],
      ['Balanced', isBalanced ? 'Yes' : 'No']
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
    XLSX.writeFile(wb, `Balance_Sheet_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text('Balance Sheet', 14, 22);
    doc.setFontSize(11);
    doc.text(`As of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 14, 30);

    const tableData = [
      [{ content: 'ASSETS', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
      ...assets.map(a => [a.name, formatCurrency(a.amount, true)]),
      [{ content: 'TOTAL ASSETS', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalAssets, true), styles: { fontStyle: 'bold' } }],
      [],
      [{ content: 'LIABILITIES', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
      ...liabilities.map(l => [l.name, formatCurrency(l.amount, true)]),
      [{ content: 'TOTAL LIABILITIES', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalLiabilities, true), styles: { fontStyle: 'bold' } }],
      [],
      [{ content: 'EQUITY', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
      ...equity.map(e => [e.name, formatCurrency(e.amount, true)]),
      [{ content: 'TOTAL EQUITY', styles: { fontStyle: 'bold' } }, { content: formatCurrency(totalEquity, true), styles: { fontStyle: 'bold' } }],
      [],
      [{ content: 'TOTAL LIABILITIES AND EQUITY', styles: { fontStyle: 'bold', fillColor: [238, 242, 255] } }, { content: formatCurrency(totalLiabilitiesAndEquity, true), styles: { fontStyle: 'bold', fillColor: [238, 242, 255] } }],
    ];

    autoTable(doc, {
      startY: 40,
      body: tableData as any[],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: 'right' } }
    });

    doc.save(`Balance_Sheet_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">Balance Sheet</h2>
          <p className="text-sm text-slate-500 font-medium">As of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        {userRole === 'admin' && (
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
        )}
      </div>

      {!isBalanced && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 animate-pulse">
          <AlertCircle size={20} />
          <p className="text-sm font-bold">
            Accounting Equation Mismatch: Assets ({formatCurrency(totalAssets)}) ≠ Liabilities + Equity ({formatCurrency(totalLiabilitiesAndEquity)})
          </p>
        </div>
      )}

      {isBalanced && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700">
          <CheckCircle2 size={20} />
          <p className="text-sm font-bold">
            Accounting Equation Balanced: Assets = Liabilities + Equity
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Assets Section */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4">Assets</h3>
          <div className="space-y-4">
            {assets.map((asset, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="text-slate-600">{asset.name}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(asset.amount)}</span>
              </div>
            ))}
            {assets.length === 0 && <p className="text-slate-400 italic text-sm">No assets recorded</p>}
          </div>
          <div className="pt-6 border-t border-slate-200 flex justify-between items-center">
            <span className="font-bold text-slate-800">Total Assets</span>
            <span className="text-xl font-bold text-emerald-600 underline decoration-double decoration-emerald-200 underline-offset-4">
              {formatCurrency(totalAssets)}
            </span>
          </div>
        </div>

        {/* Liabilities & Equity Section */}
        <div className="space-y-8">
          {/* Liabilities */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4">Liabilities</h3>
            <div className="space-y-4">
              {liabilities.map((liab, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-600">{liab.name}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(liab.amount)}</span>
                </div>
              ))}
              {liabilities.length === 0 && <p className="text-slate-400 italic text-sm">No liabilities recorded</p>}
            </div>
            <div className="pt-6 border-t border-slate-200 flex justify-between items-center">
              <span className="font-bold text-slate-800">Total Liabilities</span>
              <span className="text-xl font-bold text-rose-600">
                {formatCurrency(totalLiabilities)}
              </span>
            </div>
          </div>

          {/* Equity */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-4">Equity</h3>
            <div className="space-y-4">
              {equity.map((eq, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-600">{eq.name}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(eq.amount)}</span>
                </div>
              ))}
              {equity.length === 0 && <p className="text-slate-400 italic text-sm">No equity recorded</p>}
            </div>
            <div className="pt-6 border-t border-slate-200 flex justify-between items-center">
              <span className="font-bold text-slate-800">Total Equity</span>
              <span className="text-xl font-bold text-indigo-600">
                {formatCurrency(totalEquity)}
              </span>
            </div>
          </div>

          {/* Total Liabilities & Equity */}
          <div className={cn(
            "p-8 rounded-3xl border shadow-lg flex justify-between items-center transition-colors",
            isBalanced 
              ? "bg-indigo-50 border-indigo-100" 
              : "bg-rose-50 border-rose-100"
          )}>
            <span className="font-bold text-slate-800">Total Liabilities & Equity</span>
            <span className={cn(
              "text-2xl font-bold underline decoration-double underline-offset-4",
              isBalanced ? "text-indigo-600 decoration-indigo-200" : "text-rose-600 decoration-rose-200"
            )}>
              {formatCurrency(totalLiabilitiesAndEquity)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

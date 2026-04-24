import { useState } from 'react';
import { LedgerEntry } from '../types';
import { formatCurrency, cn, formatDate } from '../lib/utils';
import { Trash2, StickyNote, Table as TableIcon, List, Pencil, Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LedgerTableProps {
  entries: LedgerEntry[];
  onDelete: (id: string) => void;
  onEdit: (entry: LedgerEntry) => void;
  userRole: string;
}

export default function LedgerTable({ entries, onDelete, onEdit, userRole }: LedgerTableProps) {
  const isAdmin = userRole === 'admin';
  const getJournalLines = (entry: LedgerEntry) => {
    const lines: { account: string; dr: number; cr: number }[] = [];

    (entry.customEntries || []).forEach(ce => {
      if (ce.type === 'Dr') {
        lines.push({ account: ce.accountName, dr: ce.amount, cr: 0 });
      } else {
        lines.push({ account: ce.accountName, dr: 0, cr: ce.amount });
      }
    });

    // Sort: Debits first
    return lines.sort((a, b) => (b.dr - a.dr));
  };

  const downloadJournalExcel = () => {
    const data: any[] = [];
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedEntries.forEach(e => {
      const lines = getJournalLines(e);
      lines.forEach((line, idx) => {
        data.push({
          Date: idx === 0 ? e.date : '',
          'Account Titles & Explanation': line.cr > 0 ? `    ${line.account}` : line.account,
          Remarks: idx === 0 ? e.remarks : '',
          'Debit (Dr)': line.dr > 0 ? line.dr : '',
          'Credit (Cr)': line.cr > 0 ? line.cr : ''
        });
      });
      data.push({
        Date: '',
        'Account Titles & Explanation': `(${e.details})`,
        'Debit (Dr)': '',
        'Credit (Cr)': ''
      });
      data.push({}); // Empty row between entries
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Journal View');
    XLSX.writeFile(wb, `Journal_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadJournalPDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text('Transaction History (Journal View)', 14, 22);

    const tableData: any[] = [];
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedEntries.forEach(e => {
      const lines = getJournalLines(e);
      lines.forEach((line, idx) => {
        tableData.push([
          idx === 0 ? formatDate(e.date) : '',
          { content: line.account, styles: { paddingLeft: line.cr > 0 ? 10 : 2 } },
          idx === 0 ? e.remarks : '',
          line.dr > 0 ? formatCurrency(line.dr, true) : '',
          line.cr > 0 ? formatCurrency(line.cr, true) : ''
        ]);
      });
      tableData.push([
        '',
        { content: `(${e.details})`, styles: { fontStyle: 'italic', textColor: [100, 116, 139] } },
        '',
        ''
      ]);
    });

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Account Titles & Explanation', 'Remarks', 'Debit (Dr)', 'Credit (Cr)']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }
    });

    doc.save(`Journal_Ledger_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const downloadImportableExcel = () => {
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const data = sortedEntries.map(e => {
      const getNet = (name: string, targetType: 'Dr' | 'Cr') => {
        return (e.customEntries || [])
          .filter(ce => ce.accountName.toLowerCase() === name.toLowerCase())
          .reduce((sum, ce) => {
            if (ce.type === targetType) return sum + ce.amount;
            return sum - ce.amount;
          }, 0);
      };

      return {
        'Date': e.date,
        'Transaction Item': e.details,
        'Cash': getNet('Cash', 'Dr'),
        'Accounts Receivable': getNet('Accounts Receivable', 'Dr'),
        'Supplies': getNet('Supplies', 'Dr'),
        'Equipment': getNet('Equipment', 'Dr'),
        'Accounts Payable': getNet('Accounts Payable', 'Cr'),
        "Owner's Capital": getNet("Owner's Capital", 'Cr'),
        'Revenue': getNet('Revenue', 'Cr'),
        "Owner's Drawings": getNet("Owner's Drawings", 'Dr'),
        'Expense': -Math.abs(getNet('Expense', 'Dr')),
        'Remarks': e.remarks,
        'Notes': e.notes
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template');
    XLSX.writeFile(wb, `Importable_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        {userRole === 'admin' && (
          <div className="flex gap-2">
            <button
              onClick={downloadJournalExcel}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-xs"
              title="Export Current View"
            >
              <Download size={14} />
              Excel
            </button>
            <button
              onClick={downloadImportableExcel}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors font-bold text-xs"
              title="Export in Importable Format"
            >
              <Download size={14} />
              Export for Import
            </button>
            <button
              onClick={downloadJournalPDF}
              className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors font-bold text-xs"
            >
              <FileText size={14} />
              PDF
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Date</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Titles & Explanation</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Remarks</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-40">Debit (Dr)</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-40">Credit (Cr)</th>
                {isAdmin && <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center w-24 print:hidden">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const lines = getJournalLines(entry);
                  return (
                    <tr key={entry.id} className="align-top hover:bg-slate-50/30 transition-colors group">
                      <td className="p-4 text-sm text-slate-600 font-medium whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td className="p-4">
                        <div className="space-y-1">
                          {lines.map((line, idx) => (
                            <div 
                              key={idx} 
                              className={cn(
                                "text-sm font-medium",
                                line.cr > 0 ? "pl-8 text-slate-600" : "text-slate-900"
                              )}
                            >
                              {line.account}
                            </div>
                          ))}
                          <div className="text-xs text-slate-400 italic mt-2 pl-2 border-l-2 border-slate-100">
                            ({entry.details})
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600 font-medium">
                        {entry.remarks}
                      </td>
                      <td className="p-4 text-right">
                        <div className="space-y-1">
                          {lines.map((line, idx) => (
                            <div key={idx} className="text-sm font-bold text-emerald-600 h-5">
                              {line.dr > 0 ? formatCurrency(line.dr) : ''}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="space-y-1">
                          {lines.map((line, idx) => (
                            <div key={idx} className="text-sm font-bold text-rose-600 h-5">
                              {line.cr > 0 ? formatCurrency(line.cr) : ''}
                            </div>
                          ))}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="p-4 text-center print:hidden">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => onEdit(entry)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Edit Transaction"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => onDelete(entry.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

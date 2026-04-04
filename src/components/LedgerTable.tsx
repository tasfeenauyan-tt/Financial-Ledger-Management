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
}

export default function LedgerTable({ entries, onDelete, onEdit }: LedgerTableProps) {
  const [viewMode, setViewMode] = useState<'tabular' | 'journal'>('journal');

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

  const downloadTabularExcel = () => {
    const data = entries.map(e => ({
      Date: e.date,
      'Transaction Item': e.transactionItemName,
      Details: e.details,
      'Total Amount': (e.customEntries || []).reduce((sum, ce) => sum + (ce.type === 'Dr' ? ce.amount : 0), 0),
      Remarks: e.remarks,
      Notes: e.notes
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transaction History');
    XLSX.writeFile(wb, `Transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadTabularPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4') as any;
    doc.setFontSize(18);
    doc.text('Transaction History', 14, 22);
    
    const tableData = entries.map(e => [
      formatDate(e.date),
      e.transactionItemName,
      e.details,
      formatCurrency((e.customEntries || []).reduce((sum, ce) => sum + (ce.type === 'Dr' ? ce.amount : 0), 0)),
      e.remarks
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Item', 'Details', 'Total Amount', 'Remarks']],
      body: tableData,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Transactions_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const downloadJournalExcel = () => {
    const data: any[] = [];
    entries.forEach(e => {
      const lines = getJournalLines(e);
      lines.forEach((line, idx) => {
        data.push({
          Date: idx === 0 ? e.date : '',
          'Account Titles & Explanation': line.cr > 0 ? `    ${line.account}` : line.account,
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
    entries.forEach(e => {
      const lines = getJournalLines(e);
      lines.forEach((line, idx) => {
        tableData.push([
          idx === 0 ? formatDate(e.date) : '',
          { content: line.account, styles: { paddingLeft: line.cr > 0 ? 10 : 2 } },
          line.dr > 0 ? formatCurrency(line.dr) : '',
          line.cr > 0 ? formatCurrency(line.cr) : ''
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
      head: [['Date', 'Account Titles & Explanation', 'Debit (Dr)', 'Credit (Cr)']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    doc.save(`Journal_Ledger_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <div className="flex gap-2">
          <button
            onClick={viewMode === 'tabular' ? downloadTabularExcel : downloadJournalExcel}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-xs"
          >
            <Download size={14} />
            Excel
          </button>
          <button
            onClick={viewMode === 'tabular' ? downloadTabularPDF : downloadJournalPDF}
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors font-bold text-xs"
          >
            <FileText size={14} />
            PDF
          </button>
        </div>
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setViewMode('tabular')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewMode === 'tabular' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <TableIcon size={14} />
            Tabular
          </button>
          <button
            onClick={() => setViewMode('journal')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewMode === 'journal' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <List size={14} />
            Journal (Dr/Cr)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {viewMode === 'tabular' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Date</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transaction Item</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Amount</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center w-24 print:hidden">Actions</th>
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
                  entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-4 text-sm text-slate-600 font-medium">{formatDate(entry.date)}</td>
                      <td className="p-4 text-sm text-slate-900 font-bold">{entry.transactionItemName}</td>
                      <td className="p-4 text-sm text-slate-600">{entry.details}</td>
                      <td className="p-4 text-sm text-indigo-600 font-bold text-right">
                        {formatCurrency((entry.customEntries || []).reduce((sum, ce) => sum + (ce.type === 'Dr' ? ce.amount : 0), 0))}
                      </td>
                      <td className="p-4 text-sm text-slate-500 italic">{entry.remarks}</td>
                      <td className="p-4 text-center print:hidden">
                        <div className="flex items-center justify-center gap-2">
                          {entry.notes && (
                            <button title={entry.notes} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                              <StickyNote size={16} />
                            </button>
                          )}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Date</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Titles & Explanation</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-40">Debit (Dr)</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right w-40">Credit (Cr)</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center w-24 print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 italic">
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

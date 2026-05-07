import { LedgerEntry, UserRole } from '../types';
import { formatCurrency } from '../lib/utils';
import { useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ClientRevenueProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
}

export default function ClientRevenue({ entries, userRole }: ClientRevenueProps) {
  const clientData = useMemo(() => {
    // Filter entries that are project revenue
    const revenueEntries = entries.filter(e => {
      let hasRevenue = false;
      (e.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const lowerName = ce.accountName.toLowerCase();
          const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
          
          const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                              lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                              lowerName.includes('retainer') || lowerName.includes('commission');
          
          if (isRevKeywords || (!isCapital && ce.type === 'Cr')) {
            hasRevenue = true;
          }
        }
      });
      
      const details = e.details.toLowerCase();
      const itemName = e.transactionItemName.toLowerCase();
      const remarks = e.remarks.toLowerCase();
      const notes = (e.notes || '').toLowerCase();
      
      const isProjectRelated = 
        details.includes('project') || 
        itemName.includes('project') || 
        remarks.includes('tt-lg') ||
        notes.includes('tt-lg') ||
        remarks.includes('project') ||
        ((details.includes('revenue') || itemName.includes('revenue') || details.includes('income') || details.includes('sales')) && e.remarks.length > 0);
      
      return hasRevenue && isProjectRelated;
    });

    const clientsList = new Set<string>();
    const months = new Set<string>();
    const dataMap: Record<string, Record<string, number>> = {};

    revenueEntries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const projectName = entry.remarks || entry.transactionItemName || 'General-Uncategorized';
      let clientId = 'Uncategorized';
      
      // Extraction logic: first part before ")-" including ")"
      if (projectName.includes(')-')) {
        const parts = projectName.split(')-');
        clientId = parts[0].trim() + ')';
      } else {
        // Fallback for cases without the exact format
        const parts = projectName.split('-');
        clientId = parts.length > 1 ? parts[0].trim() : projectName;
      }

      clientsList.add(clientId);
      months.add(monthKey);

      if (!dataMap[clientId]) {
        dataMap[clientId] = {};
      }
      
      let entryRevenue = 0;
      (entry.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const lowerName = ce.accountName.toLowerCase();
          const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
          
          const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                              lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                              lowerName.includes('retainer') || lowerName.includes('commission');

          if (isRevKeywords || (!isCapital && ce.type === 'Cr')) {
            entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
          }
        }
      });
      
      dataMap[clientId][monthKey] = (dataMap[clientId][monthKey] || 0) + entryRevenue;
    });

    const sortedMonthKeys = Array.from(months).sort((a, b) => a.localeCompare(b));
    const sortedClients = Array.from(clientsList).sort();

    const monthLabels = sortedMonthKeys.map(key => {
      const [year, month] = key.split('-');
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return {
      clients: sortedClients,
      monthKeys: sortedMonthKeys,
      monthLabels,
      dataMap
    };
  }, [entries]);

  const { clients, monthKeys, monthLabels, dataMap } = clientData;

  const totals = useMemo(() => {
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;

    clients.forEach(clientId => {
      let rowSum = 0;
      monthKeys.forEach(key => {
        const val = dataMap[clientId][key] || 0;
        rowSum += val;
        colTotals[key] = (colTotals[key] || 0) + val;
      });
      rowTotals[clientId] = rowSum;
      grandTotal += rowSum;
    });

    return { rowTotals, colTotals, grandTotal };
  }, [clients, monthKeys, dataMap]);

  if (clients.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Client Revenue</h3>
        <p className="text-sm text-slate-500 italic">No client revenue recorded yet.</p>
      </div>
    );
  }

  const downloadXLS = () => {
    const header = ['Sl', 'Client ID', ...monthLabels, 'Total Revenue'];
    const rows = clients.map((client, idx) => {
      const row = [idx + 1, client];
      monthKeys.forEach(key => {
        row.push(dataMap[client][key] || 0);
      });
      row.push(totals.rowTotals[client]);
      return row;
    });

    const footer = ['', 'Monthly Total'];
    monthKeys.forEach(key => footer.push(totals.colTotals[key]));
    footer.push(totals.grandTotal);
    rows.push(footer);

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Client Revenue');
    XLSX.writeFile(wb, `Client_Revenue_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text('Client Revenue Report', 14, 22);
    
    const header = ['Sl', 'Client ID', ...monthLabels, 'Total Revenue'];
    const rows = clients.map((client, idx) => {
      const row = [idx + 1, client];
      monthKeys.forEach(key => row.push(formatCurrency(dataMap[client][key] || 0, true)));
      row.push(formatCurrency(totals.rowTotals[client], true));
      return row;
    });

    const footer = ['', 'Monthly Total'];
    monthKeys.forEach(key => footer.push(formatCurrency(totals.colTotals[key], true)));
    footer.push(formatCurrency(totals.grandTotal, true));
    rows.push(footer);

    autoTable(doc, {
      startY: 35,
      head: [header],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      didParseCell: (data) => {
        if (data.row.index === rows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });

    doc.save(`Client_Revenue_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-slate-800">Client Revenue</h3>
          <p className="text-xs text-slate-500 font-medium">Monthly revenue breakdown by Client ID</p>
        </div>
        {userRole === 'admin' && (
          <div className="flex items-center gap-2">
            <button onClick={downloadXLS} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors">
              <Download size={14} /> XLS
            </button>
            <button onClick={downloadPDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors">
              <FileText size={14} /> PDF
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto custom-scrollbar pb-2">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-12 text-center">Sl</th>
              <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[200px] sticky left-0 bg-white z-10">Client ID</th>
              {monthLabels.map((label, idx) => (
                <th key={idx} className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right min-w-[120px] px-4">{label}</th>
              ))}
              <th className="pb-4 text-[10px] font-bold text-indigo-500 uppercase tracking-widest text-right min-w-[140px] px-4">Revenue Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {clients.map((client, idx) => (
              <tr key={client} className="group hover:bg-slate-50 transition-colors">
                <td className="py-4 text-sm font-medium text-slate-500 text-center">{idx + 1}</td>
                <td className="py-4 text-sm font-bold text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-transparent group-hover:border-slate-100 transition-colors">
                  {client}
                </td>
                {monthKeys.map(key => (
                  <td key={key} className="py-4 text-sm font-bold text-emerald-600 text-right px-4">
                    {dataMap[client][key] ? formatCurrency(dataMap[client][key]) : '-'}
                  </td>
                ))}
                <td className="py-4 text-sm font-black text-indigo-600 text-right px-4 bg-indigo-50/30">
                  {formatCurrency(totals.rowTotals[client])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50/50 font-bold">
              <td className="py-4"></td>
              <td className="py-4 text-sm text-slate-900 sticky left-0 bg-slate-50/50 z-10 border-r border-slate-100">Monthly Total</td>
              {monthKeys.map(key => (
                <td key={key} className="py-4 text-sm text-emerald-700 text-right px-4">
                  {formatCurrency(totals.colTotals[key])}
                </td>
              ))}
              <td className="py-4 text-sm font-black text-indigo-700 text-right px-4 bg-indigo-50">
                {formatCurrency(totals.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

import { LedgerEntry, UserRole, Client } from '../types';
import { formatCurrency } from '../lib/utils';
import { useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { getCountryRevenueData } from '../lib/revenueDataHelpers';

interface CountryRevenueProps {
  entries: LedgerEntry[];
  clients: Client[];
  userRole?: UserRole | null;
}

export default function CountryRevenue({ entries, clients, userRole }: CountryRevenueProps) {
  const countryData = useMemo(() => getCountryRevenueData(entries, clients), [entries, clients]);

  if (countryData.items.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Country Revenue</h3>
        <p className="text-sm text-slate-500 italic">No country-wise revenue data available. Ensure clients have countries assigned in the database.</p>
      </div>
    );
  }

  const { items: countries, monthKeys, monthLabels, dataMap, rowTotals, colTotals, grandTotal } = countryData;

  const totals = { rowTotals, colTotals, grandTotal };

  const downloadXLS = () => {
    const header = ['Sl', 'Country', ...monthLabels, 'Total Revenue', '%'];
    const rows = countries.map((country, idx) => {
      const row: any[] = [idx + 1, country];
      monthKeys.forEach(key => row.push(dataMap[country][key] || 0));
      row.push(totals.rowTotals[country]);
      row.push(totals.grandTotal > 0 ? ((totals.rowTotals[country] / totals.grandTotal) * 100).toFixed(2) + '%' : '0%');
      return row;
    });

    const footer = ['', 'Monthly Total'];
    monthKeys.forEach(key => footer.push(totals.colTotals[key]));
    footer.push(totals.grandTotal);
    footer.push('100%');
    rows.push(footer);

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Country Revenue');
    XLSX.writeFile(wb, `Country_Revenue_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text('Country Revenue Report', 14, 22);
    
    const header = ['Sl', 'Country', ...monthLabels, 'Total Revenue', '%'];
    const rows = countries.map((country, idx) => {
      const row = [idx + 1, country];
      monthKeys.forEach(key => row.push(formatCurrency(dataMap[country][key] || 0, true)));
      row.push(formatCurrency(totals.rowTotals[country], true));
      row.push(totals.grandTotal > 0 ? ((totals.rowTotals[country] / totals.grandTotal) * 100).toFixed(2) + '%' : '0%');
      return row;
    });

    const footer = ['', 'Monthly Total'];
    monthKeys.forEach(key => footer.push(formatCurrency(totals.colTotals[key], true)));
    footer.push(formatCurrency(totals.grandTotal, true));
    footer.push('100%');
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

    doc.save(`Country_Revenue_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-slate-800">Country Revenue</h3>
          <p className="text-xs text-slate-500 font-medium">Revenue distribution by client's country</p>
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
              <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[150px] sticky left-0 bg-white z-10">Country</th>
              {monthLabels.map((label, idx) => (
                <th key={idx} className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right min-w-[120px] px-4">{label}</th>
              ))}
              <th className="pb-4 text-[10px] font-bold text-indigo-500 uppercase tracking-widest text-right min-w-[140px] px-4">Revenue Total</th>
              <th className="pb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right min-w-[70px] px-4">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {countries.map((country, idx) => (
              <tr key={country} className="group hover:bg-slate-50 transition-colors">
                <td className="py-4 text-sm font-medium text-slate-500 text-center">{idx + 1}</td>
                <td className="py-4 text-sm font-bold text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-transparent group-hover:border-slate-100 transition-colors">
                  {country}
                </td>
                {monthKeys.map(key => (
                  <td key={key} className="py-4 text-sm font-bold text-emerald-600 text-right px-4">
                    {dataMap[country][key] ? formatCurrency(dataMap[country][key]) : '-'}
                  </td>
                ))}
                <td className="py-4 text-sm font-black text-indigo-600 text-right px-4 bg-indigo-50/30">
                  {formatCurrency(totals.rowTotals[country])}
                </td>
                <td className="py-4 text-sm font-medium text-slate-500 text-right px-4">
                  {totals.grandTotal > 0 ? ((totals.rowTotals[country] / totals.grandTotal) * 100).toFixed(1) : '0'}%
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
              <td className="py-4 text-sm text-slate-900 text-right px-4">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

import { LedgerEntry } from '../types';
import { Download, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useMemo } from 'react';

interface MonthlyBalanceSheetProps {
  entries: LedgerEntry[];
}

export default function MonthlyBalanceSheet({ entries }: MonthlyBalanceSheetProps) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const monthlyData = useMemo(() => {
    const months: Record<string, LedgerEntry[]> = {};
    
    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedEntries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[monthKey]) months[monthKey] = [];
      months[monthKey].push(entry);
    });

    const sortedMonthKeys = Object.keys(months).sort((a, b) => a.localeCompare(b));
    
    const cumulativeAccountTotals: Record<string, { name: string; amount: number; category: 'Asset' | 'Liability' | 'Equity' }> = {};

    const cumulativeMonthlyData = sortedMonthKeys.map(monthKey => {
      const monthEntries = months[monthKey];
      
      monthEntries.forEach(entry => {
        (entry.customEntries || []).forEach(ce => {
          if (!cumulativeAccountTotals[ce.accountId]) {
            cumulativeAccountTotals[ce.accountId] = { name: ce.accountName, amount: 0, category: ce.accountCategory };
          }
          
          if (ce.accountCategory === 'Asset') {
            cumulativeAccountTotals[ce.accountId].amount += ce.type === 'Dr' ? ce.amount : -ce.amount;
          } else if (ce.accountCategory === 'Liability') {
            cumulativeAccountTotals[ce.accountId].amount += ce.type === 'Cr' ? ce.amount : -ce.amount;
          } else if (ce.accountCategory === 'Equity') {
            cumulativeAccountTotals[ce.accountId].amount += ce.type === 'Cr' ? ce.amount : -ce.amount;
          }
        });
      });

      const totals = Object.values(cumulativeAccountTotals).map(t => ({ ...t }));
      const assets = totals.filter(t => t.category === 'Asset' && Math.abs(t.amount) > 0.01);
      const liabilities = totals.filter(t => t.category === 'Liability' && Math.abs(t.amount) > 0.01);
      const equity = totals.filter(t => t.category === 'Equity' && Math.abs(t.amount) > 0.01);

      return {
        monthKey,
        monthLabel: new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        transactionCount: monthEntries.length,
        assets,
        liabilities,
        equity,
        totalAssets: assets.reduce((sum, a) => sum + a.amount, 0),
        totalLiabilities: liabilities.reduce((sum, l) => sum + l.amount, 0),
        totalEquity: equity.reduce((sum, e) => sum + e.amount, 0),
      };
    });

    return cumulativeMonthlyData.reverse(); // Newest first for display
  }, [entries]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const downloadExcel = (data: any) => {
    const { monthLabel, monthKey, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } = data;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    const excelData = [
      ['Monthly Balance Sheet (Cumulative)'],
      ['As of end of ' + monthLabel],
      [],
      ['ASSETS'],
      ...assets.map((a: any) => [a.name, a.amount]),
      ['TOTAL ASSETS', totalAssets],
      [],
      ['LIABILITIES'],
      ...liabilities.map((l: any) => [l.name, l.amount]),
      ['TOTAL LIABILITIES', totalLiabilities],
      [],
      ['EQUITY'],
      ...equity.map((e: any) => [e.name, e.amount]),
      ['TOTAL EQUITY', totalEquity],
      [],
      ['TOTAL LIABILITIES AND EQUITY', totalLiabilitiesAndEquity]
    ];

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
    XLSX.writeFile(wb, `Cumulative_Balance_Sheet_${monthKey}.xlsx`);
  };

  const downloadPDF = (data: any) => {
    const { monthLabel, monthKey, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } = data;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text('Monthly Balance Sheet (Cumulative)', 14, 22);
    doc.setFontSize(11);
    doc.text(`As of end of ${monthLabel}`, 14, 30);

    const tableData = [
      [{ content: 'ASSETS', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
      ...assets.map((a: any) => [a.name, `$${a.amount.toLocaleString()}`]),
      [{ content: 'TOTAL ASSETS', styles: { fontStyle: 'bold' } }, { content: `$${totalAssets.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
      [],
      [{ content: 'LIABILITIES', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
      ...liabilities.map((l: any) => [l.name, `$${l.amount.toLocaleString()}`]),
      [{ content: 'TOTAL LIABILITIES', styles: { fontStyle: 'bold' } }, { content: `$${totalLiabilities.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
      [],
      [{ content: 'EQUITY', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
      ...equity.map((e: any) => [e.name, `$${e.amount.toLocaleString()}`]),
      [{ content: 'TOTAL EQUITY', styles: { fontStyle: 'bold' } }, { content: `$${totalEquity.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
      [],
      [{ content: 'TOTAL LIABILITIES AND EQUITY', styles: { fontStyle: 'bold', fillColor: [238, 242, 255] } }, { content: `$${totalLiabilitiesAndEquity.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [238, 242, 255] } }],
    ];

    autoTable(doc, {
      startY: 40,
      body: tableData as any[],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: 'right' } }
    });

    doc.save(`Cumulative_Balance_Sheet_${monthKey}.pdf`);
  };

  const downloadAllExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Sort oldest to newest for Excel sheets
    const dataToExport = [...monthlyData].reverse();
    
    dataToExport.forEach(data => {
      const { monthLabel, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } = data;
      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

      const excelData = [
        ['Monthly Balance Sheet (Cumulative)'],
        ['As of end of ' + monthLabel],
        [],
        ['ASSETS'],
        ...assets.map((a: any) => [a.name, a.amount]),
        ['TOTAL ASSETS', totalAssets],
        [],
        ['LIABILITIES'],
        ...liabilities.map((l: any) => [l.name, l.amount]),
        ['TOTAL LIABILITIES', totalLiabilities],
        [],
        ['EQUITY'],
        ...equity.map((e: any) => [e.name, e.amount]),
        ['TOTAL EQUITY', totalEquity],
        [],
        ['TOTAL LIABILITIES AND EQUITY', totalLiabilitiesAndEquity]
      ];

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, monthLabel.replace(/ /g, '_'));
    });

    XLSX.writeFile(wb, `All_Monthly_Balance_Sheets_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadAllPDF = () => {
    const doc = new jsPDF() as any;
    
    monthlyData.forEach((data, index) => {
      if (index > 0) doc.addPage();
      
      const { monthLabel, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } = data;
      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

      doc.setFontSize(18);
      doc.text('Monthly Balance Sheet (Cumulative)', 14, 22);
      doc.setFontSize(11);
      doc.text(`As of end of ${monthLabel}`, 14, 30);

      const tableData = [
        [{ content: 'ASSETS', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
        ...assets.map((a: any) => [a.name, `$${a.amount.toLocaleString()}`]),
        [{ content: 'TOTAL ASSETS', styles: { fontStyle: 'bold' } }, { content: `$${totalAssets.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
        [],
        [{ content: 'LIABILITIES', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
        ...liabilities.map((l: any) => [l.name, `$${l.amount.toLocaleString()}`]),
        [{ content: 'TOTAL LIABILITIES', styles: { fontStyle: 'bold' } }, { content: `$${totalLiabilities.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
        [],
        [{ content: 'EQUITY', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }],
        ...equity.map((e: any) => [e.name, `$${e.amount.toLocaleString()}`]),
        [{ content: 'TOTAL EQUITY', styles: { fontStyle: 'bold' } }, { content: `$${totalEquity.toLocaleString()}`, styles: { fontStyle: 'bold' } }],
        [],
        [{ content: 'TOTAL LIABILITIES AND EQUITY', styles: { fontStyle: 'bold', fillColor: [238, 242, 255] } }, { content: `$${totalLiabilitiesAndEquity.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [238, 242, 255] } }],
      ];

      autoTable(doc, {
        startY: 40,
        body: tableData as any[],
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 1: { halign: 'right' } }
      });
    });

    doc.save(`All_Monthly_Balance_Sheets_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="flex gap-3">
          <button
            onClick={downloadAllExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-semibold text-sm"
          >
            <Download size={18} />
            Download All Excel
          </button>
          <button
            onClick={downloadAllPDF}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors font-semibold text-sm"
          >
            <FileText size={18} />
            Download All PDF
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {monthlyData.map((data) => {
          const { monthKey, monthLabel, transactionCount, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity } = data;
          const isExpanded = expandedMonths[monthKey];
          const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

          return (
            <div key={monthKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div 
                onClick={() => toggleMonth(monthKey)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown className="text-slate-400" /> : <ChevronRight className="text-slate-400" />}
                  <span className="font-bold text-slate-700">{monthLabel}</span>
                  <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                    {transactionCount} Transactions this month
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadExcel(data); }}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Download Excel"
                  >
                    <Download size={18} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadPDF(data); }}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Download PDF"
                  >
                    <FileText size={18} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-6 border-t border-slate-100 bg-slate-50/30 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Assets (Cumulative)</h4>
                    <div className="space-y-2">
                      {assets.map((asset: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-slate-500">{asset.name}</span>
                          <span className="font-semibold text-slate-700">${asset.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {assets.length === 0 && <p className="text-slate-400 italic text-sm">No assets</p>}
                      <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-emerald-600">
                        <span>Total Assets</span>
                        <span>${totalAssets.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Liabilities & Equity (Cumulative)</h4>
                    <div className="space-y-2">
                      {liabilities.map((liab: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-slate-500">{liab.name}</span>
                          <span className="font-semibold text-slate-700">${liab.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {liabilities.length === 0 && <p className="text-slate-400 italic text-sm">No liabilities</p>}
                      
                      <div className="pt-2 border-t border-slate-100"></div>
                      
                      {equity.map((eq: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-slate-500">{eq.name}</span>
                          <span className="font-semibold text-slate-700">${eq.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {equity.length === 0 && <p className="text-slate-400 italic text-sm">No equity</p>}

                      <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-indigo-600">
                        <span>Total Liab. & Equity</span>
                        <span>${totalLiabilitiesAndEquity.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

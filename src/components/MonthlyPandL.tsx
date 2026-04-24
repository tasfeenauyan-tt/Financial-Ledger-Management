import { useState, useMemo } from 'react';
import { LedgerEntry, UserRole } from '../types';
import { Download, FileText, TrendingUp, TrendingDown, Minus, ChevronRight, ChevronDown } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface MonthlyPandLProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
}

interface DetailEntry {
  id: string;
  date: string;
  name: string;
  amount: number;
  remarks: string;
}

export default function MonthlyPandL({ entries, userRole }: MonthlyPandLProps) {
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);

  const monthlyData = useMemo(() => {
    const data: Record<string, { 
      monthKey: string;
      revenue: number; 
      expense: number; 
      revenueEntries: DetailEntry[];
      expenseEntries: DetailEntry[];
    }> = {};
    
    // Sort entries by date descending
    const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));

    sortedEntries.forEach(entry => {
      const monthYear = entry.date.substring(0, 7); // YYYY-MM
      if (!data[monthYear]) {
        data[monthYear] = { 
          monthKey: monthYear,
          revenue: 0, 
          expense: 0,
          revenueEntries: [],
          expenseEntries: []
        };
      }
      
      let entryRevenue = 0;
      let entryExpense = 0;

      (entry.customEntries || []).forEach(ce => {
        const lowerName = ce.accountName.toLowerCase();
        const isRevenue = lowerName.includes('revenue') || lowerName.includes('income');
        const isExpense = lowerName.includes('expense') || lowerName.includes('cost');
        
        if (isRevenue) {
          entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
        } else if (isExpense) {
          entryExpense += ce.type === 'Dr' ? ce.amount : -ce.amount;
        }
      });

      if (entryRevenue !== 0) {
        data[monthYear].revenue += entryRevenue;
        data[monthYear].revenueEntries.push({
          id: entry.id,
          date: entry.date,
          name: entry.transactionItemName,
          amount: entryRevenue,
          remarks: entry.remarks
        });
      }

      if (entryExpense !== 0) {
        data[monthYear].expense += entryExpense;
        data[monthYear].expenseEntries.push({
          id: entry.id,
          date: entry.date,
          name: entry.transactionItemName,
          amount: entryExpense,
          remarks: entry.remarks
        });
      }
    });
    
    // Sort keys descending (most recent first)
    const sortedKeys = Object.keys(data).sort((a, b) => b.localeCompare(a));
    
    return sortedKeys.map(key => {
      const { revenue, expense, revenueEntries, expenseEntries } = data[key];
      return {
        month: key,
        revenue,
        expense,
        netProfit: revenue - expense,
        revenueEntries,
        expenseEntries
      };
    });
  }, [entries]);

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => 
      prev.includes(month) 
        ? prev.filter(m => m !== month) 
        : [...prev, month]
    );
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Summary Sheet
    const summaryData = [
      ['Monthly Profit & Loss Summary'],
      ['Generated on ' + new Date().toLocaleDateString()],
      [],
      ['Month', 'Revenue', 'Expense', 'Net Profit'],
      ...monthlyData.map(row => [row.month, row.revenue, row.expense, row.netProfit]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Detail Sheets for each month
    monthlyData.forEach(month => {
      const details: any[] = [['Revenue Details'], ['Date', 'Item', 'Amount', 'Remarks']];
      month.revenueEntries.forEach(r => details.push([formatDate(r.date), r.name, r.amount, r.remarks]));
      details.push([]);
      details.push(['Expense Details'], ['Date', 'Item', 'Amount', 'Remarks']);
      month.expenseEntries.forEach(e => details.push([formatDate(e.date), e.name, e.amount, e.remarks]));
      
      const wsDetails = XLSX.utils.aoa_to_sheet(details);
      XLSX.utils.book_append_sheet(wb, wsDetails, month.month.replace('-', '_'));
    });

    XLSX.writeFile(wb, `Monthly_PL_Detailed_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text('Monthly Profit & Loss Statement (Summary)', 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = monthlyData.map(row => [
      row.month,
      formatCurrency(row.revenue, true),
      formatCurrency(row.expense, true),
      formatCurrency(row.netProfit, true)
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Month', 'Revenue', 'Expense', 'Net Profit']],
      body: tableData as any[],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    });

    doc.save(`Monthly_PL_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const downloadMonthExcel = (monthData: typeof monthlyData[0]) => {
    const wb = XLSX.utils.book_new();
    const monthName = getMonthName(monthData.month);
    
    const details: any[] = [
      [`Profit & Loss Statement - ${monthName}`],
      [`Generated on ${new Date().toLocaleDateString()}`],
      [],
      ['Summary'],
      ['Revenue', monthData.revenue],
      ['Expense', monthData.expense],
      ['Net Profit', monthData.netProfit],
      [],
      ['Revenue Details'],
      ['Date', 'Item', 'Amount', 'Remarks']
    ];
    
    monthData.revenueEntries.forEach(r => details.push([formatDate(r.date), r.name, r.amount, r.remarks]));
    details.push([]);
    details.push(['Expense Details'], ['Date', 'Item', 'Amount', 'Remarks']);
    monthData.expenseEntries.forEach(e => details.push([formatDate(e.date), e.name, e.amount, e.remarks]));
    
    const ws = XLSX.utils.aoa_to_sheet(details);
    XLSX.utils.book_append_sheet(wb, ws, 'P&L Details');
    
    XLSX.writeFile(wb, `PL_Details_${monthData.month}.xlsx`);
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">Monthly Profit & Loss</h2>
          <p className="text-sm text-slate-500 font-medium">Monthly breakdown of revenues and expenditures</p>
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

      <div className="space-y-4">
        {monthlyData.map((month) => {
          const isExpanded = expandedMonths.includes(month.month);
          return (
            <div key={month.month} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleMonth(month.month)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{getMonthName(month.month)}</h3>
                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">{month.month}</p>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Revenue</p>
                    <p className="text-sm font-bold text-emerald-600 font-mono">{formatCurrency(month.revenue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Expense</p>
                    <p className="text-sm font-bold text-rose-600 font-mono">{formatCurrency(month.expense)}</p>
                  </div>
                  <div className="text-right min-w-[120px]">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Net Profit</p>
                    <div className="flex items-center justify-end gap-2">
                       {month.netProfit > 0 ? (
                        <TrendingUp size={14} className="text-emerald-500" />
                      ) : month.netProfit < 0 ? (
                        <TrendingDown size={14} className="text-rose-500" />
                      ) : (
                        <Minus size={14} className="text-slate-400" />
                      )}
                      <p className={cn(
                        "text-base font-black font-mono",
                        month.netProfit > 0 ? "text-emerald-600" : month.netProfit < 0 ? "text-rose-600" : "text-slate-600"
                      )}>
                        {formatCurrency(month.netProfit)}
                      </p>
                    </div>
                  </div>
                  {userRole === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadMonthExcel(month);
                      }}
                      className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                      title="Download Month Details (Excel)"
                    >
                      <Download size={16} />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 p-4 space-y-6 bg-slate-50/30">
                  {/* Revenue Details */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <TrendingUp size={18} />
                      <h4 className="font-bold uppercase tracking-widest text-xs">Revenue Details</h4>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50">
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {month.revenueEntries.map((rev) => (
                            <tr key={rev.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 text-xs text-slate-600 font-medium font-mono">{formatDate(rev.date)}</td>
                              <td className="p-3 text-xs text-slate-900 font-bold">{rev.name}</td>
                              <td className="p-3 text-xs text-emerald-600 font-black text-right font-mono">{formatCurrency(rev.amount)}</td>
                              <td className="p-3 text-xs text-slate-500 italic">{rev.remarks}</td>
                            </tr>
                          ))}
                          {month.revenueEntries.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-8 text-center text-slate-400 italic text-xs">No revenue entries recorded.</td>
                            </tr>
                          )}
                        </tbody>
                        {month.revenueEntries.length > 0 && (
                          <tfoot className="bg-emerald-50/50 font-bold">
                            <tr>
                              <td colSpan={2} className="p-3 text-xs text-emerald-700 uppercase tracking-widest">Total Revenue</td>
                              <td className="p-3 text-xs text-emerald-700 text-right font-black font-mono">{formatCurrency(month.revenue)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* Expense Details */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-rose-600">
                      <TrendingDown size={18} />
                      <h4 className="font-bold uppercase tracking-widest text-xs">Expense Details</h4>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/50">
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                            <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {month.expenseEntries.map((exp) => (
                            <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 text-xs text-slate-600 font-medium font-mono">{formatDate(exp.date)}</td>
                              <td className="p-3 text-xs text-slate-900 font-bold">{exp.name}</td>
                              <td className="p-3 text-xs text-rose-600 font-black text-right font-mono">{formatCurrency(exp.amount)}</td>
                              <td className="p-3 text-xs text-slate-500 italic">{exp.remarks}</td>
                            </tr>
                          ))}
                          {month.expenseEntries.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-8 text-center text-slate-400 italic text-xs">No expense entries recorded.</td>
                            </tr>
                          )}
                        </tbody>
                        {month.expenseEntries.length > 0 && (
                          <tfoot className="bg-rose-50/50 font-bold">
                            <tr>
                              <td colSpan={2} className="p-3 text-xs text-rose-700 uppercase tracking-widest">Total Expense</td>
                              <td className="p-3 text-xs text-rose-700 text-right font-black font-mono">{formatCurrency(month.expense)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {monthlyData.length === 0 && (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 italic">
            No transactions found for P&L calculation.
          </div>
        )}
      </div>
    </div>
  );
}


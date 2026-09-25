import { LedgerEntry, UserRole } from '../types';
import { formatCurrency, formatDate } from '../lib/utils';
import { Download, ChevronRight, ChevronDown, Receipt } from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { useState, useMemo } from 'react';

interface ExpenseReportProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
}

export default function ExpenseReport({ entries, userRole }: ExpenseReportProps) {
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);

  const monthlyExpenses = useMemo(() => {
    const months: Record<string, { 
      monthKey: string;
      monthLabel: string;
      expenses: LedgerEntry[];
      total: number;
    }> = {};

    const sortedEntries = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sortedEntries.forEach(entry => {
      let entryExpense = 0;
      (entry.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const name = ce.accountName.toLowerCase();
          if (name.includes('expense') || name.includes('cost')) {
            entryExpense += ce.type === 'Dr' ? ce.amount : -ce.amount;
          }
        }
      });

      if (entryExpense > 0) {
        const date = new Date(entry.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        if (!months[monthKey]) {
          months[monthKey] = {
            monthKey,
            monthLabel,
            expenses: [],
            total: 0
          };
        }

        // Create a temporary object with the calculated expense for display
        const displayEntry = { ...entry, expenseAmount: entryExpense };
        months[monthKey].expenses.push(displayEntry as any);
        months[monthKey].total += entryExpense;
      }
    });

    return Object.values(months).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [entries]);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => 
      prev.includes(monthKey) 
        ? prev.filter(m => m !== monthKey) 
        : [...prev, monthKey]
    );
  };

  const downloadMonthlyExcel = (monthData: typeof monthlyExpenses[0]) => {
    const data = monthData.expenses.map((e: any) => ({
      Date: formatDate(e.date),
      'Transaction Item': e.transactionItemName,
      Amount: e.expenseAmount,
      Remarks: e.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `Expense_Report_${monthData.monthKey}.xlsx`);
  };

  const downloadAllExcel = () => {
    const wb = XLSX.utils.book_new();
    
    monthlyExpenses.forEach(monthData => {
      const data = monthData.expenses.map((e: any) => ({
        Date: formatDate(e.date),
        'Transaction Item': e.transactionItemName,
        Amount: e.expenseAmount,
        Remarks: e.remarks
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, monthData.monthKey);
    });

    XLSX.writeFile(wb, `Full_Expense_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (monthlyExpenses.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <Receipt size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">No Expenses Recorded</h3>
        <p className="text-slate-500">There are no expense transactions found in your ledger.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {userRole === 'admin' && (
        <div className="flex items-center justify-end">
          <button
            onClick={downloadAllExcel}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md font-bold text-sm"
          >
            <Download size={18} />
            Download All (XLS)
          </button>
        </div>
      )}

      <div className="space-y-4">
        {monthlyExpenses.map((month) => (
          <div key={month.monthKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div 
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => toggleMonth(month.monthKey)}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                  {expandedMonths.includes(month.monthKey) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{month.monthLabel}</h3>
                  <p className="text-xs text-slate-500 font-medium">{month.expenses.length} Transactions</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Expense</p>
                  <p className="text-lg font-bold text-rose-600">{formatCurrency(month.total)}</p>
                </div>
                {userRole === 'admin' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadMonthlyExcel(month);
                    }}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Download Monthly XLS"
                  >
                    <Download size={20} />
                  </button>
                )}
              </div>
            </div>

            {expandedMonths.includes(month.monthKey) && (
              <div className="border-t border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest pl-18">Date</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Transaction Item</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Amount</th>
                      <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {month.expenses.map((expense: any) => (
                      <tr key={expense.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-4 text-sm text-slate-600 font-medium pl-18">{formatDate(expense.date)}</td>
                        <td className="p-4 text-sm text-slate-900 font-bold">{expense.transactionItemName}</td>
                        <td className="p-4 text-sm text-rose-600 font-bold text-right">{formatCurrency(expense.expenseAmount)}</td>
                        <td className="p-4 text-sm text-slate-500 italic">{expense.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

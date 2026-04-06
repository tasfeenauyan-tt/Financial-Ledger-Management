import { LedgerEntry, UserRole } from '../types';
import { formatCurrency } from '../lib/utils';
import { Users, Download } from 'lucide-react';
import { useMemo } from 'react';
import * as XLSX from 'xlsx';

interface SalaryReportProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
}

export default function SalaryReport({ entries, userRole }: SalaryReportProps) {
  const salaryData = useMemo(() => {
    // Filter entries that are salaries
    // The user specified "Opex: Salary" in details and employee in remarks
    const salaryEntries = entries.filter(e => {
      let hasExpense = false;
      (e.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const name = ce.accountName.toLowerCase();
          if (name.includes('expense') || name.includes('cost')) {
            hasExpense = true;
          }
        }
      });
      return hasExpense && e.details.toLowerCase().includes('opex: salary');
    });

    const employees = new Set<string>();
    const months = new Set<string>();
    const dataMap: Record<string, Record<string, number>> = {};

    salaryEntries.forEach(entry => {
      const date = new Date(entry.date);
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const employee = entry.remarks || 'Unknown Employee';

      employees.add(employee);
      months.add(monthKey);

      if (!dataMap[employee]) {
        dataMap[employee] = {};
      }
      
      let entryExpense = 0;
      (entry.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          const name = ce.accountName.toLowerCase();
          if (name.includes('expense') || name.includes('cost')) {
            entryExpense += ce.type === 'Dr' ? ce.amount : -ce.amount;
          }
        }
      });
      
      dataMap[employee][monthKey] = (dataMap[employee][monthKey] || 0) + entryExpense;
    });

    // Sort months latest to oldest
    const sortedMonthKeys = Array.from(months).sort((a, b) => b.localeCompare(a));
    const sortedEmployees = Array.from(employees).sort();

    const monthLabels = sortedMonthKeys.map(key => {
      const [year, month] = key.split('-');
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    return {
      employees: sortedEmployees,
      monthKeys: sortedMonthKeys,
      monthLabels,
      dataMap
    };
  }, [entries]);

  const downloadExcel = () => {
    const { employees, monthKeys, monthLabels, dataMap } = salaryData;
    
    const header = ['SL', 'Employee', ...monthLabels];
    const rows = employees.map((emp, idx) => {
      const row: any = [idx + 1, emp];
      monthKeys.forEach(key => {
        row.push(dataMap[emp][key] || 0);
      });
      return row;
    });

    // Add Total row
    const totalRow = ['Total', 'Total Salary Disbursement'];
    monthKeys.forEach(key => {
      let monthTotal = 0;
      employees.forEach(emp => {
        monthTotal += dataMap[emp][key] || 0;
      });
      totalRow.push(monthTotal as any);
    });
    rows.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
    XLSX.writeFile(wb, `Salary_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (salaryData.employees.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <Users size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">No Salary Records Found</h3>
        <p className="text-slate-500">There are no salary transactions found in your ledger. Ensure "Opex: Salary" is in the details.</p>
      </div>
    );
  }

  const { employees, monthKeys, monthLabels, dataMap } = salaryData;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-800">Salary Sheet</h3>
          <p className="text-sm text-slate-500 font-medium"> Monthly salary disbursements.</p>
        </div>
        {userRole === 'admin' && (
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md font-bold text-sm"
          >
            <Download size={18} />
            Download XLS
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest w-16">SL</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest min-w-[200px]">Employee</th>
                {monthLabels.map((label, idx) => (
                  <th key={idx} className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp, idx) => (
                <tr key={emp} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-sm text-slate-500 font-medium">{idx + 1}</td>
                  <td className="p-4 text-sm text-slate-900 font-bold">{emp}</td>
                  {monthKeys.map(key => (
                    <td key={key} className="p-4 text-sm text-slate-700 font-semibold text-right">
                      {dataMap[emp][key] ? formatCurrency(dataMap[emp][key]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50/50 font-bold border-t-2 border-indigo-100">
                <td colSpan={2} className="p-4 text-sm text-indigo-700">Total Salary Disbursement</td>
                {monthKeys.map(key => {
                  const monthTotal = employees.reduce((sum, emp) => sum + (dataMap[emp][key] || 0), 0);
                  return (
                    <td key={key} className="p-4 text-sm text-indigo-700 text-right">
                      {formatCurrency(monthTotal)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

import { LedgerEntry, UserRole, Employee } from '../types';
import { formatCurrency } from '../lib/utils';
import { Users, Download } from 'lucide-react';
import { useMemo } from 'react';
import * as XLSX from 'xlsx';

interface SalaryReportProps {
  entries: LedgerEntry[];
  userRole?: UserRole | null;
  employees: Employee[];
}

export default function SalaryReport({ entries, userRole, employees: employeeDb }: SalaryReportProps) {
  const salaryData = useMemo(() => {
    // Create a map for quick employee lookup by name/shortName
    const employeeMap: Record<string, Employee> = {};
    employeeDb.forEach(emp => {
      // Map by full name and short name for better matching
      if (emp.fullName) employeeMap[emp.fullName.toLowerCase()] = emp;
      if (emp.shortName) employeeMap[emp.shortName.toLowerCase()] = emp;
    });

    // Filter entries that are salaries
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

    const employeeNames = new Set<string>();
    const months = new Set<string>();
    const dataMap: Record<string, Record<string, number>> = {};

    salaryEntries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const employeeName = entry.remarks || 'Unknown Employee';

      employeeNames.add(employeeName);
      months.add(monthKey);

      if (!dataMap[employeeName]) {
        dataMap[employeeName] = {};
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
      
      dataMap[employeeName][monthKey] = (dataMap[employeeName][monthKey] || 0) + entryExpense;
    });

    // Sort months latest to oldest
    const sortedMonthKeys = Array.from(months).sort((a, b) => b.localeCompare(a));
    
    // Sort employees by their ID if found, otherwise by name
    const sortedEmployees = Array.from(employeeNames).sort((a, b) => {
      const empA = employeeMap[a.toLowerCase()];
      const empB = employeeMap[b.toLowerCase()];
      
      if (empA && empB) {
        return (empA.employeeId || '').localeCompare(empB.employeeId || '', undefined, { numeric: true });
      }
      if (empA) return -1;
      if (empB) return 1;
      return a.localeCompare(b);
    });

    const monthLabels = sortedMonthKeys.map(key => {
      const [year, month] = key.split('-');
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    return {
      employees: sortedEmployees,
      employeeMap,
      monthKeys: sortedMonthKeys,
      monthLabels,
      dataMap
    };
  }, [entries, employeeDb]);

  const downloadExcel = () => {
    const { employees: empNames, employeeMap, monthKeys, monthLabels, dataMap } = salaryData;
    
    const header = ['SL', 'ID', 'Employee', ...monthLabels];
    const rows = empNames.map((name, idx) => {
      const emp = employeeMap[name.toLowerCase()];
      const row: any = [idx + 1, emp?.employeeId || '-', name];
      monthKeys.forEach(key => {
        row.push(dataMap[name][key] || 0);
      });
      return row;
    });

    // Add Total row
    const totalRow = ['Total', '', 'Total Salary Disbursement'];
    monthKeys.forEach(key => {
      let monthTotal = 0;
      empNames.forEach(name => {
        monthTotal += dataMap[name][key] || 0;
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

  const { employees: empNames, employeeMap, monthKeys, monthLabels, dataMap } = salaryData;

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
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest w-24">ID</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest min-w-[200px]">Employee</th>
                {monthLabels.map((label, idx) => (
                  <th key={idx} className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empNames.map((name, idx) => {
                const emp = employeeMap[name.toLowerCase()];
                return (
                  <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-sm text-slate-500 font-medium">{idx + 1}</td>
                    <td className="p-4 text-sm text-slate-600 font-mono">{emp?.employeeId || '-'}</td>
                    <td className="p-4 text-sm text-slate-900 font-bold">{name}</td>
                    {monthKeys.map(key => (
                      <td key={key} className="p-4 text-sm text-slate-700 font-semibold text-right">
                        {dataMap[name][key] ? formatCurrency(dataMap[name][key]) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50/50 font-bold border-t-2 border-indigo-100">
                <td colSpan={3} className="p-4 text-sm text-indigo-700">Total Salary Disbursement</td>
                {monthKeys.map(key => {
                  const monthTotal = empNames.reduce((sum, name) => sum + (dataMap[name][key] || 0), 0);
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

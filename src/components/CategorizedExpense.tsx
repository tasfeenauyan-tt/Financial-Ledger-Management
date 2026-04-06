import { useMemo } from 'react';
import { LedgerEntry } from '../types';
import { formatCurrency } from '../lib/utils';
import { Receipt, TrendingDown, Users } from 'lucide-react';

interface CategorizedExpenseProps {
  entries: LedgerEntry[];
}

export default function CategorizedExpense({ entries }: CategorizedExpenseProps) {
  // Helper to get month key and label
  const getMonthInfo = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    };
  };

  // Get all unique months in chronological order
  const allMonths = useMemo(() => {
    const monthMap: Record<string, string> = {};
    entries.forEach(e => {
      const info = getMonthInfo(e.date);
      monthMap[info.key] = info.label;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, label]) => ({ key, label }));
  }, [entries]);

  // Media Buy Data
  const mediaBuyData = useMemo(() => {
    const companies: Record<string, Record<string, number>> = {};
    
    entries.forEach(e => {
      if (e.details.includes('Opex: Media Buy')) {
        const company = e.remarks || 'Unknown Company';
        const monthInfo = getMonthInfo(e.date);
        
        if (!companies[company]) {
          companies[company] = {};
        }
        
        let amount = 0;
        e.customEntries.forEach(ce => {
          if (ce.accountName.toLowerCase().includes('expense') || ce.accountName.toLowerCase().includes('cost')) {
            amount += ce.type === 'Dr' ? ce.amount : -ce.amount;
          }
        });
        
        companies[company][monthInfo.key] = (companies[company][monthInfo.key] || 0) + amount;
      }
    });

    return Object.entries(companies).map(([name, months]) => ({
      name,
      months,
      total: Object.values(months).reduce((sum: number, val: number) => sum + val, 0)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  // Food Bill Data
  const foodBillData = useMemo<Record<string, number>>(() => {
    const months: Record<string, number> = {};
    
    entries.forEach(e => {
      if (e.details.includes('Opex: Food Bill')) {
        const monthInfo = getMonthInfo(e.date);
        
        let amount = 0;
        e.customEntries.forEach(ce => {
          if (ce.accountName.toLowerCase().includes('expense') || ce.accountName.toLowerCase().includes('cost')) {
            amount += ce.type === 'Dr' ? ce.amount : -ce.amount;
          }
        });
        
        months[monthInfo.key] = (months[monthInfo.key] || 0) + amount;
      }
    });

    return months;
  }, [entries]);

  // Referral Commission Data
  const referralCommissionData = useMemo(() => {
    const persons: Record<string, Record<string, number>> = {};
    
    entries.forEach(e => {
      if (e.details.includes('Opex: Referral Commission')) {
        const person = e.remarks || 'Unknown Person';
        const monthInfo = getMonthInfo(e.date);
        
        if (!persons[person]) {
          persons[person] = {};
        }
        
        let amount = 0;
        e.customEntries.forEach(ce => {
          if (ce.accountName.toLowerCase().includes('expense') || ce.accountName.toLowerCase().includes('cost')) {
            amount += ce.type === 'Dr' ? ce.amount : -ce.amount;
          }
        });
        
        persons[person][monthInfo.key] = (persons[person][monthInfo.key] || 0) + amount;
      }
    });

    return Object.entries(persons).map(([name, months]) => ({
      name,
      months,
      total: Object.values(months).reduce((sum: number, val: number) => sum + val, 0)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  if (mediaBuyData.length === 0 && Object.keys(foodBillData).length === 0 && referralCommissionData.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <Receipt size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">No Categorized Expenses</h3>
        <p className="text-slate-500">No transactions found for Media Buy, Food Bill, or Referral Commission.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Media Buy Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <TrendingDown size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Monthly Expense of Media Buy</h3>
            <p className="text-sm text-slate-500">Breakdown by company and month</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-16">Sl</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</th>
                  {allMonths.map(m => (
                    <th key={m.key} className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right min-w-[100px]">
                      {m.label}
                    </th>
                  ))}
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right font-bold bg-slate-100/50">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mediaBuyData.map((company, index) => (
                  <tr key={company.name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-sm text-slate-500 text-center font-medium">{index + 1}</td>
                    <td className="p-4 text-sm text-slate-900 font-bold">{company.name}</td>
                    {allMonths.map(m => (
                      <td key={m.key} className="p-4 text-sm text-right font-medium text-slate-600">
                        {company.months[m.key] ? formatCurrency(company.months[m.key]) : '-'}
                      </td>
                    ))}
                    <td className="p-4 text-sm text-right font-bold text-indigo-600 bg-indigo-50/30">
                      {formatCurrency(company.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                  <td colSpan={2} className="p-4 text-sm text-slate-900 text-right">Total</td>
                  {allMonths.map(m => {
                    const monthTotal = mediaBuyData.reduce((sum: number, c) => sum + (c.months[m.key] || 0), 0);
                    return (
                      <td key={m.key} className="p-4 text-sm text-right text-rose-600">
                        {formatCurrency(monthTotal)}
                      </td>
                    );
                  })}
                  <td className="p-4 text-sm text-right text-rose-700 bg-rose-50">
                    {formatCurrency(mediaBuyData.reduce((sum: number, c) => sum + c.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      {/* Food Bill Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Receipt size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Monthly Expense of Food Bill</h3>
            <p className="text-sm text-slate-500">Monthly summary of food expenditures</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Item Name</th>
                  {allMonths.map(m => (
                    <th key={m.key} className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right min-w-[100px]">
                      {m.label}
                    </th>
                  ))}
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right font-bold bg-slate-100/50">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-sm text-slate-900 font-bold">Opex: Food Bill</td>
                  {allMonths.map(m => (
                    <td key={m.key} className="p-4 text-sm text-right font-medium text-slate-600">
                      {foodBillData[m.key] ? formatCurrency(foodBillData[m.key]) : '-'}
                    </td>
                  ))}
                  <td className="p-4 text-sm text-right font-bold text-emerald-600 bg-emerald-50/30">
                    {(() => {
                      const total = (Object.values(foodBillData) as number[]).reduce((sum: number, val: number) => sum + val, 0);
                      return formatCurrency(total);
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Referral Commission Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Monthly Referral Commission</h3>
            <p className="text-sm text-slate-500">Breakdown by person and month</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-16">Sl</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Person Name</th>
                  {allMonths.map(m => (
                    <th key={m.key} className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right min-w-[100px]">
                      {m.label}
                    </th>
                  ))}
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right font-bold bg-slate-100/50">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {referralCommissionData.map((person, index) => (
                  <tr key={person.name} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-sm text-slate-500 text-center font-medium">{index + 1}</td>
                    <td className="p-4 text-sm text-slate-900 font-bold">{person.name}</td>
                    {allMonths.map(m => (
                      <td key={m.key} className="p-4 text-sm text-right font-medium text-slate-600">
                        {person.months[m.key] ? formatCurrency(person.months[m.key]) : '-'}
                      </td>
                    ))}
                    <td className="p-4 text-sm text-right font-bold text-amber-600 bg-amber-50/30">
                      {formatCurrency(person.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                  <td colSpan={2} className="p-4 text-sm text-slate-900 text-right">Total</td>
                  {allMonths.map(m => {
                    const monthTotal = referralCommissionData.reduce((sum: number, p) => sum + (p.months[m.key] || 0), 0);
                    return (
                      <td key={m.key} className="p-4 text-sm text-right text-rose-600">
                        {formatCurrency(monthTotal)}
                      </td>
                    );
                  })}
                  <td className="p-4 text-sm text-right text-rose-700 bg-rose-50">
                    {formatCurrency(referralCommissionData.reduce((sum: number, p) => sum + p.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

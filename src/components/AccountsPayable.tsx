import React, { useMemo } from 'react';
import { LedgerEntry, Account } from '../types';
import { formatCurrency } from '../lib/utils';
import { CreditCard, ArrowUpRight, ArrowDownRight, Clock, User, Download, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AccountsPayableProps {
  entries: LedgerEntry[];
  accounts: Account[];
  userRole: string;
}

interface PayableVendor {
  vendorName: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  lastTransactionDate: string;
  transactions: {
    date: string;
    description: string;
    owed: number;
    paid: number;
    balance: number;
  }[];
}

export default function AccountsPayable({ entries, accounts, userRole }: AccountsPayableProps) {
  const payableResults = useMemo(() => {
    // 1. Identify which accounts are "Liability" and specifically related to payables
    const liabilityAccountIds = accounts
      .filter(acc => acc.category === 'Liability')
      .map(acc => acc.id);

    const vendorMap = new Map<string, PayableVendor>();

    // Sort entries by date to calculate running balance correctly per vendor
    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedEntries.forEach(entry => {
      const vendorName = entry.remarks || 'Uncategorized';
      
      (entry.customEntries || []).forEach(ce => {
        if (liabilityAccountIds.includes(ce.accountId)) {
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, {
              vendorName,
              totalOwed: 0,
              totalPaid: 0,
              balance: 0,
              lastTransactionDate: entry.date,
              transactions: []
            });
          }

          const vendor = vendorMap.get(vendorName)!;
          const owed = ce.type === 'Cr' ? ce.amount : 0;
          const paid = ce.type === 'Dr' ? ce.amount : 0;

          vendor.totalOwed += owed;
          vendor.totalPaid += paid;
          vendor.balance += (owed - paid);
          vendor.lastTransactionDate = entry.date;
          
          vendor.transactions.push({
            date: entry.date,
            description: entry.details || entry.transactionItemName,
            owed,
            paid,
            balance: vendor.balance
          });
        }
      });
    });

    // Only return vendors with a positive balance (pending payables)
    return Array.from(vendorMap.values())
      .filter(v => v.balance > 0.01)
      .sort((a, b) => b.balance - a.balance);
  }, [entries, accounts]);

  const totalPending = payableResults.reduce((sum, v) => sum + v.balance, 0);

  const downloadXLS = () => {
    const data = payableResults.map(v => ({
      Vendor: v.vendorName,
      'Total Owed': v.totalOwed,
      'Total Paid': v.totalPaid,
      'Pending Balance': v.balance,
      'Last Update': v.lastTransactionDate
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Accounts Payable");
    XLSX.writeFile(wb, `Accounts_Payable_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Pending Accounts Payable Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Total Outstanding: ${formatCurrency(totalPending, true)}`, 14, 38);

    const header = [['Vendor / Remarks', 'Total Owed', 'Total Paid', 'Balance', 'Last Date']];
    const rows = payableResults.map(v => [
      v.vendorName,
      formatCurrency(v.totalOwed, true),
      formatCurrency(v.totalPaid, true),
      formatCurrency(v.balance, true),
      v.lastTransactionDate
    ]);

    autoTable(doc, {
      startY: 45,
      head: header,
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`Accounts_Payable_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
              <CreditCard size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Payable</p>
              <h4 className="text-2xl font-black text-slate-900">{formatCurrency(totalPending)}</h4>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <User size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending Vendors</p>
              <h4 className="text-2xl font-black text-slate-900">{payableResults.length}</h4>
            </div>
          </div>
        </motion.div>

        <div className="flex items-end justify-end gap-3">
          <button 
            onClick={downloadXLS}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-sm font-bold transition-all border border-emerald-100"
          >
            <Download size={18} />
            Export Excel
          </button>
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-sm font-bold transition-all border border-rose-100"
          >
            <FileText size={18} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Vendor / Remarks</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total Owed</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total Paid</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Pending Balance</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Last Update</th>
                <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payableResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                    No pending accounts payable found.
                  </td>
                </tr>
              ) : (
                payableResults.map((vendor, idx) => (
                  <React.Fragment key={idx}>
                    <tr className="group hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            <User size={16} />
                          </div>
                          <span className="font-bold text-slate-700">{vendor.vendorName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-600">
                        {formatCurrency(vendor.totalOwed)}
                      </td>
                      <td className="p-4 text-right font-medium text-emerald-600">
                        {formatCurrency(vendor.totalPaid)}
                      </td>
                      <td className="p-4 text-right font-black text-rose-600">
                        {formatCurrency(vendor.balance)}
                      </td>
                      <td className="p-4 text-center text-sm font-semibold text-slate-500 uppercase tracking-tight">
                        {vendor.lastTransactionDate}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold uppercase tracking-wider border border-rose-100">
                          <Clock size={12} />
                          Pending
                        </span>
                      </td>
                    </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <ArrowUpRight className="text-rose-500" size={20} />
            Liability Concentration
          </h3>
          <div className="space-y-4">
            {payableResults.slice(0, 5).map((vendor, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate-500">{vendor.vendorName}</span>
                  <span className="text-slate-900">{formatCurrency(vendor.balance)} ({( (vendor.balance / totalPending) * 100 ).toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(vendor.balance / totalPending) * 100}%` }}
                    className="h-full bg-rose-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <ArrowDownRight className="text-emerald-500" size={20} />
            Recent Payments Activity
          </h3>
          <div className="space-y-4">
             {entries
              .filter(e => e.customEntries?.some(ce => ce.accountCategory === 'Liability' && ce.type === 'Dr'))
              .slice(0, 5)
              .map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{entry.remarks || 'General Payable'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{entry.date}</p>
                  </div>
                  <span className="text-sm font-black text-emerald-600">
                    -{formatCurrency(entry.customEntries.reduce((sum, ce) => ce.accountCategory === 'Liability' && ce.type === 'Dr' ? sum + ce.amount : sum, 0))}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

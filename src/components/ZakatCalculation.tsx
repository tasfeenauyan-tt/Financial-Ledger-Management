import React, { useMemo, useState, useEffect } from 'react';
import { LedgerEntry, ZakatSettings } from '../types';
import { formatCurrency } from '../lib/utils';
import { Download, FileText, Calculator, Calendar, TrendingUp, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface ZakatCalculationProps {
  entries: LedgerEntry[];
  settings: ZakatSettings | null;
  onUpdateSettings: (settings: ZakatSettings) => void;
  userRole: string;
}

export default function ZakatCalculation({ entries, settings, onUpdateSettings, userRole }: ZakatCalculationProps) {
  const isAdmin = userRole === 'admin';
  const [nisabInput, setNisabInput] = useState(settings?.nisabAmount?.toString() || '0');
  const [startDateInput, setStartDateInput] = useState(settings?.startDate || new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (settings) {
      setNisabInput(settings.nisabAmount.toString());
      setStartDateInput(settings.startDate);
    }
  }, [settings]);

  const dailyEquityData = useMemo(() => {
    const dailyChanges: Record<string, number> = {};
    
    entries.forEach(entry => {
      let entryEquityChange = 0;
      (entry.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Equity') {
          // Equity: Cr increases, Dr decreases
          entryEquityChange += ce.type === 'Cr' ? ce.amount : -ce.amount;
        }
      });
      
      dailyChanges[entry.date] = (dailyChanges[entry.date] || 0) + entryEquityChange;
    });

    const sortedDates = Object.keys(dailyChanges).sort();
    let cumulative = 0;
    
    return sortedDates.map(date => {
      const daily = dailyChanges[date];
      cumulative += daily;
      return {
        date,
        dailyEquity: daily,
        cumulativeEquity: cumulative
      };
    });
  }, [entries]);

  const latestCumulativeEquity = dailyEquityData.length > 0 
    ? dailyEquityData[dailyEquityData.length - 1].cumulativeEquity 
    : 0;

  const endDate = useMemo(() => {
    if (!startDateInput) return '';
    const date = new Date(startDateInput);
    date.setDate(date.getDate() + 365);
    return date.toISOString().split('T')[0];
  }, [startDateInput]);

  const zakatInfo = useMemo(() => {
    if (!endDate) return null;
    
    // Find cumulative equity on or before the end date
    const dataOnEndDate = [...dailyEquityData]
      .reverse()
      .find(d => d.date <= endDate);
    
    const equityOnEnd = dataOnEndDate ? dataOnEndDate.cumulativeEquity : 0;
    const nisab = parseFloat(nisabInput) || 0;
    const isEligible = equityOnEnd >= nisab;
    const payable = isEligible ? equityOnEnd * 0.025 : 0;

    return {
      equityOnEnd,
      isEligible,
      payable
    };
  }, [dailyEquityData, endDate, nisabInput]);

  const handleSaveSettings = () => {
    onUpdateSettings({
      id: 'zakat-settings',
      nisabAmount: parseFloat(nisabInput) || 0,
      startDate: startDateInput
    });
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(dailyEquityData.map(d => ({
      Date: d.date,
      'Daily Equity': d.dailyEquity,
      'Cumulative Equity': d.cumulativeEquity
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Zakat Data");
    XLSX.writeFile(workbook, `Zakat_Calculation_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("Zakat Calculation Data", 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Daily Equity', 'Cumulative Equity']],
      body: dailyEquityData.map(d => [
        d.date,
        formatCurrency(d.dailyEquity),
        formatCurrency(d.cumulativeEquity)
      ]),
    });
    doc.save(`Zakat_Calculation_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Side: Zakat Panel */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <Calculator size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Zakat Panel</h3>
              <p className="text-sm text-slate-500 font-medium">Calculate your Zakat liability</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Date Cumulative Equity</p>
              <p className="text-2xl font-bold text-indigo-600">{formatCurrency(latestCumulativeEquity)}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <TrendingUp size={16} className="text-slate-400" />
                  Start Nisab Amount
                </label>
                <input
                  type="number"
                  value={nisabInput}
                  onChange={(e) => setNisabInput(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="Enter Nisab amount..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400" />
                  Zakat Cal Start Date
                </label>
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400" />
                  Zakat Cal End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  readOnly
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 outline-none font-medium cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 font-medium italic">Automatically set to 365 days after start date.</p>
              </div>

              {isAdmin && (
                <button
                  onClick={handleSaveSettings}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 transition-all"
                >
                  Save Zakat Settings
                </button>
              )}
            </div>
          </div>

          {zakatInfo && (
            <div className="pt-6 border-t border-slate-100 space-y-6">
              <div className={cn(
                "p-6 rounded-2xl border flex items-start gap-4",
                zakatInfo.isEligible 
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                  : "bg-slate-50 border-slate-100 text-slate-600"
              )}>
                {zakatInfo.isEligible ? (
                  <CheckCircle2 size={24} className="shrink-0 mt-1" />
                ) : (
                  <XCircle size={24} className="shrink-0 mt-1" />
                )}
                <div>
                  <p className="font-bold text-lg">{zakatInfo.isEligible ? 'Eligible for Zakat' : 'Not Eligible for Zakat'}</p>
                  <p className="text-sm opacity-80 mt-1">
                    {zakatInfo.isEligible 
                      ? `Your cumulative equity of ${formatCurrency(zakatInfo.equityOnEnd)} on ${endDate} is above the Nisab.`
                      : `Your cumulative equity of ${formatCurrency(zakatInfo.equityOnEnd)} on ${endDate} is below the Nisab.`}
                  </p>
                </div>
              </div>

              {zakatInfo.isEligible && (
                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Zakat Eligible Amount</p>
                    <p className="text-2xl font-bold text-indigo-700">{formatCurrency(zakatInfo.equityOnEnd)}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Zakat Payable Amount (2.5%)</p>
                    <p className="text-2xl font-bold text-amber-700">{formatCurrency(zakatInfo.payable)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Table View */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Equity Tracking Table</h3>
                <p className="text-sm text-slate-500 font-medium">Daily and cumulative equity changes</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl transition-all font-bold text-sm"
              >
                <Download size={16} />
                Excel
              </button>
              <button
                onClick={exportToPDF}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl transition-all font-bold text-sm"
              >
                <FileText size={16} />
                PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Equity</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Cumulative Equity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dailyEquityData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-8 py-12 text-center text-slate-400 italic">
                      No equity transactions found.
                    </td>
                  </tr>
                ) : (
                  [...dailyEquityData].reverse().map((row, idx) => (
                    <tr key={row.date} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-300" />
                          <span className="text-sm font-bold text-slate-700">{row.date}</span>
                        </div>
                      </td>
                      <td className={cn(
                        "px-8 py-4 text-right text-sm font-bold",
                        row.dailyEquity >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {row.dailyEquity >= 0 ? '+' : ''}{formatCurrency(row.dailyEquity)}
                      </td>
                      <td className="px-8 py-4 text-right">
                        <span className="text-sm font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                          {formatCurrency(row.cumulativeEquity)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

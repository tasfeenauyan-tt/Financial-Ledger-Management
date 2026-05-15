import React, { useMemo, useState, useEffect } from 'react';
import { LedgerEntry, Client, Account } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  TrendingUp, 
  Target, 
  Repeat, 
  Zap, 
  AlertCircle, 
  ArrowRight,
  Info,
  Save,
  ChevronRight,
  BarChart3
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer, 
  ComposedChart,
  Line,
  Area
} from 'recharts';
import { motion } from 'motion/react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface RevenueProjectionProps {
  entries: LedgerEntry[];
  clients: Client[];
  userRole: string | null;
}

interface MonthData {
  month: string;
  monthKey: string;
  isFuture: boolean;
  isCurrent: boolean;
  actualExpense: number;
  actualRevenue: number;
  tr: number;
  finalTr: number;
  rr: number;
  nrr: number;
  gap: number;
}

export default function RevenueProjection({ entries, clients, userRole }: RevenueProjectionProps) {
  const [trPercentage, setTrPercentage] = useState<number>(100);
  const [isSaving, setIsSaving] = useState(false);

  // Load percentage from Firestore
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'revenue-projection'));
        if (settingsDoc.exists()) {
          setTrPercentage(settingsDoc.data().trPercentage || 100);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  const saveSettings = async () => {
    if (userRole !== 'admin') return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'revenue-projection'), { trPercentage });
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const projectionData = useMemo(() => {
    const months: MonthData[] = [];
    const now = new Date();
    
    // Set to first of month for consistent iteration
    const baseDate = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Generate month keys for last 3, current, and next 6
    const monthKeys: { key: string; label: string; offset: number }[] = [];
    for (let i = -3; i <= 6; i++) {
       const d = new Date(baseDate);
       d.setMonth(d.getMonth() + i);
       const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
       const label = d.toLocaleDateString('default', { month: 'short', year: '2-digit' });
       monthKeys.push({ key, label, offset: i });
    }

    // 2. Calculate Actuals for historical months (and current)
    const actualsMap = new Map<string, { revenue: number; expense: number }>();
    entries.forEach(entry => {
      const eDate = new Date(entry.date);
      const key = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}`;
      
      let rev = 0;
      let exp = 0;
      
      (entry.customEntries || []).forEach(ce => {
        const lowerName = ce.accountName.toLowerCase();
        const isEquity = ce.accountCategory === 'Equity';
        const isCapital = lowerName.includes('capital') || lowerName.includes('partner') || lowerName.includes('owner') || lowerName.includes('drawing');
        
        const isRevKeywords = lowerName.includes('revenue') || lowerName.includes('income') || lowerName.includes('sales') || 
                            lowerName.includes('fees') || lowerName.includes('service') || lowerName.includes('billing') ||
                            lowerName.includes('retainer') || lowerName.includes('commission');
        
        const isExpKeywords = lowerName.includes('expense') || lowerName.includes('cost') || lowerName.includes('salary') || 
                            lowerName.includes('rent') || lowerName.includes('bill') || lowerName.includes('tax') || 
                            lowerName.includes('utility') || lowerName.includes('purchase') || lowerName.includes('wage') ||
                            lowerName.includes('travel') || lowerName.includes('marketing') || lowerName.includes('allowance');
        
        if (isRevKeywords || (isEquity && !isCapital && ce.type === 'Cr')) {
          rev += ce.type === 'Cr' ? ce.amount : -ce.amount;
        } else if (isExpKeywords || (isEquity && !isCapital && ce.type === 'Dr')) {
          exp += ce.type === 'Dr' ? ce.amount : -ce.amount;
        }
      });
      
      const existing = actualsMap.get(key) || { revenue: 0, expense: 0 };
      actualsMap.set(key, { 
        revenue: existing.revenue + rev, 
        expense: existing.expense + exp 
      });
    });

    // 3. Find Max Expense of last 3 months for TR
    const last3Keys = monthKeys.filter(m => m.offset < 0).map(m => m.key);
    const last3Expenses = last3Keys.map(key => actualsMap.get(key)?.expense || 0);
    const targetRevenue = last3Expenses.length > 0 ? Math.max(...last3Expenses) : 0;
    const finalTargetRevenue = targetRevenue * (trPercentage / 100);

    // 4. Calculate RR and N-RR from active clients
    // We assume these are constant for projections
    const recurrentRevenue = clients
      .filter(c => c.status === 'Active' && c.clientType === 'Recurring')
      .reduce((sum, c) => sum + (c.budget || 0), 0);
    
    const nonRecurrentRevenue = clients
      .filter(c => c.status === 'Active' && c.clientType === 'Non-Recurring')
      .reduce((sum, c) => sum + (c.budget || 0), 0);

    // 5. Build Final Month Data
    monthKeys.forEach(m => {
      const actuals = actualsMap.get(m.key) || { revenue: 0, expense: 0 };
      const isFuture = m.offset > 0;
      const isCurrent = m.offset === 0;

      // For future months, we use the active client RR/N-RR
      // For current/past, we use actuals if available, but for the "Projection" chart 
      // the user wants TR, RR, N-RR and Gap.
      // So even for historical, we show the TR calculated from that period.
      
      const currentRR = isFuture || isCurrent ? recurrentRevenue : (actuals.revenue * 0.7); // Mock historical mix if not tracked separately
      const currentNRR = isFuture || isCurrent ? nonRecurrentRevenue : (actuals.revenue * 0.3);
      
      const tr = targetRevenue;
      const finalTr = finalTargetRevenue;
      const gap = Math.max(0, finalTr - (currentRR + currentNRR));

      months.push({
        month: m.label,
        monthKey: m.key,
        isFuture,
        isCurrent,
        actualExpense: actuals.expense,
        actualRevenue: actuals.revenue,
        tr,
        finalTr,
        rr: currentRR,
        nrr: currentNRR,
        gap
      });
    });

    return { 
      months, 
      tr: targetRevenue, 
      finalTr: finalTargetRevenue,
      totalRR: recurrentRevenue,
      totalNRR: nonRecurrentRevenue
    };
  }, [entries, clients, trPercentage]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Target size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-900">Target Adjustment</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Set your revenue goal based on TR</p>
              </div>
            </div>
            {userRole === 'admin' && (
              <button 
                onClick={saveSettings}
                disabled={isSaving}
                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Save Settings"
              >
                <Save size={18} className={isSaving ? 'animate-pulse' : ''} />
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">Final TR Percentage (%)</span>
              <span className="text-lg font-black text-indigo-600">{trPercentage}%</span>
            </div>
            <input 
              type="range" 
              min="50" 
              max="200" 
              step="5"
              value={trPercentage}
              onChange={(e) => setTrPercentage(parseInt(e.target.value))}
              disabled={userRole !== 'admin'}
              className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase">
              <span>Conservative (50%)</span>
              <span>Baseline (100%)</span>
              <span>Aggressive (200%)</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Target Revenue (TR)</p>
            <h4 className="text-2xl font-black text-slate-900">{formatCurrency(projectionData.tr)}</h4>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">Max expense (last 3m)</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between ring-2 ring-indigo-500/5">
          <div>
            <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Final Target Revenue</p>
            <h4 className="text-2xl font-black text-indigo-600">{formatCurrency(projectionData.finalTr)}</h4>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-[10px] uppercase mt-2">
            <TrendingUp size={12} />
            <span>Growth Goal</span>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
              <BarChart3 size={18} />
            </div>
            <h3 className="font-black text-slate-800">Revenue Projection (10-Month View)</h3>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black uppercase">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-indigo-500 rounded-full" />
              <span className="text-slate-500">Recurrent (RR)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-indigo-300 rounded-full" />
              <span className="text-slate-500">Non-Recurrent (N-RR)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-rose-400 rounded-full" />
              <span className="text-slate-500">Revenue Gap (GP)</span>
            </div>
          </div>
        </div>

        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={projectionData.months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                tickFormatter={(val) => `৳${(val/1000).toFixed(0)}k`}
              />
              <RechartsTooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                formatter={(value: number) => [formatCurrency(value), '']}
              />
              <Bar dataKey="rr" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} barSize={40} />
              <Bar dataKey="nrr" stackId="a" fill="#a5b4fc" radius={[0, 0, 0, 0]} />
              <Bar dataKey="gap" stackId="a" fill="#fb7185" radius={[4, 4, 0, 0]} />
              
              <Line 
                type="monotone" 
                dataKey="finalTr" 
                stroke="#6366f1" 
                strokeWidth={2} 
                strokeDasharray="5 5" 
                dot={false}
                name="Final Target"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projection Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Monthly Projection Details</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded border border-indigo-100 uppercase">Future Projections</span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded border border-slate-200 uppercase">Actual History</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Month</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Recurrent (RR)</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Non-Recurrent</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Target (Final TR)</th>
                <th className="p-4 text-[10px] font-black text-rose-400 uppercase tracking-widest text-right">Revenue Gap</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {projectionData.months.map((m, idx) => (
                <tr key={idx} className={cn(
                  "hover:bg-slate-50/50 transition-colors",
                  m.isCurrent && "bg-indigo-50/30"
                )}>
                  <td className="p-4 font-black text-slate-700">{m.month}</td>
                  <td className="p-4 text-right font-medium text-slate-600">{formatCurrency(m.rr)}</td>
                  <td className="p-4 text-right font-medium text-slate-600">{formatCurrency(m.nrr)}</td>
                  <td className="p-4 text-right font-bold text-indigo-600">{formatCurrency(m.finalTr)}</td>
                  <td className="p-4 text-right">
                    {m.gap > 0 ? (
                      <span className="font-black text-rose-500">-{formatCurrency(m.gap)}</span>
                    ) : (
                      <span className="font-black text-emerald-500">Target Met</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {m.isFuture ? (
                      <span className="p-2 text-indigo-500"><ArrowRight size={14} className="inline mr-1" />Projected</span>
                    ) : m.isCurrent ? (
                      <span className="p-2 text-indigo-600 font-bold uppercase text-[10px] ring-1 ring-indigo-200 rounded">Current</span>
                    ) : (
                      <span className="p-2 text-slate-400">Actual</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

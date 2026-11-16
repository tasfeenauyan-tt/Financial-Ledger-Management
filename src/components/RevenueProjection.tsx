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
  targetNrr: number;
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

    // Build project-level lookup for classifying historical entries by project clientType
    const projectTypeLookup = new Map<string, 'Recurring' | 'Non-Recurring'>();
    clients.forEach(c => {
      if (c.projectName) {
        projectTypeLookup.set(c.projectName.toLowerCase().trim(), c.clientType || 'Non-Recurring');
      }
      if (c.name) {
        projectTypeLookup.set(c.name.toLowerCase().trim(), c.clientType || 'Non-Recurring');
      }
      (c.services || []).forEach(service => {
        const serviceLabel = service === 'Others' ? (c.otherServiceDetails || 'Others') : service;
        const projName = `${c.name}${c.crmLeadId ? ` (${c.crmLeadId})` : ''}-${serviceLabel}`.toLowerCase().trim();
        const pd = c.projectDetails?.find(p => p.service === service);
        projectTypeLookup.set(projName, pd?.clientType || c.clientType || 'Non-Recurring');
      });
      (c.projectDetails || []).forEach(p => {
        if (p.projectName) {
          projectTypeLookup.set(p.projectName.toLowerCase().trim(), p.clientType || 'Non-Recurring');
        }
      });
    });

    // 2. Calculate Actuals for historical months (and current)
    const actualsMap = new Map<string, { revenue: number; expense: number; rr: number; nrr: number }>();
    entries.forEach(entry => {
      const key = /^\d{4}-\d{2}/.test(entry.date || '')
        ? entry.date.substring(0, 7)
        : (() => {
            const eDate = new Date(entry.date);
            return `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}`;
          })();
      
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
      
      const existing = actualsMap.get(key) || { revenue: 0, expense: 0, rr: 0, nrr: 0 };
      let entryRR = 0;
      let entryNRR = 0;
      if (rev !== 0) {
        const remarkKey = (entry.remarks || '').toLowerCase().trim();
        const matchedType = projectTypeLookup.get(remarkKey) || 'Non-Recurring';
        if (matchedType === 'Recurring') {
          entryRR = rev;
        } else {
          entryNRR = rev;
        }
      }

      actualsMap.set(key, { 
        revenue: existing.revenue + rev, 
        expense: existing.expense + exp,
        rr: existing.rr + entryRR,
        nrr: existing.nrr + entryNRR
      });
    });

    // 3. Find Max Expense of last 3 months for TR
    const last3Keys = monthKeys.filter(m => m.offset < 0).map(m => m.key);
    const last3Expenses = last3Keys.map(key => actualsMap.get(key)?.expense || 0);
    const targetRevenue = last3Expenses.length > 0 ? Math.max(...last3Expenses) : 0;
    const finalTargetRevenue = targetRevenue * (trPercentage / 100);

    // 4. Calculate RR and N-RR from active clients' project-wise budgets
    let recurrentRevenue = 0;
    let nonRecurrentRevenue = 0;
    const projectBreakdown: {
      clientId: string;
      clientName: string;
      projectName: string;
      service: string;
      clientType: 'Recurring' | 'Non-Recurring';
      budget: number;
    }[] = [];

    clients
      .filter(c => c.status === 'Active')
      .forEach(c => {
        if (c.projectDetails && c.projectDetails.length > 0) {
          const activeProjects = c.projectDetails.filter(p => (p.status || 'Active') === 'Active');
          const hasAnyProjectBudget = c.projectDetails.some(p => (p.budget || 0) > 0);
          if (hasAnyProjectBudget) {
            activeProjects.forEach(p => {
              const projBudget = Number(p.budget || 0);
              if (p.clientType === 'Recurring') {
                recurrentRevenue += projBudget;
              } else {
                nonRecurrentRevenue += projBudget;
              }
              projectBreakdown.push({
                clientId: c.id,
                clientName: c.name,
                projectName: p.projectName,
                service: p.service === 'Others' ? (c.otherServiceDetails || 'Others') : p.service,
                clientType: p.clientType,
                budget: projBudget
              });
            });
          } else if (activeProjects.length > 0) {
            // Fallback for active clients with projectDetails saved without project-level budget
            const fallbackBudget = Number(c.budget || 0);
            const fallbackType = c.clientType || 'Recurring';
            if (fallbackType === 'Recurring') {
              recurrentRevenue += fallbackBudget;
            } else {
              nonRecurrentRevenue += fallbackBudget;
            }
            activeProjects.forEach((p, idx) => {
              projectBreakdown.push({
                clientId: c.id,
                clientName: c.name,
                projectName: p.projectName,
                service: p.service === 'Others' ? (c.otherServiceDetails || 'Others') : p.service,
                clientType: p.clientType,
                budget: idx === 0 ? fallbackBudget : 0
              });
            });
          }
        } else {
          // Legacy fallback when projectDetails has not been configured yet
          const fallbackBudget = Number(c.budget || 0);
          const fallbackType = c.clientType || 'Non-Recurring';
          if (fallbackType === 'Recurring') {
            recurrentRevenue += fallbackBudget;
          } else {
            nonRecurrentRevenue += fallbackBudget;
          }
          if (fallbackBudget > 0) {
            projectBreakdown.push({
              clientId: c.id,
              clientName: c.name,
              projectName: c.projectName || c.name,
              service: (c.services || []).join(', ') || 'General',
              clientType: fallbackType,
              budget: fallbackBudget
            });
          }
        }
      });

    // 5. Build Final Month Data
    monthKeys.forEach(m => {
      const actuals = actualsMap.get(m.key) || { revenue: 0, expense: 0, rr: 0, nrr: 0 };
      const isFuture = m.offset > 0;
      const isCurrent = m.offset === 0;

      const currentRR = isFuture || isCurrent ? recurrentRevenue : actuals.rr;
      const currentNRR = isFuture || isCurrent ? nonRecurrentRevenue : actuals.nrr;
      
      const tr = targetRevenue;
      const finalTr = finalTargetRevenue;
      const targetNrr = finalTr - currentRR;
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
        targetNrr,
        gap
      });
    });

    return { 
      months, 
      tr: targetRevenue, 
      finalTr: finalTargetRevenue,
      totalRR: recurrentRevenue,
      totalNRR: nonRecurrentRevenue,
      projectBreakdown
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

      {/* Project-Wise RR & N-RR Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Recurrent (RR)</p>
            <h4 className="text-xl font-black text-slate-900">{formatCurrency(projectionData.totalRR)}</h4>
            <p className="text-[11px] font-medium text-slate-400 mt-1">
              {projectionData.projectBreakdown.filter(p => p.clientType === 'Recurring').length} active recurring project(s)
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Repeat size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Non-Recurrent (N-RR)</p>
            <h4 className="text-xl font-black text-slate-900">{formatCurrency(projectionData.totalNRR)}</h4>
            <p className="text-[11px] font-medium text-slate-400 mt-1">
              {projectionData.projectBreakdown.filter(p => p.clientType === 'Non-Recurring').length} active non-recurring project(s)
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50/60 flex items-center justify-center text-indigo-400">
            <Zap size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Project Pipeline (RR + N-RR)</p>
            <h4 className="text-xl font-black text-emerald-600">
              {formatCurrency(projectionData.totalRR + projectionData.totalNRR)}
            </h4>
            <p className="text-[11px] font-medium text-slate-400 mt-1">
              From {projectionData.projectBreakdown.length} active project(s)
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm" title="Analysis Revenue Projection">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500" title="Analysis Revenue Projection">
              <BarChart3 size={18} />
            </div>
            <h3 className="font-black text-slate-800">Revenue Projection Analysis (10-Month View)</h3>
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
                <th className="p-4 text-[10px] font-black text-amber-600 uppercase tracking-widest text-right">Target Non-Recurrent (T N-RR)</th>
                <th className="p-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right">Actual Earned Revenue</th>
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
                  <td className={cn(
                    "p-4 text-right font-bold",
                    m.targetNrr <= 0 ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {formatCurrency(m.targetNrr)}
                  </td>
                  <td className={cn(
                    "p-4 text-right",
                    m.actualRevenue > 0 ? "font-bold text-emerald-600" : "font-medium text-slate-400"
                  )}>
                    {formatCurrency(m.actualRevenue)}
                  </td>
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

      {/* Project-Wise Budget Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Active Project-Wise Budget Breakdown</h3>
            <p className="text-[11px] text-slate-500 font-medium">Source for Recurrent (RR) and Non-Recurrent (N-RR) projections</p>
          </div>
          <span className="text-xs font-bold text-indigo-600">
            {projectionData.projectBreakdown.length} Active Project(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Name</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Service</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Budget (BDT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {projectionData.projectBreakdown.map((proj, idx) => (
                <tr key={`${proj.clientId}-${proj.projectName}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800">{proj.projectName}</td>
                  <td className="p-4 font-medium text-slate-600">{proj.clientName}</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-black uppercase">
                      {proj.service}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                      proj.clientType === 'Recurring'
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    )}>
                      {proj.clientType === 'Recurring' ? 'Recurrent (RR)' : 'Non-Recurrent (N-RR)'}
                    </span>
                  </td>
                  <td className="p-4 text-right font-bold text-slate-900">{formatCurrency(proj.budget)}</td>
                </tr>
              ))}
              {projectionData.projectBreakdown.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 text-xs italic">
                    No active projects found in Project/Client Management System.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

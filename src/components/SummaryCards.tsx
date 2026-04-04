import { LedgerTotals } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { Wallet, Landmark, Scale, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface SummaryCardsProps {
  totals: LedgerTotals;
}

export default function SummaryCards({ totals }: SummaryCardsProps) {
  const isBalanced = Math.abs(totals.assets - (totals.liabilities + totals.equity)) < 0.01;

  const cards = [
    {
      title: 'Total Assets',
      value: totals.assets,
      icon: Wallet,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
    },
    {
      title: 'Total Liabilities',
      value: totals.liabilities,
      icon: Landmark,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
    },
    {
      title: 'Total Equity',
      value: totals.equity,
      icon: Scale,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {cards.map((card, idx) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className={cn(
            "p-6 rounded-2xl border bg-white shadow-sm flex items-start justify-between",
            card.border
          )}
        >
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">{card.title}</p>
            <h3 className={cn("text-2xl font-bold", card.color)}>
              {formatCurrency(card.value)}
            </h3>
          </div>
          <div className={cn("p-3 rounded-xl", card.bg)}>
            <card.icon className={card.color} size={24} />
          </div>
        </motion.div>
      ))}

      {!isBalanced && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="col-span-full p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-800"
        >
          <AlertCircle className="shrink-0" size={20} />
          <p className="text-sm font-medium">
            Accounting Equation Warning: Assets ({formatCurrency(totals.assets)}) ≠ Liabilities + Equity ({formatCurrency(totals.liabilities + totals.equity)}). Difference: {formatCurrency(Math.abs(totals.assets - (totals.liabilities + totals.equity)))}
          </p>
        </motion.div>
      )}
    </div>
  );
}

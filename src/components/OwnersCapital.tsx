import React, { useMemo } from 'react';
import { LedgerEntry, Partner } from '../types';
import { formatCurrency } from '../lib/utils';
import { motion } from 'motion/react';

interface OwnersCapitalProps {
  entries: LedgerEntry[];
  partners: Partner[];
}

export default function OwnersCapital({ entries, partners }: OwnersCapitalProps) {
  const partnerCapital = useMemo(() => {
    const capitalMap: Record<string, number> = {};
    
    // Initialize all partners with 0
    partners.forEach(p => {
      capitalMap[p.name] = 0;
    });
    
    entries.forEach(e => {
      // Look for Equity entries that mention "Capital" or "Investment"
      e.customEntries.forEach(ce => {
        if (ce.accountCategory === 'Equity' && 
           (ce.accountName.toLowerCase().includes('capital') || ce.accountName.toLowerCase().includes('investment'))) {
          
          const partnerName = e.remarks || 'Unknown Partner';
          
          // For Equity: Credit increases (contribution), Debit decreases (withdrawal)
          const amount = ce.type === 'Cr' ? ce.amount : -ce.amount;
          
          capitalMap[partnerName] = (capitalMap[partnerName] || 0) + amount;
        }
      });
    });

    return Object.entries(capitalMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, partners]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Capital Contributions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {partnerCapital.length === 0 ? (
          <div className="col-span-full bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
            <p className="text-slate-400 font-medium italic">No capital contributions found.</p>
            <p className="text-xs text-slate-300 mt-1">Ensure transactions have "Capital" in the account name and partner name in remarks.</p>
          </div>
        ) : (
          partnerCapital.map((partner, idx) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Partner</p>
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                    {partner.name}
                  </h3>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Contribution</p>
                  <p className="text-2xl font-bold text-blue-500">
                    {formatCurrency(partner.amount)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { LedgerEntry, CustomAccountEntry, Account, TransactionItem, TransactionSubCategory, Client } from '../types';
import { cn, formatDate } from '../lib/utils';
import { useMemo } from 'react';

interface ExcelImportProps {
  onImport: (entries: LedgerEntry[]) => void;
  accounts: Account[];
  transactionItems: TransactionItem[];
  transactionSubCategories: TransactionSubCategory[];
  clients?: Client[];
}

export default function ExcelImport({ 
  onImport, 
  accounts = [], 
  transactionItems = [], 
  transactionSubCategories = [],
  clients = []
}: ExcelImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allSubCategories = useMemo(() => {
    const projects = clients.flatMap(c => 
      (c.services || []).map(service => {
        const serviceLabel = service === 'Others' ? (c.otherServiceDetails || 'Others') : service;
        const projectName = `${c.name}${c.crmLeadId ? ` (${c.crmLeadId})` : ''}-${serviceLabel}`;
        return {
          id: `project-${c.id}-${service}`,
          name: projectName,
        } as TransactionSubCategory;
      })
    );
    return [...transactionSubCategories, ...projects];
  }, [transactionSubCategories, clients]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Dynamically parse headers to identify columns
      if (!data || data.length === 0) return;

      const headers = (data[0] || []).map(h => String(h || '').trim());

      let dateIdx = headers.findIndex(h => h.toLowerCase() === 'date');
      let itemIdx = headers.findIndex(h => {
        const l = h.toLowerCase();
        return l.includes('transaction item') || l === 'item' || l === 'details';
      });
      let remarksIdx = headers.findIndex(h => {
        const l = h.toLowerCase();
        return l === 'remarks' || l.includes('sub-category') || l.includes('subcategory');
      });
      let notesIdx = headers.findIndex(h => {
        const l = h.toLowerCase();
        return l === 'notes' || l === 'note' || l === 'description';
      });

      // Fallbacks if header names aren't matched
      if (dateIdx === -1) dateIdx = 0;
      if (itemIdx === -1) itemIdx = 1;
      if (remarksIdx === -1) remarksIdx = headers.length > 11 ? headers.length - 2 : 11;
      if (notesIdx === -1) notesIdx = headers.length > 12 ? headers.length - 1 : 12;

      // Collect all account column indices
      const accountCols: { idx: number; name: string }[] = [];
      headers.forEach((h, idx) => {
        if (idx !== dateIdx && idx !== itemIdx && idx !== remarksIdx && idx !== notesIdx && h && h.trim() !== '') {
          accountCols.push({ idx, name: h.trim() });
        }
      });

      const entries: LedgerEntry[] = data.slice(1).filter(row => row && row.length > 0).map((row) => {
        const customEntries: CustomAccountEntry[] = [];

        accountCols.forEach(({ idx, name }) => {
          const rawVal = row[idx];
          const amount = Number(rawVal || 0);
          if (!isNaN(amount) && amount !== 0) {
            const lowerName = name.toLowerCase();
            const foundAccount = accounts.find(a => a.name.trim().toLowerCase() === lowerName);
            
            let category: 'Asset' | 'Liability' | 'Equity' = 'Asset';
            let defaultType: 'Dr' | 'Cr' = 'Dr';

            if (foundAccount) {
              category = foundAccount.category;
              if (category === 'Asset') defaultType = 'Dr';
              else if (category === 'Liability') defaultType = 'Cr';
              else {
                if (lowerName.includes('drawing') || lowerName.includes('expense')) {
                  defaultType = 'Dr';
                } else {
                  defaultType = 'Cr';
                }
              }
            } else {
              if (['cash', 'accounts receivable', 'supplies', 'equipment'].includes(lowerName) || lowerName.includes('asset') || lowerName.includes('bank') || lowerName.includes('receivable')) {
                category = 'Asset';
                defaultType = 'Dr';
              } else if (['accounts payable'].includes(lowerName) || lowerName.includes('payable') || lowerName.includes('liability') || lowerName.includes('loan')) {
                category = 'Liability';
                defaultType = 'Cr';
              } else if (["owner's capital", 'revenue'].includes(lowerName) || lowerName.includes('capital') || lowerName.includes('revenue') || lowerName.includes('income')) {
                category = 'Equity';
                defaultType = 'Cr';
              } else if (["owner's drawings", 'expense'].includes(lowerName) || lowerName.includes('drawing') || lowerName.includes('expense')) {
                category = 'Equity';
                defaultType = 'Dr';
              }
            }

            const isExpense = lowerName === 'expense' || lowerName.includes('expense');
            const absAmount = Math.abs(amount);
            
            let type: 'Dr' | 'Cr' = defaultType;
            if (isExpense) {
              type = 'Dr';
            } else {
              if (amount < 0) {
                type = defaultType === 'Dr' ? 'Cr' : 'Dr';
              }
            }

            customEntries.push({
              id: crypto.randomUUID(),
              accountId: foundAccount ? foundAccount.id : 'others',
              accountName: name,
              accountCategory: category,
              amount: absAmount,
              type,
            });
          }
        });

        const itemName = String(row[itemIdx] || '');
        const foundItem = transactionItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
        
        const remarksText = String(row[remarksIdx] || '');
        const foundSub = allSubCategories.find(s => s.name.toLowerCase() === remarksText.toLowerCase());

        return {
          id: crypto.randomUUID(),
          date: formatDate(row[dateIdx]),
          transactionItemId: foundItem ? foundItem.id : (itemName ? 'others' : ''),
          transactionItemName: itemName,
          details: itemName,
          customEntries,
          remarksId: foundSub ? foundSub.id : (remarksText ? 'others' : ''),
          remarks: remarksText,
          notes: String(row[notesIdx] || ''),
          createdAt: new Date().toISOString(),
        };
      });

      onImport(entries);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="flex items-center gap-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex items-center gap-2 px-3 lg:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all shadow-sm font-medium"
        )}
        title="Import Excel"
      >
        <Upload size={18} />
        <span className="hidden lg:inline">Import Excel</span>
      </button>
      <div className="text-xs text-slate-500 hidden lg:flex items-center gap-1">
        <FileSpreadsheet size={14} />
        Supports .xlsx, .xls, .csv
      </div>
    </div>
  );
}

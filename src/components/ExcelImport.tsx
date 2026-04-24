import React, { useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { LedgerEntry, CustomAccountEntry, Account, TransactionItem, TransactionSubCategory } from '../types';
import { cn, formatDate } from '../lib/utils';

interface ExcelImportProps {
  onImport: (entries: LedgerEntry[]) => void;
  accounts: Account[];
  transactionItems: TransactionItem[];
  transactionSubCategories: TransactionSubCategory[];
}

export default function ExcelImport({ 
  onImport, 
  accounts = [], 
  transactionItems = [], 
  transactionSubCategories = [] 
}: ExcelImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Assuming first row is header
      // Expected columns: Date, Transaction Item, Cash, Accounts Receivable, Supplies, Equipment, Accounts Payable, Owner's Capital, Revenue, Owner's Drawings, Expense, Remarks, Notes
      const entries: LedgerEntry[] = data.slice(1).map((row, index) => {
        const customEntries: CustomAccountEntry[] = [];
        const addEntry = (name: string, amount: number, category: 'Asset' | 'Liability' | 'Equity', type: 'Dr' | 'Cr') => {
          if (amount !== 0) {
            // Find account in pool
            const foundAccount = accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
            const isExpense = name.toLowerCase() === 'expense';
            
            customEntries.push({
              id: crypto.randomUUID(),
              accountId: foundAccount ? foundAccount.id : 'others',
              accountName: name,
              accountCategory: foundAccount ? foundAccount.category : category,
              amount: Math.abs(amount),
              type: isExpense ? type : (amount > 0 ? type : (type === 'Dr' ? 'Cr' : 'Dr')),
            });
          }
        };

        addEntry('Cash', Number(row[2] || 0), 'Asset', 'Dr');
        addEntry('Accounts Receivable', Number(row[3] || 0), 'Asset', 'Dr');
        addEntry('Supplies', Number(row[4] || 0), 'Asset', 'Dr');
        addEntry('Equipment', Number(row[5] || 0), 'Asset', 'Dr');
        addEntry('Accounts Payable', Number(row[6] || 0), 'Liability', 'Cr');
        addEntry("Owner's Capital", Number(row[7] || 0), 'Equity', 'Cr');
        addEntry('Revenue', Number(row[8] || 0), 'Equity', 'Cr');
        addEntry("Owner's Drawings", Number(row[9] || 0), 'Equity', 'Dr');
        addEntry('Expense', Number(row[10] || 0), 'Equity', 'Dr');

        const itemName = String(row[1] || '');
        const foundItem = transactionItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
        
        const remarksText = String(row[11] || '');
        const foundSub = transactionSubCategories.find(s => s.name.toLowerCase() === remarksText.toLowerCase());

        return {
          id: crypto.randomUUID(),
          date: formatDate(row[0]),
          transactionItemId: foundItem ? foundItem.id : (itemName ? 'others' : ''),
          transactionItemName: itemName,
          details: itemName,
          customEntries,
          remarksId: foundSub ? foundSub.id : (remarksText ? 'others' : ''),
          remarks: remarksText,
          notes: String(row[12] || ''),
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

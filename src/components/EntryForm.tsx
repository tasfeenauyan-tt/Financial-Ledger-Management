import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LedgerEntry, INITIAL_ENTRY, Account, TransactionItem, CustomAccountEntry, TransactionSubCategory } from '../types';
import { Plus, X, Info, Database, Trash2, AlertCircle, Tags } from 'lucide-react';
import { cn } from '../lib/utils';

interface EntryFormProps {
  onSave: (entry: LedgerEntry) => void;
  initialData?: LedgerEntry | null;
  onClose?: () => void;
  accounts?: Account[];
  transactionItems?: TransactionItem[];
  transactionSubCategories?: TransactionSubCategory[];
}

export default function EntryForm({ 
  onSave, 
  initialData, 
  onClose, 
  accounts = [], 
  transactionItems = [],
  transactionSubCategories = []
}: EntryFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Omit<LedgerEntry, 'id'>>(INITIAL_ENTRY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      const { id, ...rest } = initialData;
      setFormData(rest);
      setIsOpen(true);
    }
  }, [initialData]);

  const validateBalance = () => {
    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    (formData.customEntries || []).forEach(ce => {
      if (ce.accountCategory === 'Asset') {
        assets += ce.type === 'Dr' ? ce.amount : -ce.amount;
      } else if (ce.accountCategory === 'Liability') {
        liabilities += ce.type === 'Cr' ? ce.amount : -ce.amount;
      } else if (ce.accountCategory === 'Equity') {
        equity += ce.type === 'Cr' ? ce.amount : -ce.amount;
      }
    });

    return Math.abs(assets - (liabilities + equity)) < 0.01;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.customEntries.length === 0) {
      setError('Please add at least one custom account entry.');
      return;
    }

    if (!validateBalance()) {
      setError('The entry is not balanced (Assets ≠ Liabilities + Equity). Please check your amounts and Dr/Cr selections.');
      return;
    }

    onSave({
      ...formData,
      id: initialData?.id || crypto.randomUUID(),
    });
    
    if (!initialData) {
      setFormData(INITIAL_ENTRY);
    }
    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    if (onClose) onClose();
  };

  const addCustomEntry = () => {
    const newEntry: CustomAccountEntry = {
      id: crypto.randomUUID(),
      accountId: '',
      accountName: '',
      accountCategory: 'Asset',
      amount: 0,
      type: 'Dr',
    };
    setFormData(prev => ({
      ...prev,
      customEntries: [...prev.customEntries, newEntry],
    }));
  };

  const removeCustomEntry = (id: string) => {
    setFormData(prev => ({
      ...prev,
      customEntries: prev.customEntries.filter(ce => ce.id !== id),
    }));
  };

  const updateCustomEntry = (id: string, updates: Partial<CustomAccountEntry>) => {
    setFormData(prev => ({
      ...prev,
      customEntries: prev.customEntries.map(ce => {
        if (ce.id === id) {
          if (updates.accountCategory && updates.accountCategory !== ce.accountCategory) {
            return { ...ce, ...updates, accountId: '', accountName: '' };
          }
          if (updates.accountId) {
            const acc = accounts.find(a => a.id === updates.accountId);
            return { 
              ...ce, 
              ...updates, 
              accountName: acc?.name || '', 
              accountCategory: acc?.category || ce.accountCategory 
            };
          }
          return { ...ce, ...updates };
        }
        return ce;
      }),
    }));
  };

  const handleTransactionItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'others') {
      setFormData(prev => ({ ...prev, transactionItemId: 'others', transactionItemName: '', details: '' }));
    } else {
      const item = transactionItems.find(i => i.id === value);
      const name = item?.name || '';
      setFormData(prev => ({ ...prev, transactionItemId: value, transactionItemName: name, details: name }));
    }
  };

  const handleRemarksChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'others') {
      setFormData(prev => ({ ...prev, remarksId: 'others', remarks: '' }));
    } else {
      const sub = transactionSubCategories.find(s => s.id === value);
      setFormData(prev => ({ ...prev, remarksId: value, remarks: sub?.name || '' }));
    }
  };

  if (!isOpen && !initialData) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md hover:shadow-lg font-semibold"
      >
        <Plus size={20} />
        +Add Transaction
      </button>
    );
  }

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white z-20 rounded-t-3xl">
          <h2 className="text-xl font-bold text-slate-900">
            {initialData ? 'Edit Transaction' : 'Record Transaction'}
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <form id="transaction-form" onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={20} />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Transaction Details</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Purchased supplies on account"
                  value={formData.details}
                  onChange={(e) => setFormData(prev => ({ ...prev, details: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Transaction Item</label>
                <div className="space-y-3">
                  <select
                    required
                    value={formData.transactionItemId}
                    onChange={handleTransactionItemChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                  >
                    <option value="">-- Select Item --</option>
                    {transactionItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                    <option value="others">Others</option>
                  </select>
                  {formData.transactionItemId === 'others' && (
                    <input
                      type="text"
                      required
                      placeholder="Enter manual transaction item"
                      value={formData.transactionItemName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => ({ ...prev, transactionItemName: val, details: val }));
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                  <Database size={16} className="text-slate-400" />
                  Custom Accounts (from Pool)
                </h3>
                <button
                  type="button"
                  onClick={addCustomEntry}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"
                >
                  <Plus size={14} />
                  Add Another Custom Account
                </button>
              </div>

              <div className="space-y-3">
                {formData.customEntries.map((entry, index) => (
                  <div key={entry.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="md:col-span-3 space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Account Category</label>
                      <select
                        required
                        value={entry.accountCategory}
                        onChange={(e) => updateCustomEntry(entry.id, { accountCategory: e.target.value as any })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                      >
                        <option value="Asset">Asset</option>
                        <option value="Liability">Liability</option>
                        <option value="Equity">Equity</option>
                      </select>
                    </div>
                    <div className="md:col-span-3 space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Select Account</label>
                      <select
                        required
                        value={entry.accountId}
                        onChange={(e) => updateCustomEntry(entry.id, { accountId: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                      >
                        <option value="">-- Select Account --</option>
                        {accounts
                          .filter(acc => acc.category === entry.accountCategory)
                          .map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))
                        }
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Amount</label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        placeholder="0.00"
                        value={entry.amount || ''}
                        onChange={(e) => updateCustomEntry(entry.id, { amount: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1.5">
                      <label className="text-xs font-bold text-slate-500">Dr/Cr</label>
                      <select
                        required
                        value={entry.type}
                        onChange={(e) => updateCustomEntry(entry.id, { type: e.target.value as 'Dr' | 'Cr' })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                      >
                        <option value="Dr">Dr</option>
                        <option value="Cr">Cr</option>
                      </select>
                    </div>
                    <div className="md:col-span-1 flex justify-center pb-1">
                      <button
                        type="button"
                        onClick={() => removeCustomEntry(entry.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {formData.customEntries.length === 0 && (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                    No custom accounts added. Click "Add Another Custom Account" to start.
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Tags size={16} className="text-slate-400" />
                  Remarks (Sub-Category)
                </label>
                <div className="space-y-3">
                  <select
                    required
                    value={formData.remarksId}
                    onChange={handleRemarksChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                  >
                    <option value="">-- Select Sub-Category --</option>
                    {transactionSubCategories.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                    <option value="others">Others</option>
                  </select>
                  {formData.remarksId === 'others' && (
                    <input
                      type="text"
                      required
                      placeholder="Enter manual remarks"
                      value={formData.remarks}
                      onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-between z-20 rounded-b-3xl">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Info size={16} />
            <span>Ensure Assets = Liabilities + Equity</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="transaction-form"
              className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              {initialData ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

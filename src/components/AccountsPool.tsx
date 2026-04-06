import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Account, TransactionItem, TransactionSubCategory, Partner } from '../types';
import { Plus, Trash2, Wallet, Landmark, Scale, X, ListTodo, Tags, Users } from 'lucide-react';
import { cn } from '../lib/utils';

interface AccountsPoolProps {
  accounts: Account[];
  onAdd: (account: Account) => void;
  onDelete: (id: string) => void;
  transactionItems: TransactionItem[];
  onAddTransactionItem: (item: TransactionItem) => void;
  onDeleteTransactionItem: (id: string) => void;
  transactionSubCategories: TransactionSubCategory[];
  onAddTransactionSubCategory: (sub: TransactionSubCategory) => void;
  onDeleteTransactionSubCategory: (id: string) => void;
  userRole: string;
}

export default function AccountsPool({ 
  accounts, 
  onAdd, 
  onDelete,
  transactionItems,
  onAddTransactionItem,
  onDeleteTransactionItem,
  transactionSubCategories,
  onAddTransactionSubCategory,
  onDeleteTransactionSubCategory,
  userRole
}: AccountsPoolProps) {
  const isAdmin = userRole === 'admin';
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isAddingSubCategory, setIsAddingSubCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [newAccount, setNewAccount] = useState<Omit<Account, 'id'>>({
    name: '',
    category: 'Asset',
  });

  const [newItem, setNewItem] = useState('');
  const [newSubCategory, setNewSubCategory] = useState('');
  
  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.name.localeCompare(b.name)), [accounts]);
  const sortedTransactionItems = useMemo(() => [...transactionItems].sort((a, b) => a.name.localeCompare(b.name)), [transactionItems]);
  const sortedTransactionSubCategories = useMemo(() => [...transactionSubCategories].sort((a, b) => a.name.localeCompare(b.name)), [transactionSubCategories]);

  const handleSubmitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAccount.name.trim();
    if (!name) return;

    const isDuplicate = accounts.some(a => a.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      setError('This account name already exists.');
      return;
    }

    onAdd({
      ...newAccount,
      name,
      id: crypto.randomUUID(),
    });
    setNewAccount({ name: '', category: 'Asset' });
    setIsAdding(false);
    setError(null);
  };

  const handleSubmitItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;

    const isDuplicate = transactionItems.some(i => i.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      setError('This transaction item already exists.');
      return;
    }

    onAddTransactionItem({
      id: crypto.randomUUID(),
      name,
    });
    setNewItem('');
    setIsAddingItem(false);
    setError(null);
  };

  const handleSubmitSubCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSubCategory.trim();
    if (!name) return;

    const isDuplicate = transactionSubCategories.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      setError('This sub-category already exists.');
      return;
    }

    onAddTransactionSubCategory({
      id: crypto.randomUUID(),
      name,
    });
    setNewSubCategory('');
    setIsAddingSubCategory(false);
    setError(null);
  };

  const categories = [
    { name: 'Asset', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { name: 'Liability', icon: Landmark, color: 'text-rose-600', bg: 'bg-rose-50' },
    { name: 'Equity', icon: Scale, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  return (
    <div className="space-y-12">
      {/* Accounts Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Accounts Items</h3>
            <p className="text-sm text-slate-500"> Manage accounts items, and sub-categories.</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setIsAdding(true); setError(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md font-semibold"
            >
              <Plus size={18} />
              Add Accounts
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map(cat => (
            <div key={cat.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={cn("px-6 py-4 border-b border-slate-100 flex items-center gap-3", cat.bg)}>
                <cat.icon className={cat.color} size={20} />
                <h4 className={cn("font-bold", cat.color)}>{cat.name}s</h4>
              </div>
              <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                {sortedAccounts.filter(a => a.category === cat.name).length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">No accounts added</p>
                ) : (
                  sortedAccounts.filter(a => a.category === cat.name).map(account => (
                    <div key={account.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group hover:bg-slate-100 transition-colors">
                      <span className="text-sm font-semibold text-slate-700">{account.name}</span>
                      {isAdmin && (
                        <button
                          onClick={() => onDelete(account.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Items Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Transaction Items</h3>
            <p className="text-sm text-slate-500">Manage items for transaction dropdown</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setIsAddingItem(true); setError(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-md font-semibold"
            >
              <Plus size={18} />
              Add Item
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-emerald-50">
            <ListTodo className="text-emerald-600" size={20} />
            <h4 className="font-bold text-emerald-600">Items List</h4>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
            {sortedTransactionItems.length === 0 ? (
              <p className="col-span-full text-sm text-slate-400 italic text-center py-8">No transaction items added yet</p>
            ) : (
              sortedTransactionItems.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                  {isAdmin && (
                    <button
                      onClick={() => onDeleteTransactionItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Transaction Items Sub-Category Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Transaction Items Sub-Category</h3>
            <p className="text-sm text-slate-500">Manage sub-categories for remarks dropdown</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setIsAddingSubCategory(true); setError(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-md font-semibold"
            >
              <Plus size={18} />
              Add Sub-Category
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-indigo-50">
            <Tags className="text-indigo-600" size={20} />
            <h4 className="font-bold text-indigo-600">Sub-Categories List</h4>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
            {sortedTransactionSubCategories.length === 0 ? (
              <p className="col-span-full text-sm text-slate-400 italic text-center py-8">No sub-categories added yet</p>
            ) : (
              sortedTransactionSubCategories.map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-semibold text-slate-700">{sub.name}</span>
                  {isAdmin && (
                    <button
                      onClick={() => onDeleteTransactionSubCategory(sub.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isAdding && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8 md:py-12">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto relative">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add New Account</h2>
              <button onClick={() => { setIsAdding(false); setError(null); setNewAccount({ name: '', category: 'Asset' }); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitAccount} className="p-8 space-y-6">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                  <X size={16} className="shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Accounts Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Bank Account, Loan, etc."
                  value={newAccount.name}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Category</label>
                <select
                  value={newAccount.category}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, category: e.target.value as any }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                >
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsAdding(false); setError(null); setNewAccount({ name: '', category: 'Asset' }); }}
                  className="flex-1 px-6 py-2.5 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {isAddingItem && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8 md:py-12">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto relative">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add Transaction Item</h2>
              <button onClick={() => { setIsAddingItem(false); setError(null); setNewItem(''); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitItem} className="p-8 space-y-6">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                  <X size={16} className="shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Salary, Rent, Sales, etc."
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsAddingItem(false); setError(null); setNewItem(''); }}
                  className="flex-1 px-6 py-2.5 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {isAddingSubCategory && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8 md:py-12">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto relative">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Add Transaction Sub-Category</h2>
              <button onClick={() => { setIsAddingSubCategory(false); setError(null); setNewSubCategory(''); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitSubCategory} className="p-8 space-y-6">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-600 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
                  <X size={16} className="shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Sub-Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Opex, Capex, etc."
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsAddingSubCategory(false); setError(null); setNewSubCategory(''); }}
                  className="flex-1 px-6 py-2.5 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

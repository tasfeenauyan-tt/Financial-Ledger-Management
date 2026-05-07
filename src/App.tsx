import * as React from 'react';
import { useState, useMemo, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { LedgerEntry, LedgerTotals, Account, TransactionItem, TransactionSubCategory, Partner, ZakatSettings, UserRole, AppUser, Employee, Client } from './types';
import SummaryCards from './components/SummaryCards';
import LedgerTable from './components/LedgerTable';
import EntryForm from './components/EntryForm';
import ExcelImport from './components/ExcelImport';
import BalanceSheet from './components/BalanceSheet';
import MonthlyBalanceSheet from './components/MonthlyBalanceSheet';
import MonthlyPandL from './components/MonthlyPandL';
import ExpenseReport from './components/ExpenseReport';
import CategorizedExpense from './components/CategorizedExpense';
import SalaryReport from './components/SalaryReport';
import ProjectRevenue from './components/ProjectRevenue';
import FinancialReport from './components/FinancialReport';
import OwnersCapital from './components/OwnersCapital';
import ZakatCalculation from './components/ZakatCalculation';
import TrialBalance from './components/TrialBalance';
import FullDatabaseBackup from './components/FullDatabaseBackup';
import PaymentManagement from './components/PaymentManagement';
import AccountsPool from './components/AccountsPool';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import EmployeeDatabase from './components/EmployeeDatabase';
import ProjectClientDatabase from './components/ProjectClientDatabase';
import AccountsPayable from './components/AccountsPayable';
import AccountsReceivable from './components/AccountsReceivable';
import { auth, logout, User, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  getDocs,
  writeBatch,
  getDocFromServer,
  getDoc
} from 'firebase/firestore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { Building2, LayoutDashboard, History, Settings, LogOut, Search, Filter, Download, Trash2, RotateCcw, FileText, Calendar, Receipt, Users, Database, AlertCircle, Menu, X, TrendingDown, TrendingUp, Shield, ArrowLeftRight, Calculator, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn, formatCurrency } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionItems, setTransactionItems] = useState<TransactionItem[]>([]);
  const [transactionSubCategories, setTransactionSubCategories] = useState<TransactionSubCategory[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [zakatSettings, setZakatSettings] = useState<ZakatSettings | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'balance-sheet' | 'monthly-balance-sheet' | 'trial-balance' | 'monthly-p-and-l' | 'expense' | 'categorized-expense' | 'salary' | 'financial-report' | 'owners-capital' | 'zakat' | 'backup' | 'payments-mgmt' | 'accounts' | 'admin' | 'employees' | 'project-clients' | 'accounts-payable' | 'accounts-receivable'>('history');

  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Fetch user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as AppUser;
          setUserRole(userData.role);
          setUserProfile(userData);
        } else {
          // If it's the default admin, create their profile
          if (currentUser.email === 'tasfeen.auyan@triloytech.com') {
            const adminUser: AppUser = {
              uid: currentUser.uid,
              fullName: currentUser.displayName || 'Admin',
              email: currentUser.email,
              role: 'admin',
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'users', currentUser.uid), adminUser);
            setUserRole('admin');
            setUserProfile(adminUser);
          } else {
            // Default role for others if not in DB (shouldn't happen with Admin Panel management)
            setUserRole('viewer');
            setUserProfile({
              uid: currentUser.uid,
              fullName: currentUser.displayName || 'Viewer',
              email: currentUser.email || '',
              role: 'viewer',
              createdAt: new Date().toISOString()
            });
          }
        }
      } else {
        setUserRole(null);
        setUserProfile(null);
      }
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Real-time Listeners
  useEffect(() => {
    if (!user) return;

    // Test connection
    const testConnection = async (retries = 3) => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          if (retries > 0) {
            console.warn(`Connection test failed (offline), retrying... (${retries} left)`);
            setTimeout(() => testConnection(retries - 1), 2000);
          } else {
            console.error("Please check your Firebase configuration.");
          }
        }
      }
    };
    testConnection();

    const unsubEntries = onSnapshot(query(collection(db, 'entries'), orderBy('date', 'desc')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as LedgerEntry));
      // Sort by date desc, then by createdAt desc for the same date
      data.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setEntries(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'entries'));

    const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Account));
      setAccounts(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'accounts'));

    const unsubItems = onSnapshot(collection(db, 'transactionItems'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TransactionItem));
      setTransactionItems(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transactionItems'));

    const unsubSubs = onSnapshot(collection(db, 'transactionSubCategories'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TransactionSubCategory));
      setTransactionSubCategories(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transactionSubCategories'));

    const unsubPartners = onSnapshot(collection(db, 'partners'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Partner));
      setPartners(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'partners'));

    const unsubZakat = onSnapshot(doc(db, 'settings', 'zakat-settings'), (snapshot) => {
      if (snapshot.exists()) {
        setZakatSettings(snapshot.data() as ZakatSettings);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/zakat-settings'));

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Employee));
      setEmployees(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'employees'));

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client));
      setClients(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'clients'));

    return () => {
      unsubEntries();
      unsubAccounts();
      unsubItems();
      unsubSubs();
      unsubPartners();
      unsubZakat();
      unsubEmployees();
      unsubClients();
    };
  }, [user]);

  // Migration from localStorage to Firestore
  useEffect(() => {
    const migrate = async () => {
      if (!user || userRole !== 'admin') return;
      
      const entriesSnapshot = await getDocs(collection(db, 'entries'));
      if (!entriesSnapshot.empty) return; // Already migrated or has data

      const localEntries = localStorage.getItem('triloy_ledger_entries');
      const localAccounts = localStorage.getItem('triloy_accounts_pool');
      const localItems = localStorage.getItem('triloy_transaction_items_pool');
      const localSubs = localStorage.getItem('triloy_transaction_sub_categories_pool');

      if (localEntries || localAccounts || localItems || localSubs) {
        console.log('Starting migration to Firestore...');
        const batch = writeBatch(db);

        if (localEntries) {
          const parsed = JSON.parse(localEntries) as LedgerEntry[];
          parsed.forEach(e => batch.set(doc(db, 'entries', e.id), e));
        }
        if (localAccounts) {
          const parsed = JSON.parse(localAccounts) as Account[];
          parsed.forEach(a => batch.set(doc(db, 'accounts', a.id), a));
        }
        if (localItems) {
          const parsed = JSON.parse(localItems) as TransactionItem[];
          parsed.forEach(i => batch.set(doc(db, 'transactionItems', i.id), i));
        }
        if (localSubs) {
          const parsed = JSON.parse(localSubs) as TransactionSubCategory[];
          parsed.forEach(s => batch.set(doc(db, 'transactionSubCategories', s.id), s));
        }

        await batch.commit();
        console.log('Migration complete.');
      }
    };
    migrate();
  }, [user]);

  const totals = useMemo<LedgerTotals>(() => {
    return entries.reduce(
      (acc, entry) => {
        let entryAssets = 0;
        let entryLiabilities = 0;
        let entryEquity = 0;

        (entry.customEntries || []).forEach(ce => {
          if (ce.accountCategory === 'Asset') {
            entryAssets += ce.type === 'Dr' ? ce.amount : -ce.amount;
          } else if (ce.accountCategory === 'Liability') {
            entryLiabilities += ce.type === 'Cr' ? ce.amount : -ce.amount;
          } else if (ce.accountCategory === 'Equity') {
            entryEquity += ce.type === 'Cr' ? ce.amount : -ce.amount;
          }
        });

        return {
          assets: acc.assets + entryAssets,
          liabilities: acc.liabilities + entryLiabilities,
          equity: acc.equity + entryEquity,
        };
      },
      { assets: 0, liabilities: 0, equity: 0 }
    );
  }, [entries]);

  const chartData = [
    { name: 'Assets', value: totals.assets, color: '#10b981' },
    { name: 'Liabilities', value: totals.liabilities, color: '#f43f5e' },
    { name: 'Equity', value: totals.equity, color: '#6366f1' },
  ].filter(d => d.value > 0);

  const trendData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningAssets = 0;
    let runningLiabilities = 0;
    
    return sorted.map(entry => {
      let entryAssets = 0;
      let entryLiabilities = 0;

      (entry.customEntries || []).forEach(ce => {
        if (ce.accountCategory === 'Asset') {
          entryAssets += ce.type === 'Dr' ? ce.amount : -ce.amount;
        } else if (ce.accountCategory === 'Liability') {
          entryLiabilities += ce.type === 'Cr' ? ce.amount : -ce.amount;
        }
      });

      runningAssets += entryAssets;
      runningLiabilities += entryLiabilities;
      return {
        date: entry.date,
        assets: runningAssets,
        liabilities: runningLiabilities,
      };
    });
  }, [entries]);

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; revenue: number; expense: number; netIncome: number; cumulativeNetIncome: number }> = {};
    
    // Initialize months from Jan 2026 to current month
    const startYear = 2026;
    const startMonth = 0; // January
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let iterYear = startYear;
    let iterMonth = startMonth;

    while (iterYear < currentYear || (iterYear === currentYear && iterMonth <= currentMonth)) {
      const date = new Date(iterYear, iterMonth, 1);
      const monthKey = `${iterYear}-${String(iterMonth + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months[monthKey] = { month: monthLabel, revenue: 0, expense: 0, netIncome: 0, cumulativeNetIncome: 0 };
      
      iterMonth++;
      if (iterMonth > 11) {
        iterMonth = 0;
        iterYear++;
      }
    }
    
    entries.forEach(entry => {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (months[monthKey]) {
        let entryRevenue = 0;
        let entryExpense = 0;

        (entry.customEntries || []).forEach(ce => {
          if (ce.accountCategory === 'Equity') {
            const name = ce.accountName.toLowerCase();
            if (name.includes('revenue') || name.includes('income') || name.includes('sales')) {
              entryRevenue += ce.type === 'Cr' ? ce.amount : -ce.amount;
            } else if (name.includes('expense') || name.includes('cost')) {
              entryExpense += ce.type === 'Dr' ? ce.amount : -ce.amount;
            }
          }
        });

        months[monthKey].revenue += entryRevenue;
        months[monthKey].expense += entryExpense;
        months[monthKey].netIncome = months[monthKey].revenue - months[monthKey].expense;
      }
    });
    
    const sortedData = Object.entries(months)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([_, data]) => data);

    let runningNetIncome = 0;
    return sortedData.map(data => {
      runningNetIncome += data.netIncome;
      return { ...data, cumulativeNetIncome: runningNetIncome };
    });
  }, [entries]);

  const currentMonthPerformance = useMemo(() => {
    const now = new Date();
    const monthLabel = now.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return monthlyData.find(d => d.month === monthLabel) || { revenue: 0, expense: 0, netIncome: 0 };
  }, [monthlyData]);

  const filteredEntries = entries.filter(e => 
    e.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.remarks.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.date.includes(searchTerm)
  );

  const handleAddEntry = (entry: LedgerEntry) => {
    setEntries(prev => [entry, ...prev]);
  };

  const handleSaveEntry = async (entry: LedgerEntry) => {
    try {
      await setDoc(doc(db, 'entries', entry.id), entry);
      setEditingEntry(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `entries/${entry.id}`);
    }
  };

  const handleImport = async (newEntries: LedgerEntry[]) => {
    try {
      const batch = writeBatch(db);
      newEntries.forEach(e => batch.set(doc(db, 'entries', e.id), e));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'entries (batch import)');
    }
  };

  const handleDelete = (id: string) => {
    setEntryToDelete(id);
  };

  const confirmDelete = async () => {
    if (entryToDelete) {
      try {
        await deleteDoc(doc(db, 'entries', entryToDelete));
        setEntryToDelete(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `entries/${entryToDelete}`);
      }
    }
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(entries);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `TriloyTech_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadMonthlyXLS = () => {
    const data = monthlyData.map(d => ({
      Month: d.month,
      Revenue: d.revenue,
      Expense: d.expense,
      'Net Income': d.netIncome,
      'Cumulative Net Income': d.cumulativeNetIncome
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Performance');
    XLSX.writeFile(wb, `Monthly_Performance_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadMonthlyPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Monthly Performance Summary', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    const header = [['Month', 'Revenue', 'Expense', 'Net Income', 'Cumulative']];
    const rows = monthlyData.map(d => [
      d.month,
      formatCurrency(d.revenue, true),
      formatCurrency(d.expense, true),
      formatCurrency(d.netIncome, true),
      formatCurrency(d.cumulativeNetIncome, true)
    ]);

    autoTable(doc, {
      startY: 35,
      head: header,
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`Monthly_Performance_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const handleClearAll = async () => {
    try {
      const batch = writeBatch(db);
      entries.forEach(e => batch.delete(doc(db, 'entries', e.id)));
      await batch.commit();
      setIsClearModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'entries (clear all)');
    }
  };

  const SidebarContent = () => (
    <>
      <div className="p-6 flex items-center gap-3 border-b border-slate-100">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
          <Building2 size={24} />
        </div>
        <div>
          <h1 className="font-bold text-slate-900 leading-tight">TriloyTech</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accounting</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto sidebar-scrollbar">
        <button 
          onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <LayoutDashboard size={20} />
          Dashboard
        </button>
        <button 
          onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <History size={20} />
          Transactions
        </button>
        <button 
          onClick={() => { setActiveTab('balance-sheet'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'balance-sheet' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <FileText size={20} />
          Balance Sheet
        </button>
        <button 
          onClick={() => { setActiveTab('monthly-balance-sheet'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'monthly-balance-sheet' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Calendar size={20} />
          Monthly Balance Sheet
        </button>
        <button 
          onClick={() => { setActiveTab('trial-balance'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'trial-balance' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Receipt size={20} />
          Trial Balance
        </button>
        <button 
          onClick={() => { setActiveTab('monthly-p-and-l'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'monthly-p-and-l' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <TrendingUp size={20} />
          Monthly P&L
        </button>
        <button 
          onClick={() => { setActiveTab('expense'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'expense' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Receipt size={20} />
          Expense Report
        </button>
        <button 
          onClick={() => { setActiveTab('categorized-expense'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'categorized-expense' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <TrendingDown size={20} />
          Categorized Expense
        </button>
        <button 
          onClick={() => { setActiveTab('salary'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'salary' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Users size={20} />
          Salary Report
        </button>
        <button 
          onClick={() => { setActiveTab('financial-report'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'financial-report' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <FileText size={20} />
          Financial Report
        </button>
        <button 
          onClick={() => { setActiveTab('employees'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'employees' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Database size={20} />
          Employee Database
        </button>
        <button 
          onClick={() => { setActiveTab('owners-capital'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'owners-capital' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ArrowLeftRight size={20} />
          Owner's Capital
        </button>
        <button 
          onClick={() => { setActiveTab('zakat'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'zakat' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Calculator size={20} />
          Zakat Calculation
        </button>
        <button 
          onClick={() => { setActiveTab('accounts-payable'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'accounts-payable' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <CreditCard size={20} />
          Accounts Payable
        </button>
        <button 
          onClick={() => { setActiveTab('accounts-receivable'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'accounts-receivable' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <TrendingUp size={20} />
          Accounts Receivable
        </button>
        <button 
          onClick={() => { setActiveTab('payments-mgmt'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'payments-mgmt' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <CreditCard size={20} />
          Client Payments
        </button>
        <button 
          onClick={() => { setActiveTab('project-clients'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'project-clients' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Users size={20} />
          Project/Client Database
        </button>
        <button 
          onClick={() => { setActiveTab('accounts'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'accounts' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Database size={20} />
          Transaction Item Pool
        </button>
        <button 
          onClick={() => { setActiveTab('backup'); setIsMobileMenuOpen(false); }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'backup' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <History size={20} />
          Backup & Restore
        </button>

        {userRole === 'admin' && (
          <button 
            onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Shield size={20} />
            Admin Panel
          </button>
        )}

        <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl font-medium transition-all">
          <Settings size={20} />
          Settings
        </button>

        <div className="pt-2 mt-2 border-t border-slate-100 space-y-2">
          {userRole === 'admin' && (
            <button 
              onClick={() => { setIsClearModalOpen(true); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl font-medium transition-all"
            >
              <Trash2 size={20} />
              Clear All Data
            </button>
          )}

          {userProfile && (
            <div className="px-4 py-2 mt-2 border-t border-slate-50 pt-4">
              <p className="text-sm font-bold text-slate-700 truncate">{userProfile.fullName}</p>
              <p className="text-[10px] font-medium text-slate-400 truncate">{userProfile.email}</p>
            </div>
          )}

          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-50 rounded-xl font-medium transition-all"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!userRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex print:bg-white">
      {/* Clear All Confirmation Modal */}
      <AnimatePresence>
        {isClearModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 my-auto relative"
            >
              <div className="flex items-center gap-4 text-rose-600">
                <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Clear All Data?</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                This will permanently delete <span className="font-bold text-slate-900">{entries.length}</span> transactions. This action cannot be undone.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsClearModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-rose-200"
                >
                  Yes, Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Single Transaction Confirmation Modal */}
      <AnimatePresence>
        {entryToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 my-auto relative"
            >
              <div className="flex items-center gap-4 text-rose-600">
                <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-xl font-bold">Delete Transaction?</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Are you sure you want to delete this transaction? This action cannot be undone.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEntryToDelete(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-rose-200"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-[70] flex flex-col lg:hidden shadow-2xl"
            >
              <div className="absolute right-4 top-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex-col hidden lg:flex print:hidden">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 print:hidden">
          <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 lg:py-4 flex items-center justify-between gap-3 lg:gap-4">
            <div className="flex items-center gap-2 lg:hidden">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <Menu size={24} />
              </button>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Building2 size={18} />
              </div>
            </div>

            <div className="flex items-center gap-2 lg:gap-4 flex-1 max-w-xl">
              {activeTab === 'history' && (
                <>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl outline-none transition-all text-sm"
                    />
                  </div>
                  <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                    <Filter size={18} />
                  </button>
                </>
              )}
            </div>

            {activeTab === 'history' && userRole === 'admin' && (
              <div className="flex items-center gap-2 lg:gap-3">
                <ExcelImport 
                  onImport={handleImport} 
                  accounts={accounts} 
                  transactionItems={transactionItems} 
                  transactionSubCategories={transactionSubCategories} 
                  clients={clients}
                />
                <button
                  onClick={() => setIsClearModalOpen(true)}
                  className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all font-medium border border-rose-200"
                  title="Clear All Data"
                >
                  <RotateCcw size={18} />
                  <span className="hidden lg:inline">Clear All</span>
                </button>
                <EntryForm onSave={handleSaveEntry} accounts={accounts} transactionItems={transactionItems} transactionSubCategories={transactionSubCategories} clients={clients} />
                {editingEntry && (
                  <EntryForm 
                    onSave={handleSaveEntry} 
                    initialData={editingEntry} 
                    onClose={() => setEditingEntry(null)} 
                    accounts={accounts}
                    transactionItems={transactionItems}
                    transactionSubCategories={transactionSubCategories}
                    clients={clients}
                  />
                )}
              </div>
            )}
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 lg:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4"
          >
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-slate-900 mb-1">
                {activeTab === 'dashboard' ? 'Financial Dashboard' : 
                 activeTab === 'history' ? 'Transaction History' : 
                 activeTab === 'balance-sheet' ? 'Balance Sheet' : 
                 activeTab === 'monthly-balance-sheet' ? 'Monthly Balance Sheet' : 
                 activeTab === 'trial-balance' ? 'Trial Balance' : 
                 activeTab === 'monthly-p-and-l' ? 'Monthly P&L' : 
                 activeTab === 'expense' ? 'Expense Report' : 
                 activeTab === 'categorized-expense' ? 'Categorized Expense' : 
                 activeTab === 'salary' ? ' Salary Report' : 
                 activeTab === 'owners-capital' ? 'Owner’s Contribution' :
                 activeTab === 'zakat' ? 'Zakat Calculation' :
                 activeTab === 'accounts-payable' ? 'Accounts Payable' :
                 activeTab === 'accounts-receivable' ? 'Accounts Receivable' :
                 activeTab === 'backup' ? 'Backup & Restore' :
                 activeTab === 'payments-mgmt' ? 'Client/Project Payment Management' :
                 activeTab === 'admin' ? 'Admin Panel' :
                 activeTab === 'employees' ? 'Employee Management System' :
                 'Project/Client Management System'}
              </h2>
              <p className="text-slate-500">
                {activeTab === 'dashboard' ? 'Visual analysis of your company\'s financial performance.' : 
                 activeTab === 'history' ? 'Detailed record of all financial activities for TriloyTech.' : 
                 activeTab === 'balance-sheet' ? 'Statement of financial position as of the current date.' : 
                 activeTab === 'monthly-balance-sheet' ? 'Monthly breakdown of financial position.' : 
                 activeTab === 'trial-balance' ? 'Summary of all ledger balances to verify accounting accuracy.' : 
                 activeTab === 'monthly-p-and-l' ? 'Monthly breakdown of revenue, expenses and profit.' : 
                 activeTab === 'expense' ? 'Detailed breakdown of company expenditures by month.' : 
                 activeTab === 'categorized-expense' ? 'Categorized breakdown of monthly expenses.' : 
                 activeTab === 'salary' ? ' Monthly breakdown of salary disbursements' : 
                 activeTab === 'owners-capital' ? 'Owner’s Investment Management.' :
                 activeTab === 'zakat' ? 'Calculate and track your Zakat obligations.' :
                 activeTab === 'accounts-payable' ? 'Track pending payments to vendors and suppliers from remarks.' :
                 activeTab === 'accounts-receivable' ? 'Track pending collections from projects and clients from remarks.' :
                 activeTab === 'backup' ? 'Manage data backups and restore' :
                 activeTab === 'payments-mgmt' ? 'Manage clients, invoices, and project payments.' :
                 activeTab === 'admin' ? 'Manage team members and system access.' :
                 activeTab === 'employees' ? 'Manage employee information.' :
                 'Manage project/client information.'}
              </p>
            </div>
            <div className="text-right hidden md:block">
              <div className="flex items-center gap-3 justify-end mb-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  userRole === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {userRole}
                </span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Period</p>
              </div>
              <p className="text-lg font-bold text-indigo-600">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </motion.div>

          {activeTab === 'balance-sheet' && <SummaryCards totals={totals} />}

          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    {/* Monthly Revenue vs Expense Bar Chart */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800">Monthly Revenue vs Expense</h3>
                        <div className="flex items-center gap-4 text-xs font-semibold">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-slate-500">Revenue</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="text-slate-500">Expense</span>
                          </div>
                        </div>
                      </div>
                      <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="month" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 12 }}
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#94a3b8', fontSize: 12 }}
                              tickFormatter={(value) => formatCurrency(value)}
                            />
                            <Tooltip 
                              formatter={(value: number) => [formatCurrency(value), '']}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Monthly Performance Summary Table */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="font-bold text-slate-800">Monthly Performance Summary</h3>
                          <p className="text-xs text-slate-500 font-medium">Tabular view of financial trends</p>
                        </div>
                        {userRole === 'admin' && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={downloadMonthlyXLS}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors"
                            >
                              <Download size={14} />
                              XLS
                            </button>
                            <button 
                              onClick={downloadMonthlyPDF}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors"
                            >
                              <FileText size={14} />
                              PDF
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Month</th>
                              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Expense</th>
                              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Net Income</th>
                              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Cumulative Net Income</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {monthlyData.map((data, idx) => (
                              <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                                <td className="py-4 text-sm font-semibold text-slate-700">{data.month}</td>
                                <td className="py-4 text-sm font-medium text-emerald-600 text-right">{formatCurrency(data.revenue)}</td>
                                <td className="py-4 text-sm font-medium text-rose-600 text-right">{formatCurrency(data.expense)}</td>
                                <td className={cn(
                                  "py-4 text-sm font-bold text-right",
                                  data.netIncome >= 0 ? "text-indigo-600" : "text-rose-600"
                                )}>
                                  {formatCurrency(data.netIncome)}
                                </td>
                                <td className={cn(
                                  "py-4 text-sm font-bold text-right",
                                  data.cumulativeNetIncome >= 0 ? "text-indigo-600" : "text-rose-600"
                                )}>
                                  {formatCurrency(data.cumulativeNetIncome)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Project Revenue Table */}
                    <ProjectRevenue entries={entries} userRole={userRole} />
                  </div>

                  <div className="space-y-8">
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'history' ? (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Recent Transactions</h3>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {filteredEntries.length} Records
                  </span>
                </div>
                <LedgerTable 
                  entries={filteredEntries} 
                  onDelete={handleDelete} 
                  onEdit={(entry) => setEditingEntry(entry)}
                  userRole={userRole || 'viewer'}
                />
              </motion.div>
            ) : activeTab === 'balance-sheet' ? (
              <motion.div
                key="balance-sheet"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <BalanceSheet entries={entries} userRole={userRole} />
              </motion.div>
            ) : activeTab === 'monthly-balance-sheet' ? (
              <motion.div
                key="monthly-balance-sheet"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <MonthlyBalanceSheet entries={entries} userRole={userRole} />
              </motion.div>
            ) : activeTab === 'trial-balance' ? (
              <motion.div
                key="trial-balance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <TrialBalance entries={entries} userRole={userRole} accounts={accounts} />
              </motion.div>
            ) : activeTab === 'monthly-p-and-l' ? (
              <motion.div
                key="monthly-p-and-l"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <MonthlyPandL entries={entries} userRole={userRole} />
              </motion.div>
            ) : activeTab === 'expense' ? (
              <motion.div
                key="expense"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <ExpenseReport entries={entries} userRole={userRole} />
              </motion.div>
            ) : activeTab === 'categorized-expense' ? (
              <motion.div
                key="categorized-expense"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <CategorizedExpense entries={entries} />
              </motion.div>
            ) : activeTab === 'salary' ? (
              <motion.div
                key="salary"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <SalaryReport entries={entries} userRole={userRole} employees={employees} />
              </motion.div>
            ) : activeTab === 'financial-report' ? (
              <motion.div
                key="financial-report"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <FinancialReport entries={entries} clients={clients} />
              </motion.div>
            ) : activeTab === 'owners-capital' ? (
              <motion.div
                key="owners-capital"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <OwnersCapital 
                  entries={entries} 
                  partners={partners} 
                />
              </motion.div>
            ) : activeTab === 'zakat' ? (
              <motion.div
                key="zakat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <ZakatCalculation 
                  entries={entries} 
                  settings={zakatSettings}
                  onUpdateSettings={async (s) => {
                    try {
                      await setDoc(doc(db, 'settings', s.id), s);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `settings/${s.id}`);
                    }
                  }}
                  userRole={userRole || 'viewer'}
                />
              </motion.div>
            ) : activeTab === 'accounts-payable' ? (
              <motion.div
                key="accounts-payable"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <AccountsPayable 
                  entries={entries} 
                  accounts={accounts}
                  userRole={userRole || 'viewer'}
                />
              </motion.div>
            ) : activeTab === 'accounts-receivable' ? (
              <motion.div
                key="accounts-receivable"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <AccountsReceivable 
                  entries={entries} 
                  accounts={accounts}
                  userRole={userRole || 'viewer'}
                />
              </motion.div>
            ) : activeTab === 'backup' ? (
              <motion.div
                key="backup"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <FullDatabaseBackup userRole={userRole || 'viewer'} />
              </motion.div>
            ) : activeTab === 'payments-mgmt' ? (
              <motion.div
                key="payments-mgmt"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <PaymentManagement userRole={userRole || 'viewer'} />
              </motion.div>
            ) : activeTab === 'project-clients' ? (
              <motion.div
                key="project-clients"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <ProjectClientDatabase 
                  userRole={userRole || 'viewer'} 
                  transactionSubCategories={transactionSubCategories}
                  onAddTransactionSubCategory={async (sub) => {
                    try {
                      await setDoc(doc(db, 'transactionSubCategories', sub.id), sub);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `transactionSubCategories/${sub.id}`);
                    }
                  }}
                />
              </motion.div>
            ) : activeTab === 'employees' ? (
              <motion.div
                key="employees"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <EmployeeDatabase employees={employees} userRole={userRole} />
              </motion.div>
            ) : activeTab === 'admin' ? (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <AdminPanel userRole={userRole} />
              </motion.div>
            ) : (
              <motion.div
                key="accounts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <AccountsPool 
                  accounts={accounts} 
                  userRole={userRole || 'viewer'}
                  onAdd={async (acc) => {
                    try {
                      await setDoc(doc(db, 'accounts', acc.id), acc);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `accounts/${acc.id}`);
                    }
                  }}
                  onDelete={async (id) => {
                    try {
                      await deleteDoc(doc(db, 'accounts', id));
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `accounts/${id}`);
                    }
                  }}
                  transactionItems={transactionItems}
                  onAddTransactionItem={async (item) => {
                    try {
                      await setDoc(doc(db, 'transactionItems', item.id), item);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `transactionItems/${item.id}`);
                    }
                  }}
                  onDeleteTransactionItem={async (id) => {
                    try {
                      await deleteDoc(doc(db, 'transactionItems', id));
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `transactionItems/${id}`);
                    }
                  }}
                  transactionSubCategories={transactionSubCategories}
                  onAddTransactionSubCategory={async (sub) => {
                    try {
                      await setDoc(doc(db, 'transactionSubCategories', sub.id), sub);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `transactionSubCategories/${sub.id}`);
                    }
                  }}
                  onDeleteTransactionSubCategory={async (id) => {
                    try {
                      await deleteDoc(doc(db, 'transactionSubCategories', id));
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `transactionSubCategories/${id}`);
                    }
                  }}
                  clients={clients}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

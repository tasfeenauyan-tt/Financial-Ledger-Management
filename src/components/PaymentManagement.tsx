import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { Client, Invoice, PaymentRecord, InvoiceItem, BankAccount } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  Users, 
  FileText, 
  CreditCard, 
  LayoutDashboard, 
  Plus, 
  Search, 
  Download, 
  FileJson, 
  List,
  Trash2, 
  Edit, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Printer,
  X,
  Building2,
  Eye,
  ShieldAlert,
  Filter,
  Calendar,
  RotateCcw,
  Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function getOrdinalLabel(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " Installment";
}

export function getInstallmentBreakdown(invoice: Invoice) {
  let installments = invoice.installments;

  if (!installments || installments.length === 0) {
    const planCount = parseInt(invoice.installmentPlan || '1') || 1;
    if (planCount > 1) {
      const base = Math.floor(invoice.totalAmount / planCount);
      const rem = invoice.totalAmount - (base * planCount);
      installments = Array.from({ length: planCount }, (_, i) => ({
        number: i + 1,
        label: getOrdinalLabel(i + 1),
        amount: i === planCount - 1 ? base + rem : base,
        dueDate: invoice.dueDate
      }));
    } else {
      installments = [
        { number: 1, label: '1st Installment', amount: invoice.totalAmount, dueDate: invoice.dueDate }
      ];
    }
  }

  let remPaid = invoice.paidAmount || 0;
  return installments.map((inst, idx) => {
    const instAmount = Number(inst.amount) || 0;
    const paid = Math.min(remPaid, instAmount);
    remPaid = Math.max(0, remPaid - paid);
    const balance = Math.max(0, instAmount - paid);
    let status: 'Paid' | 'Partial' | 'Unpaid' = 'Unpaid';
    if (paid >= instAmount && instAmount > 0) {
      status = 'Paid';
    } else if (paid > 0) {
      status = 'Partial';
    }
    return {
      number: inst.number || idx + 1,
      label: inst.label || getOrdinalLabel(idx + 1),
      amount: instAmount,
      dueDate: inst.dueDate || invoice.dueDate,
      paidAmount: paid,
      balanceDue: balance,
      status
    };
  });
}

interface PaymentManagementProps {
  userRole: string;
}

export default function PaymentManagement({ userRole }: PaymentManagementProps) {
  const isAdmin = userRole === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'clients' | 'invoices' | 'payments' | 'bank-accounts' | 'clients-status'>('dashboard');
  
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);

  const [isBankAccountModalOpen, setIsBankAccountModalOpen] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccount | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<'client' | 'invoice' | 'bankAccount' | 'payment' | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Invoices Module Filters State
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>('ALL');
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState<string>('');
  const [invoiceClientFilter, setInvoiceClientFilter] = useState<string>('ALL');
  const [invoiceStartDateFilter, setInvoiceStartDateFilter] = useState<string>('');
  const [invoiceEndDateFilter, setInvoiceEndDateFilter] = useState<string>('');

  useEffect(() => {
    const unsubClients = onSnapshot(query(collection(db, 'clients'), orderBy('createdAt', 'desc')), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'clients'));

    const unsubInvoices = onSnapshot(query(collection(db, 'invoices'), orderBy('createdAt', 'desc')), (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'invoices'));

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), orderBy('createdAt', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentRecord)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'payments'));

    const unsubBankAccounts = onSnapshot(query(collection(db, 'bankAccounts'), orderBy('createdAt', 'desc')), (snapshot) => {
      setBankAccounts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BankAccount)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'bankAccounts'));

    return () => {
      unsubClients();
      unsubInvoices();
      unsubPayments();
      unsubBankAccounts();
    };
  }, []);

  // Dashboard Stats
  const stats = useMemo(() => {
    // Only count invoices that are NOT carry forwarded for the totals to avoid double counting
    const activeInvoices = invoices.filter(inv => inv.status !== 'Carry Forward');
    const cfInvoices = invoices.filter(inv => inv.status === 'Carry Forward');
    
    // Total Invoiced (Revenue) = Active Invoices Total + Paid portion of Carry Forwarded Invoices
    // This correctly captures all unique billed items without double counting the carried balance
    const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0) + 
                         cfInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    
    // Total Received = All payments across all invoices (including those that were later carried forward)
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    
    // Total Bad Debt = Sum of badDebtAmount across all invoices
    const totalBadDebt = invoices.reduce((sum, inv) => sum + (inv.badDebtAmount || 0), 0);
    
    const totalOutstanding = totalInvoiced - totalPaid - totalBadDebt;
    const unpaidCount = activeInvoices.filter(inv => inv.status === 'Unpaid').length;
    const partialCount = activeInvoices.filter(inv => inv.status === 'Partial').length;
    
    return { totalInvoiced, totalPaid, totalOutstanding, totalBadDebt, unpaidCount, partialCount };
  }, [invoices]);

  // Clients Payment Status Summary
  const clientSummary = useMemo(() => {
    const sortedClients = [...clients].sort((a, b) => a.projectName.localeCompare(b.projectName));
    return sortedClients.map((client, index) => {
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
      const activeInvoices = clientInvoices.filter(inv => inv.status !== 'Carry Forward');
      const cfInvoices = clientInvoices.filter(inv => inv.status === 'Carry Forward');

      const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0) + 
                           cfInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
      const totalPaid = clientInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
      const totalBadDebt = clientInvoices.reduce((sum, inv) => sum + (inv.badDebtAmount || 0), 0);
      const totalDue = totalInvoiced - totalPaid - totalBadDebt;

      return {
        slNumber: index + 1,
        clientName: client.projectName,
        company: client.company,
        totalInvoiced,
        totalPaid,
        totalDue,
        totalBadDebt
      };
    });
  }, [clients, invoices]);

  // Invoices Module Filter computations & helpers
  const isInvoiceFiltered = useMemo(() => {
    return (
      invoiceStatusFilter !== 'ALL' ||
      invoiceNumberFilter.trim() !== '' ||
      invoiceClientFilter !== 'ALL' ||
      invoiceStartDateFilter !== '' ||
      invoiceEndDateFilter !== ''
    );
  }, [invoiceStatusFilter, invoiceNumberFilter, invoiceClientFilter, invoiceStartDateFilter, invoiceEndDateFilter]);

  const clearInvoiceFilters = () => {
    setInvoiceStatusFilter('ALL');
    setInvoiceNumberFilter('');
    setInvoiceClientFilter('ALL');
    setInvoiceStartDateFilter('');
    setInvoiceEndDateFilter('');
  };

  const handleDatePreset = (preset: 'this-month' | 'last-month' | 'this-year' | 'clear') => {
    if (preset === 'clear') {
      setInvoiceStartDateFilter('');
      setInvoiceEndDateFilter('');
      return;
    }
    const now = new Date();
    if (preset === 'this-month') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      setInvoiceStartDateFilter(`${year}-${month}-01`);
      setInvoiceEndDateFilter(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last-month') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonthDate.getFullYear();
      const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
      setInvoiceStartDateFilter(`${year}-${month}-01`);
      setInvoiceEndDateFilter(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'this-year') {
      const year = now.getFullYear();
      setInvoiceStartDateFilter(`${year}-01-01`);
      setInvoiceEndDateFilter(`${year}-12-31`);
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: invoices.length,
      Unpaid: 0,
      Partial: 0,
      Paid: 0,
      'Carry Forward': 0,
      'Bad Debt': 0,
    };
    invoices.forEach(inv => {
      if (counts[inv.status] !== undefined) {
        counts[inv.status]++;
      }
    });
    return counts;
  }, [invoices]);

  const invoiceClientOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    
    invoices.forEach(inv => {
      const key = inv.clientId || inv.clientName || 'unknown';
      const displayName = inv.clientName || clients.find(c => c.id === inv.clientId)?.projectName || 'Unknown Client';
      if (!map.has(key)) {
        map.set(key, { id: key, name: displayName, count: 1 });
      } else {
        map.get(key)!.count++;
      }
    });

    clients.forEach(c => {
      if (!map.has(c.id)) {
        map.set(c.id, { id: c.id, name: c.projectName || c.name, count: 0 });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // 1. Status Filter
      if (invoiceStatusFilter !== 'ALL' && inv.status !== invoiceStatusFilter) {
        return false;
      }
      // 2. Invoice Number Filter
      if (invoiceNumberFilter.trim()) {
        const query = invoiceNumberFilter.trim().toLowerCase();
        const matchesInvoice = (inv.invoiceNumber || '').toLowerCase().includes(query);
        if (!matchesInvoice) return false;
      }
      // 3. Client Filter
      if (invoiceClientFilter !== 'ALL') {
        const matchesClient = inv.clientId === invoiceClientFilter || 
                              inv.clientName === invoiceClientFilter ||
                              (inv.clientName && inv.clientName.toLowerCase() === invoiceClientFilter.toLowerCase());
        if (!matchesClient) return false;
      }
      // 4. Date Filter
      if (invoiceStartDateFilter && (inv.date || '') < invoiceStartDateFilter) {
        return false;
      }
      if (invoiceEndDateFilter && (inv.date || '') > invoiceEndDateFilter) {
        return false;
      }
      return true;
    });
  }, [invoices, invoiceStatusFilter, invoiceNumberFilter, invoiceClientFilter, invoiceStartDateFilter, invoiceEndDateFilter]);

  const filteredTotals = useMemo(() => {
    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const paidAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const badDebtAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.badDebtAmount || 0), 0);
    const dueAmount = filteredInvoices.reduce((sum, inv) => {
      const outstanding = (inv.totalAmount || 0) - (inv.paidAmount || 0) - (inv.badDebtAmount || 0);
      return sum + Math.max(0, outstanding);
    }, 0);
    return { totalAmount, paidAmount, badDebtAmount, dueAmount };
  }, [filteredInvoices]);

  const selectedClientDisplay = useMemo(() => {
    if (invoiceClientFilter === 'ALL') return '';
    const match = invoiceClientOptions.find(o => o.id === invoiceClientFilter);
    return match ? match.name : invoiceClientFilter;
  }, [invoiceClientFilter, invoiceClientOptions]);

  // Handlers
  const handleSaveClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const crmId = editingClient?.crmLeadId || ('LEAD-' + Math.floor(Math.random() * 10000));
    
    const clientData: Client = {
      id: editingClient?.id || crypto.randomUUID(),
      projectName: editingClient?.projectName || `${name} (${crmId})`,
      crmLeadId: crmId,
      name,
      pocName: editingClient?.pocName || (formData.get('name') as string),
      company: formData.get('company') as string || '',
      mobile: formData.get('mobile') as string || '',
      email: formData.get('email') as string || '',
      address: formData.get('address') as string || '',
      country: editingClient?.country || 'Bangladesh',
      clientType: editingClient?.clientType || 'Recurring',
      status: editingClient?.status || 'Active',
      budget: editingClient?.budget || 0,
      onboardingDate: editingClient?.onboardingDate || new Date().toISOString().split('T')[0],
      leadSource: editingClient?.leadSource || 'Others',
      createdAt: editingClient?.createdAt || new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'clients', clientData.id), clientData);
      setIsClientModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error saving client:", error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteType || !itemToDelete) return;
    try {
      if (deleteType === 'invoice') {
        const invoiceToDelete = invoices.find(inv => inv.id === itemToDelete);
        if (invoiceToDelete) {
          const batch = writeBatch(db);
          
          // Revert Carry Forward status for previous invoices that were linked to this one
          const relatedInvoices = invoices.filter(inv => inv.carriedToInvoiceNumber === invoiceToDelete.invoiceNumber);
          relatedInvoices.forEach(inv => {
            const status = inv.paidAmount >= inv.totalAmount ? 'Paid' : inv.paidAmount > 0 ? 'Partial' : 'Unpaid';
            batch.update(doc(db, 'invoices', inv.id), {
              status: status,
              carriedToInvoiceNumber: deleteField()
            });
          });
          
          // Delete all payment records associated with this invoice
          const relatedPayments = payments.filter(p => p.invoiceId === invoiceToDelete.id || (p.invoiceNumber && p.invoiceNumber === invoiceToDelete.invoiceNumber));
          relatedPayments.forEach(p => {
            batch.delete(doc(db, 'payments', p.id));
          });

          batch.delete(doc(db, 'invoices', itemToDelete));
          await batch.commit();
        }
      } else if (deleteType === 'payment') {
        const paymentToDelete = payments.find(p => p.id === itemToDelete);
        if (paymentToDelete) {
          const invoice = invoices.find(inv => inv.id === paymentToDelete.invoiceId);
          const batch = writeBatch(db);
          
          if (invoice) {
            const newPaidAmount = Math.max(0, invoice.paidAmount - paymentToDelete.amount);
            let newStatus: 'Unpaid' | 'Partial' | 'Paid' = 'Unpaid';
            if (newPaidAmount >= invoice.totalAmount) {
              newStatus = 'Paid';
            } else if (newPaidAmount > 0) {
              newStatus = 'Partial';
            }
            
            batch.update(doc(db, 'invoices', invoice.id), {
              paidAmount: newPaidAmount,
              status: newStatus
            });
          }
          
          batch.delete(doc(db, 'payments', itemToDelete));
          await batch.commit();
        }
      } else {
        const collectionName = deleteType === 'client' ? 'clients' : 
                              deleteType === 'bankAccount' ? 'bankAccounts' : 
                              'invoices';
        await deleteDoc(doc(db, collectionName, itemToDelete));
      }
      setIsDeleteConfirmOpen(false);
      setDeleteType(null);
      setItemToDelete(null);
    } catch (error) {
      console.error(`Error deleting ${deleteType}:`, error);
    }
  };

  const handleSaveInvoice = async (invoice: Invoice, carryForwardIds?: string[]) => {
    try {
      const batch = writeBatch(db);
      
      // Filter existing payments that belong specifically to this invoice ID
      const existingPayments = payments.filter(p => p.invoiceId === invoice.id);
      const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);

      // Clean up any orphaned payments in Firestore matching this invoice number that belonged to a deleted invoice
      const orphanedPayments = payments.filter(
        p => p.invoiceNumber === invoice.invoiceNumber && 
             p.invoiceId !== invoice.id && 
             !invoices.some(inv => inv.id === p.invoiceId)
      );
      orphanedPayments.forEach(p => {
        batch.delete(doc(db, 'payments', p.id));
      });
      
      const updatedInvoice: Invoice = {
        ...invoice,
        paidAmount: totalPaid,
        status: totalPaid >= invoice.totalAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : (invoice.status === 'Carry Forward' ? 'Carry Forward' : 'Unpaid')
      };

      batch.set(doc(db, 'invoices', updatedInvoice.id), updatedInvoice);
      
      // Update existing payments to point to the new invoice ID/number if needed
      existingPayments.forEach(p => {
        if (p.invoiceId !== updatedInvoice.id || p.invoiceNumber !== updatedInvoice.invoiceNumber) {
          batch.update(doc(db, 'payments', p.id), { 
            invoiceId: updatedInvoice.id,
            invoiceNumber: updatedInvoice.invoiceNumber
          });
        }
      });
      
      if (carryForwardIds && carryForwardIds.length > 0) {
        carryForwardIds.forEach(id => {
          batch.update(doc(db, 'invoices', id), {
            status: 'Carry Forward',
            carriedToInvoiceNumber: invoice.invoiceNumber
          });
        });
      }
      
      await batch.commit();
      setIsInvoiceModalOpen(false);
      setEditingInvoice(null);
    } catch (error) {
      console.error("Error saving invoice:", error);
    }
  };

  const handleSavePayment = async (payment: PaymentRecord, invoice: Invoice) => {
    try {
      const batch = writeBatch(db);
      
      // Add payment record
      batch.set(doc(db, 'payments', payment.id), {
        ...payment,
        invoiceNumber: invoice.invoiceNumber
      });

      // Update invoice
      const newPaidAmount = invoice.paidAmount + payment.amount;
      const newBadDebtAmount = (invoice.badDebtAmount || 0) + (payment.badDebtAmount || 0);
      
      let newStatus: 'Unpaid' | 'Partial' | 'Paid' | 'Bad Debt' = 'Partial';
      if (newPaidAmount + newBadDebtAmount >= invoice.totalAmount) {
        newStatus = newBadDebtAmount > 0 && newPaidAmount < invoice.totalAmount ? 'Bad Debt' : 'Paid';
      } else if (newPaidAmount <= 0 && newBadDebtAmount <= 0) {
        newStatus = 'Unpaid';
      }

      batch.update(doc(db, 'invoices', invoice.id), {
        paidAmount: newPaidAmount,
        badDebtAmount: newBadDebtAmount,
        status: newStatus
      });

      await batch.commit();
      setIsPaymentModalOpen(false);
      setSelectedInvoiceForPayment(null);
    } catch (error) {
      console.error("Error recording payment:", error);
    }
  };

  const handleDeleteInvoice = (id: string) => {
    setDeleteType('invoice');
    setItemToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleSaveBankAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const bankData: BankAccount = {
      id: editingBankAccount?.id || crypto.randomUUID(),
      accountTitleName: formData.get('accountTitleName') as string,
      accountName: formData.get('accountName') as string,
      accountNumber: formData.get('accountNumber') as string,
      bankName: formData.get('bankName') as string,
      branchName: formData.get('branchName') as string,
      routingNumber: formData.get('routingNumber') as string,
      createdAt: editingBankAccount?.createdAt || new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'bankAccounts', bankData.id), bankData);
      setIsBankAccountModalOpen(false);
      setEditingBankAccount(null);
    } catch (error) {
      console.error("Error saving bank account:", error);
    }
  };

  const handleDeleteBankAccount = (id: string) => {
    setDeleteType('bankAccount');
    setItemToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const downloadInvoicesXLS = () => {
    const data = filteredInvoices.map(inv => ({
      'Invoice #': inv.invoiceNumber,
      'Client': inv.clientName,
      'Service Date': inv.serviceDate || '-',
      'Date': inv.date,
      'Due Date': inv.dueDate,
      'Installment Plan': inv.installments?.length ? `${inv.installments.length} Installment(s)` : (inv.installmentPlan ? `${inv.installmentPlan} Installment(s)` : '1 Installment'),
      'Total Amount': inv.totalAmount,
      'Paid Amount': inv.paidAmount,
      'Outstanding': inv.totalAmount - inv.paidAmount - (inv.badDebtAmount || 0),
      'Status': inv.status
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `Invoices_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadPaymentsXLS = () => {
    const data = payments.map(pay => {
      const pmInvoice = invoices.find(i => i.id === pay.invoiceId) || invoices.find(i => pay.invoiceNumber && i.invoiceNumber === pay.invoiceNumber);
      const clientName = clients.find(c => c.id === pay.clientId)?.projectName || pmInvoice?.clientName || 'Unknown Client';
      return {
        'Date': pay.date,
        'Client': clientName,
        'Invoice #': pmInvoice?.invoiceNumber || pay.invoiceNumber || 'N/A',
        'Method': pay.method,
        'Received In': bankAccounts.find(acc => acc.id === pay.bankAccountId)?.accountTitleName || 
                       bankAccounts.find(acc => acc.id === pay.bankAccountId)?.accountName || '-',
        'Amount': pay.amount,
        'Notes': pay.notes
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');
    XLSX.writeFile(wb, `Payments_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadClientsStatusXLS = () => {
    const data = clientSummary.map(row => ({
      'Sl': row.slNumber,
      'Clients': row.clientName,
      'Total Invoiced': row.totalInvoiced,
      'Total Paid': row.totalPaid,
      'Total Due': row.totalDue,
      'Total Bad Debt': row.totalBadDebt
    }));

    // Add Totals row
    const totals = {
      'Sl': '',
      'Clients': 'TOTAL',
      'Total Invoiced': clientSummary.reduce((sum, row) => sum + row.totalInvoiced, 0),
      'Total Paid': clientSummary.reduce((sum, row) => sum + row.totalPaid, 0),
      'Total Due': clientSummary.reduce((sum, row) => sum + row.totalDue, 0),
      'Total Bad Debt': clientSummary.reduce((sum, row) => sum + row.totalBadDebt, 0)
    };
    data.push(totals);

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients Payment Status');
    XLSX.writeFile(wb, `Clients_Payment_Status_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadClientsStatusPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Clients Payment Status', 14, 22);

    const tableData = clientSummary.map(row => [
      row.slNumber,
      row.clientName,
      formatCurrency(row.totalInvoiced, true),
      formatCurrency(row.totalPaid, true),
      formatCurrency(row.totalDue, true),
      formatCurrency(row.totalBadDebt, true)
    ]);

    // Add Totals row
    tableData.push([
      '',
      'TOTAL',
      formatCurrency(clientSummary.reduce((sum, row) => sum + row.totalInvoiced, 0), true),
      formatCurrency(clientSummary.reduce((sum, row) => sum + row.totalPaid, 0), true),
      formatCurrency(clientSummary.reduce((sum, row) => sum + row.totalDue, 0), true),
      formatCurrency(clientSummary.reduce((sum, row) => sum + row.totalBadDebt, 0), true)
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Sl', 'Clients', 'Total Invoiced', 'Total Paid', 'Total Due', 'Total Bad Debt']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 
        2: { halign: 'right' }, 
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`Clients_Payment_Status_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const generateInvoicePDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    
    // Document header / Company Branding - Navy & Sky Blue Theme
    doc.setFillColor(10, 37, 64); // Navy Blue top band
    doc.rect(0, 0, 210, 5, 'F');
    doc.setFillColor(14, 165, 233); // Sky Blue accent stripe
    doc.rect(0, 5, 210, 2, 'F');
    
    // Company Logo / Name
    doc.setTextColor(10, 37, 64); // Navy Blue
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("TriloyTech", 15, 24);

    // Company Contact Info below TriloyTech
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // Slate 600
    doc.text("Mobile: +(880) 1339870528", 15, 30);
    doc.text("Email: contact@triloytech.com", 15, 35);
    const addressLines = doc.splitTextToSize("Address: Saleh Tower, Level: 5; House: 1, Road: 13, Garib-E-Newaz Avenue, Dhaka 1230", 95);
    doc.text(addressLines, 15, 40);

    const balanceDue = invoice.totalAmount - invoice.paidAmount - (invoice.badDebtAmount || 0);

    // Invoice Badge (Top Right)
    doc.setFillColor(240, 249, 255); // Sky Blue 50 background
    doc.roundedRect(120, 15, 75, 20, 3, 3, 'F');
    doc.setDrawColor(186, 230, 253); // Sky Blue 200 border
    doc.roundedRect(120, 15, 75, 20, 3, 3, 'D');

    doc.setTextColor(2, 132, 199); // Sky Blue header text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("INVOICE", 126, 23);
    
    doc.setTextColor(10, 37, 64); // Navy Blue invoice number
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 126, 30);

    // Dynamic Y spacing after company header
    const startBlocksY = Math.max(52, 40 + (addressLines.length * 4.5) + 6);

    // Two-Column Meta Cards (Bill To & Invoice Details) - Styled with matching Sky Blue & Navy theme
    // Left Box: Bill To
    doc.setFillColor(240, 249, 255); // Soft Sky Blue tint
    doc.roundedRect(15, startBlocksY, 87, 36, 3, 3, 'F');
    doc.setDrawColor(186, 230, 253); // Sky Blue 200 border
    doc.roundedRect(15, startBlocksY, 87, 36, 3, 3, 'D');

    doc.setTextColor(10, 37, 64); // Navy Blue
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Bill To:", 20, startBlocksY + 8);
    doc.setDrawColor(14, 165, 233); // Sky Blue line
    doc.line(20, startBlocksY + 10, 45, startBlocksY + 10);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(10, 37, 64); // Navy Blue
    doc.text(invoice.clientName, 20, startBlocksY + 17);

    const client = clients.find(c => c.id === invoice.clientId);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    let clientMetaY = startBlocksY + 23;
    if (client?.company) {
      doc.text(`Company: ${client.company}`, 20, clientMetaY);
      clientMetaY += 5;
    }
    if (client?.mobile) {
      doc.text(`Mobile: ${client.mobile}`, 20, clientMetaY);
    }

    // Right Box: Invoice Details
    doc.setFillColor(240, 249, 255); // Soft Sky Blue tint
    doc.roundedRect(108, startBlocksY, 87, 36, 3, 3, 'F');
    doc.setDrawColor(186, 230, 253); // Sky Blue 200 border
    doc.roundedRect(108, startBlocksY, 87, 36, 3, 3, 'D');

    doc.setTextColor(10, 37, 64); // Navy Blue
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Invoice Details:", 113, startBlocksY + 8);
    doc.setDrawColor(14, 165, 233); // Sky Blue line
    doc.line(113, startBlocksY + 10, 148, startBlocksY + 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Date Issued: ${invoice.date}`, 113, startBlocksY + 17);
    doc.text(`Due Date: ${invoice.dueDate}`, 113, startBlocksY + 23);
    if (invoice.serviceDate) {
      doc.text(`Service Period: ${invoice.serviceDate}`, 113, startBlocksY + 29);
    }

    const tableStartY = startBlocksY + 41;

    // Items Table
    const tableData = invoice.items.map(item => [
      item.description,
      item.quantity.toString(),
      item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [['Description', 'Qty', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [10, 37, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
      alternateRowStyles: { fillColor: [240, 249, 255] },
      styles: { fontSize: 8.5, textColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 32 },
        3: { halign: 'right', cellWidth: 33 }
      },
      didParseCell: (data) => {
        if (data.column.index === 1) {
          data.cell.styles.halign = 'center';
        } else if (data.column.index === 2 || data.column.index === 3) {
          data.cell.styles.halign = 'right';
        }
      }
    });

    // Summary & Notes Section
    let finalY = ((doc as any).lastAutoTable?.finalY || 120) + 8;
    
    let notesY = finalY;
    
    // Notes section (left side)
    if (invoice.notes) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(2, 132, 199); // Sky Blue header
      doc.text('Notes:', 15, notesY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const splitNotes = doc.splitTextToSize(invoice.notes, 85);
      doc.text(splitNotes, 15, notesY + 5);
      notesY += (splitNotes.length * 4) + 8;
    }
    
    // Payment Instruction (left side)
    if (invoice.paymentAccountId) {
      const paymentAccount = bankAccounts.find(acc => acc.id === invoice.paymentAccountId);
      if (paymentAccount) {
        doc.setFillColor(240, 249, 255); // Soft Sky Blue tint
        doc.roundedRect(15, notesY, 87, 28, 3, 3, 'F');
        doc.setDrawColor(186, 230, 253); // Sky Blue 200 border
        doc.roundedRect(15, notesY, 87, 28, 3, 3, 'D');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(2, 132, 199); // Sky Blue
        doc.text('Payment Instruction', 19, notesY + 6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(10, 37, 64);
        doc.text(`Account: ${paymentAccount.accountName}`, 19, notesY + 12);
        doc.setTextColor(71, 85, 105);
        doc.text(`A/C No: ${paymentAccount.accountNumber}`, 19, notesY + 17);
        doc.text(`Bank: ${paymentAccount.bankName} (${paymentAccount.branchName})`, 19, notesY + 22);
        notesY += 32;
      }
    }

    // Totals Box (right side card)
    const totalsBoxY = finalY;
    doc.setFillColor(240, 249, 255); // Soft Sky Blue tint
    doc.roundedRect(115, totalsBoxY, 80, 28, 3, 3, 'F');
    doc.setDrawColor(186, 230, 253);
    doc.roundedRect(115, totalsBoxY, 80, 28, 3, 3, 'D');

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Total Amount:`, 120, totalsBoxY + 7);
    doc.text(`Paid Amount:`, 120, totalsBoxY + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(10, 37, 64); // Navy Blue highlight
    doc.text(`Balance Due:`, 120, totalsBoxY + 22);

    // Right-aligned values in Totals Box
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(10, 37, 64);
    doc.text(`BDT ${invoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 190, totalsBoxY + 7, { align: 'right' });
    doc.setTextColor(22, 101, 52); // Emerald for paid
    doc.text(`BDT ${invoice.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 190, totalsBoxY + 14, { align: 'right' });
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(2, 132, 199); // Sky Blue for balance due
    doc.text(`BDT ${balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 190, totalsBoxY + 22, { align: 'right' });

    // Installment Breakdown Table in PDF
    const installmentBreakdown = getInstallmentBreakdown(invoice);
    if (installmentBreakdown.length > 0 && invoice.showInstallmentSchedule !== false) {
      const startInstY = Math.max(notesY + 4, totalsBoxY + 34);
      doc.setTextColor(10, 37, 64); // Navy Blue
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Installment Payment Schedule", 15, startInstY);

      doc.setDrawColor(14, 165, 233); // Sky Blue divider line
      doc.line(15, startInstY + 2, 195, startInstY + 2);

      autoTable(doc, {
        startY: startInstY + 6,
        head: [['Installment', 'Amount Payable', 'Amount Paid', 'Balance Due', 'Status']],
        body: installmentBreakdown.map(inst => [
          inst.label,
          `BDT ${inst.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `BDT ${inst.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `BDT ${inst.balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          inst.status
        ]),
        theme: 'striped',
        headStyles: { fillColor: [10, 37, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [240, 249, 255] },
        styles: { fontSize: 8.5 },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'center' }
        },
        didParseCell: (data) => {
          if (data.column.index === 0) {
            data.cell.styles.halign = 'left';
          } else if (data.column.index >= 1 && data.column.index <= 3) {
            data.cell.styles.halign = 'right';
          } else if (data.column.index === 4) {
            data.cell.styles.halign = 'center';
            if (data.section === 'body') {
              data.cell.styles.fontStyle = 'bold';
              if (data.cell.raw === 'Paid') {
                data.cell.styles.textColor = [22, 101, 52]; // Emerald
              } else if (data.cell.raw === 'Partial') {
                data.cell.styles.textColor = [146, 64, 14]; // Amber
              } else {
                data.cell.styles.textColor = [100, 116, 139]; // Slate
              }
            }
          }
        }
      });
    }

    // Aesthetic Footer at bottom of document
    const pageHeight = doc.internal.pageSize.height || 297;
    doc.setDrawColor(186, 230, 253); // Sky Blue divider
    doc.line(15, pageHeight - 15, 195, pageHeight - 15);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Thank you for doing business with TriloyTech!", 105, pageHeight - 9, { align: 'center' });

    doc.save(`Invoice_${invoice.invoiceNumber}_${invoice.clientName}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* Sub-navigation */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
        {[
          { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
          { id: 'clients', label: 'Clients', icon: Users },
          { id: 'invoices', label: 'Invoices', icon: FileText },
          { id: 'payments', label: 'Payments', icon: CreditCard },
          { id: 'clients-status', label: 'Clients Payment Status', icon: List },
          { id: 'bank-accounts', label: 'TriloyTech Accounts', icon: Building2 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === tab.id 
                ? "bg-white text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Invoiced</p>
                <p className="text-3xl font-black text-slate-900">{formatCurrency(stats.totalInvoiced)}</p>
                <div className="flex items-center gap-1 text-indigo-600 text-xs font-bold">
                  <ArrowUpRight size={14} />
                  <span>Gross Revenue</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Received</p>
                <p className="text-3xl font-black text-emerald-600">{formatCurrency(stats.totalPaid)}</p>
                <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                  <CheckCircle2 size={14} />
                  <span>Collected Funds</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Outstanding</p>
                <p className="text-3xl font-black text-rose-600">{formatCurrency(stats.totalOutstanding)}</p>
                <div className="flex items-center gap-1 text-rose-600 text-xs font-bold">
                  <Clock size={14} />
                  <span>Pending Payments</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-2">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Bad Debt</p>
                <p className="text-3xl font-black text-slate-400">{formatCurrency(stats.totalBadDebt)}</p>
                <div className="flex items-center gap-1 text-slate-400 text-xs font-bold">
                  <ShieldAlert size={14} />
                  <span>Written Off</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                <h3 className="text-lg font-bold text-slate-800">Recent Invoices</h3>
                <div className="space-y-4">
                  {invoices.slice(0, 5).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 shadow-sm">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{inv.clientName}</p>
                          <p className="text-xs text-slate-500 font-medium">Inv: {inv.invoiceNumber} • {inv.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">{formatCurrency(inv.totalAmount)}</p>
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                          inv.status === 'Paid' ? "bg-emerald-100 text-emerald-700" :
                          inv.status === 'Partial' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                <h3 className="text-lg font-bold text-slate-800">Recent Payments</h3>
                <div className="space-y-4">
                  {payments.slice(0, 5).map(pay => {
                    const pmInvoice = invoices.find(i => i.id === pay.invoiceId) || invoices.find(i => pay.invoiceNumber && i.invoiceNumber === pay.invoiceNumber);
                    const clientName = clients.find(c => c.id === pay.clientId)?.projectName || pmInvoice?.clientName || 'Unknown Client';
                    return (
                      <div key={pay.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-500 shadow-sm">
                            <CreditCard size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{clientName}</p>
                            <p className="text-xs text-slate-500 font-medium">{pay.method} • {pay.date}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-600">+{formatCurrency(pay.amount)}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Received</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'clients' && (
          <motion.div
            key="clients"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Clients Management</h3>
              {isAdmin && (
                <button 
                  onClick={() => { setEditingClient(null); setIsClientModalOpen(true); }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                  <Plus size={20} />
                  Add New Client
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map(client => (
                <div key={client.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Users size={24} />
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingClient(client); setIsClientModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Edit size={18} />
                        </button>
                        <button 
                          onClick={() => { setDeleteType('client'); setItemToDelete(client.id); setIsDeleteConfirmOpen(true); }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Delete Client"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 truncate" title={client.projectName}>{client.projectName}</h4>
                  <p className="text-sm font-bold text-indigo-600 mb-2 truncate" title={client.name}>{client.name} {client.company ? `| ${client.company}` : ''}</p>
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                      <Clock size={14} />
                      Joined {format(new Date(client.createdAt), 'MMM yyyy')}
                    </div>
                    {client.email && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium truncate">
                        <span className="font-bold uppercase tracking-widest text-[10px] text-slate-400">Email:</span>
                        {client.email}
                      </div>
                    )}
                    {client.address && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium truncate">
                        <span className="font-bold uppercase tracking-widest text-[10px] text-slate-400">Addr:</span>
                        {client.address}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Phone</span>
                    <span className="text-sm font-bold text-slate-700">{client.mobile || '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'invoices' && (
          <motion.div
            key="invoices"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Invoices Module</h3>
                <p className="text-xs text-slate-500 font-medium">Manage and track client invoices, billing schedules, and collections</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={downloadInvoicesXLS}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all border border-emerald-100"
                  title={isInvoiceFiltered ? `Export ${filteredInvoices.length} filtered invoices to Excel` : "Export all invoices to Excel"}
                >
                  <Download size={18} />
                  Export XLS {isInvoiceFiltered && `(${filteredInvoices.length})`}
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => { setEditingInvoice(null); setIsInvoiceModalOpen(true); }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                  >
                    <Plus size={20} />
                    Create Invoice
                  </button>
                )}
              </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Filter size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-800">Filter Invoices</h4>
                      {isInvoiceFiltered && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                          Filters Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">Filter by Status, Invoice #, Client, or Date</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Date Quick Presets */}
                  <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
                    <button
                      type="button"
                      onClick={() => handleDatePreset('this-month')}
                      className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDatePreset('last-month')}
                      className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all"
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDatePreset('this-year')}
                      className="px-2.5 py-1 rounded-lg hover:bg-white hover:text-slate-900 transition-all"
                    >
                      This Year
                    </button>
                  </div>

                  {isInvoiceFiltered && (
                    <button
                      type="button"
                      onClick={clearInvoiceFilters}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all border border-rose-100"
                      title="Clear all filters"
                    >
                      <RotateCcw size={14} />
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              {/* 4 Filter Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Status Filter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Status
                    </label>
                    {invoiceStatusFilter !== 'ALL' && (
                      <button 
                        type="button" 
                        onClick={() => setInvoiceStatusFilter('ALL')}
                        className="text-[10px] font-bold text-rose-500 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={invoiceStatusFilter}
                      onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                      className={cn(
                        "w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer appearance-none pr-8",
                        invoiceStatusFilter !== 'ALL'
                          ? "border-indigo-400 bg-indigo-50/50 text-indigo-900 font-bold"
                          : "border-slate-200 text-slate-700"
                      )}
                    >
                      <option value="ALL">All Statuses ({statusCounts.ALL})</option>
                      <option value="Unpaid">Unpaid ({statusCounts.Unpaid})</option>
                      <option value="Partial">Partial ({statusCounts.Partial})</option>
                      <option value="Paid">Paid ({statusCounts.Paid})</option>
                      <option value="Carry Forward">Carry Forward ({statusCounts['Carry Forward']})</option>
                      <option value="Bad Debt">Bad Debt ({statusCounts['Bad Debt']})</option>
                    </select>
                    {invoiceStatusFilter !== 'ALL' ? (
                      <button
                        type="button"
                        onClick={() => setInvoiceStatusFilter('ALL')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ArrowDownRight size={14} className="rotate-45" />
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Invoice # Filter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Invoice #
                    </label>
                    {invoiceNumberFilter.trim() !== '' && (
                      <button 
                        type="button" 
                        onClick={() => setInvoiceNumberFilter('')}
                        className="text-[10px] font-bold text-rose-500 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Hash size={15} />
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. INV-001..."
                      value={invoiceNumberFilter}
                      onChange={(e) => setInvoiceNumberFilter(e.target.value)}
                      className={cn(
                        "w-full pl-8 pr-8 py-2 bg-slate-50 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                        invoiceNumberFilter.trim() !== ''
                          ? "border-indigo-400 bg-indigo-50/50 text-indigo-900 font-bold"
                          : "border-slate-200 text-slate-700 placeholder:text-slate-400"
                      )}
                    />
                    {invoiceNumberFilter.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => setInvoiceNumberFilter('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Client Filter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Client
                    </label>
                    {invoiceClientFilter !== 'ALL' && (
                      <button 
                        type="button" 
                        onClick={() => setInvoiceClientFilter('ALL')}
                        className="text-[10px] font-bold text-rose-500 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={invoiceClientFilter}
                      onChange={(e) => setInvoiceClientFilter(e.target.value)}
                      className={cn(
                        "w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer appearance-none pr-8",
                        invoiceClientFilter !== 'ALL'
                          ? "border-indigo-400 bg-indigo-50/50 text-indigo-900 font-bold"
                          : "border-slate-200 text-slate-700"
                      )}
                    >
                      <option value="ALL">All Clients ({invoices.length})</option>
                      {invoiceClientOptions.map(clientOpt => (
                        <option key={clientOpt.id} value={clientOpt.id}>
                          {clientOpt.name} ({clientOpt.count})
                        </option>
                      ))}
                    </select>
                    {invoiceClientFilter !== 'ALL' ? (
                      <button
                        type="button"
                        onClick={() => setInvoiceClientFilter('ALL')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ArrowDownRight size={14} className="rotate-45" />
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Date Filter (From & To) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Calendar size={13} className="text-slate-400" />
                      Date (From / To)
                    </label>
                    {(invoiceStartDateFilter || invoiceEndDateFilter) && (
                      <button
                        type="button"
                        onClick={() => { setInvoiceStartDateFilter(''); setInvoiceEndDateFilter(''); }}
                        className="text-[10px] font-bold text-rose-500 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="date"
                        value={invoiceStartDateFilter}
                        onChange={(e) => setInvoiceStartDateFilter(e.target.value)}
                        title="Start Date (From)"
                        aria-label="From Date"
                        className={cn(
                          "w-full px-2 py-1.5 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                          invoiceStartDateFilter
                            ? "border-indigo-400 bg-indigo-50/50 text-indigo-900 font-bold"
                            : "border-slate-200 text-slate-700"
                        )}
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="date"
                        value={invoiceEndDateFilter}
                        onChange={(e) => setInvoiceEndDateFilter(e.target.value)}
                        title="End Date (To)"
                        aria-label="To Date"
                        className={cn(
                          "w-full px-2 py-1.5 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                          invoiceEndDateFilter
                            ? "border-indigo-400 bg-indigo-50/50 text-indigo-900 font-bold"
                            : "border-slate-200 text-slate-700"
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Filter Chips & Summary Bar */}
              {(isInvoiceFiltered || invoices.length > 0) && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-500">
                      Showing <span className="text-slate-900 font-black">{filteredInvoices.length}</span> of {invoices.length} invoices
                    </span>

                    {invoiceStatusFilter !== 'ALL' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        Status: {invoiceStatusFilter}
                        <button type="button" onClick={() => setInvoiceStatusFilter('ALL')} className="hover:text-indigo-900" title="Remove Status filter">
                          <X size={12} />
                        </button>
                      </span>
                    )}

                    {invoiceNumberFilter.trim() !== '' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        Invoice: "{invoiceNumberFilter.trim()}"
                        <button type="button" onClick={() => setInvoiceNumberFilter('')} className="hover:text-indigo-900" title="Remove Invoice filter">
                          <X size={12} />
                        </button>
                      </span>
                    )}

                    {invoiceClientFilter !== 'ALL' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        Client: {selectedClientDisplay}
                        <button type="button" onClick={() => setInvoiceClientFilter('ALL')} className="hover:text-indigo-900" title="Remove Client filter">
                          <X size={12} />
                        </button>
                      </span>
                    )}

                    {(invoiceStartDateFilter || invoiceEndDateFilter) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        Date: {invoiceStartDateFilter || 'Any'} → {invoiceEndDateFilter || 'Any'}
                        <button type="button" onClick={() => { setInvoiceStartDateFilter(''); setInvoiceEndDateFilter(''); }} className="hover:text-indigo-900" title="Remove Date filter">
                          <X size={12} />
                        </button>
                      </span>
                    )}
                  </div>

                  {/* Filtered Financial Metrics Preview */}
                  <div className="flex flex-wrap items-center gap-3 font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                    <span>
                      Total: <strong className="text-slate-900 font-black">{formatCurrency(filteredTotals.totalAmount)}</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Paid: <strong className="text-emerald-600 font-black">{formatCurrency(filteredTotals.paidAmount)}</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>
                      Due: <strong className="text-rose-600 font-black">{formatCurrency(filteredTotals.dueAmount)}</strong>
                    </span>
                    {filteredTotals.badDebtAmount > 0 && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span>
                          Bad Debt: <strong className="text-slate-500 font-black">{formatCurrency(filteredTotals.badDebtAmount)}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice #</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Plan</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Paid</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Due</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">New Invoice #</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-12 text-center">
                          <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                              <Search size={22} />
                            </div>
                            <div>
                              <p className="text-base font-bold text-slate-700">
                                {isInvoiceFiltered ? 'No invoices match your filter criteria' : 'No invoices found'}
                              </p>
                              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                {isInvoiceFiltered 
                                  ? 'Try adjusting your status, invoice number, client, or date filters to find what you are looking for.' 
                                  : 'No invoice records are currently available. Click "Create Invoice" to add a new invoice.'}
                              </p>
                            </div>
                            {isInvoiceFiltered && (
                              <button
                                type="button"
                                onClick={clearInvoiceFilters}
                                className="mt-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-indigo-100"
                              >
                                <RotateCcw size={14} />
                                Reset All Filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 text-sm font-bold text-slate-900">{inv.invoiceNumber}</td>
                        <td className="p-4 text-sm font-bold text-slate-700">{inv.clientName}</td>
                        <td className="p-4 text-sm text-slate-500 font-medium">{inv.date}</td>
                        <td className="p-4 text-center">
                          {(() => {
                            const instCount = inv.installments?.length || (parseInt(inv.installmentPlan || '1') || 1);
                            return (
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border",
                                instCount > 1 
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                                  : "bg-slate-50 text-slate-600 border-slate-200"
                              )}>
                                {instCount} Installment{instCount > 1 ? 's' : ''}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="p-4 text-sm font-black text-slate-900 text-right">{formatCurrency(inv.totalAmount)}</td>
                        <td className="p-4 text-sm font-black text-emerald-600 text-right">{formatCurrency(inv.paidAmount)}</td>
                        <td className="p-4 text-sm font-black text-rose-600 text-right">{formatCurrency(inv.totalAmount - inv.paidAmount - (inv.badDebtAmount || 0))}</td>
                        <td className="p-4 text-center">
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md whitespace-nowrap",
                            inv.status === 'Paid' ? "bg-emerald-100 text-emerald-700" :
                            inv.status === 'Partial' ? "bg-amber-100 text-amber-700" : 
                            inv.status === 'Carry Forward' ? "bg-slate-100 text-slate-600" :
                            inv.status === 'Bad Debt' ? "bg-slate-200 text-slate-500" :
                            "bg-rose-100 text-rose-700"
                          )}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-4 text-sm font-bold text-indigo-600">
                          {inv.carriedToInvoiceNumber || '-'}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAdmin && (
                              <button 
                                onClick={() => { setEditingInvoice(inv); setIsInvoiceModalOpen(true); }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Edit Invoice"
                              >
                                <Edit size={18} />
                              </button>
                            )}
                            <button 
                              onClick={() => { setPreviewInvoice(inv); setIsPreviewModalOpen(true); }}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Preview Invoice"
                            >
                              <Eye size={18} />
                            </button>
                            <button 
                              onClick={() => generateInvoicePDF(inv)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Download PDF"
                            >
                              <Printer size={18} />
                            </button>
                            {inv.status !== 'Paid' && isAdmin && (
                              <button 
                                onClick={() => { setSelectedInvoiceForPayment(inv); setIsPaymentModalOpen(true); }}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Record Payment"
                              >
                                <CreditCard size={18} />
                              </button>
                            )}
                            {isAdmin && (
                              <button 
                                onClick={() => handleDeleteInvoice(inv.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                title="Delete Invoice"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'payments' && (
          <motion.div
            key="payments"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Payments Tracking</h3>
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-100">
                  Total Collected: {formatCurrency(stats.totalPaid)}
                </div>
                <button 
                  onClick={downloadPaymentsXLS}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-emerald-600 border border-emerald-100 rounded-xl font-bold hover:bg-emerald-50 transition-all shadow-sm"
                  title="Export to Excel"
                >
                  <Download size={18} />
                  Export XLS
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => { setSelectedInvoiceForPayment(null); setIsPaymentModalOpen(true); }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all"
                  >
                    <Plus size={20} />
                    Record Payment
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice #</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Method</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Received In</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Notes</th>
                      {isAdmin && <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map(pay => {
                      const pmInvoice = invoices.find(i => i.id === pay.invoiceId) || invoices.find(i => pay.invoiceNumber && i.invoiceNumber === pay.invoiceNumber);
                      const clientName = clients.find(c => c.id === pay.clientId)?.projectName || pmInvoice?.clientName || 'Unknown Client';
                      return (
                        <tr key={pay.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="p-4 text-sm text-slate-500 font-medium">{pay.date}</td>
                          <td className="p-4 text-sm font-bold text-slate-700">
                            {clientName}
                          </td>
                          <td className="p-4 text-sm font-bold text-indigo-600">
                            {pmInvoice?.invoiceNumber || pay.invoiceNumber || 'N/A'}
                          </td>
                          <td className="p-4 text-sm text-slate-500 font-medium">{pay.method}</td>
                          <td className="p-4 text-sm font-bold text-slate-600">
                            {bankAccounts.find(acc => acc.id === pay.bankAccountId)?.accountTitleName || 
                             bankAccounts.find(acc => acc.id === pay.bankAccountId)?.accountName || '-'}
                          </td>
                          <td className="p-4 text-sm font-black text-emerald-600 text-right">{formatCurrency(pay.amount)}</td>
                          <td className="p-4 text-xs text-slate-400 italic max-w-xs truncate">{pay.notes}</td>
                          {isAdmin && (
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => { setDeleteType('payment'); setItemToDelete(pay.id); setIsDeleteConfirmOpen(true); }}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="Delete Payment"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'bank-accounts' && (
          <motion.div
            key="bank-accounts"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">TriloyTech Bank Accounts</h3>
              {isAdmin && (
                <button 
                  onClick={() => { setEditingBankAccount(null); setIsBankAccountModalOpen(true); }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                  <Plus size={20} />
                  Add Bank Account
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bankAccounts.map(account => (
                <div key={account.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 relative group">
                  {isAdmin && (
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingBankAccount(account); setIsBankAccountModalOpen(true); }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteBankAccount(account.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-800 truncate" title={account.accountTitleName}>{account.accountTitleName || 'No Title'}</h4>
                    <p className="text-sm font-bold text-indigo-600 truncate">{account.accountName || 'Unnamed Account'}</p>
                    <p className="text-xs text-slate-500 font-medium truncate">{account.bankName || 'N/A'}</p>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-50">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Account #</span>
                      <span className="text-slate-700 font-mono font-bold">{account.accountNumber || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Branch</span>
                      <span className="text-slate-700 font-bold">{account.branchName || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Routing</span>
                      <span className="text-slate-700 font-mono font-bold">{account.routingNumber || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              ))}
              {bankAccounts.length === 0 && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <Building2 size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500 font-medium">No bank accounts added yet.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'clients-status' && (
          <motion.div
            key="clients-status"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Clients Payment Status</h3>
              <div className="flex gap-2">
                <button 
                  onClick={downloadClientsStatusXLS}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all"
                >
                  <Download size={18} />
                  Excel
                </button>
                <button 
                  onClick={downloadClientsStatusPDF}
                  className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all"
                >
                  <FileText size={18} />
                  PDF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">Sl</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Clients</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Invoiced</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Paid</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Due</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Bad Debt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {clientSummary.map((row) => (
                      <tr key={row.slNumber} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 text-sm font-bold text-slate-500">{row.slNumber}</td>
                        <td className="p-4">
                          <p className="text-sm font-bold text-slate-800">{row.clientName}</p>
                          {row.company && <p className="text-xs text-slate-500">{row.company}</p>}
                        </td>
                        <td className="p-4 text-sm font-black text-slate-900 text-right">{formatCurrency(row.totalInvoiced)}</td>
                        <td className="p-4 text-sm font-black text-emerald-600 text-right">{formatCurrency(row.totalPaid)}</td>
                        <td className="p-4 text-sm font-black text-rose-600 text-right">{formatCurrency(row.totalDue)}</td>
                        <td className="p-4 text-sm font-black text-slate-400 text-right">{formatCurrency(row.totalBadDebt)}</td>
                      </tr>
                    ))}
                    {clientSummary.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">No client data available.</td>
                      </tr>
                    )}
                  </tbody>
                  {clientSummary.length > 0 && (
                    <tfoot className="bg-slate-50/50 border-t-2 border-slate-100 font-black">
                      <tr>
                        <td colSpan={2} className="p-4 text-sm text-slate-900 uppercase tracking-widest">Totals</td>
                        <td className="p-4 text-sm text-slate-900 text-right">{formatCurrency(clientSummary.reduce((s, r) => s + r.totalInvoiced, 0))}</td>
                        <td className="p-4 text-sm text-emerald-600 text-right">{formatCurrency(clientSummary.reduce((s, r) => s + r.totalPaid, 0))}</td>
                        <td className="p-4 text-sm text-rose-600 text-right">{formatCurrency(clientSummary.reduce((s, r) => s + r.totalDue, 0))}</td>
                        <td className="p-4 text-sm text-slate-400 text-right">{formatCurrency(clientSummary.reduce((s, r) => s + r.totalBadDebt, 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {isClientModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">{editingClient ? 'Edit Client' : 'Add Client'}</h2>
                <button onClick={() => setIsClientModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveClient} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Client Name *</label>
                  <input name="name" defaultValue={editingClient?.name} required maxLength={100} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</label>
                  <input name="company" defaultValue={editingClient?.company} maxLength={100} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mobile Number</label>
                  <input name="mobile" defaultValue={editingClient?.mobile} maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                  <input name="email" type="email" defaultValue={editingClient?.email} maxLength={100} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Address</label>
                  <textarea name="address" defaultValue={editingClient?.address} rows={2} maxLength={200} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none" />
                </div>
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all mt-4">
                  {editingClient ? 'Update Client' : 'Save Client'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isInvoiceModalOpen && (
          <InvoiceModal 
            clients={clients}
            invoices={invoices}
            bankAccounts={bankAccounts}
            onClose={() => setIsInvoiceModalOpen(false)}
            onSave={handleSaveInvoice}
            editingInvoice={editingInvoice}
          />
        )}

        {isPaymentModalOpen && (
          <PaymentModal 
            clients={clients}
            invoices={invoices}
            bankAccounts={bankAccounts}
            onClose={() => setIsPaymentModalOpen(false)}
            onSave={handleSavePayment}
            initialInvoice={selectedInvoiceForPayment}
          />
        )}

        {isBankAccountModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">{editingBankAccount ? 'Edit Bank Account' : 'Add Bank Account'}</h2>
                <button onClick={() => setIsBankAccountModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveBankAccount} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Title Name</label>
                  <input name="accountTitleName" defaultValue={editingBankAccount?.accountTitleName} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Name</label>
                  <input name="accountName" defaultValue={editingBankAccount?.accountName} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Number</label>
                  <input name="accountNumber" defaultValue={editingBankAccount?.accountNumber} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bank Name</label>
                  <input name="bankName" defaultValue={editingBankAccount?.bankName} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Branch Name</label>
                  <input name="branchName" defaultValue={editingBankAccount?.branchName} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Routing Number</label>
                  <input name="routingNumber" defaultValue={editingBankAccount?.routingNumber} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all mt-4">
                  {editingBankAccount ? 'Update Account' : 'Save Account'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
        {isPreviewModalOpen && previewInvoice && (
          <InvoicePreviewModal 
            invoice={previewInvoice}
            clients={clients}
            bankAccounts={bankAccounts}
            onClose={() => { setIsPreviewModalOpen(false); setPreviewInvoice(null); }}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Confirm Deletion</h2>
                <button onClick={() => { setIsDeleteConfirmOpen(false); setDeleteType(null); setItemToDelete(null); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4 p-4 bg-rose-50 rounded-2xl text-rose-700">
                  <AlertCircle size={24} className="shrink-0" />
                  <p className="text-sm font-semibold">
                    {deleteType === 'client' && "Are you sure you want to delete this client? This action cannot be undone and may affect associated invoices."}
                    {deleteType === 'invoice' && "Are you sure you want to delete this invoice? This action cannot be undone."}
                    {deleteType === 'bankAccount' && "Are you sure you want to delete this bank account? This action cannot be undone."}
                    {deleteType === 'payment' && "Are you sure you want to delete this payment record? The associated invoice balance will be updated automatically."}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setIsDeleteConfirmOpen(false); setDeleteType(null); setItemToDelete(null); }}
                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InvoicePreviewModal({ invoice, clients, bankAccounts, onClose }: { 
  invoice: Invoice, 
  clients: Client[], 
  bankAccounts: BankAccount[],
  onClose: () => void 
}) {
  const client = clients.find(c => c.id === invoice.clientId);
  const installmentBreakdown = getInstallmentBreakdown(invoice);
  const isMultiInstallment = installmentBreakdown.length > 0 && invoice.showInstallmentSchedule !== false;
  
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-xl font-bold text-slate-900">Invoice Preview</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-white">
          <div className="space-y-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-8">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                  <FileText size={32} />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">INVOICE</h1>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">TriloyTech Solutions</p>
                </div>
              </div>
              <div className="text-left md:text-right space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Invoice Number</p>
                <p className="text-lg font-black text-slate-900">{invoice.invoiceNumber}</p>
                <div className="pt-2 space-y-1">
                  {invoice.serviceDate && (
                    <>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Service Date</p>
                      <p className="text-sm font-bold text-slate-700">{invoice.serviceDate}</p>
                    </>
                  )}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">Date Issued</p>
                  <p className="text-sm font-bold text-slate-700">{invoice.date}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">Due Date</p>
                  <p className="text-sm font-bold text-rose-600">{invoice.dueDate}</p>
                </div>
              </div>
            </div>

            {/* Billing Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Bill To</p>
                <div>
                  <p className="text-lg font-black text-slate-900">{invoice.clientName}</p>
                  {client && (
                    <div className="text-sm text-slate-500 font-medium space-y-0.5">
                      <p>{client.company}</p>
                      <p>{client.mobile}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Payment Status</p>
                <span className={cn(
                  "inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                  invoice.status === 'Paid' ? "bg-emerald-100 text-emerald-700" :
                  invoice.status === 'Partial' ? "bg-amber-100 text-amber-700" : 
                  invoice.status === 'Carry Forward' ? "bg-slate-100 text-slate-600" :
                  "bg-rose-100 text-rose-700"
                )}>
                  {invoice.status}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="pt-4">
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Unit Price</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-4 text-sm font-bold text-slate-700">{item.description}</td>
                        <td className="p-4 text-sm text-slate-500 font-medium text-center">{item.quantity}</td>
                        <td className="p-4 text-sm text-slate-500 font-medium text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-4 text-sm font-black text-slate-900 text-right">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {invoice.notes && (
              <div className="pt-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</p>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-sm text-slate-600 whitespace-pre-wrap">
                  {invoice.notes}
                </div>
              </div>
            )}

            {isMultiInstallment && (
              <div className="pt-6 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Installment Payment Schedule ({installmentBreakdown.length} Installment{installmentBreakdown.length > 1 ? 's' : ''})</p>
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Installment</th>
                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Due Date</th>
                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount Payable</th>
                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount Paid</th>
                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance Due</th>
                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {installmentBreakdown.map((inst, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3 text-xs font-bold text-slate-800">{inst.label}</td>
                          <td className="p-3 text-xs text-slate-500 font-medium">{inst.dueDate || '-'}</td>
                          <td className="p-3 text-xs font-bold text-slate-700 text-right">{formatCurrency(inst.amount)}</td>
                          <td className="p-3 text-xs font-bold text-emerald-600 text-right">{formatCurrency(inst.paidAmount)}</td>
                          <td className="p-3 text-xs font-bold text-slate-900 text-right">{formatCurrency(inst.balanceDue)}</td>
                          <td className="p-3 text-center">
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full",
                              inst.status === 'Paid' ? "bg-emerald-100 text-emerald-700" :
                              inst.status === 'Partial' ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            )}>
                              {inst.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totals & Payment Instruction */}
            <div className="flex flex-col md:flex-row justify-between gap-8 pt-8 border-t border-slate-100">
              <div className="flex-1">
                {invoice.paymentAccountId && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Payment Instruction</p>
                    {(() => {
                      const acc = bankAccounts.find(a => a.id === invoice.paymentAccountId);
                      if (!acc) return null;
                      return (
                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 max-w-sm">
                          <div className="text-[10px] space-y-1 text-slate-500 font-bold uppercase tracking-wider">
                            <p>Account Name: <span className="text-slate-700">{acc.accountName}</span></p>
                            <p>Account Number: <span className="text-slate-700 font-mono">{acc.accountNumber}</span></p>
                            <p>Bank Name: <span className="text-slate-700">{acc.bankName}</span></p>
                            <p>Branch Name: <span className="text-slate-700">{acc.branchName}</span></p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="w-full md:w-64 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Subtotal</span>
                  <span className="text-slate-900 font-bold">{formatCurrency(invoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Paid Amount</span>
                  <span className="text-emerald-600 font-bold">{formatCurrency(invoice.paidAmount)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                  <span className="text-slate-900 font-black uppercase tracking-widest">Amount Due</span>
                  <span className="text-2xl font-black text-indigo-600">{formatCurrency(invoice.totalAmount - invoice.paidAmount)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-12 text-center">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Thank you for your business!</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all"
          >
            Close
          </button>
          <button 
            onClick={() => {
              // We can't directly call generateInvoicePDF here because it's in the parent
              // But we can trigger it via a prop or just let the user download from the list
              onClose();
            }}
            className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
          >
            Done Previewing
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function InvoiceModal({ clients, invoices, bankAccounts, onClose, onSave, editingInvoice }: { 
  clients: Client[], 
  invoices: Invoice[],
  bankAccounts: BankAccount[],
  onClose: () => void, 
  onSave: (inv: Invoice, carryForwardIds?: string[]) => void,
  editingInvoice: Invoice | null
}) {
  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.projectName.localeCompare(b.projectName)), [clients]);
  const sortedBankAccounts = useMemo(() => [...bankAccounts].sort((a, b) => (a.accountTitleName || a.accountName).localeCompare(b.accountTitleName || b.accountName)), [bankAccounts]);

  const [items, setItems] = useState<any[]>(editingInvoice?.items.map(item => ({ ...item })) || [{ description: '', quantity: 1, unitPrice: '', total: 0 }]);
  const [clientId, setClientId] = useState(editingInvoice?.clientId || '');
  const [paidAmount, setPaidAmount] = useState<string | number>(editingInvoice?.paidAmount || '');
  const [addPreviousDues, setAddPreviousDues] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState(editingInvoice?.paymentAccountId || '');
  
  const [invoiceDate, setInvoiceDate] = useState(editingInvoice?.date || format(new Date(), 'yyyy-MM-dd'));
  const [serviceDate, setServiceDate] = useState(editingInvoice?.serviceDate || format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(editingInvoice?.dueDate || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [invoiceNumber, setInvoiceNumber] = useState(editingInvoice?.invoiceNumber || '');
  const [notes, setNotes] = useState(editingInvoice?.notes || '');
  const [showInstallmentSchedule, setShowInstallmentSchedule] = useState<boolean>(
    editingInvoice?.showInstallmentSchedule !== undefined ? editingInvoice.showInstallmentSchedule : true
  );
  const [error, setError] = useState<string | null>(null);

  interface FormInstallment {
    number: number;
    label: string;
    amount: string | number;
    dueDate?: string;
  }

  const [formInstallments, setFormInstallments] = useState<FormInstallment[]>(() => {
    if (editingInvoice?.installments && editingInvoice.installments.length > 0) {
      return editingInvoice.installments.map((inst, idx) => ({
        number: inst.number || idx + 1,
        label: inst.label || getOrdinalLabel(idx + 1),
        amount: inst.amount,
        dueDate: inst.dueDate
      }));
    }
    const count = parseInt(editingInvoice?.installmentPlan || '1') || 1;
    const tot = editingInvoice?.totalAmount || 0;
    if (count > 1 && tot > 0) {
      const base = Math.floor(tot / count);
      const rem = tot - (base * count);
      return Array.from({ length: count }, (_, i) => ({
        number: i + 1,
        label: getOrdinalLabel(i + 1),
        amount: i === count - 1 ? base + rem : base
      }));
    }
    return [
      { number: 1, label: '1st Installment', amount: editingInvoice?.totalAmount ?? '' }
    ];
  });

  // Auto-generate invoice number when service date changes (only for new invoices)
  useEffect(() => {
    if (!editingInvoice && serviceDate) {
      const date = new Date(serviceDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      
      const prefix = `TT-INV-${year}${month}-`;
      const monthInvoices = invoices.filter(inv => inv.invoiceNumber.startsWith(prefix));
      let nextSeq = 1;
      
      if (monthInvoices.length > 0) {
        const sequences = monthInvoices.map(inv => {
          const parts = inv.invoiceNumber.split('-');
          const lastPart = parts[parts.length - 1];
          return parseInt(lastPart) || 0;
        });
        nextSeq = Math.max(...sequences) + 1;
      }
      
      setInvoiceNumber(`${prefix}${String(nextSeq).padStart(3, '0')}`);
    }
  }, [serviceDate, invoices, editingInvoice]);

  // Update due date when invoice date changes
  useEffect(() => {
    if (invoiceDate && !editingInvoice) {
      const date = new Date(invoiceDate);
      date.setDate(date.getDate() + 30);
      setDueDate(format(date, 'yyyy-MM-dd'));
    }
  }, [invoiceDate, editingInvoice]);

  const previousDuesInvoices = useMemo(() => {
    if (!clientId || editingInvoice) return [];
    return invoices.filter(inv => 
      inv.clientId === clientId && 
      (inv.status === 'Unpaid' || inv.status === 'Partial')
    );
  }, [clientId, invoices, editingInvoice]);

  const previousDuesAmount = useMemo(() => {
    return previousDuesInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);
  }, [previousDuesInvoices]);

  const totalAmount = useMemo(() => {
    const currentItemsTotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    return addPreviousDues ? currentItemsTotal + previousDuesAmount : currentItemsTotal;
  }, [items, addPreviousDues, previousDuesAmount]);

  const handleSetInstallmentCount = (targetCount: number) => {
    const count = Math.max(1, Math.min(24, targetCount));
    const base = Math.floor(totalAmount / count);
    const rem = totalAmount - (base * count);

    const newInsts: FormInstallment[] = Array.from({ length: count }, (_, i) => {
      const existing = formInstallments[i];
      return {
        number: i + 1,
        label: existing?.label || getOrdinalLabel(i + 1),
        amount: i === count - 1 ? base + rem : base,
        dueDate: existing?.dueDate
      };
    });
    setFormInstallments(newInsts);
  };

  const autoSplitEqual = () => {
    if (formInstallments.length === 0) return;
    const count = formInstallments.length;
    const base = Math.floor(totalAmount / count);
    const rem = totalAmount - (base * count);
    const updated = formInstallments.map((inst, idx) => ({
      ...inst,
      amount: idx === count - 1 ? base + rem : base
    }));
    setFormInstallments(updated);
  };

  const handleAddInstallment = () => {
    const nextNum = formInstallments.length + 1;
    setFormInstallments([
      ...formInstallments,
      {
        number: nextNum,
        label: getOrdinalLabel(nextNum),
        amount: 0
      }
    ]);
  };

  const handleRemoveInstallment = (idxToRemove: number) => {
    if (formInstallments.length <= 1) return;
    const filtered = formInstallments.filter((_, idx) => idx !== idxToRemove);
    const reindexed = filtered.map((inst, idx) => ({
      ...inst,
      number: idx + 1,
      label: inst.label === getOrdinalLabel(idx + 2) ? getOrdinalLabel(idx + 1) : inst.label
    }));
    setFormInstallments(reindexed);
  };

  const updateInstallment = (idx: number, key: keyof FormInstallment, value: any) => {
    const updated = [...formInstallments];
    updated[idx] = { ...updated[idx], [key]: value };
    setFormInstallments(updated);
  };

  const addItem = () => setItems([...items, { description: '', quantity: 1, unitPrice: '', total: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  
  const updateItem = (idx: number, updates: any) => {
    const newItems = [...items];
    const item = { ...newItems[idx], ...updates };
    
    // Ensure numeric calculation
    const q = (item.quantity === '' || item.quantity === '-') ? 0 : (Number(item.quantity) || 0);
    const u = (item.unitPrice === '' || item.unitPrice === '-') ? 0 : (Number(item.unitPrice) || 0);
    item.total = q * u;
    
    newItems[idx] = item;
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Check for duplicate invoice number
    const isDuplicate = invoices.some(inv => 
      inv.invoiceNumber === invoiceNumber && inv.id !== editingInvoice?.id
    );

    if (isDuplicate) {
      setError(`Invoice number "${invoiceNumber}" already exists. Please use a unique number.`);
      return;
    }

    const numPaid = Number(paidAmount) || 0;

    const sumInst = formInstallments.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
    if (Math.abs(sumInst - totalAmount) > 0.01) {
      setError(`The sum of the ${formInstallments.length} installment(s) (${formatCurrency(sumInst)}) must equal the Total Invoice Amount (${formatCurrency(totalAmount)}). Please adjust installment amounts or click "Auto-Split Equal Amount".`);
      return;
    }

    const client = clients.find(c => c.id === clientId);
    
    // Convert items properly for storage
    const storageItems: InvoiceItem[] = items.map(item => ({
      description: item.description,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      total: Number(item.total) || 0
    }));

    const invoice: Invoice = {
      id: editingInvoice?.id || crypto.randomUUID(),
      invoiceNumber,
      clientId,
      clientName: client?.projectName || 'Unknown',
      date: invoiceDate,
      serviceDate,
      dueDate,
      paymentAccountId,
      items: addPreviousDues ? [
        ...storageItems,
        { 
          description: `Previous Dues Carry Forward (${previousDuesInvoices.map(inv => inv.invoiceNumber).join(', ')})`, 
          quantity: 1, 
          unitPrice: previousDuesAmount, 
          total: previousDuesAmount 
        }
      ] : storageItems,
      totalAmount,
      paidAmount: numPaid,
      notes,
      status: numPaid >= totalAmount ? 'Paid' : numPaid > 0 ? 'Partial' : 'Unpaid',
      installmentPlan: String(formInstallments.length),
      showInstallmentSchedule,
      installments: formInstallments.map((inst, idx) => ({
        number: idx + 1,
        label: inst.label || getOrdinalLabel(idx + 1),
        amount: Number(inst.amount) || 0,
        dueDate: inst.dueDate || dueDate
      })),
      createdAt: editingInvoice?.createdAt || new Date().toISOString(),
    };

    onSave(invoice, addPreviousDues ? previousDuesInvoices.map(inv => inv.id) : []);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">{editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form id="invoice-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-700">
              <AlertCircle size={20} />
              <p className="text-sm font-bold">{error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice Number</label>
              <input 
                value={invoiceNumber || ''} 
                onChange={(e) => setInvoiceNumber(e.target.value)} 
                required 
                maxLength={30} 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Client</label>
              <select 
                value={clientId || ''} 
                onChange={(e) => setClientId(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
              >
                <option value="">-- Select Client --</option>
                {sortedClients.map(c => <option key={c.id} value={c.id}>{c.projectName}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Service Date</label>
              <input 
                type="date" 
                value={serviceDate || ''} 
                onChange={(e) => setServiceDate(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice Date</label>
              <input 
                type="date" 
                value={invoiceDate || ''} 
                onChange={(e) => setInvoiceDate(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Due Date</label>
              <input 
                type="date" 
                value={dueDate || ''} 
                onChange={(e) => setDueDate(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paid Amount</label>
              <input 
                type="text" 
                value={paidAmount} 
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    let processed = val;
                    if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
                      processed = val.replace(/^0+/, '');
                    }
                    setPaidAmount(processed);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-semibold" 
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Account</label>
              <select 
                value={paymentAccountId || ''} 
                onChange={(e) => setPaymentAccountId(e.target.value)} 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
              >
                <option value="">-- Select Account --</option>
                {sortedBankAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.accountTitleName || acc.accountName}</option>)}
              </select>
            </div>
            {!editingInvoice && previousDuesAmount > 0 && (
              <div className="md:col-span-3 flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <input 
                  type="checkbox" 
                  id="add-dues"
                  checked={addPreviousDues}
                  onChange={(e) => setAddPreviousDues(e.target.checked)}
                  className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="add-dues" className="text-sm font-bold text-amber-800 cursor-pointer">
                  Add Previous Dues of this Client ({formatCurrency(previousDuesAmount)})
                </label>
              </div>
            )}
          </div>

          {/* Installment Plan Selection & Breakdown */}
          <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">Payment Installment Plan</label>
                <p className="text-xs text-slate-500 font-medium">Specify the number of installment payments to bill the client</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500 mr-1">Presets:</span>
                {[1, 2, 3, 4, 6, 12].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleSetInstallmentCount(num)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                      formInstallments.length === num 
                        ? "bg-indigo-600 text-white shadow-sm" 
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {num} {num === 1 ? 'Payment' : 'Installments'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-3 border-t border-indigo-100/80">
              <input 
                type="checkbox" 
                id="show-installment-schedule"
                checked={showInstallmentSchedule}
                onChange={(e) => setShowInstallmentSchedule(e.target.checked)}
                className="w-4 h-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="show-installment-schedule" className="text-xs font-bold text-indigo-950 cursor-pointer select-none">
                Show "Installment Payment Schedule" section in invoice (PDF & Preview)
              </label>
            </div>

            <div className="space-y-3 pt-3 border-t border-indigo-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Installments ({formInstallments.length}):</span>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                    <span className="text-xs text-slate-500 font-medium">Custom Count:</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={formInstallments.length}
                      onChange={(e) => handleSetInstallmentCount(parseInt(e.target.value) || 1)}
                      className="w-12 text-center text-xs font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={autoSplitEqual}
                    className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-200 transition-colors"
                  >
                    Auto-Split Equal Amount
                  </button>
                  <button
                    type="button"
                    onClick={handleAddInstallment}
                    className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
                  >
                    <Plus size={14} /> Add Installment
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {formInstallments.map((inst, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-white rounded-xl border border-slate-200 items-center">
                    <div className="sm:col-span-6 space-y-0.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Label</label>
                      <input
                        type="text"
                        value={inst.label}
                        onChange={(e) => updateInstallment(idx, 'label', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder={`Installment ${idx + 1}`}
                      />
                    </div>
                    <div className="sm:col-span-5 space-y-0.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Amount (BDT)</label>
                      <input
                        type="text"
                        value={inst.amount}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            updateInstallment(idx, 'amount', val);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center justify-center pt-3 sm:pt-0">
                      {formInstallments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInstallment(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Remove Installment"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {(() => {
                const sum = formInstallments.reduce((acc, inst) => acc + (Number(inst.amount) || 0), 0);
                const diff = totalAmount - sum;
                if (Math.abs(diff) > 0.01) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-amber-800">
                      <span className="text-xs font-bold">
                        ⚠️ Sum of {formInstallments.length} installment(s) ({formatCurrency(sum)}) does not match Total Amount ({formatCurrency(totalAmount)}). Difference: {formatCurrency(diff)}.
                      </span>
                      <button
                        type="button"
                        onClick={autoSplitEqual}
                        className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-bold rounded-lg whitespace-nowrap transition-colors"
                      >
                        Auto-Balance
                      </button>
                    </div>
                  );
                }
                return (
                  <p className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    ✓ Sum of {formInstallments.length} installment(s) equals Total Invoice Amount ({formatCurrency(sum)}).
                  </p>
                );
              })()}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes / Terms</label>
            <textarea 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              placeholder="Enter payment terms, payment instructions, or other notes..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm" 
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Service Items</h3>
              <button type="button" onClick={addItem} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all">
                <Plus size={14} />
                Add Item
              </button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
                    <input value={item.description || ''} onChange={(e) => updateItem(idx, { description: e.target.value })} required maxLength={200} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm" />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty</label>
                    <input 
                      type="text" 
                      value={item.quantity} 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
                          let processed = val;
                          const isNegative = val.startsWith('-');
                          const numericPart = isNegative ? val.slice(1) : val;
                          
                          if (numericPart.length > 1 && numericPart.startsWith('0') && !numericPart.startsWith('0.')) {
                            processed = (isNegative ? '-' : '') + numericPart.replace(/^0+/, '');
                            if (processed === '-' || processed === '') processed = isNegative ? '-0' : '0';
                          }
                          updateItem(idx, { quantity: processed });
                        }
                      }}
                      required 
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold" 
                      inputMode="decimal"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unit Price</label>
                    <input 
                      type="text" 
                      value={item.unitPrice} 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
                          let processed = val;
                          const isNegative = val.startsWith('-');
                          const numericPart = isNegative ? val.slice(1) : val;
                          
                          if (numericPart.length > 1 && numericPart.startsWith('0') && !numericPart.startsWith('0.')) {
                            processed = (isNegative ? '-' : '') + numericPart.replace(/^0+/, '');
                            if (processed === '-' || processed === '') processed = isNegative ? '-0' : '0';
                          }
                          updateItem(idx, { unitPrice: processed });
                        }
                      }}
                      required 
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold" 
                      inputMode="decimal"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</label>
                    <div className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-100 text-sm font-bold text-slate-600">
                      {formatCurrency(item.total || 0)}
                    </div>
                  </div>
                  <div className="md:col-span-1 flex justify-center pb-1">
                    <button type="button" onClick={() => removeItem(idx)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-slate-100">
            <div className="text-right space-y-1">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Grand Total</p>
              <p className="text-4xl font-black text-indigo-600">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
          <button type="submit" form="invoice-form" className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
            {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PaymentModal({ 
  clients,
  invoices, 
  bankAccounts,
  onClose, 
  onSave, 
  initialInvoice 
}: { 
  clients: Client[],
  invoices: Invoice[], 
  bankAccounts: BankAccount[],
  onClose: () => void, 
  onSave: (payment: PaymentRecord, invoice: Invoice) => void,
  initialInvoice: Invoice | null
}) {
  const sortedActiveInvoices = useMemo(() => 
    invoices
      .filter(inv => inv.status !== 'Paid' && inv.status !== 'Carry Forward')
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber)),
    [invoices]
  );
  const sortedBankAccounts = useMemo(() => [...bankAccounts].sort((a, b) => (a.accountTitleName || a.accountName).localeCompare(b.accountTitleName || b.accountName)), [bankAccounts]);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState(initialInvoice?.id || '');
  const [bankAccountId, setBankAccountId] = useState(initialInvoice?.paymentAccountId || '');
  
  const selectedInvoice = useMemo(() => invoices.find(i => i.id === selectedInvoiceId), [invoices, selectedInvoiceId]);
  const outstanding = selectedInvoice ? selectedInvoice.totalAmount - selectedInvoice.paidAmount : 0;

  useEffect(() => {
    if (selectedInvoice && !bankAccountId) {
      setBankAccountId(selectedInvoice.paymentAccountId || '');
    }
  }, [selectedInvoice]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const badDebtAmount = Number(formData.get('badDebtAmount') || 0);
    const date = formData.get('date') as string;
    const method = formData.get('method') as string;
    const notes = formData.get('notes') as string;

    const payment: PaymentRecord = {
      id: crypto.randomUUID(),
      invoiceId: selectedInvoice.id,
      clientId: selectedInvoice.clientId,
      amount,
      badDebtAmount,
      date,
      method,
      bankAccountId,
      notes,
      createdAt: new Date().toISOString(),
    };

    onSave(payment, selectedInvoice);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Record Payment</h2>
            {selectedInvoice && (
              <p className="text-xs text-slate-500 font-medium">Inv: {selectedInvoice.invoiceNumber}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!initialInvoice && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Invoice</label>
              <select 
                value={selectedInvoiceId || ''} 
                onChange={(e) => setSelectedInvoiceId(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
              >
                <option value="">-- Select Invoice --</option>
                {sortedActiveInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} - {inv.clientName} ({formatCurrency(inv.totalAmount - inv.paidAmount)} due)
                    </option>
                  ))
                }
              </select>
            </div>
          )}

          {selectedInvoice && (
            <div className="bg-indigo-50 p-4 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Outstanding Balance</p>
              <p className="text-2xl font-black text-indigo-900">{formatCurrency(outstanding)}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Amount</label>
              <input 
                name="amount" 
                type="number" 
                step="0.01" 
                required 
                onFocus={(e) => e.target.select()}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-semibold" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-500 uppercase tracking-wider">Bad Debt Amount</label>
              <input 
                name="badDebtAmount" 
                type="number" 
                step="0.01" 
                onFocus={(e) => e.target.select()}
                className="w-full px-4 py-2.5 rounded-xl border border-rose-100 bg-rose-50/30 focus:ring-2 focus:ring-rose-500 outline-none transition-all font-semibold" 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Date</label>
            <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Method</label>
            <select name="method" required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white">
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Check">Check</option>
              <option value="Mobile Banking">Mobile Banking</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Received In Account</label>
            <select 
              value={bankAccountId || ''} 
              onChange={(e) => setBankAccountId(e.target.value)} 
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
            >
              <option value="">-- Select Account --</option>
              {sortedBankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountTitleName || acc.accountName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes</label>
            <textarea name="notes" rows={2} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none" />
          </div>
          <button 
            type="submit" 
            disabled={!selectedInvoice}
            className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Payment
          </button>
        </form>
      </motion.div>
    </div>
  );
}

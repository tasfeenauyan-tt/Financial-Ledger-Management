import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { Client, Invoice, PaymentRecord, InvoiceItem, BankAccount } from '../types';
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
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  useEffect(() => {
    const unsubClients = onSnapshot(query(collection(db, 'clients'), orderBy('createdAt', 'desc')), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client)));
    });

    const unsubInvoices = onSnapshot(query(collection(db, 'invoices'), orderBy('createdAt', 'desc')), (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)));
    });

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), orderBy('createdAt', 'desc')), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentRecord)));
    });

    const unsubBankAccounts = onSnapshot(query(collection(db, 'bankAccounts'), orderBy('createdAt', 'desc')), (snapshot) => {
      setBankAccounts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as BankAccount)));
      setLoading(false);
    });

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
    const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));
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
        clientName: client.name,
        company: client.company,
        totalInvoiced,
        totalPaid,
        totalDue,
        totalBadDebt
      };
    });
  }, [clients, invoices]);

  // Handlers
  const handleSaveClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const clientData: Client = {
      id: editingClient?.id || crypto.randomUUID(),
      name: formData.get('name') as string,
      phone: formData.get('phone') as string || '',
      company: formData.get('company') as string || '',
      email: formData.get('email') as string || '',
      address: formData.get('address') as string || '',
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
      
      // Check for existing payments if this is a new invoice or recreated one
      const existingPayments = payments.filter(p => p.invoiceNumber === invoice.invoiceNumber);
      const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
      
      const updatedInvoice: Invoice = {
        ...invoice,
        paidAmount: totalPaid,
        status: totalPaid >= invoice.totalAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : (invoice.status === 'Carry Forward' ? 'Carry Forward' : 'Unpaid')
      };

      batch.set(doc(db, 'invoices', updatedInvoice.id), updatedInvoice);
      
      // Update existing payments to point to the new invoice ID if it changed
      existingPayments.forEach(p => {
        if (p.invoiceId !== updatedInvoice.id) {
          batch.update(doc(db, 'payments', p.id), { invoiceId: updatedInvoice.id });
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
    const data = invoices.map(inv => ({
      'Invoice #': inv.invoiceNumber,
      'Client': inv.clientName,
      'Service Date': inv.serviceDate || '-',
      'Date': inv.date,
      'Due Date': inv.dueDate,
      'Total Amount': inv.totalAmount,
      'Paid Amount': inv.paidAmount,
      'Outstanding': inv.totalAmount - inv.paidAmount,
      'Status': inv.status
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `Invoices_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadPaymentsXLS = () => {
    const data = payments.map(pay => ({
      'Date': pay.date,
      'Client': clients.find(c => c.id === pay.clientId)?.name || 'Unknown Client',
      'Invoice #': invoices.find(i => i.id === pay.invoiceId)?.invoiceNumber || 'N/A',
      'Method': pay.method,
      'Received In': bankAccounts.find(acc => acc.id === pay.bankAccountId)?.accountTitleName || 
                     bankAccounts.find(acc => acc.id === pay.bankAccountId)?.accountName || '-',
      'Amount': pay.amount,
      'Notes': pay.notes
    }));
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
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text('INVOICE', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Invoice #: ${invoice.invoiceNumber}`, 14, 30);
    if (invoice.serviceDate) {
      doc.text(`Service Date: ${invoice.serviceDate}`, 14, 35);
      doc.text(`Date Issued: ${invoice.date}`, 14, 40);
      doc.text(`Due Date: ${invoice.dueDate}`, 14, 45);
    } else {
      doc.text(`Date Issued: ${invoice.date}`, 14, 35);
      doc.text(`Due Date: ${invoice.dueDate}`, 14, 40);
    }

    // Client Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Bill To:', 14, 60);
    doc.setFontSize(10);
    doc.text(invoice.clientName, 14, 67);
    const client = clients.find(c => c.id === invoice.clientId);
    if (client) {
      doc.text(client.company, 14, 72);
      doc.text(client.phone, 14, 77);
    }

    // Items Table
    const tableData = invoice.items.map(item => [
      item.description,
      item.quantity.toString(),
      formatCurrency(item.unitPrice, true),
      formatCurrency(item.total, true)
    ]);

    autoTable(doc, {
      startY: 85,
      head: [['Description', 'Qty', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    // Summary & Payment Instruction
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
        // Payment Instruction on the left
    if (invoice.paymentAccountId) {
      const paymentAccount = bankAccounts.find(acc => acc.id === invoice.paymentAccountId);
      if (paymentAccount) {
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Payment Instruction:', 14, finalY);
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`Account Name: ${paymentAccount.accountName}`, 14, finalY + 7);
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Account Number: ${paymentAccount.accountNumber}`, 14, finalY + 12);
        doc.text(`Bank Name: ${paymentAccount.bankName}`, 14, finalY + 16);
        doc.text(`Branch Name: ${paymentAccount.branchName}`, 14, finalY + 20);
      }
    }

    // Totals on the right
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Total Amount: ${formatCurrency(invoice.totalAmount, true)}`, 140, finalY);
    doc.text(`Paid Amount: ${formatCurrency(invoice.paidAmount, true)}`, 140, finalY + 7);
    doc.setFontSize(12);
    doc.setTextColor(79, 70, 229);
    doc.text(`Balance Due: ${formatCurrency(invoice.totalAmount - invoice.paidAmount, true)}`, 140, finalY + 15);

    doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
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
                  {payments.slice(0, 5).map(pay => (
                    <div key={pay.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-500 shadow-sm">
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{clients.find(c => c.id === pay.clientId)?.name || 'Unknown Client'}</p>
                          <p className="text-xs text-slate-500 font-medium">{pay.method} • {pay.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-emerald-600">+{formatCurrency(pay.amount)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Received</p>
                      </div>
                    </div>
                  ))}
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
                  <h4 className="text-lg font-bold text-slate-800 truncate" title={client.name}>{client.name}</h4>
                  {client.company && <p className="text-sm font-bold text-indigo-600 mb-2 truncate" title={client.company}>{client.company}</p>}
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
                    <span className="text-sm font-bold text-slate-700">{client.phone || '-'}</span>
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
              <h3 className="text-xl font-bold text-slate-800">Invoices Module</h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={downloadInvoicesXLS}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all"
                >
                  <Download size={18} />
                  Export XLS
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

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice #</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Paid</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Due</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">New Invoice #</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 text-sm font-bold text-slate-900">{inv.invoiceNumber}</td>
                        <td className="p-4 text-sm font-bold text-slate-700">{inv.clientName}</td>
                        <td className="p-4 text-sm text-slate-500 font-medium">{inv.date}</td>
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
                    ))}
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
                    {payments.map(pay => (
                      <tr key={pay.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 text-sm text-slate-500 font-medium">{pay.date}</td>
                        <td className="p-4 text-sm font-bold text-slate-700">
                          {clients.find(c => c.id === pay.clientId)?.name || 'Unknown Client'}
                        </td>
                        <td className="p-4 text-sm font-bold text-indigo-600">
                          {invoices.find(i => i.id === pay.invoiceId)?.invoiceNumber || 'N/A'}
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
                    ))}
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
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone Number</label>
                  <input name="phone" defaultValue={editingClient?.phone} maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
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
                      <p>{client.phone}</p>
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
  const sortedClients = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const sortedBankAccounts = useMemo(() => [...bankAccounts].sort((a, b) => (a.accountTitleName || a.accountName).localeCompare(b.accountTitleName || b.accountName)), [bankAccounts]);

  const [items, setItems] = useState<InvoiceItem[]>(editingInvoice?.items || [{ description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const [clientId, setClientId] = useState(editingInvoice?.clientId || '');
  const [paidAmount, setPaidAmount] = useState(editingInvoice?.paidAmount || 0);
  const [addPreviousDues, setAddPreviousDues] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState(editingInvoice?.paymentAccountId || '');
  
  const [invoiceDate, setInvoiceDate] = useState(editingInvoice?.date || format(new Date(), 'yyyy-MM-dd'));
  const [serviceDate, setServiceDate] = useState(editingInvoice?.serviceDate || format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(editingInvoice?.dueDate || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [invoiceNumber, setInvoiceNumber] = useState(editingInvoice?.invoiceNumber || '');
  const [error, setError] = useState<string | null>(null);

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
    const currentItemsTotal = items.reduce((sum, item) => sum + item.total, 0);
    return addPreviousDues ? currentItemsTotal + previousDuesAmount : currentItemsTotal;
  }, [items, addPreviousDues, previousDuesAmount]);

  const addItem = () => setItems([...items, { description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  
  const updateItem = (idx: number, updates: Partial<InvoiceItem>) => {
    const newItems = [...items];
    const item = { ...newItems[idx], ...updates };
    item.total = item.quantity * item.unitPrice;
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

    const client = clients.find(c => c.id === clientId);
    
    const invoice: Invoice = {
      id: editingInvoice?.id || crypto.randomUUID(),
      invoiceNumber,
      clientId,
      clientName: client?.name || 'Unknown',
      date: invoiceDate,
      serviceDate,
      dueDate,
      paymentAccountId,
      items: addPreviousDues ? [
        ...items,
        { 
          description: `Previous Dues Carry Forward (${previousDuesInvoices.map(inv => inv.invoiceNumber).join(', ')})`, 
          quantity: 1, 
          unitPrice: previousDuesAmount, 
          total: previousDuesAmount 
        }
      ] : items,
      totalAmount,
      paidAmount,
      status: paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid',
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
                value={invoiceNumber} 
                onChange={(e) => setInvoiceNumber(e.target.value)} 
                required 
                maxLength={30} 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Client</label>
              <select 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
              >
                <option value="">-- Select Client --</option>
                {sortedClients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Service Date</label>
              <input 
                type="date" 
                value={serviceDate} 
                onChange={(e) => setServiceDate(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice Date</label>
              <input 
                type="date" 
                value={invoiceDate} 
                onChange={(e) => setInvoiceDate(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Due Date</label>
              <input 
                type="date" 
                value={dueDate} 
                onChange={(e) => setDueDate(e.target.value)} 
                required 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paid Amount</label>
              <input 
                type="number" 
                value={paidAmount || ''} 
                onChange={(e) => setPaidAmount(e.target.value === '' ? 0 : Number(e.target.value))} 
                step="0.01"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payment Account</label>
              <select 
                value={paymentAccountId} 
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
                    <input value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} required maxLength={200} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm" />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qty</label>
                    <input 
                      type="number" 
                      value={item.quantity || ''} 
                      onChange={(e) => updateItem(idx, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })} 
                      required 
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm" 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unit Price</label>
                    <input 
                      type="number" 
                      value={item.unitPrice || ''} 
                      onChange={(e) => updateItem(idx, { unitPrice: e.target.value === '' ? 0 : Number(e.target.value) })} 
                      required 
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm" 
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</label>
                    <div className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-100 text-sm font-bold text-slate-600">
                      {formatCurrency(item.total)}
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
                value={selectedInvoiceId} 
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-500 uppercase tracking-wider">Bad Debt Amount</label>
              <input 
                name="badDebtAmount" 
                type="number" 
                step="0.01" 
                className="w-full px-4 py-2.5 rounded-xl border border-rose-100 bg-rose-50/30 focus:ring-2 focus:ring-rose-500 outline-none transition-all" 
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
              value={bankAccountId} 
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

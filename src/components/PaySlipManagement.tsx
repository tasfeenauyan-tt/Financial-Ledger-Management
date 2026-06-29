import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { Employee } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  Coins, 
  Plus, 
  Trash2, 
  Edit, 
  Download, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  CheckCircle, 
  Clock, 
  Settings, 
  AlertCircle, 
  FileText, 
  Printer, 
  Check, 
  X,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PaySlipManagementProps {
  employees: Employee[];
  userRole: string | null;
}

interface PaySlipItem {
  id: string;
  name: string;
  type: 'payment' | 'deduction';
  order?: number;
  createdAt?: any;
}

interface PaySlipRecord {
  id: string;
  employeeId: string; // Employee's Firestore doc ID
  employeeIdCode: string; // e.g. EMP001
  employeeName: string;
  monthYear: string; // e.g. "2026-06"
  periodType: 'Half month' | 'Full month';
  payments: { [key: string]: number };
  deductions: { [key: string]: number };
  totalPayments: number;
  totalDeductions: number;
  netPayment: number;
  disbursementStatus: 'Done' | 'Pending';
  createdAt: string;
}

export default function PaySlipManagement({ employees, userRole }: PaySlipManagementProps) {
  const isAdmin = userRole === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<'generation' | 'salary_profiles' | 'pools' | 'records'>('generation');

  // --- State for Employee Salary Profiles ---
  const [salaryProfiles, setSalaryProfiles] = useState<any[]>([]);
  const [selectedProfileEmployeeId, setSelectedProfileEmployeeId] = useState('');
  const [profilePayments, setProfilePayments] = useState<{ [key: string]: string }>({});
  const [profileDeductions, setProfileDeductions] = useState<{ [key: string]: string }>({});
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSearchQuery, setProfileSearchQuery] = useState('');

  // --- State for Pools ---
  const [poolItems, setPoolItems] = useState<PaySlipItem[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'payment' | 'deduction'>('payment');
  const [editingPoolItem, setEditingPoolItem] = useState<PaySlipItem | null>(null);
  const [deletingPoolItemId, setDeletingPoolItemId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  // --- State for Pay Slip Generation Form ---
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [periodType, setPeriodType] = useState<'Half month' | 'Full month'>('Full month');
  const [formPayments, setFormPayments] = useState<{ [key: string]: string }>({});
  const [formDeductions, setFormDeductions] = useState<{ [key: string]: string }>({});
  const [disbursementStatus, setDisbursementStatus] = useState<'Done' | 'Pending'>('Pending');
  const [isGenerating, setIsGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // --- State for Pay Slip Records ---
  const [records, setRecords] = useState<PaySlipRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [editingRecord, setEditingRecord] = useState<PaySlipRecord | null>(null);

  // --- Load Pools & Records from Firestore ---
  useEffect(() => {
    const unsubPool = onSnapshot(collection(db, 'payslip_items'), (snapshot) => {
      const items: PaySlipItem[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as PaySlipItem));
      setPoolItems(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'payslip_items'));

    const unsubRecords = onSnapshot(collection(db, 'payslips'), (snapshot) => {
      const recs: PaySlipRecord[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as PaySlipRecord));
      setRecords(recs);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'payslips'));

    const unsubSalaries = onSnapshot(collection(db, 'employee_salaries'), (snapshot) => {
      const salProfiles = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setSalaryProfiles(salProfiles);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'employee_salaries'));

    return () => {
      unsubPool();
      unsubRecords();
      unsubSalaries();
    };
  }, []);

  // --- Reset editing pool item if it is deleted from the database ---
  useEffect(() => {
    if (editingPoolItem && !poolItems.some(item => item.id === editingPoolItem.id)) {
      setEditingPoolItem(null);
      setNewFieldName('');
    }
  }, [poolItems, editingPoolItem]);

  // --- Split Pool Items ---
  const paymentFields = useMemo(() => {
    return [...poolItems]
      .filter(i => i.type === 'payment')
      .sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 1000;
        const orderB = b.order !== undefined ? b.order : 1000;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
  }, [poolItems]);

  const deductionFields = useMemo(() => {
    return [...poolItems]
      .filter(i => i.type === 'deduction')
      .sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 1000;
        const orderB = b.order !== undefined ? b.order : 1000;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
  }, [poolItems]);

  // --- Set Auto Basic Salary or Profile based on Selected Employee ---
  useEffect(() => {
    if (selectedEmployeeId) {
      const emp = employees.find(e => e.id === selectedEmployeeId);
      if (emp) {
        const profile = salaryProfiles.find(p => p.employeeId === selectedEmployeeId);
        
        const initialPayments: { [key: string]: string } = {};
        paymentFields.forEach(field => {
          if (profile && profile.payments && profile.payments[field.name] !== undefined) {
            initialPayments[field.name] = profile.payments[field.name];
          } else if (field.name.toLowerCase() === 'basic salary') {
            initialPayments[field.name] = String(emp.currentSalary);
          } else {
            initialPayments[field.name] = '';
          }
        });
        setFormPayments(initialPayments);

        const initialDeductions: { [key: string]: string } = {};
        deductionFields.forEach(field => {
          if (profile && profile.deductions && profile.deductions[field.name] !== undefined) {
            initialDeductions[field.name] = profile.deductions[field.name];
          } else {
            initialDeductions[field.name] = '';
          }
        });
        setFormDeductions(initialDeductions);
      }
    } else {
      setFormPayments({});
      setFormDeductions({});
    }
  }, [selectedEmployeeId, paymentFields, deductionFields, employees, salaryProfiles]);

  // --- Set Profile Form Fields when Selected Profile Employee changes ---
  useEffect(() => {
    if (selectedProfileEmployeeId) {
      const emp = employees.find(e => e.id === selectedProfileEmployeeId);
      if (emp) {
        const profile = salaryProfiles.find(p => p.employeeId === selectedProfileEmployeeId);
        
        const initialPayments: { [key: string]: string } = {};
        paymentFields.forEach(field => {
          if (profile && profile.payments && profile.payments[field.name] !== undefined) {
            initialPayments[field.name] = profile.payments[field.name];
          } else if (field.name.toLowerCase() === 'basic salary') {
            initialPayments[field.name] = String(emp.currentSalary);
          } else {
            initialPayments[field.name] = '';
          }
        });
        setProfilePayments(initialPayments);

        const initialDeductions: { [key: string]: string } = {};
        deductionFields.forEach(field => {
          if (profile && profile.deductions && profile.deductions[field.name] !== undefined) {
            initialDeductions[field.name] = profile.deductions[field.name];
          } else {
            initialDeductions[field.name] = '';
          }
        });
        setProfileDeductions(initialDeductions);
      }
    } else {
      setProfilePayments({});
      setProfileDeductions({});
    }
  }, [selectedProfileEmployeeId, paymentFields, deductionFields, employees, salaryProfiles]);

  // --- Live Calculations ---
  const totals = useMemo(() => {
    let paySum = 0;
    Object.values(formPayments).forEach(val => {
      const n = parseFloat(val as string);
      if (!isNaN(n)) paySum += n;
    });

    let dedSum = 0;
    Object.values(formDeductions).forEach(val => {
      const n = parseFloat(val as string);
      if (!isNaN(n)) dedSum += n;
    });

    return {
      payments: paySum,
      deductions: dedSum,
      net: paySum - dedSum
    };
  }, [formPayments, formDeductions]);

  // --- Add/Edit Pool Items ---
  const handleSavePoolItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newFieldName.trim()) return;

    try {
      if (editingPoolItem) {
        await setDoc(doc(db, 'payslip_items', editingPoolItem.id), {
          name: newFieldName.trim(),
          type: newFieldType,
          createdAt: (editingPoolItem as any).createdAt || new Date().toISOString()
        }, { merge: true });
        setEditingPoolItem(null);
      } else {
        const typeFields = poolItems.filter(i => i.type === newFieldType);
        const maxOrder = typeFields.reduce((max, item) => {
          const ord = item.order !== undefined ? item.order : 0;
          return ord > max ? ord : max;
        }, 0);
        await addDoc(collection(db, 'payslip_items'), {
          name: newFieldName.trim(),
          type: newFieldType,
          order: maxOrder + 10,
          createdAt: new Date().toISOString()
        });
      }
      setNewFieldName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payslip_items');
    }
  };

  // --- Rearrange Pool Items (Up/Down) ---
  const handleMovePoolItem = async (itemId: string, direction: 'up' | 'down') => {
    if (!isAdmin) return;
    
    const itemToMove = poolItems.find(i => i.id === itemId);
    if (!itemToMove) return;

    const list = [...poolItems]
      .filter(i => i.type === itemToMove.type)
      .sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 1000;
        const orderB = b.order !== undefined ? b.order : 1000;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

    const index = list.findIndex(i => i.id === itemId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    try {
      const batchUpdates = list.map((item, idx) => {
        let orderVal = idx * 10;
        if (idx === index) {
          orderVal = targetIndex * 10;
        } else if (idx === targetIndex) {
          orderVal = index * 10;
        }
        return {
          id: item.id,
          order: orderVal
        };
      });

      for (const update of batchUpdates) {
        await setDoc(doc(db, 'payslip_items', update.id), {
          order: update.order
        }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payslip_items');
    }
  };

  const handleDeletePoolItem = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'payslip_items', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `payslip_items/${id}`);
    }
  };

  // --- Live Calculations for Salary Profile ---
  const profileTotals = useMemo(() => {
    let paySum = 0;
    Object.values(profilePayments).forEach(val => {
      const n = parseFloat(val as string);
      if (!isNaN(n)) paySum += n;
    });

    let dedSum = 0;
    Object.values(profileDeductions).forEach(val => {
      const n = parseFloat(val as string);
      if (!isNaN(n)) dedSum += n;
    });

    return {
      payments: paySum,
      deductions: dedSum,
      net: paySum - dedSum
    };
  }, [profilePayments, profileDeductions]);

  // --- Save Salary Profile ---
  const handleSaveSalaryProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!selectedProfileEmployeeId) return;

    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const cleanPayments: { [key: string]: string } = {};
      Object.entries(profilePayments).forEach(([key, val]) => {
        const strVal = String(val).trim();
        if (strVal !== '') {
          cleanPayments[key] = strVal;
        }
      });

      const cleanDeductions: { [key: string]: string } = {};
      Object.entries(profileDeductions).forEach(([key, val]) => {
        const strVal = String(val).trim();
        if (strVal !== '') {
          cleanDeductions[key] = strVal;
        }
      });

      await setDoc(doc(db, 'employee_salaries', selectedProfileEmployeeId), {
        employeeId: selectedProfileEmployeeId,
        payments: cleanPayments,
        deductions: cleanDeductions,
        updatedAt: new Date().toISOString()
      });

      setProfileSuccess('Salary profile saved successfully!');
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `employee_salaries/${selectedProfileEmployeeId}`);
      setProfileError('Failed to save salary profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // --- Delete Salary Profile ---
  const handleDeleteSalaryProfile = async (employeeId: string) => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to clear/reset this employee\'s salary profile?')) return;
    
    try {
      await deleteDoc(doc(db, 'employee_salaries', employeeId));
      if (selectedProfileEmployeeId === employeeId) {
        // Reset form to base current salary
        const emp = employees.find(e => e.id === employeeId);
        if (emp) {
          const initialPayments: { [key: string]: string } = {};
          paymentFields.forEach(field => {
            if (field.name.toLowerCase() === 'basic salary') {
              initialPayments[field.name] = String(emp.currentSalary);
            } else {
              initialPayments[field.name] = '';
            }
          });
          setProfilePayments(initialPayments);

          const initialDeductions: { [key: string]: string } = {};
          deductionFields.forEach(field => {
            initialDeductions[field.name] = '';
          });
          setProfileDeductions(initialDeductions);
        }
      }
      setProfileSuccess('Salary profile cleared successfully.');
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employee_salaries/${employeeId}`);
    }
  };

  // --- Submit Pay Slip Generation ---
  const handleGeneratePaySlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setFormError(null);
    setFormSuccess(null);

    if (!selectedEmployeeId) {
      setFormError('Please select an employee');
      return;
    }

    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (!emp) {
      setFormError('Employee not found');
      return;
    }

    setIsGenerating(true);

    const paymentsMap: { [key: string]: number } = {};
    Object.entries(formPayments).forEach(([k, v]) => {
      const parsed = parseFloat(v as string);
      paymentsMap[k] = isNaN(parsed) ? 0 : parsed;
    });

    const deductionsMap: { [key: string]: number } = {};
    Object.entries(formDeductions).forEach(([k, v]) => {
      const parsed = parseFloat(v as string);
      deductionsMap[k] = isNaN(parsed) ? 0 : parsed;
    });

    const newRecord: Omit<PaySlipRecord, 'id'> = {
      employeeId: emp.id,
      employeeIdCode: emp.employeeId,
      employeeName: emp.fullName,
      monthYear: selectedMonth,
      periodType,
      payments: paymentsMap,
      deductions: deductionsMap,
      totalPayments: totals.payments,
      totalDeductions: totals.deductions,
      netPayment: totals.net,
      disbursementStatus,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'payslips'), newRecord);
      setFormSuccess(`Pay slip generated successfully for ${emp.fullName}!`);
      // Reset
      setSelectedEmployeeId('');
      setDisbursementStatus('Pending');
    } catch (err: any) {
      setFormError(err.message || 'Error generating pay slip');
      handleFirestoreError(err, OperationType.WRITE, 'payslips');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Records Processing ---
  // "These files will be arrange monthly with recent on top and serially by employee ID."
  const processedRecords = useMemo(() => {
    let recs = [...records];

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      recs = recs.filter(r => 
        r.employeeName.toLowerCase().includes(q) || 
        r.employeeIdCode.toLowerCase().includes(q)
      );
    }

    if (filterMonth) {
      recs = recs.filter(r => r.monthYear === filterMonth);
    }

    if (filterEmployeeId) {
      recs = recs.filter(r => r.employeeId === filterEmployeeId);
    }

    if (filterStatus !== 'All') {
      recs = recs.filter(r => r.disbursementStatus === filterStatus);
    }

    // Sort: Monthly with recent on top, and serially by employee ID.
    return recs.sort((a, b) => {
      // Month Year DESC (e.g. "2026-06" vs "2026-05")
      if (b.monthYear !== a.monthYear) {
        return b.monthYear.localeCompare(a.monthYear);
      }
      // Employee ID Code ASC (e.g. "EMP001" vs "EMP002")
      return a.employeeIdCode.localeCompare(b.employeeIdCode);
    });
  }, [records, searchQuery, filterMonth, filterEmployeeId, filterStatus]);

  // --- Toggle Quick Disbursement Status ---
  const toggleDisbursementStatus = async (record: PaySlipRecord) => {
    if (!isAdmin) return;
    const newStatus = record.disbursementStatus === 'Done' ? 'Pending' : 'Done';
    try {
      await updateDoc(doc(db, 'payslips', record.id), {
        disbursementStatus: newStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `payslips/${record.id}`);
    }
  };

  // --- Edit Record Modal Actions ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editRecordPayments, setEditRecordPayments] = useState<{ [key: string]: string }>({});
  const [editRecordDeductions, setEditRecordDeductions] = useState<{ [key: string]: string }>({});
  const [editDisbursementStatus, setEditDisbursementStatus] = useState<'Done' | 'Pending'>('Pending');

  const openEditModal = (rec: PaySlipRecord) => {
    setEditingRecord(rec);
    setEditDisbursementStatus(rec.disbursementStatus);
    
    // Fill payments
    const p: { [key: string]: string } = {};
    paymentFields.forEach(f => {
      p[f.name] = rec.payments[f.name] !== undefined ? String(rec.payments[f.name]) : '';
    });
    setEditRecordPayments(p);

    // Fill deductions
    const d: { [key: string]: string } = {};
    deductionFields.forEach(f => {
      d[f.name] = rec.deductions[f.name] !== undefined ? String(rec.deductions[f.name]) : '';
    });
    setEditRecordDeductions(d);

    setIsEditModalOpen(true);
  };

  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingRecord) return;

    const paymentsMap: { [key: string]: number } = {};
    let paySum = 0;
    Object.entries(editRecordPayments).forEach(([k, v]) => {
      const parsed = parseFloat(v as string);
      const val = isNaN(parsed) ? 0 : parsed;
      paymentsMap[k] = val;
      paySum += val;
    });

    const deductionsMap: { [key: string]: number } = {};
    let dedSum = 0;
    Object.entries(editRecordDeductions).forEach(([k, v]) => {
      const parsed = parseFloat(v as string);
      const val = isNaN(parsed) ? 0 : parsed;
      deductionsMap[k] = val;
      dedSum += val;
    });

    try {
      await updateDoc(doc(db, 'payslips', editingRecord.id), {
        payments: paymentsMap,
        deductions: deductionsMap,
        totalPayments: paySum,
        totalDeductions: dedSum,
        netPayment: paySum - dedSum,
        disbursementStatus: editDisbursementStatus,
        updatedAt: new Date().toISOString()
      });
      setIsEditModalOpen(false);
      setEditingRecord(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `payslips/${editingRecord.id}`);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'payslips', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `payslips/${id}`);
    }
  };

  // --- Export & Download Utilities ---

  // Generate beautiful singular PDF for an individual payslip
  const downloadIndividualPDF = (rec: PaySlipRecord) => {
    const doc = new jsPDF();
    const empDetails = employees.find(e => e.id === rec.employeeId);

    // Document header / Company Branding
    doc.setFillColor(99, 102, 241); // Indigo color banner
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("TriloyTech", 15, 25);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Premium Financial Solutions & IT Services", 15, 32);

    // Pay Slip Label
    doc.setFillColor(243, 244, 246); // Gray background for pay period label
    doc.rect(120, 15, 75, 18, 'F');
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PAY SLIP RECORD", 125, 21);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Period: ${rec.monthYear} (${rec.periodType})`, 125, 29);

    // Employee & Summary Details Block
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Employee Information", 15, 55);
    doc.line(15, 57, 195, 57);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Employee ID:  ${rec.employeeIdCode}`, 15, 65);
    doc.text(`Full Name:    ${rec.employeeName}`, 15, 72);
    doc.text(`Designation:  ${empDetails?.currentPosition || 'N/A'}`, 15, 79);
    doc.text(`Joining Date: ${empDetails?.joiningDate || 'N/A'}`, 15, 86);

    doc.text(`Generated At: ${new Date(rec.createdAt).toLocaleDateString()}`, 120, 65);
    doc.text(`Status:       ${rec.disbursementStatus === 'Done' ? 'Disbursed (Paid)' : 'Pending Disbursement'}`, 120, 72);
    doc.text(`Net Payable:  BDT ${rec.netPayment.toLocaleString('en-US')}/-`, 120, 79);

    // Earnings and Deductions tables in parallel or serial using autoTable
    const earningsBody = Object.entries(rec.payments).filter(([_, v]) => v > 0).map(([k, v]) => [k, `BDT ${v.toLocaleString('en-US')}`]);
    const deductionsBody = Object.entries(rec.deductions).filter(([_, v]) => v > 0).map(([k, v]) => [k, `BDT ${v.toLocaleString('en-US')}`]);

    // Construct unified table of earnings and deductions
    const maxLen = Math.max(earningsBody.length, deductionsBody.length);
    const tableData = [];
    for (let i = 0; i < maxLen; i++) {
      const earnCol = earningsBody[i] || ['', ''];
      const dedCol = deductionsBody[i] || ['', ''];
      tableData.push([
        earnCol[0], earnCol[1],
        dedCol[0], dedCol[1]
      ]);
    }

    autoTable(doc, {
      startY: 95,
      head: [['Earnings / Payments', 'Amount', 'Deductions', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241], fontStyle: 'bold', fontSize: 10 },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Summary Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFillColor(248, 250, 252);
    doc.rect(15, finalY, 180, 28, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`Total Earnings: BDT ${rec.totalPayments.toLocaleString('en-US')}`, 20, finalY + 8);
    doc.text(`Total Deductions: BDT ${rec.totalDeductions.toLocaleString('en-US')}`, 20, finalY + 16);
    
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text(`Net Paid Salary: BDT ${rec.netPayment.toLocaleString('en-US')}/-`, 20, finalY + 24);

    // Footer signature spaces
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("-----------------------------------------", 20, finalY + 60);
    doc.text("Employer / Authorized Signature", 20, finalY + 64);

    doc.text("-----------------------------------------", 125, finalY + 60);
    doc.text("Employee Signature / Acknowledgment", 125, finalY + 64);

    doc.save(`PaySlip_${rec.employeeIdCode}_${rec.employeeName}_${rec.monthYear}_${rec.periodType.replace(/\s+/g, '_')}.pdf`);
  };

  // Generate structured singular Excel row or sheet
  const downloadIndividualXLS = (rec: PaySlipRecord) => {
    const summaryData = [
      { 'Field': 'Employee ID', 'Value': rec.employeeIdCode },
      { 'Field': 'Employee Name', 'Value': rec.employeeName },
      { 'Field': 'Month Year', 'Value': rec.monthYear },
      { 'Field': 'Period Type', 'Value': rec.periodType },
      { 'Field': 'Total Payments', 'Value': rec.totalPayments },
      { 'Field': 'Total Deductions', 'Value': rec.totalDeductions },
      { 'Field': 'Net Payment', 'Value': rec.netPayment },
      { 'Field': 'Disbursement Status', 'Value': rec.disbursementStatus },
      { 'Field': 'Generated At', 'Value': rec.createdAt }
    ];

    const detailsData: any[] = [];
    Object.entries(rec.payments).forEach(([k, v]) => {
      if (v > 0) detailsData.push({ 'Type': 'Earning/Payment', 'Item Name': k, 'Amount (BDT)': v });
    });
    Object.entries(rec.deductions).forEach(([k, v]) => {
      if (v > 0) detailsData.push({ 'Type': 'Deduction', 'Item Name': k, 'Amount (BDT)': v });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsDetails = XLSX.utils.json_to_sheet(detailsData);
    
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Salary Details');

    XLSX.writeFile(wb, `PaySlip_${rec.employeeIdCode}_${rec.monthYear}_${rec.periodType.replace(' ', '_')}.xlsx`);
  };

  // Bulk Excel download for all currently filtered records (Month-wise or Employee-wise or general search)
  const downloadBulkXLS = () => {
    const data = processedRecords.map(rec => ({
      'Employee ID': rec.employeeIdCode,
      'Employee Name': rec.employeeName,
      'Month/Year': rec.monthYear,
      'Period': rec.periodType,
      'Total Payments (BDT)': rec.totalPayments,
      'Total Deductions (BDT)': rec.totalDeductions,
      'Net Payment (BDT)': rec.netPayment,
      'Disbursement Status': rec.disbursementStatus,
      'Created Date': new Date(rec.createdAt).toLocaleDateString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pay Slips Summary');
    XLSX.writeFile(wb, `PaySlips_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Bulk PDF download (generates a combined detailed report of all matched/filtered payslips)
  const downloadBulkPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape layout
    doc.setFontSize(16);
    doc.text("TriloyTech - Pay Slip Records Summary", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} | Records Count: ${processedRecords.length}`, 14, 21);

    const body = processedRecords.map(rec => [
      rec.employeeIdCode,
      rec.employeeName,
      rec.monthYear,
      rec.periodType,
      `BDT ${rec.totalPayments.toLocaleString()}`,
      `BDT ${rec.totalDeductions.toLocaleString()}`,
      `BDT ${rec.netPayment.toLocaleString()}`,
      rec.disbursementStatus,
      new Date(rec.createdAt).toLocaleDateString()
    ]);

    autoTable(doc, {
      startY: 26,
      head: [['Emp ID', 'Employee Name', 'Month/Year', 'Period', 'Earnings', 'Deductions', 'Net Salary', 'Status', 'Generated Date']],
      body: body,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241] },
      styles: { fontSize: 8.5 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`PaySlips_Records_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-2 max-w-3xl">
        <button
          onClick={() => setActiveSubTab('generation')}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeSubTab === 'generation' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <Coins size={18} />
          Pay Slip Generation
        </button>
        <button
          onClick={() => setActiveSubTab('salary_profiles')}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeSubTab === 'salary_profiles' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <UserCheck size={18} />
          Employee Salary Form
        </button>
        <button
          onClick={() => setActiveSubTab('pools')}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeSubTab === 'pools' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <Settings size={18} />
          Pay Slip Items Pools
        </button>
        <button
          onClick={() => setActiveSubTab('records')}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeSubTab === 'records' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <FileText size={18} />
          Pay Slip Records
        </button>
      </div>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {/* VIEW 1: PAY SLIP GENERATION FORM */}
        {activeSubTab === 'generation' && (
          <motion.div
            key="generation"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Input Form Column */}
            <form onSubmit={handleGeneratePaySlip} className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800">Generate New Pay Slip</h3>
                <p className="text-xs font-medium text-slate-400 mt-0.5">Generate salary sheets with fully customized earnings & deduction structures</p>
              </div>

              {formError && (
                <div className="flex items-center gap-2 p-4 bg-rose-50 text-rose-700 text-sm font-semibold rounded-2xl border border-rose-100 animate-shake">
                  <AlertCircle size={18} />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-2xl border border-emerald-100">
                  <CheckCircle size={18} />
                  <span>{formSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Employee Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase ml-1">Employee (ID - Name)</label>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    required
                    disabled={!isAdmin}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium transition-all"
                  >
                    <option value="">Select Employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeId} - {emp.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Month Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase ml-1">Select Month/Year</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    required
                    disabled={!isAdmin}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-medium transition-all"
                  />
                </div>

                {/* Period Select */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase ml-1 block">Period Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPeriodType('Half month')}
                      disabled={!isAdmin}
                      className={cn(
                        "py-3 rounded-xl text-xs font-bold transition-all border",
                        periodType === 'Half month' 
                          ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm" 
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Half Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodType('Full month')}
                      disabled={!isAdmin}
                      className={cn(
                        "py-3 rounded-xl text-xs font-bold transition-all border",
                        periodType === 'Full month' 
                          ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm" 
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Full Month
                    </button>
                  </div>
                </div>
              </div>

              {selectedEmployeeId && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                  {/* Payments Segment */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Payments & Earnings
                    </h4>
                    {paymentFields.length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-medium">No fields defined in payment items pool.</p>
                    ) : (
                      <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                        {paymentFields.map(field => (
                          <div key={field.id} className="grid grid-cols-12 items-center gap-3">
                            <label className="col-span-7 text-xs font-bold text-slate-600 truncate" title={field.name}>{field.name}</label>
                            <div className="col-span-5 relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">৳</span>
                              <input
                                type="number"
                                placeholder="0"
                                value={formPayments[field.name] || ''}
                                onChange={(e) => setFormPayments({
                                  ...formPayments,
                                  [field.name]: e.target.value
                                })}
                                disabled={!isAdmin}
                                className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-semibold text-sm transition-all"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Deductions Segment */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      Deductions
                    </h4>
                    {deductionFields.length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-medium">No fields defined in deduction items pool.</p>
                    ) : (
                      <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                        {deductionFields.map(field => (
                          <div key={field.id} className="grid grid-cols-12 items-center gap-3">
                            <label className="col-span-7 text-xs font-bold text-slate-600 truncate" title={field.name}>{field.name}</label>
                            <div className="col-span-5 relative">
                              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">৳</span>
                              <input
                                type="number"
                                placeholder="0"
                                value={formDeductions[field.name] || ''}
                                onChange={(e) => setFormDeductions({
                                  ...formDeductions,
                                  [field.name]: e.target.value
                                })}
                                disabled={!isAdmin}
                                className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-semibold text-sm transition-all"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Disbursement Status Selection */}
              {selectedEmployeeId && (
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-700 uppercase">Disbursement Status:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDisbursementStatus('Pending')}
                        disabled={!isAdmin}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                          disbursementStatus === 'Pending' 
                            ? "bg-amber-50 border-amber-300 text-amber-700" 
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        <Clock size={14} />
                        Pending
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisbursementStatus('Done')}
                        disabled={!isAdmin}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                          disbursementStatus === 'Done' 
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700" 
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        <Check size={14} />
                        Done / Disbursed
                      </button>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
                    >
                      {isGenerating ? 'Generating...' : 'Save & Generate Pay Slip'}
                    </button>
                  )}
                </div>
              )}
            </form>

            {/* Live Financial Overview Sidebar Column */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2">
                  Live Net Calculator
                </h4>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Gross Payments</span>
                    <span className="text-sm font-bold text-emerald-600">+{formatCurrency(totals.payments)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Total Deductions</span>
                    <span className="text-sm font-bold text-rose-500">-{formatCurrency(totals.deductions)}</span>
                  </div>
                  
                  <div className="pt-4 border-t border-dashed border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-black text-slate-800 uppercase">Net Pay Amount</span>
                    <span className="text-xl font-black text-indigo-600">{formatCurrency(totals.net)}</span>
                  </div>
                </div>

                {!selectedEmployeeId && (
                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex gap-3 text-indigo-700">
                    <User className="shrink-0 mt-0.5 text-indigo-500" size={18} />
                    <div>
                      <h5 className="text-xs font-bold">Select an employee</h5>
                      <p className="text-[10px] text-indigo-500 mt-0.5">Please choose an employee from the dropdown list to begin generating salary sheets.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW: EMPLOYEE SALARY PROFILE CONFIGURATION */}
        {activeSubTab === 'salary_profiles' && (
          <motion.div
            key="salary_profiles"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Left Panel: Employee Selector List */}
            <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[650px]">
              <div className="mb-4">
                <h3 className="text-md font-bold text-slate-800">Employees List</h3>
                <p className="text-xs font-medium text-slate-400 mt-0.5">Select a team member to define their fixed recurring salary structure</p>
              </div>

              {/* Search Box */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employee name or ID..."
                  value={profileSearchQuery}
                  onChange={(e) => setProfileSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Employee Scrollable List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {employees
                  .filter(emp => 
                    emp.fullName.toLowerCase().includes(profileSearchQuery.toLowerCase()) || 
                    emp.employeeId.toLowerCase().includes(profileSearchQuery.toLowerCase())
                  )
                  .map(emp => {
                    const profile = salaryProfiles.find(p => p.employeeId === emp.id);
                    const isSelected = selectedProfileEmployeeId === emp.id;

                    // Calculate profile net salary if configured
                    let profileNet = 0;
                    if (profile) {
                      let pay = 0;
                      Object.values(profile.payments || {}).forEach(v => {
                        const parsed = parseFloat(v as string);
                        if (!isNaN(parsed)) pay += parsed;
                      });
                      let ded = 0;
                      Object.values(profile.deductions || {}).forEach(v => {
                        const parsed = parseFloat(v as string);
                        if (!isNaN(parsed)) ded += parsed;
                      });
                      profileNet = pay - ded;
                    }

                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setSelectedProfileEmployeeId(emp.id)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between",
                          isSelected
                            ? "bg-indigo-50/75 border-indigo-200 shadow-sm"
                            : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                        )}
                      >
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-slate-800">{emp.fullName}</div>
                          <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[9px]">{emp.employeeId}</span>
                            <span>•</span>
                            <span>Base: {formatCurrency(emp.currentSalary)}</span>
                          </div>
                        </div>
                        <div>
                          {profile ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100">
                                Configured
                              </span>
                              <span className="text-[10px] font-bold text-slate-600">
                                {formatCurrency(profileNet)}
                              </span>
                            </div>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-slate-200">
                              Not Configured
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Right Panel: Salary Profile Configuration Form */}
            <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[650px]">
              {selectedProfileEmployeeId ? (
                (() => {
                  const emp = employees.find(e => e.id === selectedProfileEmployeeId);
                  if (!emp) return null;
                  const profile = salaryProfiles.find(p => p.employeeId === emp.id);

                  return (
                    <form onSubmit={handleSaveSalaryProfile} className="flex flex-col h-full justify-between">
                      <div className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                        {/* Employee Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div>
                            <h3 className="text-md font-bold text-slate-800">Configure Salary Form Structure</h3>
                            <p className="text-xs font-semibold text-slate-400 mt-0.5">
                              Define the default recurring salary details for <span className="text-indigo-600 font-bold">{emp.fullName}</span> ({emp.employeeId})
                            </p>
                          </div>
                          {profile && isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSalaryProfile(emp.id)}
                              className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition-colors flex items-center gap-1"
                            >
                              <Trash2 size={13} />
                              Clear Profile
                            </button>
                          )}
                        </div>

                        {/* Status Messages */}
                        {profileSuccess && (
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-700 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
                            <CheckCircle size={16} className="shrink-0" />
                            {profileSuccess}
                          </div>
                        )}
                        {profileError && (
                          <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
                            <AlertCircle size={16} className="shrink-0" />
                            {profileError}
                          </div>
                        )}

                        {/* Two Columns for Pools Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                          {/* Left column: Payments */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-1.5 border-b border-slate-50 pb-2">
                              <Coins size={15} className="text-emerald-500" />
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Payments & Earnings</h4>
                            </div>
                            <div className="space-y-3">
                              {paymentFields.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No fields in the payments pool. Go to "Pay Slip Items Pools" to add fields.</p>
                              ) : (
                                paymentFields.map(field => (
                                  <div key={field.id} className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-600 flex justify-between items-center">
                                      <span>{field.name}</span>
                                      {field.name.toLowerCase() === 'basic salary' && (
                                        <span className="text-[9px] text-slate-400">Master Base: {formatCurrency(emp.currentSalary)}</span>
                                      )}
                                    </label>
                                    <div className="relative rounded-xl shadow-sm">
                                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-slate-400 text-xs font-bold font-mono">BDT</span>
                                      </div>
                                      <input
                                        type="number"
                                        step="any"
                                        placeholder="0.00"
                                        value={profilePayments[field.name] || ''}
                                        onChange={(e) => setProfilePayments(prev => ({ ...prev, [field.name]: e.target.value }))}
                                        className="block w-full pl-11 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold"
                                      />
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Right column: Deductions */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-1.5 border-b border-slate-50 pb-2">
                              <Settings size={15} className="text-rose-500" />
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Deductions</h4>
                            </div>
                            <div className="space-y-3">
                              {deductionFields.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No fields in the deductions pool. Go to "Pay Slip Items Pools" to add fields.</p>
                              ) : (
                                deductionFields.map(field => (
                                  <div key={field.id} className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-600">{field.name}</label>
                                    <div className="relative rounded-xl shadow-sm">
                                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-slate-400 text-xs font-bold font-mono">BDT</span>
                                      </div>
                                      <input
                                        type="number"
                                        step="any"
                                        placeholder="0.00"
                                        value={profileDeductions[field.name] || ''}
                                        onChange={(e) => setProfileDeductions(prev => ({ ...prev, [field.name]: e.target.value }))}
                                        className="block w-full pl-11 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold"
                                      />
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Calculations Summary and Save Button */}
                      <div className="mt-6 border-t border-slate-100 pt-4 space-y-4 bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-3xl shrink-0">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-white p-3 rounded-2xl border border-slate-100 flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Earnings</span>
                            <span className="text-sm font-black text-emerald-600 mt-1">{formatCurrency(profileTotals.payments)}</span>
                          </div>
                          <div className="bg-white p-3 rounded-2xl border border-slate-100 flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deductions</span>
                            <span className="text-sm font-black text-rose-600 mt-1">{formatCurrency(profileTotals.deductions)}</span>
                          </div>
                          <div className="bg-indigo-600 p-3 rounded-2xl flex flex-col text-white">
                            <span className="text-[10px] font-bold opacity-80 uppercase tracking-wider">Estimated Net Salary</span>
                            <span className="text-sm font-black mt-1">{formatCurrency(profileTotals.net)}</span>
                          </div>
                        </div>

                        {isAdmin && (
                          <div className="flex gap-3 justify-end pt-2">
                            <button
                              type="submit"
                              disabled={isSavingProfile}
                              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                            >
                              {isSavingProfile ? 'Saving Profile...' : 'Save Salary Profile'}
                            </button>
                          </div>
                        )}
                      </div>
                    </form>
                  );
                })()
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-100 rounded-3xl">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
                    <UserCheck size={32} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Select an Employee</h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Select a team member from the left panel to configure their customized recurring payments and deductions once. They will pre-fill automatically during Pay Slip generation.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* VIEW 2: PAY SLIP ITEMS POOLS */}
        {activeSubTab === 'pools' && (
          <motion.div
            key="pools"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Create field box */}
            <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm h-fit">
              <h3 className="text-md font-bold text-slate-800 mb-1">
                {editingPoolItem ? 'Edit Pool Field' : 'Add New Field to Pool'}
              </h3>
              <p className="text-xs text-slate-400 font-medium mb-6">Create global payroll field options</p>

              <form onSubmit={handleSavePoolItem} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase ml-1">Field/Item Name</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    placeholder="e.g. Health Insurance, Performance Bonus"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase ml-1">Type Of Field</label>
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as 'payment' | 'deduction')}
                    disabled={!isAdmin}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm transition-all"
                  >
                    <option value="payment">Payment / Earning Field</option>
                    <option value="deduction">Deduction Field</option>
                  </select>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase rounded-xl transition-all shadow-md shadow-indigo-100"
                    >
                      {editingPoolItem ? 'Update Field' : 'Create Field'}
                    </button>
                    {editingPoolItem && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPoolItem(null);
                          setNewFieldName('');
                        }}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* List current pool items column */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Earnings column */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Payments & Earnings Pool
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{paymentFields.length} Items</span>
                </h4>

                <div className="divide-y divide-slate-50 max-h-[450px] overflow-y-auto pr-1">
                  {paymentFields.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4 font-medium">No payment fields created yet.</p>
                  ) : (
                    paymentFields.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 group">
                        <span className="text-xs font-bold text-slate-700">{item.name}</span>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            {deletingPoolItemId === item.id ? (
                              <div className="flex items-center gap-1 bg-rose-50 p-0.5 rounded-lg border border-rose-100">
                                <span className="text-[10px] font-bold text-rose-600 px-1">Delete?</span>
                                <button
                                  onClick={async () => {
                                    await handleDeletePoolItem(item.id);
                                    setDeletingPoolItemId(null);
                                  }}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                  title="Confirm Delete"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => setDeletingPoolItemId(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleMovePoolItem(item.id, 'up')}
                                  disabled={paymentFields.indexOf(item) === 0}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 rounded-lg transition-all"
                                  title="Move Up"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  onClick={() => handleMovePoolItem(item.id, 'down')}
                                  disabled={paymentFields.indexOf(item) === paymentFields.length - 1}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 rounded-lg transition-all"
                                  title="Move Down"
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingPoolItem(item);
                                    setNewFieldName(item.name);
                                    setNewFieldType(item.type);
                                    setTimeout(() => nameInputRef.current?.focus(), 50);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                                  title="Edit Field"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => setDeletingPoolItemId(item.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete Field"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Deductions column */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Deductions Pool
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{deductionFields.length} Items</span>
                </h4>

                <div className="divide-y divide-slate-50 max-h-[450px] overflow-y-auto pr-1">
                  {deductionFields.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4 font-medium">No deduction fields created yet.</p>
                  ) : (
                    deductionFields.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 group">
                        <span className="text-xs font-bold text-slate-700">{item.name}</span>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            {deletingPoolItemId === item.id ? (
                              <div className="flex items-center gap-1 bg-rose-50 p-0.5 rounded-lg border border-rose-100">
                                <span className="text-[10px] font-bold text-rose-600 px-1">Delete?</span>
                                <button
                                  onClick={async () => {
                                    await handleDeletePoolItem(item.id);
                                    setDeletingPoolItemId(null);
                                  }}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                  title="Confirm Delete"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => setDeletingPoolItemId(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleMovePoolItem(item.id, 'up')}
                                  disabled={deductionFields.indexOf(item) === 0}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 rounded-lg transition-all"
                                  title="Move Up"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  onClick={() => handleMovePoolItem(item.id, 'down')}
                                  disabled={deductionFields.indexOf(item) === deductionFields.length - 1}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 rounded-lg transition-all"
                                  title="Move Down"
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingPoolItem(item);
                                    setNewFieldName(item.name);
                                    setNewFieldType(item.type);
                                    setTimeout(() => nameInputRef.current?.focus(), 50);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                                  title="Edit Field"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => setDeletingPoolItemId(item.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Delete Field"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 3: PAY SLIP RECORDS */}
        {activeSubTab === 'records' && (
          <motion.div
            key="records"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Search and Filters Header */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-md font-bold text-slate-800">Saved Pay Slips Database</h3>
                  <p className="text-xs text-slate-400 font-medium">History of all payroll releases arranged monthly & by employee ID</p>
                </div>
                {/* Export Options */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={downloadBulkXLS}
                    disabled={processedRecords.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50"
                  >
                    <FileSpreadsheet size={16} />
                    Export Excel
                  </button>
                  <button
                    onClick={downloadBulkPDF}
                    disabled={processedRecords.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase rounded-xl transition-all disabled:opacity-50"
                  >
                    <Download size={16} />
                    Export PDF Summary
                  </button>
                </div>
              </div>

              {/* Dynamic Filter Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search name, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium"
                  />
                </div>

                {/* Filter Month */}
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-3 text-slate-400" size={16} />
                  <input
                    type="month"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium"
                  />
                </div>

                {/* Filter Employee */}
                <select
                  value={filterEmployeeId}
                  onChange={(e) => setFilterEmployeeId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-semibold text-slate-700"
                >
                  <option value="">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.employeeId} - {emp.fullName}</option>
                  ))}
                </select>

                {/* Filter Status */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-semibold text-slate-700"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Done">Done / Disbursed</option>
                </select>
              </div>

              {/* Reset Filters button */}
              {(filterMonth || filterEmployeeId || filterStatus !== 'All' || searchQuery) && (
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setFilterMonth('');
                      setFilterEmployeeId('');
                      setFilterStatus('All');
                      setSearchQuery('');
                    }}
                    className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>

            {/* List Records Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Month/Period</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Emp ID</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Total Payments</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Total Deductions</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Net Payment</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Disbursement Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {processedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-sm font-medium text-slate-400 italic">No pay slip records match your filter criteria.</td>
                      </tr>
                    ) : (
                      processedRecords.map(rec => (
                        <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-700">
                            {rec.monthYear} <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-1.5">{rec.periodType}</span>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-indigo-600">{rec.employeeIdCode}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-800">{rec.employeeName}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-600 text-right">+{formatCurrency(rec.totalPayments)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-600 text-right">-{formatCurrency(rec.totalDeductions)}</td>
                          <td className="px-6 py-4 text-sm font-black text-indigo-600 text-right">{formatCurrency(rec.netPayment)}</td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => toggleDisbursementStatus(rec)}
                              disabled={!isAdmin}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 mx-auto border",
                                rec.disbursementStatus === 'Done'
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                  : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                              )}
                              title={isAdmin ? "Toggle Disbursement Status" : ""}
                            >
                              {rec.disbursementStatus === 'Done' ? (
                                <>
                                  <CheckCircle size={12} />
                                  Paid
                                </>
                              ) : (
                                <>
                                  <Clock size={12} />
                                  Pending
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Download options */}
                              <button
                                onClick={() => downloadIndividualPDF(rec)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Download PDF Pay Slip"
                              >
                                <Printer size={16} />
                              </button>
                              <button
                                onClick={() => downloadIndividualXLS(rec)}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Download Excel Pay Slip"
                              >
                                <FileSpreadsheet size={16} />
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => openEditModal(rec)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                                    title="Edit Record"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  {deletingRecordId === rec.id ? (
                                    <div className="flex items-center gap-1 bg-rose-50 p-0.5 rounded-lg border border-rose-100 animate-in fade-in zoom-in-95">
                                      <span className="text-[9px] font-bold text-rose-600 px-1">Delete?</span>
                                      <button
                                        onClick={async () => {
                                          await handleDeleteRecord(rec.id);
                                          setDeletingRecordId(null);
                                        }}
                                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                        title="Confirm Delete"
                                      >
                                        <Check size={12} />
                                      </button>
                                      <button
                                        onClick={() => setDeletingRecordId(null)}
                                        className="p-1 text-slate-400 hover:bg-slate-100 rounded transition-colors"
                                        title="Cancel"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeletingRecordId(rec.id)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                      title="Delete Record"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EDIT RECORD MODAL */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Edit Pay Slip</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">Editing record for {editingRecord.employeeName} ({editingRecord.employeeIdCode}) - {editingRecord.monthYear}</p>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingRecord(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateRecord} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Payments */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Payments & Earnings
                  </h4>
                  <div className="space-y-3.5 pr-1">
                    {paymentFields.map(field => (
                      <div key={field.id} className="grid grid-cols-12 items-center gap-3">
                        <label className="col-span-7 text-xs font-bold text-slate-600 truncate" title={field.name}>{field.name}</label>
                        <div className="col-span-5 relative">
                          <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">৳</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={editRecordPayments[field.name] || ''}
                            onChange={(e) => setEditRecordPayments({
                              ...editRecordPayments,
                              [field.name]: e.target.value
                            })}
                            className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-semibold text-sm transition-all"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Deductions */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Deductions
                  </h4>
                  <div className="space-y-3.5 pr-1">
                    {deductionFields.map(field => (
                      <div key={field.id} className="grid grid-cols-12 items-center gap-3">
                        <label className="col-span-7 text-xs font-bold text-slate-600 truncate" title={field.name}>{field.name}</label>
                        <div className="col-span-5 relative">
                          <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">৳</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={editRecordDeductions[field.name] || ''}
                            onChange={(e) => setEditRecordDeductions({
                              ...editRecordDeductions,
                              [field.name]: e.target.value
                            })}
                            className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none font-semibold text-sm transition-all"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status input */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-700 uppercase">Disbursement Status:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditDisbursementStatus('Pending')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                        editDisbursementStatus === 'Pending' 
                          ? "bg-amber-50 border-amber-300 text-amber-700" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <Clock size={14} />
                      Pending
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDisbursementStatus('Done')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                        editDisbursementStatus === 'Done' 
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <Check size={14} />
                      Done / Disbursed
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingRecord(null);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase rounded-xl transition-all"
                  >
                    Update Record
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

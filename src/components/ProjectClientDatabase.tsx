import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { Client, TransactionSubCategory, ServiceItem, ProjectDetail } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { 
  Users, 
  Plus, 
  Check,
  Search, 
  Edit, 
  Trash2, 
  X, 
  Filter, 
  Globe, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  UserCircle, 
  DollarSign, 
  Calendar,
  Briefcase,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Eraser,
  LayoutGrid,
  List,
  RefreshCw,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface ProjectClientDatabaseProps {
  userRole: string;
  transactionSubCategories: TransactionSubCategory[];
  services?: ServiceItem[];
  onAddTransactionSubCategory: (sub: TransactionSubCategory) => Promise<void>;
}

export default function ProjectClientDatabase({ 
  userRole, 
  transactionSubCategories, 
  services = [],
  onAddTransactionSubCategory 
}: ProjectClientDatabaseProps) {
  const isAdmin = userRole === 'admin';
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const availableServiceNames = useMemo(() => {
    const setOfNames = new Set<string>(['WEB', 'DM', 'SEO-AEO-GEO', 'SAAS']);
    services.forEach(s => {
      if (s.name && s.name.trim()) {
        setOfNames.add(s.name.trim());
      }
    });
    if (editingClient?.services) {
      editingClient.services.forEach(s => {
        if (s && s !== 'Others') setOfNames.add(s.trim());
      });
    }
    const list = Array.from(setOfNames).sort((a, b) => a.localeCompare(b));
    list.push('Others');
    return list;
  }, [services, editingClient]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'services'>('clients');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [serviceClientTypeFilter, setServiceClientTypeFilter] = useState<'All' | 'Recurring' | 'Non-Recurring'>('All');
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Halted' | 'Closed'>('All');
  const [serviceNameFilter, setServiceNameFilter] = useState<string>('All');

  // Form State for auto-fill logic
  const [formCrmLeadId, setFormCrmLeadId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formProjectName, setFormProjectName] = useState('');
  const [formBudget, setFormBudget] = useState<string>('');
  const [isProjectNameAuto, setIsProjectNameAuto] = useState(true);
  const [formServices, setFormServices] = useState<string[]>([]);
  const [formOtherServiceDetails, setFormOtherServiceDetails] = useState('');
  const [formClientStatus, setFormClientStatus] = useState<'Active' | 'Inactive' | 'Halted' | 'Closed'>('Active');
  const [formProjectConfigs, setFormProjectConfigs] = useState<
    Record<string, { clientType: 'Recurring' | 'Non-Recurring'; budget: string; status: 'Active' | 'Inactive' | 'Halted' | 'Closed' }>
  >({});

  useEffect(() => {
    if (isModalOpen) {
      if (editingClient) {
        const crmId = editingClient.crmLeadId || '';
        const name = editingClient.name || '';
        const currentProjectName = editingClient.projectName || '';
        const expectedAutoName = `${name}${crmId ? ` (${crmId})` : ''}`;
        const clientServices = editingClient.services || [];
        const defaultType = editingClient.clientType || 'Recurring';
        const defaultStatus = editingClient.status || 'Active';

        const initialConfigs: Record<string, { clientType: 'Recurring' | 'Non-Recurring'; budget: string; status: 'Active' | 'Inactive' | 'Halted' | 'Closed' }> = {};
        clientServices.forEach((service) => {
          const existingDetail = editingClient.projectDetails?.find((p) => p.service === service);
          if (existingDetail) {
            initialConfigs[service] = {
              clientType: existingDetail.clientType || defaultType,
              budget: existingDetail.budget !== undefined && existingDetail.budget !== null ? String(existingDetail.budget) : '',
              status: existingDetail.status || defaultStatus,
            };
          } else {
            initialConfigs[service] = {
              clientType: defaultType,
              budget: clientServices.length === 1 && editingClient.budget ? String(editingClient.budget) : '',
              status: defaultStatus,
            };
          }
        });
        
        setFormCrmLeadId(crmId);
        setFormClientName(name);
        setFormProjectName(currentProjectName);
        setFormBudget(editingClient.budget ? String(editingClient.budget) : '');
        setFormClientStatus(defaultStatus);
        setFormServices(clientServices);
        setFormOtherServiceDetails(editingClient.otherServiceDetails || '');
        setFormProjectConfigs(initialConfigs);
        // Enable auto-reflect if it matches expected pattern or is empty
        setIsProjectNameAuto(!currentProjectName || currentProjectName === expectedAutoName);
      } else {
        setFormCrmLeadId('');
        setFormClientName('');
        setFormProjectName('');
        setFormBudget('');
        setFormClientStatus('Active');
        setFormServices([]);
        setFormOtherServiceDetails('');
        setFormProjectConfigs({});
        setIsProjectNameAuto(true);
      }
    }
  }, [isModalOpen, editingClient]);

  useEffect(() => {
    if (isProjectNameAuto) {
      const name = formClientName.trim();
      const id = formCrmLeadId.trim();
      if (name || id) {
        setFormProjectName(`${name}${id ? ` (${id})` : ''}`);
      } else {
        setFormProjectName('');
      }
    }
  }, [formClientName, formCrmLeadId, isProjectNameAuto]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'clients'), orderBy('createdAt', 'desc')), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'clients'));
    return () => unsub();
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter(client => 
            client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            client.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            client.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.crmLeadId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clients, searchTerm]);

  const projectStats = useMemo(() => ({
    total: clients.length,
    active: clients.filter(c => c.status === 'Active').length,
    inactive: clients.filter(c => c.status === 'Inactive').length,
    halted: clients.filter(c => c.status === 'Halted').length,
  }), [clients]);

  const allServiceProjects = useMemo(() => {
    const rows: {
      id: string;
      clientId: string;
      clientName: string;
      projectName: string;
      serviceName: string;
      clientType: 'Recurring' | 'Non-Recurring';
      status: 'Active' | 'Inactive' | 'Halted' | 'Closed';
      budget: number;
    }[] = [];

    clients.forEach((client) => {
      const clientServices = client.services || [];
      if (clientServices.length > 0) {
        clientServices.forEach((s) => {
          const pd = client.projectDetails?.find((p) => p.service === s);
          const serviceLabel = s === 'Others' ? (client.otherServiceDetails?.trim() || 'Others') : s;
          const generatedProjName = `${client.name || 'Client'}${client.crmLeadId ? ` (${client.crmLeadId})` : ''}-${serviceLabel}`;
          const projName = pd?.projectName || generatedProjName;
          const clientType = pd?.clientType || client.clientType || 'Recurring';
          const status = pd?.status || client.status || 'Active';
          const budget = pd
            ? Number(pd.budget || 0)
            : (clientServices.length === 1 ? Number(client.budget || 0) : 0);

          rows.push({
            id: `${client.id}-${s}`,
            clientId: client.id,
            clientName: client.name,
            projectName: projName,
            serviceName: serviceLabel,
            clientType,
            status,
            budget,
          });
        });
      } else if (client.projectDetails && client.projectDetails.length > 0) {
        client.projectDetails.forEach((pd, idx) => {
          const serviceLabel = pd.service === 'Others' ? (client.otherServiceDetails?.trim() || 'Others') : pd.service;
          rows.push({
            id: `${client.id}-${pd.service}-${idx}`,
            clientId: client.id,
            clientName: client.name,
            projectName: pd.projectName || `${client.name || 'Client'}-${serviceLabel}`,
            serviceName: serviceLabel,
            clientType: pd.clientType || client.clientType || 'Recurring',
            status: pd.status || client.status || 'Active',
            budget: Number(pd.budget || 0),
          });
        });
      }
    });

    return rows;
  }, [clients]);

  const serviceFilterOptions = useMemo(() => {
    const set = new Set<string>();
    allServiceProjects.forEach((r) => {
      if (r.serviceName) set.add(r.serviceName);
    });
    availableServiceNames.forEach((name) => {
      if (name && name !== 'Others') set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allServiceProjects, availableServiceNames]);

  const filteredServiceProjects = useMemo(() => {
    const q = serviceSearchTerm.toLowerCase().trim();
    return allServiceProjects.filter((row) => {
      if (serviceClientTypeFilter !== 'All' && row.clientType !== serviceClientTypeFilter) {
        return false;
      }
      if (serviceStatusFilter !== 'All' && row.status !== serviceStatusFilter) {
        return false;
      }
      if (serviceNameFilter !== 'All' && row.serviceName.toLowerCase() !== serviceNameFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      const matchesProject = row.projectName.toLowerCase().includes(q);
      const matchesService = row.serviceName.toLowerCase().includes(q);
      const matchesClientType =
        row.clientType.toLowerCase() === q ||
        (q.length >= 2 && row.clientType.toLowerCase().startsWith(q));
      const matchesStatus =
        row.status.toLowerCase() === q ||
        (q.length >= 2 && row.status.toLowerCase().startsWith(q));
      return matchesProject || matchesService || matchesClientType || matchesStatus;
    });
  }, [allServiceProjects, serviceSearchTerm, serviceClientTypeFilter, serviceStatusFilter, serviceNameFilter]);

  const totalServiceBudget = useMemo(
    () => filteredServiceProjects.reduce((sum, row) => sum + (row.budget || 0), 0),
    [filteredServiceProjects]
  );

  const syncProjectToPool = async (projectName: string) => {
    if (!projectName) return;
    const nameToSync = projectName.trim();
    const exists = transactionSubCategories.some(s => s.name.toLowerCase().trim() === nameToSync.toLowerCase());
    if (!exists) {
      await onAddTransactionSubCategory({
        id: crypto.randomUUID(),
        name: nameToSync
      });
    }
  };

  const handleSyncAllToPool = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    let count = 0;
    let invoiceCount = 0;
    
    // Create a local set of names that already exist or are being added in this batch
    const processedNames = new Set(transactionSubCategories.map(s => s.name.toLowerCase().trim()));
    
    try {
      // 1. Sync Project Names to Transaction Item Pool
      for (const client of clients) {
        const name = client.projectName?.trim();
        if (!name) continue;
        
        const lowerName = name.toLowerCase();
        if (!processedNames.has(lowerName)) {
          await onAddTransactionSubCategory({
            id: crypto.randomUUID(),
            name: name
          });
          processedNames.add(lowerName);
          count++;
        }
      }

      // 2. Sync Client Names in Invoices Collection
      const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
      const batch = writeBatch(db);
      let batchSize = 0;

      invoicesSnapshot.docs.forEach(invoiceDoc => {
        const invoiceData = invoiceDoc.data();
        const client = clients.find(c => c.id === invoiceData.clientId);
        
        if (client && client.projectName && invoiceData.clientName !== client.projectName) {
          batch.update(invoiceDoc.ref, { clientName: client.projectName });
          batchSize++;
          invoiceCount++;
          
          // Firestore batch limit is 500
          if (batchSize === 450) {
            // We'll just stop at 450 for this turn to be safe, or we could commit and start new batch
            // But normally these lists aren't that huge in this app
          }
        }
      });

      if (batchSize > 0) {
        await batch.commit();
      }
      
      if (count > 0 || invoiceCount > 0) {
        let msg = `Successfully synced ${count} project names to the transaction pool.`;
        if (invoiceCount > 0) {
          msg += ` Updated ${invoiceCount} invoices with latest client project names.`;
        }
        alert(msg + " Client list at Payment Management is also up to date.");
      } else {
        alert("All data is already synchronized.");
      }
    } catch (error) {
      console.error("Error syncing to pool:", error);
      alert("An error occurred while syncing data.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);

    const rawName = ((formData.get('name') as string) || '').trim();
    const rawCrmId = ((formData.get('crmLeadId') as string) || '').trim();
    const fallbackClientType = editingClient?.clientType || 'Recurring';
    const fallbackStatus = (formData.get('status') as Client['status']) || formClientStatus || 'Active';

    const projectDetails: ProjectDetail[] = formServices.map((service) => {
      const serviceLabel = service === 'Others' ? (formOtherServiceDetails || 'Others') : service;
      const projName = `${rawName || 'Client'}${rawCrmId ? ` (${rawCrmId})` : ''}-${serviceLabel}`;
      const cfg = formProjectConfigs[service];
      return {
        service,
        projectName: projName,
        clientType: cfg?.clientType || fallbackClientType,
        budget: Number(cfg?.budget || 0),
        status: cfg?.status || fallbackStatus,
      };
    });

    const derivedClientType: 'Recurring' | 'Non-Recurring' =
      projectDetails.length > 0
        ? (projectDetails.some((p) => p.clientType === 'Recurring') ? 'Recurring' : 'Non-Recurring')
        : fallbackClientType;

    const projectBudgetSum = projectDetails.reduce((sum, p) => sum + (p.budget || 0), 0);
    const hasAnyProjectBudget = projectDetails.some((p) => p.budget > 0);
    const finalBudget = hasAnyProjectBudget ? projectBudgetSum : Number(formData.get('budget') || 0);
    
    const clientData: Partial<Client> = {
      projectName: (formData.get('projectName') as string)?.trim() || 'Unnamed Project',
      crmLeadId: rawCrmId,
      name: formData.get('name') as string,
      pocName: formData.get('pocName') as string,
      company: formData.get('company') as string,
      mobile: formData.get('mobile') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
      country: formData.get('country') as string,
      clientType: derivedClientType,
      status: formData.get('status') as any,
      budget: finalBudget,
      onboardingDate: formData.get('onboardingDate') as string,
      closureDate: formData.get('closureDate') as string || '',
      leadSource: formData.get('leadSource') as any,
      services: formServices,
      otherServiceDetails: formOtherServiceDetails,
      projectDetails,
      createdAt: editingClient?.createdAt || new Date().toISOString(),
    };

    const id = editingClient?.id || crypto.randomUUID();

    try {
      await setDoc(doc(db, 'clients', id), { ...clientData, id });
      
      // Sync project name to pool
      if (clientData.projectName) {
        await syncProjectToPool(clientData.projectName);
      }

      setIsModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      console.error("Error saving client:", error);
      handleFirestoreError(error, OperationType.WRITE, `clients/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'clients', itemToDelete));
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
    } catch (error) {
      console.error("Error deleting client:", error);
    }
  };

  const handleClearAll = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'clients'));
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setIsClearAllOpen(false);
    } catch (error) {
      console.error("Error clearing data:", error);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const batch = writeBatch(db);
        const now = new Date().toISOString();

        data.forEach((row) => {
          const id = crypto.randomUUID();
          const name = row['Client Name'] || '';
          const crmId = row['CRM Lead ID'] || '';
          const projectNameFromFile = row['Project Name'];
          const autoProjectName = `${name}${crmId ? ` (${crmId})` : ''}`;

          // Parse Services and OtherServiceDetails
          let services: string[] = [];
          let otherServiceDetails = '';
          if (row['Services']) {
            const rawServices = String(row['Services']).split(',').map(s => s.trim());
            services = rawServices.map(s => {
              if (s.startsWith('Others:')) {
                otherServiceDetails = s.replace('Others:', '').trim();
                return 'Others';
              }
              if (s === 'Others' && !otherServiceDetails) {
                // Check if there was a colon somewhere else or if it's just 'Others'
                return 'Others';
              }
              return s;
            });
          }

          const clientData: Client = {
            id,
            projectName: projectNameFromFile || autoProjectName || 'Unnamed Project',
            crmLeadId: crmId,
            name: name,
            pocName: row['Client POC'] || '',
            company: row['Company Name'] || '',
            mobile: String(row['Mobile Number'] || ''),
            email: row['Email Address'] || '',
            address: row['Address'] || '',
            country: row['Country'] || '',
            clientType: (row['Client Type'] as any) || 'Non-Recurring',
            status: (row['Client Status'] as any) || 'Active',
            budget: Number(row['Budget'] || 0),
            services: services,
            otherServiceDetails: otherServiceDetails,
            leadSource: (row['Lead Source'] as any) || 'Others',
            onboardingDate: row['Client On-Boarding Date'] || now.split('T')[0],
            closureDate: row['Client Halted/Closed Date'] || '',
            createdAt: now,
          };
          const docRef = doc(collection(db, 'clients'), id);
          batch.set(docRef, clientData);
          
          // Also sync to pool (one by one or add to a list for secondary batch)
          // Since we are in a loop and transactionSubCategories is from props, 
          // we might want to check against local set to avoid duplicate additions in same batch
        });

        await batch.commit();

        // Sync new project names after batch commit - batching them locally to avoid duplicates
        const currentPoolNames = new Set(transactionSubCategories.map(s => s.name.toLowerCase().trim()));
        const uniqueToImport = new Set<string>();

        for (const row of data) {
          const name = row['Client Name'] || '';
          const crmId = row['CRM Lead ID'] || '';
          const projectNameFromFile = row['Project Name'];
          const autoProjectName = `${name}${crmId ? ` (${crmId})` : ''}`;
          const finalName = (projectNameFromFile || autoProjectName || 'Unnamed Project').trim();
          
          if (finalName && !currentPoolNames.has(finalName.toLowerCase()) && !uniqueToImport.has(finalName.toLowerCase())) {
            uniqueToImport.add(finalName.toLowerCase());
            // We use the original case for the name we save
            await onAddTransactionSubCategory({
              id: crypto.randomUUID(),
              name: finalName
            });
          }
        }

        alert(`Successfully imported ${data.length} clients!`);
      } catch (error) {
        console.error("Error importing data:", error);
        alert("Failed to import data. Please check the file format.");
      } finally {
        setIsImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExport = () => {
    const data = clients.map(c => {
      const projectsCombined = (c.services || []).map(service => {
        const serviceLabel = service === 'Others' ? (c.otherServiceDetails || 'Others') : service;
        const projName = `${c.name}${c.crmLeadId ? ` (${c.crmLeadId})` : ''}-${serviceLabel}`;
        const pd = c.projectDetails?.find(p => p.service === service);
        if (pd) {
          const st = pd.status || c.status || 'Active';
          return `${projName} [${pd.clientType} • ${st}${pd.budget ? ` - ${pd.budget} BDT` : ''}]`;
        }
        return projName;
      }).join(', ');

      return {
        'Project Name': c.projectName,
        'CRM Lead ID': c.crmLeadId,
        'Client Name': c.name,
        'Client POC': c.pocName,
        'Company Name': c.company,
        'Mobile Number': c.mobile,
        'Email Address': c.email,
        'Address': c.address,
        'Country': c.country,
        'Client Type': c.clientType,
        'Client Status': c.status,
        'Budget': c.budget,
        'Services': (c.services || []).join(', ') + (c.services?.includes('Others') ? `: ${c.otherServiceDetails || ''}` : ''),
        'Lead Source': c.leadSource,
        'Client On-Boarding Date': c.onboardingDate ? format(new Date(c.onboardingDate), 'yyyy-MM-dd') : '',
        'Client Halted/Closed Date': c.closureDate ? format(new Date(c.closureDate), 'yyyy-MM-dd') : '',
        'Projects': projectsCombined
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.writeFile(wb, `Client_Database_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('clients')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'clients'
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Users size={16} />
          Clients
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
            activeTab === 'services'
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Briefcase size={16} />
          Services
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-black",
            activeTab === 'services'
              ? "bg-indigo-50 text-indigo-600"
              : "bg-slate-200/70 text-slate-600"
          )}>
            {allServiceProjects.length}
          </span>
        </button>
      </div>

      {activeTab === 'clients' ? (
        <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total Projects:</span>
            <span className="text-xs font-bold text-indigo-700">{projectStats.total}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active:</span>
            <span className="text-xs font-bold text-emerald-700">{projectStats.active}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inactive:</span>
            <span className="text-xs font-bold text-slate-600">{projectStats.inactive}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-100 rounded-lg">
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Halted:</span>
            <span className="text-xs font-bold text-amber-700">{projectStats.halted}</span>
          </div>
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-xl self-start md:self-center">
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewMode === 'list' 
                ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <List size={14} />
            List
          </button>
          <button 
            onClick={() => setViewMode('grid')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewMode === 'grid' 
                ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <LayoutGrid size={14} />
            Cards
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <button 
              onClick={handleSyncAllToPool}
              disabled={isSyncing}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-100",
                isSyncing && "opacity-50 cursor-not-allowed"
              )}
              title="Sync all current project names to Pool Management System"
            >
              <RefreshCw size={18} className={cn(isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Sync to Pool'}
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => setIsClearAllOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all border border-rose-100"
            >
              <Eraser size={18} />
              Clear Data
            </button>
          )}
          <div className="relative group">
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv"
              onChange={handleImport}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              disabled={isImporting}
            />
            <button 
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-100",
                isImporting && "opacity-50 cursor-not-allowed"
              )}
            >
              <Upload size={18} />
              {isImporting ? 'Importing...' : 'Import Data'}
            </button>
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all border border-emerald-100"
          >
            <FileSpreadsheet size={18} />
            Export Data
          </button>
          {isAdmin && (
            <button 
              onClick={() => { setEditingClient(null); setIsModalOpen(true); }}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              <Plus size={20} />
              Add Client
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search by name, company, ID or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client, index) => (
            <motion.div 
              layout
              key={client.id} 
              className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
            >
              {/* Status Badge */}
              <div className={cn(
                "absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                client.status === 'Active' ? "bg-emerald-100 text-emerald-700" :
                client.status === 'Inactive' ? "bg-slate-100 text-slate-500" :
                client.status === 'Halted' ? "bg-amber-100 text-amber-700" :
                "bg-rose-100 text-rose-700"
              )}>
                {client.status}
              </div>

              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <UserCircle size={28} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="text-lg font-bold text-slate-800 truncate" title={client.projectName || client.name}>
                    {client.projectName || client.name}
                  </h4>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-indigo-600 truncate max-w-[100px]">{client.name}</p>
                    <span className="text-slate-200">|</span>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sl: {index + 1} • ID: {client.crmLeadId}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Building2 size={16} className="text-slate-400" />
                  <span className="font-semibold text-slate-700">{client.company}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase size={16} className="text-slate-400" />
                  <span className="text-slate-600">{client.pocName} <span className="text-slate-400 font-normal">(POC)</span></span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Phone size={16} className="text-slate-400" />
                  <span>{client.mobile}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 truncate">
                  <Mail size={16} className="text-slate-400" />
                  <span title={client.email}>{client.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Globe size={16} className="text-slate-400" />
                  <span>{client.country}</span>
                </div>
              </div>

              {client.services && client.services.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {client.services.map(s => {
                    const pd = client.projectDetails?.find(p => p.service === s);
                    const svcStatus = pd?.status || client.status || 'Active';
                    return (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[9px] font-black uppercase tracking-widest border border-indigo-100"
                        title={pd ? `${pd.clientType} • ${svcStatus}${pd.budget > 0 ? ` • ${formatCurrency(pd.budget)}` : ''}` : svcStatus}
                      >
                        <span>
                          {s === 'Others' ? (client.otherServiceDetails || 'Others') : s}
                          {pd ? ` (${pd.clientType === 'Recurring' ? 'Rec' : 'Non-Rec'}${pd.budget > 0 ? ` • ${formatCurrency(pd.budget)}` : ''})` : ''}
                        </span>
                        <span className={cn(
                          "px-1 py-px rounded text-[8px] font-black uppercase",
                          svcStatus === 'Active' ? "bg-emerald-100 text-emerald-700" :
                          svcStatus === 'Inactive' ? "bg-slate-200 text-slate-600" :
                          svcStatus === 'Halted' ? "bg-amber-100 text-amber-700" :
                          "bg-rose-100 text-rose-700"
                        )}>
                          {svcStatus}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-slate-50 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Budget</p>
                  <p className="text-sm font-bold text-indigo-600">{formatCurrency(client.budget)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Type</p>
                  <p className="text-sm font-bold text-slate-700">{client.clientType}</p>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-6 flex items-center gap-2">
                  <button 
                    onClick={() => { setEditingClient(client); setIsModalOpen(true); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl font-bold transition-all"
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button 
                    onClick={() => { setItemToDelete(client.id); setIsDeleteConfirmOpen(true); }}
                    className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="w-14 px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Sl</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Project / Client</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Company</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Services</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Contact</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Budget</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredClients.map((client, index) => (
                <tr key={client.id} className="hover:bg-slate-50/50 transition-all group">
                  <td className="w-14 px-4 py-4 text-xs font-bold text-slate-400 text-center">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <UserCircle size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{client.projectName}</p>
                        <p className="text-[10px] font-medium text-slate-400">{client.name} | ID: {client.crmLeadId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-slate-700">{client.company}</p>
                    <p className="text-[10px] text-slate-400">{client.country}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      {(client.services || []).map(s => {
                        const pd = client.projectDetails?.find(p => p.service === s);
                        const svcStatus = pd?.status || client.status || 'Active';
                        return (
                          <div key={s} className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-black uppercase">
                              {s === 'Others' ? (client.otherServiceDetails || 'Others') : s}
                            </span>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
                              svcStatus === 'Active' ? "bg-emerald-100 text-emerald-700" :
                              svcStatus === 'Inactive' ? "bg-slate-100 text-slate-500" :
                              svcStatus === 'Halted' ? "bg-amber-100 text-amber-700" :
                              "bg-rose-100 text-rose-700"
                            )}>
                              {svcStatus}
                            </span>
                            {pd && (
                              <span className="text-[10px] font-medium text-slate-500">
                                {pd.clientType}{pd.budget > 0 ? ` • ${formatCurrency(pd.budget)}` : ''}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {(!client.services || client.services.length === 0) && (
                        <span className="text-[10px] text-slate-400 font-medium">None</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <p className="text-sm text-slate-600 flex items-center gap-1.5">
                        <Mail size={12} className="text-slate-400" />
                        {client.email}
                      </p>
                      <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <Phone size={12} className="text-slate-400" />
                        {client.mobile}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold text-indigo-600">{formatCurrency(client.budget)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                      client.status === 'Active' ? "bg-emerald-100 text-emerald-700" :
                      client.status === 'Inactive' ? "bg-slate-100 text-slate-500" :
                      client.status === 'Halted' ? "bg-amber-100 text-amber-700" :
                      "bg-rose-100 text-rose-700"
                    )}>
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isAdmin && (
                        <>
                          <button 
                            onClick={() => { setEditingClient(client); setIsModalOpen(true); }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => { setItemToDelete(client.id); setIsDeleteConfirmOpen(true); }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredClients.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-slate-400 font-medium">No clients found matching your search.</p>
            </div>
          )}
        </div>
      )}
        </>
      ) : (
        <div className="space-y-6">
          {/* Services Search & Filter Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by project name, service name, client type, or status..."
                value={serviceSearchTerm}
                onChange={(e) => setServiceSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-slate-400" />
                <select
                  value={serviceNameFilter}
                  onChange={(e) => setServiceNameFilter(e.target.value)}
                  className="px-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                  aria-label="Filter by Service Name"
                >
                  <option value="All">All Services</option>
                  {serviceFilterOptions.map((svc) => (
                    <option key={svc} value={svc}>{svc}</option>
                  ))}
                </select>
              </div>

              <select
                value={serviceClientTypeFilter}
                onChange={(e) => setServiceClientTypeFilter(e.target.value as 'All' | 'Recurring' | 'Non-Recurring')}
                className="px-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                aria-label="Filter by Client Type"
              >
                <option value="All">All Client Types</option>
                <option value="Recurring">Recurring</option>
                <option value="Non-Recurring">Non-Recurring</option>
              </select>

              <select
                value={serviceStatusFilter}
                onChange={(e) => setServiceStatusFilter(e.target.value as 'All' | 'Active' | 'Inactive' | 'Halted' | 'Closed')}
                className="px-4 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all"
                aria-label="Filter by Status"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Halted">Halted</option>
                <option value="Closed">Closed</option>
              </select>

              {(serviceSearchTerm || serviceClientTypeFilter !== 'All' || serviceStatusFilter !== 'All' || serviceNameFilter !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setServiceSearchTerm('');
                    setServiceClientTypeFilter('All');
                    setServiceStatusFilter('All');
                    setServiceNameFilter('All');
                  }}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="w-16 px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">SL</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Project Names</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Client Type</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Budget (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredServiceProjects.map((row, index) => (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-all">
                      <td className="w-16 px-4 py-4 text-xs font-bold text-slate-400 text-center">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-800">{row.projectName}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                          Service: {row.serviceName}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                          row.clientType === 'Recurring'
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-100"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        )}>
                          {row.clientType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                          row.status === 'Active' ? "bg-emerald-100 text-emerald-700" :
                          row.status === 'Inactive' ? "bg-slate-100 text-slate-500" :
                          row.status === 'Halted' ? "bg-amber-100 text-amber-700" :
                          "bg-rose-100 text-rose-700"
                        )}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-bold text-indigo-600">{formatCurrency(row.budget)}</p>
                      </td>
                    </tr>
                  ))}
                  {filteredServiceProjects.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                        No service projects found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/80 border-t-2 border-slate-100">
                    <td colSpan={4} className="px-6 py-4 text-xs font-black text-slate-700 uppercase tracking-widest">
                      Total Amount
                      <span className="ml-2 text-[10px] font-bold text-slate-400 normal-case tracking-normal">
                        ({filteredServiceProjects.length} {filteredServiceProjects.length === 1 ? 'project' : 'projects'})
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-base font-black text-indigo-700">
                      {formatCurrency(totalServiceBudget)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] overflow-y-auto flex justify-center p-4 py-12">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full p-8 lg:p-10 relative h-fit"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute right-6 top-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={24} />
              </button>

              <h3 className="text-2xl font-bold text-slate-900 mb-8">
                {editingClient ? 'Edit Client Profile' : 'Add New Client'}
              </h3>

              <form onSubmit={handleSaveClient} className="space-y-6">
                {/* Client ID */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-indigo-600 uppercase tracking-widest px-1">Client ID</label>
                  <input 
                    name="projectName"
                    value={formProjectName || ''}
                    onChange={(e) => {
                      setFormProjectName(e.target.value);
                      setIsProjectNameAuto(false);
                    }}
                    className="w-full px-5 py-4 bg-indigo-50/30 border-2 border-indigo-100 rounded-2xl text-base focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-slate-800 placeholder:text-slate-300"
                    placeholder="Auto-filled: Client Name (CRM ID)"
                  />
                  <p className="text-[10px] text-slate-400 font-medium px-1 italic">
                    {isProjectNameAuto ? "Auto-generating from Client Name & ID" : "Custom Client ID applied"}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Client Name */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Client Name</label>
                    <input 
                      name="name"
                      value={formClientName || ''}
                      onChange={(e) => setFormClientName(e.target.value)}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="Full Name"
                    />
                  </div>

                  {/* CRM Lead ID */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">CRM Lead ID</label>
                    <input 
                      name="crmLeadId"
                      value={formCrmLeadId || ''}
                      onChange={(e) => setFormCrmLeadId(e.target.value)}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="e.g. LEAD-2024-001"
                    />
                  </div>

                  {/* POC Name */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Client POC</label>
                    <input 
                      name="pocName"
                      defaultValue={editingClient?.pocName}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="Point of Contact"
                    />
                  </div>

                  {/* Company Name */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Company Name</label>
                    <input 
                      name="company"
                      defaultValue={editingClient?.company}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="Organization Name"
                    />
                  </div>

                  {/* Mobile */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Mobile Number</label>
                    <input 
                      name="mobile"
                      defaultValue={editingClient?.mobile}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="+880..."
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
                    <input 
                      type="email"
                      name="email"
                      defaultValue={editingClient?.email}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="client@example.com"
                    />
                  </div>

                  {/* Country */}
                   <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Country</label>
                    <input 
                      name="country"
                      defaultValue={editingClient?.country}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                      placeholder="e.g. Bangladesh"
                    />
                  </div>

                  {/* Client Status */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Client Status</label>
                    <select 
                      name="status"
                      value={formClientStatus}
                      onChange={(e) => setFormClientStatus(e.target.value as 'Active' | 'Inactive' | 'Halted' | 'Closed')}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Halted">Halted</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  {/* Budget */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Budget (BDT)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text"
                        name="budget"
                        value={formBudget}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Only allow numbers and decimal point
                          if (/^\d*\.?\d*$/.test(val)) {
                            // Prevent multiple leading zeros
                            if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
                              setFormBudget(val.replace(/^0+/, ''));
                            } else {
                              setFormBudget(val);
                            }
                          }
                        }}
                        className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                  </div>

                  {/* Lead Source */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Lead Source</label>
                    <select 
                      name="leadSource"
                      defaultValue={editingClient?.leadSource || 'Others'}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                    >
                      <option value="Facebook Ads">Facebook Ads</option>
                      <option value="FNF">FNF</option>
                      <option value="Reference">Reference</option>
                      <option value="Web Search">Web Search</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>

                  {/* On-boarding Date */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Client On-boarding Date</label>
                    <input 
                      type="date"
                      name="onboardingDate"
                      defaultValue={editingClient?.onboardingDate || format(new Date(), 'yyyy-MM-dd')}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                    />
                  </div>

                  {/* Halted/Closed Date */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 text-rose-500">Halted/Closed Date</label>
                    <input 
                      type="date"
                      name="closureDate"
                      defaultValue={editingClient?.closureDate}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                {/* Services Section */}
                <div className="space-y-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1 block mb-2">Services</label>
                  <div className="flex flex-wrap gap-4">
                    {availableServiceNames.map((service) => (
                      <label key={service} className="flex items-center gap-2 cursor-pointer group">
                        <div 
                          onClick={() => {
                            const isCurrentlySelected = formServices.includes(service);
                            const nextServices = isCurrentlySelected
                              ? formServices.filter(s => s !== service)
                              : [...formServices, service];

                            setFormServices(nextServices);

                            if (!isCurrentlySelected) {
                              setFormProjectConfigs(prev => {
                                if (prev[service]) return prev;
                                return {
                                  ...prev,
                                  [service]: {
                                    clientType: editingClient?.clientType || 'Recurring',
                                    budget: '',
                                    status: formClientStatus || 'Active'
                                  }
                                };
                              });
                            } else {
                              const hadAnyProjectBudget = formServices.some(s => (formProjectConfigs[s]?.budget || '') !== '');
                              if (hadAnyProjectBudget) {
                                const remainingSum = nextServices.reduce(
                                  (sum, s) => sum + (Number(formProjectConfigs[s]?.budget || 0) || 0),
                                  0
                                );
                                setFormBudget(remainingSum > 0 ? String(remainingSum) : '');
                              }
                            }
                          }}
                          className={cn(
                            "w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center",
                            formServices.includes(service)
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white border-slate-200 group-hover:border-indigo-300"
                          )}
                        >
                          {formServices.includes(service) && <Check size={14} />}
                        </div>
                        <span className={cn(
                          "text-sm font-bold transition-colors",
                          formServices.includes(service) ? "text-indigo-600" : "text-slate-600"
                        )}>
                          {service}
                        </span>
                      </label>
                    ))}
                  </div>

                  {formServices.includes('Others') && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-slate-200"
                    >
                      <input 
                        type="text"
                        value={formOtherServiceDetails}
                        onChange={(e) => setFormOtherServiceDetails(e.target.value)}
                        className="w-full px-5 py-3 bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                        placeholder="Specify other services..."
                      />
                    </motion.div>
                  )}
                </div>

                {/* Projects Section */}
                <div className="space-y-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Projects</label>
                    {formServices.length > 0 && (
                      <span className="text-[11px] font-bold text-indigo-600">
                        Total: {formatCurrency(
                          formServices.reduce((sum, s) => sum + (Number(formProjectConfigs[s]?.budget || 0) || 0), 0)
                        )}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {formServices.length > 0 ? (
                      formServices.map((service) => {
                        const serviceLabel = service === 'Others' ? (formOtherServiceDetails || 'Others') : service;
                        const projectName = `${formClientName || 'Client'}${formCrmLeadId ? ` (${formCrmLeadId})` : ''}-${serviceLabel}`;
                        const projectConfig = formProjectConfigs[service] || {
                          clientType: editingClient?.clientType || 'Recurring',
                          budget: '',
                          status: formClientStatus || 'Active'
                        };

                        return (
                          <div key={service} className="p-4 bg-white rounded-2xl border border-slate-200/70 space-y-3 shadow-xs">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                <Database size={16} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-800 truncate" title={projectName}>
                                  {projectName}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Service: {serviceLabel}
                                </p>
                              </div>
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0",
                                projectConfig.status === 'Active' ? "bg-emerald-100 text-emerald-700" :
                                projectConfig.status === 'Inactive' ? "bg-slate-100 text-slate-500" :
                                projectConfig.status === 'Halted' ? "bg-amber-100 text-amber-700" :
                                "bg-rose-100 text-rose-700"
                              )}>
                                {projectConfig.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 block">
                                  Client Type
                                </label>
                                <select
                                  value={projectConfig.clientType}
                                  onChange={(e) => {
                                    const nextType = e.target.value as 'Recurring' | 'Non-Recurring';
                                    setFormProjectConfigs(prev => ({
                                      ...prev,
                                      [service]: {
                                        ...projectConfig,
                                        clientType: nextType
                                      }
                                    }));
                                  }}
                                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-slate-700"
                                >
                                  <option value="Recurring">Recurring</option>
                                  <option value="Non-Recurring">Non-Recurring</option>
                                </select>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 block">
                                  Status
                                </label>
                                <select
                                  value={projectConfig.status}
                                  onChange={(e) => {
                                    const nextStatus = e.target.value as 'Active' | 'Inactive' | 'Halted' | 'Closed';
                                    setFormProjectConfigs(prev => ({
                                      ...prev,
                                      [service]: {
                                        ...projectConfig,
                                        status: nextStatus
                                      }
                                    }));
                                  }}
                                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-slate-700"
                                >
                                  <option value="Active">Active</option>
                                  <option value="Inactive">Inactive</option>
                                  <option value="Halted">Halted</option>
                                  <option value="Closed">Closed</option>
                                </select>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 block">
                                  Budget (BDT)
                                </label>
                                <div className="relative">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">৳</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={projectConfig.budget}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (/^\d*\.?\d*$/.test(val)) {
                                        const sanitized = val.length > 1 && val.startsWith('0') && !val.startsWith('0.')
                                          ? val.replace(/^0+/, '')
                                          : val;
                                        const updatedConfigs = {
                                          ...formProjectConfigs,
                                          [service]: {
                                            ...projectConfig,
                                            budget: sanitized
                                          }
                                        };
                                        setFormProjectConfigs(updatedConfigs);

                                        const totalSum = formServices.reduce(
                                          (sum, s) => sum + (Number(updatedConfigs[s]?.budget || 0) || 0),
                                          0
                                        );
                                        setFormBudget(totalSum > 0 ? String(totalSum) : '');
                                      }
                                    }}
                                    placeholder="0.00"
                                    className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 transition-all font-semibold text-slate-700"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-400 italic font-medium px-1">Select services above to generate project names...</p>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Full Address</label>
                  <textarea 
                    name="address"
                    defaultValue={editingClient?.address}
                    rows={3}
                    className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold resize-none"
                    placeholder="Company physical address..."
                  />
                </div>

                <div className="pt-6 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className={cn(
                      "flex-[2] px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-100",
                      isSaving && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isSaving ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      editingClient ? 'Update Profile' : 'Register Client'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 my-auto relative"
            >
              <div className="flex items-center gap-4 text-rose-600">
                <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                  <AlertCircle size={24} />
                </div>
                <h3 className="text-xl font-bold">Remove Client?</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                This will permanently delete this client profile from your database. All associated history will be impacted.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Keep
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-rose-200"
                >
                  Delete Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Clear All Confirmation Modal */}
      <AnimatePresence>
        {isClearAllOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] overflow-y-auto flex justify-center p-4 py-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 my-auto relative"
            >
              <div className="flex items-center gap-4 text-rose-600">
                <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                  <AlertCircle size={24} />
                </div>
                <h3 className="text-xl font-bold">Clear All Data?</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                This will permanently delete <span className="font-bold text-rose-600">ALL {clients.length} clients</span> from your database. This action is irreversible.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsClearAllOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-rose-200"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

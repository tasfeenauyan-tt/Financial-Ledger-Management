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
import { Client, TransactionSubCategory } from '../types';
import { 
  Users, 
  Plus, 
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
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface ProjectClientDatabaseProps {
  userRole: string;
  transactionSubCategories: TransactionSubCategory[];
  onAddTransactionSubCategory: (sub: TransactionSubCategory) => Promise<void>;
}

export default function ProjectClientDatabase({ 
  userRole, 
  transactionSubCategories, 
  onAddTransactionSubCategory 
}: ProjectClientDatabaseProps) {
  const isAdmin = userRole === 'admin';
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Form State for auto-fill logic
  const [formCrmLeadId, setFormCrmLeadId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formProjectName, setFormProjectName] = useState('');
  const [isProjectNameAuto, setIsProjectNameAuto] = useState(true);

  useEffect(() => {
    if (isModalOpen) {
      if (editingClient) {
        const crmId = editingClient.crmLeadId || '';
        const name = editingClient.name || '';
        const currentProjectName = editingClient.projectName || '';
        const expectedAutoName = `${name}${crmId ? ` (${crmId})` : ''}`;
        
        setFormCrmLeadId(crmId);
        setFormClientName(name);
        setFormProjectName(currentProjectName);
        // Enable auto-reflect if it matches expected pattern or is empty
        setIsProjectNameAuto(!currentProjectName || currentProjectName === expectedAutoName);
      } else {
        setFormCrmLeadId('');
        setFormClientName('');
        setFormProjectName('');
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
    });
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
    
    // Create a local set of names that already exist or are being added in this batch
    const processedNames = new Set(transactionSubCategories.map(s => s.name.toLowerCase().trim()));
    
    try {
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
      
      if (count > 0) {
        alert(`Successfully synced ${count} project names to the Transaction Item Pool.`);
      } else {
        alert("All project names are already in the pool.");
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
    
    const clientData: Partial<Client> = {
      projectName: (formData.get('projectName') as string)?.trim() || 'Unnamed Project',
      crmLeadId: (formData.get('crmLeadId') as string)?.trim() || '',
      name: formData.get('name') as string,
      pocName: formData.get('pocName') as string,
      company: formData.get('company') as string,
      mobile: formData.get('mobile') as string,
      email: formData.get('email') as string,
      address: formData.get('address') as string,
      country: formData.get('country') as string,
      clientType: formData.get('clientType') as any,
      status: formData.get('status') as any,
      budget: Number(formData.get('budget')),
      onboardingDate: formData.get('onboardingDate') as string,
      closureDate: formData.get('closureDate') as string || '',
      leadSource: formData.get('leadSource') as any,
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
    const data = clients.map(c => ({
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
      'Lead Source': c.leadSource,
      'Client On-Boarding Date': c.onboardingDate,
      'Client Halted/Closed Date': c.closureDate
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.writeFile(wb, `Client_Database_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-indigo-600" />
            Project/Client Management System
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Manage project/client information.</p>
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-xl self-start md:self-center">
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
              title="Sync all current project names to Transaction Item Pool"
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
          {filteredClients.map(client => (
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
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID: {client.crmLeadId}</p>
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
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Project / Client</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Company</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Contact</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Budget</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredClients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50/50 transition-all group">
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
                {/* Project Name */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-indigo-600 uppercase tracking-widest px-1">Project Name</label>
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
                    {isProjectNameAuto ? "Auto-generating from Client Name & ID" : "Custom Project Name applied"}
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

                  {/* Client Type */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Client Type</label>
                    <select 
                      name="clientType"
                      defaultValue={editingClient?.clientType || 'Recurring'}
                      className="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                    >
                      <option value="Recurring">Recurring</option>
                      <option value="Non-Recurring">Non-Recurring</option>
                    </select>
                  </div>

                  {/* Client Status */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Client Status</label>
                    <select 
                      name="status"
                      defaultValue={editingClient?.status || 'Active'}
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
                        type="number"
                        name="budget"
                        defaultValue={editingClient?.budget}
                        className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-semibold"
                        placeholder="0.00"
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

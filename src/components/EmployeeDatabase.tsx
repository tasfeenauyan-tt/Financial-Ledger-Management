import * as React from 'react';
import { useState, useMemo } from 'react';
import { Employee } from '../types';
import { 
  Search, 
  Plus, 
  Download, 
  Trash2, 
  Edit2, 
  UserPlus, 
  FileSpreadsheet, 
  AlertCircle,
  X,
  CreditCard,
  MapPin,
  Calendar,
  Phone,
  Mail,
  User as UserIcon,
  ChevronRight,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { cn, formatCurrency, formatDate, calculateAge, displayDate } from '../lib/utils';

interface EmployeeDatabaseProps {
  employees: Employee[];
  userRole: string | null;
}

export default function EmployeeDatabase({ employees, userRole }: EmployeeDatabaseProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    return employees
      .filter(emp => 
        (emp.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.mobileNo || '').includes(searchTerm) ||
        (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.location || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true }));
  }, [employees, searchTerm]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (userRole === 'viewer') return;
    setError(null);

    const formData = new FormData(e.currentTarget);
    const employeeId = (formData.get('employeeId') as string || '').trim();
    const fullName = (formData.get('fullName') as string || '').trim();

    // Check for duplicate Employee ID
    if (employeeId !== '') {
      const isDuplicate = employees.some(emp => 
        (emp.employeeId || '').trim() === employeeId && emp.id !== editingEmployee?.id
      );
      if (isDuplicate) {
        setError(`Employee ID "${employeeId}" already exists. Please use a unique ID.`);
        return;
      }
    }

    const data: Partial<Employee> = {
      employeeId,
      fullName,
      shortName: formData.get('shortName') as string,
      mobileNo: formData.get('mobileNo') as string,
      email: formData.get('email') as string,
      nidNumber: formData.get('nidNumber') as string,
      dateOfBirth: formData.get('dateOfBirth') as string,
      gender: formData.get('gender') as string,
      bloodGroup: formData.get('bloodGroup') as string,
      location: formData.get('location') as string,
      emergencyPocName: formData.get('emergencyPocName') as string,
      emergencyPocMobile: formData.get('emergencyPocMobile') as string,
      relationshipWithPoc: formData.get('relationshipWithPoc') as string,
      joiningDate: formData.get('joiningDate') as string,
      startingSalary: Number(formData.get('startingSalary')),
      currentSalary: Number(formData.get('currentSalary')),
    };

    try {
      const id = editingEmployee?.id || doc(collection(db, 'employees')).id;
      const employeeData: Employee = {
        ...data,
        id,
        createdAt: editingEmployee?.createdAt || new Date().toISOString(),
      } as Employee;

      await setDoc(doc(db, 'employees', id), employeeData);
      setIsModalOpen(false);
      setEditingEmployee(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    }
  };

  const handleDelete = async (id: string) => {
    if (userRole === 'viewer') return;
    try {
      await deleteDoc(doc(db, 'employees', id));
      setIsDeleting(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
    }
  };

  const handleClearAll = async () => {
    if (userRole === 'viewer') return;
    try {
      const deletePromises = employees.map(emp => deleteDoc(doc(db, 'employees', emp.id)));
      await Promise.all(deletePromises);
      setIsClearingAll(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'employees');
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        for (const row of data) {
          const id = doc(collection(db, 'employees')).id;
          const employee: Employee = {
            id,
            employeeId: String(row['Employee ID'] || row['employeeId'] || ''),
            fullName: String(row['Employee Name (Full)'] || row['Employee Name'] || row['fullName'] || ''),
            shortName: String(row['Preferred Short Name'] || row['Short Name'] || row['shortName'] || ''),
            mobileNo: String(row['Mobile No'] || row['mobileNo'] || ''),
            email: String(row['Email Address'] || row['Email'] || row['email'] || ''),
            nidNumber: String(row['NID Number'] || row['NID'] || row['nidNumber'] || ''),
            dateOfBirth: formatDate(row['Date Of Birth'] || row['DOB'] || row['dateOfBirth'] || ''),
            gender: String(row['Gender'] || row['gender'] || ''),
            bloodGroup: String(row['Blood Group'] || row['bloodGroup'] || ''),
            location: String(row['Location (Current Stationed District Name)'] || row['Location'] || row['location'] || ''),
            emergencyPocName: String(row['Emergency POC Name'] || row['POC Name'] || row['emergencyPocName'] || ''),
            emergencyPocMobile: String(row['Emergency POC Mobile No'] || row['POC Mobile'] || row['emergencyPocMobile'] || ''),
            relationshipWithPoc: String(row['Relationship With POC'] || row['Relationship'] || row['relationshipWithPoc'] || ''),
            joiningDate: formatDate(row['Joining Date'] || row['joiningDate'] || ''),
            startingSalary: Number(row['Starting Salary'] || row['startingSalary'] || 0),
            currentSalary: Number(row['Current Salary'] || row['currentSalary'] || 0),
            createdAt: new Date().toISOString(),
          };
          if (employee.fullName) {
            await setDoc(doc(db, 'employees', id), employee);
          }
        }
      } catch (error) {
        console.error('Import error:', error);
      } finally {
        setIsImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const exportToExcel = () => {
    const data = filteredEmployees.map((emp, index) => ({
      'SI': index + 1,
      'Employee ID': emp.employeeId,
      'Employee Name (Full)': emp.fullName,
      'Preferred Short Name': emp.shortName,
      'Mobile No': emp.mobileNo,
      'Email Address': emp.email,
      'NID Number': emp.nidNumber,
      'Date Of Birth': emp.dateOfBirth,
      'Age': calculateAge(emp.dateOfBirth),
      'Gender': emp.gender,
      'Blood Group': emp.bloodGroup,
      'Location': emp.location,
      'Emergency POC Name': emp.emergencyPocName,
      'Emergency POC Mobile No': emp.emergencyPocMobile,
      'Relationship With POC': emp.relationshipWithPoc,
      'Joining Date': emp.joiningDate,
      'Starting Salary': emp.startingSalary,
      'Current Salary': emp.currentSalary
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, `Employee_Database_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Employee Database</h2>
            <p className="text-slate-500 mt-1">Manage official records of all employees</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsClearingAll(true)}
              disabled={userRole === 'viewer' || employees.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold rounded-xl transition-all disabled:opacity-50"
            >
              <Trash2 size={18} />
              Clear All
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all"
            >
              <Download size={18} />
              Export
            </button>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl cursor-pointer transition-all">
              <FileSpreadsheet size={18} />
              {isImporting ? 'Importing...' : 'Import XLS'}
              <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} disabled={isImporting || userRole === 'viewer'} />
            </label>
            <button
              onClick={() => { setEditingEmployee(null); setError(null); setIsModalOpen(true); }}
              disabled={userRole === 'viewer'}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={18} />
              Add Employee
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, ID, email, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
            <Filter size={18} />
            <span className="text-sm font-medium">{filteredEmployees.length} Records Found</span>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[2400px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-16">SI</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee ID</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Full Name</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Short Name</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Mobile No</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">NID Number</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">DOB</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Gender</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Blood Group</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Location</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">POC Name</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">POC Mobile</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Relationship</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Age</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Joining Date</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Starting Salary</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Current Salary</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center sticky right-0 bg-slate-50/50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredEmployees.map((emp, index) => (
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={emp.id}
                  className="hover:bg-slate-50/50 transition-colors group"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-slate-400">{index + 1}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-500 font-mono">{emp.employeeId}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">
                        {(emp.fullName || '?').charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-slate-900">{emp.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-600">{emp.shortName}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-600">{emp.mobileNo}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-xs text-slate-500">{emp.email}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-xs text-slate-600 font-mono">{emp.nidNumber}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-600">{displayDate(emp.dateOfBirth)}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-tighter ${
                      emp.gender === 'Male' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
                    }`}>
                      {emp.gender}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-xs font-bold text-rose-600">{emp.bloodGroup}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin size={12} className="text-indigo-400" />
                      {emp.location}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-700 font-medium">{emp.emergencyPocName}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-600">{emp.emergencyPocMobile}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-xs text-slate-500 italic">{emp.relationshipWithPoc}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                      {calculateAge(emp.dateOfBirth)}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-600">{displayDate(emp.joiningDate)}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-600">{formatCurrency(emp.startingSalary, true)}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-emerald-600">{formatCurrency(emp.currentSalary, true)}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white group-hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => { setEditingEmployee(emp); setError(null); setIsModalOpen(true); }}
                        disabled={userRole === 'viewer'}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-30"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setIsDeleting(emp.id)}
                        disabled={userRole === 'viewer'}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filteredEmployees.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={32} className="text-slate-200" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No employees found</h3>
              <p className="text-slate-500">Try adjusting your search or add a new employee record.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal for Add/Edit */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center overflow-y-auto p-4 py-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-8 relative"
            >
              <button
                onClick={() => { setIsModalOpen(false); setEditingEmployee(null); setError(null); }}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={24} />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-bold text-slate-900">
                  {editingEmployee ? 'Edit Employee Record' : 'Add New Employee'}
                </h3>
                <p className="text-slate-500">Fill in details for official records</p>
                {error && (
                  <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-sm animate-shake">
                    <AlertCircle size={18} />
                    <span className="font-medium">{error}</span>
                  </div>
                )}
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-4 md:col-span-1">
                    <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest pb-2 border-b border-indigo-50">Identity</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Employee ID</label>
                        <input
                          name="employeeId"
                          defaultValue={editingEmployee?.employeeId}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="EMP-001"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Full Name</label>
                        <input
                          name="fullName"
                          defaultValue={editingEmployee?.fullName}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Short Name</label>
                        <input
                          name="shortName"
                          defaultValue={editingEmployee?.shortName}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">NID Number</label>
                        <input
                          name="nidNumber"
                          defaultValue={editingEmployee?.nidNumber}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Personal & Contact */}
                  <div className="space-y-4 md:col-span-1">
                    <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest pb-2 border-b border-indigo-50">Personal & Contact</h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">DOB</label>
                          <input
                            name="dateOfBirth"
                            type="date"
                            defaultValue={editingEmployee?.dateOfBirth}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Gender</label>
                          <select
                            name="gender"
                            defaultValue={editingEmployee?.gender || ''}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                          >
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Blood Group</label>
                        <select
                          name="bloodGroup"
                          defaultValue={editingEmployee?.bloodGroup || ''}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                        >
                          <option value="">Select Blood Group</option>
                          <option value="A+">A+</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B-">B-</option>
                          <option value="O+">O+</option>
                          <option value="O-">O-</option>
                          <option value="AB+">AB+</option>
                          <option value="AB-">AB-</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Mobile No</label>
                        <input
                          name="mobileNo"
                          defaultValue={editingEmployee?.mobileNo}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="+880..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Email</label>
                        <input
                          name="email"
                          type="email"
                          defaultValue={editingEmployee?.email}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Company & Location */}
                  <div className="space-y-4 md:col-span-1">
                    <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest pb-2 border-b border-indigo-50">Employment</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Location</label>
                        <input
                          name="location"
                          defaultValue={editingEmployee?.location}
                          placeholder="District Name"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Joining Date</label>
                        <input
                          name="joiningDate"
                          type="date"
                          defaultValue={editingEmployee?.joiningDate}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Starting Salary</label>
                        <input
                          name="startingSalary"
                          type="number"
                          defaultValue={editingEmployee?.startingSalary || ''}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Current Salary</label>
                        <input
                          name="currentSalary"
                          type="number"
                          defaultValue={editingEmployee?.currentSalary || ''}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency POC Section */}
                <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle size={14} className="text-rose-500" />
                    Emergency Point of Contact
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">POC Name</label>
                      <input
                        name="emergencyPocName"
                        defaultValue={editingEmployee?.emergencyPocName}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">POC Mobile</label>
                      <input
                        name="emergencyPocMobile"
                        defaultValue={editingEmployee?.emergencyPocMobile}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 ml-1">Relationship</label>
                      <input
                        name="relationshipWithPoc"
                        defaultValue={editingEmployee?.relationshipWithPoc}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Spouse, Parent, etc."
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setEditingEmployee(null); setError(null); }}
                    className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Plus size={20} />
                    {editingEmployee ? 'Update Records' : 'Register Employee'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleting && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-6"
            >
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mx-auto">
                <Trash2 size={24} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900">Delete Employee?</h3>
                <p className="text-slate-500 text-sm mt-1">This action cannot be undone. All official records for this employee will be removed.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleting(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(isDeleting)}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear All Confirmation Modal */}
      <AnimatePresence>
        {isClearingAll && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-6"
            >
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mx-auto">
                <AlertCircle size={24} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900">Clear All Records?</h3>
                <p className="text-slate-500 text-sm mt-1">This will permanently delete ALL {employees.length} employee records. This action is irreversible.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsClearingAll(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-rose-100"
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

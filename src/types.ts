export type UserRole = 'admin' | 'viewer';

export interface AppUser {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  category: 'Asset' | 'Liability' | 'Equity';
}

export interface TransactionItem {
  id: string;
  name: string;
}

export interface TransactionSubCategory {
  id: string;
  name: string;
}

export interface Partner {
  id: string;
  name: string;
}

export interface ZakatSettings {
  id: string;
  nisabAmount: number;
  startDate: string;
}

export interface CustomAccountEntry {
  id: string;
  accountId: string;
  accountName: string;
  accountCategory: 'Asset' | 'Liability' | 'Equity';
  amount: number;
  type: 'Dr' | 'Cr';
}

export interface LedgerEntry {
  id: string;
  date: string;
  transactionItemId: string;
  transactionItemName: string;
  details: string;
  customEntries: CustomAccountEntry[];
  remarksId: string;
  remarks: string;
  notes: string;
  createdAt: string;
}

export interface Client {
  id: string;
  projectName: string;
  crmLeadId: string;
  name: string;
  pocName: string;
  company: string;
  mobile: string;
  email: string;
  address: string;
  country: string;
  clientType: 'Recurring' | 'Non-Recurring';
  status: 'Active' | 'Inactive' | 'Halted' | 'Closed';
  budget: number;
  onboardingDate: string;
  closureDate?: string;
  leadSource: 'Facebook Ads' | 'FNF' | 'Reference' | 'Web Search' | 'Others';
  createdAt: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  date: string;
  serviceDate?: string;
  dueDate: string;
  paymentAccountId?: string;
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  badDebtAmount?: number;
  status: 'Unpaid' | 'Partial' | 'Paid' | 'Carry Forward' | 'Bad Debt';
  carriedToInvoiceNumber?: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber?: string;
  clientId: string;
  amount: number;
  badDebtAmount?: number;
  date: string;
  method: string;
  bankAccountId?: string;
  notes: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  accountTitleName: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName: string;
  routingNumber: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeId: string;
  fullName: string;
  shortName: string;
  mobileNo: string;
  email: string;
  nidNumber: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  location: string;
  emergencyPocName: string;
  emergencyPocMobile: string;
  relationshipWithPoc: string;
  joiningDate: string;
  startingSalary: number;
  currentSalary: number;
  createdAt: string;
}

export interface LedgerTotals {
  assets: number;
  liabilities: number;
  equity: number;
}

export const INITIAL_ENTRY: Omit<LedgerEntry, 'id'> = {
  date: new Date().toISOString().split('T')[0],
  transactionItemId: '',
  transactionItemName: '',
  details: '',
  customEntries: [],
  remarksId: '',
  remarks: '',
  notes: '',
  createdAt: new Date().toISOString(),
};

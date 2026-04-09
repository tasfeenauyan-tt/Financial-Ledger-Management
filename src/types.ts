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

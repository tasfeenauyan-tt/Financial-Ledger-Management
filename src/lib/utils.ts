import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, isPDF: boolean = false) {
  const symbol = isPDF ? "Tk." : "৳";
  return symbol + " " + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateInput: any): string {
  if (!dateInput) return '';
  
  let date: Date;

  // If it's an Excel numeric date
  if (typeof dateInput === 'number') {
    // Excel dates are number of days since 1899-12-30
    date = new Date(Math.round((dateInput - 25569) * 86400 * 1000));
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    // Try parsing the string
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) {
    // Fallback if parsing fails - maybe it's DD/MM/YYYY
    if (typeof dateInput === 'string' && dateInput.includes('/')) {
      const parts = dateInput.split('/');
      if (parts.length === 3) {
        // Try assuming DD/MM/YYYY or MM/DD/YYYY
        // For now, let's keep it simple or try a more robust parser if needed
        // Just return as is if we can't be sure
      }
    }
    return String(dateInput);
  }
  
  // Return YYYY-MM-DD for consistency in DB and <input type="date">
  return date.toISOString().split('T')[0];
}

export function displayDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function calculateAge(birthDate: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return 0;
  
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

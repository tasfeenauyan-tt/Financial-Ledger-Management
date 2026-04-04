import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateInput: any): string {
  if (!dateInput) return '';
  
  // If it's an Excel numeric date
  if (typeof dateInput === 'number') {
    const date = new Date(Math.round((dateInput - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  
  return date.toISOString().split('T')[0];
}

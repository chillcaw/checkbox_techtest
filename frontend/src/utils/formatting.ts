import { SLAStatus, CurrencyValue } from '../types/matter';

export function formatCurrency(value: CurrencyValue | null): string {
  if (!value || typeof value !== 'object') return 'N/A';
  
  const { amount, currency } = value;
  if (amount === null || amount === undefined) return 'N/A';
  
  return `${amount.toLocaleString()} ${currency}`;
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
}

export function formatBoolean(value: boolean | null): string {
  if (value === null || value === undefined) return 'N/A';
  return value ? '✓' : '✗';
}

export function getSLABadgeColor(sla: SLAStatus): string {
  switch (sla) {
    case 'In Progress':
      return 'bg-blue-100 text-blue-800';
    case 'Met':
      return 'bg-green-100 text-green-800';
    case 'Breached':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusBadgeColor(statusLabel: string): string {
  switch (statusLabel.toLowerCase()) {
    case 'to do':
      return 'bg-gray-100 text-gray-800';
    case 'in progress':
      return 'bg-blue-100 text-blue-800';
    case 'done':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-purple-100 text-purple-800';
  }
}


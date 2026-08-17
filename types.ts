// Implementing the application's shared TypeScript types
export type NoteCounts = {
  [denomination: number]: number;
};

export type TransactionType = 'credit' | 'debit';
export type PaymentMethod = 'cash' | 'upi';

export interface Transaction {
  id: string;
  date: string; // ISO string format
  manualDate?: string; // Optional manual date from user input
  type: TransactionType;
  paymentMethod: PaymentMethod;
  company?: string; // Optional
  person?: string; // Optional
  bank?: string; // Optional: which bank the payment was made to
  slip?: string; // Optional: base64 image data or URL for the transaction slip
  location: string;
  recordedBy: string;
  amount: number;
  notes: string;
  breakdown: NoteCounts; // For cash transactions only
  isSynced?: boolean; // Track if this transaction has been synced to Aiven PostgreSQL
  isSettlement?: boolean; // Track if this is an automated settlement transaction
  clientId?: string; // Stable local ID used to prevent duplicate server inserts
  cashClosingBalance?: number; // Authoritative cumulative cash balance supplied by PostgreSQL
}

export interface CompanySummary {
  companyName: string;
  totalCredit: number;
  totalDebit: number;
  netBalance: number;
}

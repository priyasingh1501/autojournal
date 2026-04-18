/**
 * SMSSpendService — disabled.
 * READ_SMS permission removed; feature returns empty data silently.
 */

export interface SMSTransaction {
  amount: number;
  merchant: string;
  date: Date;
  raw: string;
}

export async function syncSMSTransactionsToNotes(): Promise<void> {}

export async function getSMSSpendCategories(): Promise<[]> {
  return [];
}

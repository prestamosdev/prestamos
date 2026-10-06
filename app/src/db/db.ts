import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Una base por prestamista: aislamiento físico local entre cuentas del mismo dispositivo. */
export function getDb(lenderId: string): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(`prestamos_${lenderId}.db`);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS clients (
          id TEXT PRIMARY KEY, lender_id TEXT NOT NULL, name TEXT NOT NULL,
          document_id TEXT, phone TEXT, address TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS loans (
          id TEXT PRIMARY KEY, lender_id TEXT NOT NULL, client_id TEXT NOT NULL,
          amount REAL NOT NULL, interest_rate REAL NOT NULL, interest_type TEXT NOT NULL,
          frequency TEXT NOT NULL, installments INTEGER NOT NULL, status TEXT NOT NULL,
          start_date TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY, lender_id TEXT NOT NULL, loan_id TEXT NOT NULL,
          amount_paid REAL NOT NULL, capital_portion REAL NOT NULL, interest_portion REAL NOT NULL,
          remaining_balance REAL NOT NULL, payment_date TEXT NOT NULL, reversed_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS payment_audit (
          id TEXT PRIMARY KEY, lender_id TEXT NOT NULL, payment_id TEXT NOT NULL,
          action TEXT NOT NULL, old_values TEXT, new_values TEXT,
          created_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_loans_client ON loans(client_id);
        CREATE INDEX IF NOT EXISTS idx_pay_loan ON payments(loan_id);
        CREATE INDEX IF NOT EXISTS idx_pay_date ON payments(payment_date);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export function resetDb() {
  dbPromise = null;
}

export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const nowIso = () => new Date().toISOString();
export const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

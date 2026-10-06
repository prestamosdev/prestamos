import { getDb, nowIso, todayIso, uuid } from './db';
import {
  buildLedger, computeStatus, splitSinglePayment, LoanStatus, LedgerState, RawPayment
} from '../domain/amortization';

export interface Client {
  id: string; lender_id: string; name: string; document_id: string | null;
  phone: string | null; address: string | null;
}
export interface Loan {
  id: string; lender_id: string; client_id: string; amount: number; interest_rate: number;
  interest_type: string; frequency: string; installments: number;
  status: LoanStatus; start_date: string;
}
export interface Payment {
  id: string; lender_id: string; loan_id: string; amount_paid: number; capital_portion: number;
  interest_portion: number; remaining_balance: number; payment_date: string; reversed_at: string | null;
}

// ---------- Clientes ----------
export async function listClients(lender: string): Promise<Client[]> {
  const db = await getDb(lender);
  return db.getAllAsync<Client>(
    'SELECT * FROM clients WHERE lender_id=? AND deleted_at IS NULL ORDER BY name', [lender]);
}

export async function getClient(lender: string, id: string): Promise<Client | null> {
  const db = await getDb(lender);
  return db.getFirstAsync<Client>('SELECT * FROM clients WHERE id=? AND lender_id=?', [id, lender]);
}

export async function saveClient(lender: string, c: Partial<Client> & { name: string }): Promise<string> {
  const db = await getDb(lender);
  const t = nowIso();
  if (c.id) {
    await db.runAsync(
      'UPDATE clients SET name=?,document_id=?,phone=?,address=?,updated_at=?,synced=0 WHERE id=? AND lender_id=?',
      [c.name, c.document_id ?? null, c.phone ?? null, c.address ?? null, t, c.id, lender]);
    return c.id;
  }
  const id = uuid();
  await db.runAsync(
    'INSERT INTO clients(id,lender_id,name,document_id,phone,address,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
    [id, lender, c.name, c.document_id ?? null, c.phone ?? null, c.address ?? null, t, t]);
  return id;
}

export async function deleteClient(lender: string, id: string) {
  const db = await getDb(lender);
  const t = nowIso();
  await db.runAsync('UPDATE clients SET deleted_at=?,updated_at=?,synced=0 WHERE id=? AND lender_id=?', [t, t, id, lender]);
}

// ---------- Préstamos ----------
export async function createLoan(
  lender: string,
  l: Omit<Loan, 'id' | 'lender_id' | 'status'>,
): Promise<string> {
  const db = await getDb(lender);
  const id = uuid();
  const t = nowIso();
  await db.runAsync(
    `INSERT INTO loans(id,lender_id,client_id,amount,interest_rate,interest_type,frequency,installments,status,start_date,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, lender, l.client_id, l.amount, l.interest_rate, 'simple', 'monthly',
      l.installments, 'active', l.start_date, t, t]);
  return id;
}

export async function getLoan(lender: string, id: string): Promise<Loan | null> {
  const db = await getDb(lender);
  return db.getFirstAsync<Loan>('SELECT * FROM loans WHERE id=? AND lender_id=?', [id, lender]);
}

export async function listLoans(lender: string, clientId?: string): Promise<Loan[]> {
  const db = await getDb(lender);
  return clientId
    ? db.getAllAsync<Loan>(
        'SELECT * FROM loans WHERE lender_id=? AND client_id=? AND deleted_at IS NULL ORDER BY start_date DESC', [lender, clientId])
    : db.getAllAsync<Loan>(
        'SELECT * FROM loans WHERE lender_id=? AND deleted_at IS NULL ORDER BY start_date DESC', [lender]);
}

export async function listPayments(lender: string, loanId: string): Promise<Payment[]> {
  const db = await getDb(lender);
  return db.getAllAsync<Payment>(
    'SELECT * FROM payments WHERE lender_id=? AND loan_id=? ORDER BY payment_date DESC', [lender, loanId]);
}

export interface LoanSummary { balance: number; paid: number; status: LoanStatus; pendingInterest: number; totalInterestGenerated: number }

export async function loanSummary(lender: string, loan: Loan | string): Promise<LoanSummary> {
  const l = typeof loan === 'string' ? await getLoan(lender, loan) : loan;
  if (!l) throw new Error('Préstamo no encontrado');
  
  const pays = await listPayments(lender, l.id);
  const validPays: RawPayment[] = pays.filter(p => !p.reversed_at).map(p => ({
    id: p.id,
    date: p.payment_date,
    amount: p.amount_paid
  }));
  
  const state = buildLedger({
    amount: l.amount,
    monthlyRate: l.interest_rate,
    startDate: l.start_date
  }, validPays, todayIso());

  return { 
    balance: state.capitalBalance, 
    paid: state.totalPaid, 
    status: computeStatus(state),
    pendingInterest: state.pendingInterest,
    totalInterestGenerated: state.totalInterestGenerated
  };
}

async function refreshStatus(lender: string, loanId: string) {
  const loan = await getLoan(lender, loanId);
  if (!loan) return;
  const s = await loanSummary(lender, loan);
  const db = await getDb(lender);
  await db.runAsync('UPDATE loans SET status=?,updated_at=?,synced=0 WHERE id=?', [s.status, nowIso(), loanId]);
}

// ---------- Abonos ----------
export async function addPayment(lender: string, loanId: string, amount: number): Promise<string> {
  const l = await getLoan(lender, loanId);
  if (!l) throw new Error('Préstamo no encontrado');
  if (!(amount > 0)) throw new Error('El monto debe ser mayor a 0');
  
  const pays = await listPayments(lender, loanId);
  const validPays: RawPayment[] = pays.filter(p => !p.reversed_at).map(p => ({
    id: p.id,
    date: p.payment_date,
    amount: p.amount_paid
  }));
  
  const state = buildLedger({
    amount: l.amount,
    monthlyRate: l.interest_rate,
    startDate: l.start_date
  }, validPays, todayIso());

  if (state.capitalBalance <= 0 && state.pendingInterest <= 0) {
    throw new Error('El préstamo ya está finalizado');
  }

  const split = splitSinglePayment(amount, state.pendingInterest, state.capitalBalance);
  
  const db = await getDb(lender);
  const id = uuid();
  const t = nowIso();
  await db.runAsync(
    `INSERT INTO payments(id,lender_id,loan_id,amount_paid,capital_portion,interest_portion,remaining_balance,payment_date,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id, lender, loanId, amount, split.capital, split.interest, split.remaining, t, t, t]);
  await refreshStatus(lender, loanId);
  return id;
}

async function audit(lender: string, paymentId: string, action: 'edit' | 'reverse', oldV: unknown, newV: unknown) {
  const db = await getDb(lender);
  await db.runAsync(
    'INSERT INTO payment_audit(id,lender_id,payment_id,action,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?)',
    [uuid(), lender, paymentId, action, JSON.stringify(oldV), JSON.stringify(newV), nowIso()]);
}

/** Revierte un abono (no se borra: queda marcado y auditado). */
export async function reversePayment(lender: string, paymentId: string) {
  const db = await getDb(lender);
  const p = await db.getFirstAsync<Payment>('SELECT * FROM payments WHERE id=? AND lender_id=?', [paymentId, lender]);
  if (!p || p.reversed_at) return;
  const t = nowIso();
  await db.runAsync('UPDATE payments SET reversed_at=?,updated_at=?,synced=0 WHERE id=?', [t, t, paymentId]);
  await audit(lender, paymentId, 'reverse', p, { reversed_at: t });
  await refreshStatus(lender, p.loan_id);
}

/** Edita un abono: revierte el original y registra uno nuevo con el monto corregido. */
export async function editPayment(lender: string, paymentId: string, newAmount: number): Promise<string> {
  const db = await getDb(lender);
  const p = await db.getFirstAsync<Payment>('SELECT * FROM payments WHERE id=? AND lender_id=?', [paymentId, lender]);
  if (!p) throw new Error('Abono no encontrado');
  await reversePayment(lender, paymentId);
  const newId = await addPayment(lender, p.loan_id, newAmount);
  await audit(lender, paymentId, 'edit', { amount_paid: p.amount_paid }, { amount_paid: newAmount, new_payment_id: newId });
  return newId;
}

// ---------- Datos para reportes ----------
export interface PaymentRow extends Payment { client_name: string; client_id: string }

export async function paymentsInRange(
  lender: string, from: string, to: string, clientId?: string,
): Promise<PaymentRow[]> {
  const db = await getDb(lender);
  const args: (string)[] = [
    lender,
    new Date(from + 'T00:00:00').toISOString(),
    new Date(to + 'T23:59:59.999').toISOString(),
  ];
  let sql = `SELECT p.*, c.name AS client_name, c.id AS client_id FROM payments p
    JOIN loans l ON l.id=p.loan_id JOIN clients c ON c.id=l.client_id
    WHERE p.lender_id=? AND p.reversed_at IS NULL AND p.payment_date>=? AND p.payment_date<=?`;
  if (clientId) { sql += ' AND c.id=?'; args.push(clientId); }
  sql += ' ORDER BY p.payment_date';
  return db.getAllAsync<PaymentRow>(sql, args);
}

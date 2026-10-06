export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/**
 * Tipos de interés soportados (extensible: agregar una clave y una función en `builders`).
 * - french:        cuota fija, interés sobre saldo (sistema francés)
 * - simple:        interés simple sobre el capital total, repartido en cuotas iguales
 * - german:        capital fijo por cuota, interés sobre saldo (cuota decreciente)
 * - interest_only: solo intereses cada periodo, capital en la última cuota
 */
export type InterestType = 'french' | 'simple' | 'german' | 'interest_only';

export const INTEREST_TYPE_LABELS: Record<InterestType, string> = {
  french: 'Cuota fija (francés)',
  simple: 'Interés simple',
  german: 'Capital fijo (alemán)',
  interest_only: 'Solo interés, capital al final',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

export interface LoanTerms {
  amount: number;
  /** Tasa MENSUAL en porcentaje (ej. 10 = 10% mensual). */
  monthlyRate: number;
  frequency: Frequency;
  installments: number;
  interestType: InterestType;
  /** ISO yyyy-mm-dd */
  startDate: string;
}

export interface Installment {
  number: number;
  dueDate: string;
  payment: number;
  capital: number;
  interest: number;
  balance: number;
}

const round = (n: number) => Math.round(n);

/** Convierte la tasa mensual a tasa por periodo de pago. */
export function periodRate(monthlyRate: number, frequency: Frequency): number {
  const r = monthlyRate / 100;
  switch (frequency) {
    case 'daily': return r / 30;
    case 'weekly': return (r * 7) / 30;
    case 'biweekly': return r / 2;
    case 'monthly': return r;
  }
}

export function addPeriod(iso: string, frequency: Frequency, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (frequency === 'monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + n);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else {
    const days = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 15;
    date.setUTCDate(date.getUTCDate() + days * n);
  }
  return date.toISOString().slice(0, 10);
}

type Raw = { capital: number; interest: number };

const builders: Record<InterestType, (P: number, i: number, n: number) => Raw[]> = {
  french(P, i, n) {
    const pmt = i === 0 ? P / n : (P * i) / (1 - Math.pow(1 + i, -n));
    const rows: Raw[] = [];
    let bal = P;
    for (let k = 0; k < n; k++) {
      const interest = bal * i;
      rows.push({ capital: pmt - interest, interest });
      bal -= pmt - interest;
    }
    return rows;
  },
  simple(P, i, n) {
    const interest = P * i;
    return Array.from({ length: n }, () => ({ capital: P / n, interest }));
  },
  german(P, i, n) {
    const cap = P / n;
    return Array.from({ length: n }, (_, k) => ({ capital: cap, interest: (P - cap * k) * i }));
  },
  interest_only(P, i, n) {
    return Array.from({ length: n }, (_, k) => ({ capital: k === n - 1 ? P : 0, interest: P * i }));
  },
};

export function buildSchedule(t: LoanTerms): Installment[] {
  if (t.amount <= 0 || t.installments < 1) return [];
  const i = periodRate(t.monthlyRate, t.frequency);
  const raw = builders[t.interestType](t.amount, i, t.installments);
  let balance = t.amount;
  return raw.map((r, idx) => {
    const last = idx === raw.length - 1;
    const capital = last ? balance : Math.min(round(r.capital), balance);
    const interest = round(r.interest);
    balance -= capital;
    return {
      number: idx + 1,
      dueDate: addPeriod(t.startDate, t.frequency, idx + 1),
      payment: capital + interest,
      capital,
      interest,
      balance,
    };
  });
}

export function totalInterest(s: Installment[]): number {
  return s.reduce((a, r) => a + r.interest, 0);
}

export type LoanStatus = 'active' | 'on_time' | 'overdue' | 'finished';

export const STATUS_LABELS: Record<LoanStatus, string> = {
  active: 'Activo',
  on_time: 'Al día',
  overdue: 'En mora',
  finished: 'Finalizado',
};

/**
 * Estado del préstamo: compara lo pagado acumulado contra lo que debía estar
 * pagado a la fecha `today` según el cronograma.
 */
export function computeStatus(
  schedule: Installment[],
  totalPaid: number,
  today: string,
  outstandingBalance: number,
): LoanStatus {
  if (outstandingBalance <= 0) return 'finished';
  const dueSoFar = schedule.filter((r) => r.dueDate <= today).reduce((a, r) => a + r.payment, 0);
  if (dueSoFar === 0) return 'active';
  return totalPaid + 1 >= dueSoFar ? 'on_time' : 'overdue';
}

/**
 * Reparte un abono: primero a los intereses pendientes de la cuota en curso,
 * el resto a capital. `previouslyPaid` es el total abonado antes de este pago.
 */
export function splitPayment(
  amountPaid: number,
  schedule: Installment[],
  previouslyPaid: number,
  currentBalance: number,
): { interest: number; capital: number; remaining: number } {
  let cursor = 0;
  let interestDue = 0;
  for (const r of schedule) {
    const end = cursor + r.payment;
    if (previouslyPaid < end) {
      const paidInRow = Math.max(0, previouslyPaid - cursor);
      // Los intereses de la cuota se consideran cubiertos primero.
      interestDue = Math.max(0, r.interest - paidInRow);
      break;
    }
    cursor = end;
  }
  const interest = Math.min(amountPaid, interestDue);
  const capital = Math.min(amountPaid - interest, currentBalance);
  return { interest, capital, remaining: currentBalance - capital };
}

export const formatCOP = (n: number): string =>
  '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

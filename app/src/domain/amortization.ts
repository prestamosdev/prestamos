export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type InterestType = 'french' | 'simple' | 'german' | 'interest_only';

export const INTEREST_TYPE_LABELS: Record<InterestType, string> = {
  french: 'Interés sobre saldos',
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
  monthlyRate: number;
  startDate: string;
}

export type LoanStatus = 'active' | 'on_time' | 'overdue' | 'finished';
export const STATUS_LABELS: Record<LoanStatus, string> = {
  active: 'Al día',
  on_time: 'Al día',
  overdue: 'En mora',
  finished: 'Finalizado',
};

export const formatCOP = (n: number): string =>
  '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Añade N meses a una fecha ISO
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + n);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

// Representa los pagos realizados
export interface RawPayment {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
}

// Representa el estado del préstamo después de procesar eventos
export interface LedgerState {
  capitalBalance: number;
  pendingInterest: number;
  totalPaid: number;
  totalInterestGenerated: number;
  isFinished: boolean;
}

// Motor de Libro Mayor (Ledger)
// Viaja en el tiempo desde startDate hasta `evaluateUntilDate`
export function buildLedger(
  terms: LoanTerms,
  payments: RawPayment[],
  evaluateUntilDate: string
): LedgerState {
  let capital = terms.amount;
  let pendingInterest = 0;
  let totalPaid = 0;
  let totalInterestGenerated = 0;
  
  // Ordenar pagos por fecha
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  let paymentIdx = 0;

  // Fecha de evaluación (hoy o la fecha de cierre)
  const limitDate = evaluateUntilDate < terms.startDate ? terms.startDate : evaluateUntilDate;

  let currentMonthAnniversary = addMonths(terms.startDate, 1);
  const rate = terms.monthlyRate / 100;

  // Simular línea de tiempo por cada evento (aniversario mensual o pago)
  while (true) {
    const nextPayment = sortedPayments[paymentIdx];
    
    // El próximo evento es un aniversario mensual si ocurre ANTES O AL MISMO TIEMPO que el próximo pago
    // (Acreditamos los intereses primero si caen en el mismo día)
    let isAnniversaryNext = false;
    if (currentMonthAnniversary <= limitDate) {
      if (!nextPayment || currentMonthAnniversary <= nextPayment.date.slice(0, 10)) {
        isAnniversaryNext = true;
      }
    }

    if (isAnniversaryNext) {
      // Evento: Generar interés mensual
      if (capital > 0) {
        const generated = capital * rate;
        pendingInterest += generated;
        totalInterestGenerated += generated;
      }
      currentMonthAnniversary = addMonths(currentMonthAnniversary, 1);
    } 
    else if (nextPayment && nextPayment.date.slice(0, 10) <= limitDate) {
      // Evento: Pago
      let remainingPayment = nextPayment.amount;
      totalPaid += remainingPayment;
      
      // 1. Pagar intereses pendientes primero
      if (pendingInterest > 0) {
        const coverInterest = Math.min(remainingPayment, pendingInterest);
        pendingInterest -= coverInterest;
        remainingPayment -= coverInterest;
      }
      // 2. Lo que sobre va a capital
      if (remainingPayment > 0) {
        capital = Math.max(0, capital - remainingPayment);
      }
      paymentIdx++;
    } 
    else {
      break; // No hay más eventos antes del limitDate
    }
  }

  return {
    capitalBalance: capital,
    pendingInterest: pendingInterest,
    totalPaid,
    totalInterestGenerated,
    isFinished: capital <= 0 && pendingInterest <= 0,
  };
}

// Función auxiliar para determinar cómo se divide un pago específico HOY
export function splitSinglePayment(
  amountPaid: number,
  pendingInterest: number,
  currentCapital: number
): { interest: number; capital: number; remaining: number } {
  const interest = Math.min(amountPaid, pendingInterest);
  const capital = Math.min(amountPaid - interest, currentCapital);
  return { interest, capital, remaining: currentCapital - capital };
}

export function computeStatus(state: LedgerState): LoanStatus {
  if (state.isFinished) return 'finished';
  if (state.pendingInterest > 0) return 'overdue';
  return 'on_time';
}

import {
  buildSchedule, addPeriod, periodRate, totalInterest, computeStatus, splitPayment, formatCOP, LoanTerms,
} from '../amortization';

const base: LoanTerms = {
  amount: 1_000_000, monthlyRate: 10, frequency: 'monthly', installments: 4,
  interestType: 'french', startDate: '2026-01-31',
};

describe('amortization', () => {
  test('capital siempre suma el monto prestado en todos los tipos', () => {
    for (const t of ['french', 'simple', 'german', 'interest_only'] as const) {
      const s = buildSchedule({ ...base, interestType: t });
      expect(s).toHaveLength(4);
      expect(s.reduce((a, r) => a + r.capital, 0)).toBe(base.amount);
      expect(s[3].balance).toBe(0);
    }
  });

  test('interés simple: 10% mensual x 4 meses = 400.000 de interés', () => {
    const s = buildSchedule({ ...base, interestType: 'simple' });
    expect(totalInterest(s)).toBe(400_000);
    expect(s[0].payment).toBe(350_000);
  });

  test('francés: cuota constante (±1 por redondeo)', () => {
    const s = buildSchedule(base);
    expect(Math.abs(s[0].payment - s[1].payment)).toBeLessThanOrEqual(2);
    expect(s[0].interest).toBe(100_000);
  });

  test('tasa por periodo', () => {
    expect(periodRate(30, 'daily')).toBeCloseTo(0.01);
    expect(periodRate(10, 'biweekly')).toBeCloseTo(0.05);
  });

  test('fechas mensuales respetan fin de mes', () => {
    expect(addPeriod('2026-01-31', 'monthly', 1)).toBe('2026-02-28');
    expect(addPeriod('2026-01-01', 'weekly', 2)).toBe('2026-01-15');
  });

  test('estado: mora, al día y finalizado', () => {
    const s = buildSchedule({ ...base, interestType: 'simple', startDate: '2026-01-01' });
    expect(computeStatus(s, 0, '2026-01-02', 1_000_000)).toBe('active');
    expect(computeStatus(s, 0, '2026-03-01', 1_000_000)).toBe('overdue');
    expect(computeStatus(s, 350_000, '2026-02-01', 750_000)).toBe('on_time');
    expect(computeStatus(s, 1_400_000, '2026-06-01', 0)).toBe('finished');
  });

  test('abono cubre interés primero y luego capital', () => {
    const s = buildSchedule({ ...base, interestType: 'simple' });
    const r = splitPayment(350_000, s, 0, 1_000_000);
    expect(r.interest).toBe(100_000);
    expect(r.capital).toBe(250_000);
    expect(r.remaining).toBe(750_000);
  });

  test('formato COP', () => {
    expect(formatCOP(1234567)).toBe('$ 1.234.567');
  });
});

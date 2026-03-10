import { calculateSalary } from '../src/utils/salary';

describe('salary calculation', () => {
  it('calculates net salary with late threshold deduction', () => {
    const out = calculateSalary({
      month: '2026-03',
      basicSalary: 31000,
      presentDays: 20,
      absentDays: 2,
      halfDays: 2,
      lateEntries: 6,
      overtimeRatePerHour: 100,
      overtimeHours: 5,
      lateThreshold: 3,
      lateDeductionDays: 0.5,
    });

    expect(out.totalDaysInMonth).toBe(31);
    expect(out.lateDeductionDays).toBe(1);
    expect(out.payableDays).toBe(24);
    expect(out.overtimeAmount).toBe(500);
    expect(out.netSalary).toBeGreaterThan(0);
  });

  it('never returns negative net salary', () => {
    const out = calculateSalary({
      month: '2026-02',
      basicSalary: 28000,
      presentDays: 0,
      absentDays: 28,
      halfDays: 0,
      lateEntries: 0,
      overtimeRatePerHour: 100,
      overtimeHours: 0,
    });

    expect(out.netSalary).toBe(0);
  });
});

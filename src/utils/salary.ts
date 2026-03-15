import { daysInMonth } from './date';

export interface SalaryInput {
  month: string;
  basicSalary: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lateEntries: number;
  overtimeRatePerHour: number;
  overtimeHours: number;
  lateThreshold?: number;
  lateDeductionDays?: number;
}

export interface SalaryOutput {
  totalDaysInMonth: number;
  perDaySalary: number;
  lateDeductionDays: number;
  payableDays: number;
  overtimeAmount: number;
  netSalary: number;
}

const round2 = (value: number) => Number(value.toFixed(2));

export const calculateSalary = (input: SalaryInput): SalaryOutput => {
  const totalDays = Math.max(1, daysInMonth(input.month));
  const basicSalary = Math.max(0, Number(input.basicSalary) || 0);
  const presentDays = Math.max(0, Number(input.presentDays) || 0);
  const lateEntries = Math.max(0, Number(input.lateEntries) || 0);
  const halfDays = Math.max(0, Number(input.halfDays) || 0);
  const overtimeRatePerHour = Math.max(0, Number(input.overtimeRatePerHour) || 0);
  const overtimeHours = Math.max(0, Number(input.overtimeHours) || 0);

  const perDay = basicSalary / totalDays;
  const threshold = Math.max(1, Number(input.lateThreshold) || 3);
  const lateDeductionStep = Math.max(0, Number(input.lateDeductionDays) || 0.5);
  const lateDeductionDays = Math.floor(lateEntries / threshold) * lateDeductionStep;

  // Paid days should come only from paid statuses.
  // Absents are already excluded from paid statuses and should not be deducted again.
  const payableDaysRaw = presentDays + lateEntries + halfDays * 0.5 - lateDeductionDays;
  const payableDays = Math.max(0, Math.min(totalDays, payableDaysRaw));

  const overtimeAmount = overtimeRatePerHour * overtimeHours;
  const netSalary = Math.max(0, payableDays * perDay + overtimeAmount);

  return {
    totalDaysInMonth: totalDays,
    perDaySalary: round2(perDay),
    lateDeductionDays: round2(lateDeductionDays),
    payableDays: round2(payableDays),
    overtimeAmount: round2(overtimeAmount),
    netSalary: round2(netSalary),
  };
};

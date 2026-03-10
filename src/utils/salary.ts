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
  const totalDays = daysInMonth(input.month);
  const perDay = input.basicSalary / totalDays;
  const threshold = input.lateThreshold ?? 3;
  const lateDeductionStep = input.lateDeductionDays ?? 0.5;
  const lateDeductionDays = Math.floor(input.lateEntries / threshold) * lateDeductionStep;

  const payableDays =
    input.presentDays + input.lateEntries + input.halfDays * 0.5 - input.absentDays - lateDeductionDays;

  const overtimeAmount = input.overtimeRatePerHour * input.overtimeHours;
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

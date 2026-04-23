import dayjs from 'dayjs';
import type {
  AttendanceRecord,
  Employee,
  HolidayCalendarEntry,
  LeaveRequest,
  StaffWeeklyShiftDay,
  WeeklyOffDay,
} from '../types/models';
import { daysInMonth } from './date';
import { dedupeAttendanceRecords } from './attendanceAnalytics';
import { resolveAttendanceCalendarDecision } from './leaveManagement';

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

export interface SalaryEngineDateRange {
  startDate: string;
  endDate: string;
}

export interface SalaryCalculationEngineInput {
  shopId: string;
  staffId: string;
  dateRange: SalaryEngineDateRange;
  attendanceRecords: AttendanceRecord[];
  staffConfig: {
    joiningDate?: string;
    weeklyOff?: WeeklyOffDay;
    salaryType?: 'daily' | 'monthly';
    monthlySalary?: number;
    dailyRate?: number;
    latePenalty?: number;
  };
  weeklyAssignments?: StaffWeeklyShiftDay[];
  approvedLeaves?: LeaveRequest[];
  holidays?: HolidayCalendarEntry[];
  manualAdjustment?: number;
}

export interface SalaryCalculationEngineOutput {
  fullDays: number;
  halfDays: number;
  absentDays: number;
  lateCount: number;
  earnedSalary: number;
  deductions: {
    lateDeduction: number;
    absentDeduction: number;
    manualAdjustment: number;
    total: number;
  };
  finalSalary: number;
  totalWorkingDays: number;
  warning?: string;
}

const round2 = (value: number) => Number(value.toFixed(2));

const weeklyOffToIndex = (value?: WeeklyOffDay | string | null) => {
  switch (String(value ?? '').toLowerCase()) {
    case 'mon':
      return 0;
    case 'tue':
      return 1;
    case 'wed':
      return 2;
    case 'thu':
      return 3;
    case 'fri':
      return 4;
    case 'sat':
      return 5;
    case 'sun':
      return 6;
    default:
      return null;
  }
};

const weekdayIndexFromDate = (date: string) => (dayjs(date).day() + 6) % 7;

const enumerateDates = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  let cursor = dayjs(startDate);
  const end = dayjs(endDate);
  while (cursor.isValid() && (cursor.isBefore(end, 'day') || cursor.isSame(end, 'day'))) {
    dates.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return dates;
};

const isOffDate = (date: string, weeklyOff?: WeeklyOffDay | string, weeklyAssignments?: StaffWeeklyShiftDay[]) => {
  const dayOfWeek = weekdayIndexFromDate(date);
  const weeklyAssignment = weeklyAssignments?.find(item => item.dayOfWeek === dayOfWeek);
  if (weeklyAssignment) {
    return weeklyAssignment.isOff;
  }
  const defaultOff = weeklyOffToIndex(weeklyOff);
  return defaultOff !== null && defaultOff === dayOfWeek;
};

const buildWorkingDates = (
  range: SalaryEngineDateRange,
  joiningDate?: string,
  weeklyOff?: WeeklyOffDay,
  weeklyAssignments?: StaffWeeklyShiftDay[],
) => {
  const boundedStart = joiningDate && dayjs(joiningDate).isAfter(dayjs(range.startDate), 'day')
    ? dayjs(joiningDate).format('YYYY-MM-DD')
    : range.startDate;
  return enumerateDates(boundedStart, range.endDate).filter(date => !isOffDate(date, weeklyOff, weeklyAssignments));
};

export const calculateSalaryFromAttendance = (
  input: SalaryCalculationEngineInput,
): SalaryCalculationEngineOutput => {
  const uniqueRecords = dedupeAttendanceRecords(
    input.attendanceRecords.filter(record =>
      record.employeeId === input.staffId
      && !dayjs(record.date).isBefore(dayjs(input.dateRange.startDate), 'day')
      && !dayjs(record.date).isAfter(dayjs(input.dateRange.endDate), 'day'),
    ),
  ).filter(record => !isOffDate(record.date, input.staffConfig.weeklyOff, input.weeklyAssignments));

  const approvedLeaves = input.approvedLeaves ?? [];
  const holidays = input.holidays ?? [];

  if (uniqueRecords.length === 0) {
    const manualAdjustment = round2(Number(input.manualAdjustment ?? 0));
    return {
      fullDays: 0,
      halfDays: 0,
      absentDays: 0,
      lateCount: 0,
      earnedSalary: 0,
      deductions: {
        lateDeduction: 0,
        absentDeduction: 0,
        manualAdjustment,
        total: manualAdjustment,
      },
      finalSalary: 0,
      totalWorkingDays: buildWorkingDates(
        input.dateRange,
        input.staffConfig.joiningDate,
        input.staffConfig.weeklyOff,
        input.weeklyAssignments,
      ).length,
      warning: 'No attendance data found for the selected period.',
    };
  }

  let fullDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let lateCount = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let paidHolidayDays = 0;
  let unpaidHolidayDays = 0;

  const processedDates = new Set<string>();

  uniqueRecords.forEach(record => {
    processedDates.add(record.date);
    const decision = resolveAttendanceCalendarDecision({
      staffId: input.staffId,
      date: record.date,
      leaves: approvedLeaves,
      holidays,
      weeklyOff: input.staffConfig.weeklyOff,
      weeklyAssignments: input.weeklyAssignments,
    });

    if (decision.status === 'holiday') {
      if (decision.payableAs === 'present') {
        paidHolidayDays += 1;
      } else {
        unpaidHolidayDays += 1;
      }
      return;
    }

    if (decision.status === 'leave') {
      if (decision.payableAs === 'present') {
        paidLeaveDays += 1;
      } else {
        unpaidLeaveDays += 1;
      }
      return;
    }

    if (record.status === 'present' || record.status === 'late') {
      fullDays += 1;
    } else if (record.status === 'half_day') {
      halfDays += 1;
    } else if (record.status === 'absent') {
      absentDays += 1;
    } else if (record.status === 'leave') {
      paidLeaveDays += 1;
    } else if (record.status === 'holiday') {
      paidHolidayDays += 1;
    }

    if (record.status === 'late' || record.lateFlag) {
      lateCount += 1;
    }
  });

  const totalWorkingDays = buildWorkingDates(
    input.dateRange,
    input.staffConfig.joiningDate,
    input.staffConfig.weeklyOff,
    input.weeklyAssignments,
  ).length;

  const effectiveWorkingDays = Math.max(1, totalWorkingDays);
  enumerateDates(input.dateRange.startDate, input.dateRange.endDate).forEach(date => {
    if (processedDates.has(date) || isOffDate(date, input.staffConfig.weeklyOff, input.weeklyAssignments)) {
      return;
    }
    const decision = resolveAttendanceCalendarDecision({
      staffId: input.staffId,
      date,
      leaves: approvedLeaves,
      holidays,
      weeklyOff: input.staffConfig.weeklyOff,
      weeklyAssignments: input.weeklyAssignments,
    });
    if (decision.status === 'holiday') {
      if (decision.payableAs === 'present') {
        paidHolidayDays += 1;
      } else {
        unpaidHolidayDays += 1;
      }
    } else if (decision.status === 'leave') {
      if (decision.payableAs === 'present') {
        paidLeaveDays += 1;
      } else {
        unpaidLeaveDays += 1;
      }
    }
  });

  const salaryType = input.staffConfig.salaryType ?? 'monthly';
  const configuredMonthlySalary = Math.max(0, Number(input.staffConfig.monthlySalary ?? 0));
  const configuredDailyRate = Math.max(0, Number(input.staffConfig.dailyRate ?? 0));
  const perDaySalary = salaryType === 'daily'
    ? configuredDailyRate
    : configuredMonthlySalary / effectiveWorkingDays;

  absentDays += unpaidLeaveDays + unpaidHolidayDays;

  const earnedSalary = round2((fullDays + paidLeaveDays + paidHolidayDays + halfDays * 0.5) * perDaySalary);
  const lateDeduction = round2(lateCount * Math.max(0, Number(input.staffConfig.latePenalty ?? 0)));
  const absentDeduction = round2(absentDays * perDaySalary);
  const manualAdjustment = round2(Number(input.manualAdjustment ?? 0));
  const totalDeductions = round2(lateDeduction + absentDeduction + manualAdjustment);
  const finalSalary = round2(Math.max(0, earnedSalary - totalDeductions));

  return {
    fullDays,
    halfDays,
    absentDays,
    lateCount,
    earnedSalary,
    deductions: {
      lateDeduction,
      absentDeduction,
      manualAdjustment,
      total: totalDeductions,
    },
    finalSalary,
    totalWorkingDays,
  };
};

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

export const buildSalaryEngineInputFromEmployee = (
  employee: Pick<Employee, 'id' | 'shopId' | 'joiningDate' | 'weeklyOff' | 'basicSalary' | 'salaryType'>,
  dateRange: SalaryEngineDateRange,
  attendanceRecords: AttendanceRecord[],
  weeklyAssignments?: StaffWeeklyShiftDay[],
) => ({
  shopId: employee.shopId,
  staffId: employee.id,
  dateRange,
  attendanceRecords,
  weeklyAssignments,
  staffConfig: {
    joiningDate: employee.joiningDate,
    weeklyOff: employee.weeklyOff,
    salaryType: employee.salaryType === 'monthly' ? 'monthly' : 'daily',
    monthlySalary: employee.basicSalary,
  } as SalaryCalculationEngineInput['staffConfig'],
});

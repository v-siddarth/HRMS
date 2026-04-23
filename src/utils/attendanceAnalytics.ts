import dayjs from 'dayjs';
import type { AttendanceRecord, Employee, StaffWeeklyShiftDay, WeeklyOffDay } from '../types/models';

export interface AnalyticsDateRange {
  startDate: string;
  endDate: string;
}

export interface StaffAttendanceMetric {
  staffId: string;
  totalWorkingDays: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  lateCount: number;
  attendancePercentage: number;
  lateRatio: number;
}

export interface ShopAttendanceMetrics {
  totalStaff: number;
  avgAttendancePercentage: number;
  totalPresentDays: number;
  totalAbsentDays: number;
  totalHalfDays: number;
  totalLateCount: number;
}

export interface AttendanceTrendPoint {
  granularity: 'daily' | 'monthly';
  bucket: string;
  label: string;
  attendanceCount: number;
  presentCount: number;
  halfDayCount: number;
  absentCount: number;
  lateCount: number;
}

export interface AttendanceAnalyticsOutput {
  staffMetrics: StaffAttendanceMetric[];
  shopMetrics: ShopAttendanceMetrics;
  trends: AttendanceTrendPoint[];
}

interface AttendanceAnalyticsInput {
  attendanceRecords: AttendanceRecord[];
  employees: Pick<Employee, 'id' | 'joiningDate' | 'weeklyOff'>[];
  dateRange: AnalyticsDateRange;
  staffId?: string;
  weeklyAssignmentsByStaffId?: Record<string, StaffWeeklyShiftDay[]>;
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

const getRecordPriority = (record: AttendanceRecord) => {
  const statusWeight =
    record.status === 'present' || record.status === 'late'
      ? 5
      : record.status === 'half_day'
        ? 4
        : record.status === 'leave'
          ? 3
          : record.status === 'absent'
            ? 2
            : 1;
  const completenessWeight = (record.checkInTime ? 1 : 0) + (record.checkOutTime ? 2 : 0) + (record.shiftId ? 1 : 0);
  const updatedAtWeight = dayjs(record.updatedAt).isValid() ? dayjs(record.updatedAt).valueOf() / 1_000_000_000_000 : 0;
  return statusWeight * 10 + completenessWeight + updatedAtWeight;
};

export const dedupeAttendanceRecords = (records: AttendanceRecord[]) => {
  const bestByEmployeeDate = new Map<string, AttendanceRecord>();
  records.forEach(record => {
    const key = `${record.employeeId}__${record.date}`;
    const existing = bestByEmployeeDate.get(key);
    if (!existing || getRecordPriority(record) >= getRecordPriority(existing)) {
      bestByEmployeeDate.set(key, record);
    }
  });
  return Array.from(bestByEmployeeDate.values());
};

const isOffDate = (
  date: string,
  weeklyOff?: WeeklyOffDay | string | null,
  weeklyAssignments?: StaffWeeklyShiftDay[],
) => {
  const dayIndex = weekdayIndexFromDate(date);
  const weeklyEntry = weeklyAssignments?.find(item => item.dayOfWeek === dayIndex);
  if (weeklyEntry) {
    return weeklyEntry.isOff;
  }
  const defaultOffIndex = weeklyOffToIndex(weeklyOff);
  return defaultOffIndex !== null && defaultOffIndex === dayIndex;
};

const buildWorkingDates = (
  range: AnalyticsDateRange,
  employee?: Pick<Employee, 'joiningDate' | 'weeklyOff'>,
  weeklyAssignments?: StaffWeeklyShiftDay[],
) => {
  const boundedStart = employee?.joiningDate && dayjs(employee.joiningDate).isAfter(dayjs(range.startDate), 'day')
    ? dayjs(employee.joiningDate).format('YYYY-MM-DD')
    : range.startDate;
  return enumerateDates(boundedStart, range.endDate).filter(date => !isOffDate(date, employee?.weeklyOff, weeklyAssignments));
};

const emptyOutput = (): AttendanceAnalyticsOutput => ({
  staffMetrics: [],
  shopMetrics: {
    totalStaff: 0,
    avgAttendancePercentage: 0,
    totalPresentDays: 0,
    totalAbsentDays: 0,
    totalHalfDays: 0,
    totalLateCount: 0,
  },
  trends: [],
});

export const calculateAttendanceAnalytics = ({
  attendanceRecords,
  employees,
  dateRange,
  staffId,
  weeklyAssignmentsByStaffId,
}: AttendanceAnalyticsInput): AttendanceAnalyticsOutput => {
  const filteredEmployees = (staffId ? employees.filter(item => item.id === staffId) : employees).filter(Boolean);
  const employeeIds = new Set(filteredEmployees.map(item => item.id));
  const dedupedRecords = dedupeAttendanceRecords(
    attendanceRecords.filter(record => {
      if (staffId && record.employeeId !== staffId) {
        return false;
      }
      return dayjs(record.date).isValid()
        && !dayjs(record.date).isBefore(dayjs(dateRange.startDate), 'day')
        && !dayjs(record.date).isAfter(dayjs(dateRange.endDate), 'day');
    }),
  );

  if (dedupedRecords.length === 0 && filteredEmployees.length === 0) {
    return emptyOutput();
  }

  dedupedRecords.forEach(record => employeeIds.add(record.employeeId));
  const employeeMap = new Map(filteredEmployees.map(item => [item.id, item]));

  const staffMetrics = Array.from(employeeIds)
    .sort((a, b) => a.localeCompare(b))
    .map(currentStaffId => {
      const employee = employeeMap.get(currentStaffId);
      const weeklyAssignments = weeklyAssignmentsByStaffId?.[currentStaffId] ?? [];
      const workingDates = new Set(buildWorkingDates(dateRange, employee, weeklyAssignments));
      const staffRecords = dedupedRecords.filter(
        record => record.employeeId === currentStaffId && (workingDates.size === 0 || workingDates.has(record.date)),
      );

      let presentDays = 0;
      let halfDays = 0;
      let absentDays = 0;
      let lateCount = 0;

      staffRecords.forEach(record => {
        if (record.status === 'present' || record.status === 'late') {
          presentDays += 1;
        } else if (record.status === 'half_day') {
          halfDays += 1;
        } else if (record.status === 'absent') {
          absentDays += 1;
        }

        if (record.status === 'late' || record.lateFlag) {
          lateCount += 1;
        }
      });

      const totalWorkingDays = workingDates.size;
      const attendancePercentage = totalWorkingDays > 0 ? round2((presentDays / totalWorkingDays) * 100) : 0;
      const lateRatio = presentDays > 0 ? round2(lateCount / presentDays) : 0;

      return {
        staffId: currentStaffId,
        totalWorkingDays,
        presentDays,
        halfDays,
        absentDays,
        lateCount,
        attendancePercentage,
        lateRatio,
      };
    });

  if (staffMetrics.length === 0) {
    return emptyOutput();
  }

  const dailyTrendMap = new Map<string, AttendanceTrendPoint>();
  const monthlyTrendMap = new Map<string, AttendanceTrendPoint>();

  dedupedRecords.forEach(record => {
    if (staffId && record.employeeId !== staffId) {
      return;
    }
    const employee = employeeMap.get(record.employeeId);
    const weeklyAssignments = weeklyAssignmentsByStaffId?.[record.employeeId] ?? [];
    if (isOffDate(record.date, employee?.weeklyOff, weeklyAssignments)) {
      return;
    }

    const monthKey = dayjs(record.date).format('YYYY-MM');
    const dayLabel = dayjs(record.date).format('DD MMM');
    const monthLabel = dayjs(`${monthKey}-01`).format('MMM YYYY');
    const isPresentLike = record.status === 'present' || record.status === 'late';
    const isLate = record.status === 'late' || Boolean(record.lateFlag);

    const daily = dailyTrendMap.get(record.date) ?? {
      granularity: 'daily',
      bucket: record.date,
      label: dayLabel,
      attendanceCount: 0,
      presentCount: 0,
      halfDayCount: 0,
      absentCount: 0,
      lateCount: 0,
    };
    daily.attendanceCount += isPresentLike || record.status === 'half_day' ? 1 : 0;
    daily.presentCount += isPresentLike ? 1 : 0;
    daily.halfDayCount += record.status === 'half_day' ? 1 : 0;
    daily.absentCount += record.status === 'absent' ? 1 : 0;
    daily.lateCount += isLate ? 1 : 0;
    dailyTrendMap.set(record.date, daily);

    const monthly = monthlyTrendMap.get(monthKey) ?? {
      granularity: 'monthly',
      bucket: monthKey,
      label: monthLabel,
      attendanceCount: 0,
      presentCount: 0,
      halfDayCount: 0,
      absentCount: 0,
      lateCount: 0,
    };
    monthly.attendanceCount += isPresentLike || record.status === 'half_day' ? 1 : 0;
    monthly.presentCount += isPresentLike ? 1 : 0;
    monthly.halfDayCount += record.status === 'half_day' ? 1 : 0;
    monthly.absentCount += record.status === 'absent' ? 1 : 0;
    monthly.lateCount += isLate ? 1 : 0;
    monthlyTrendMap.set(monthKey, monthly);
  });

  const totalPresentDays = staffMetrics.reduce((sum, item) => sum + item.presentDays, 0);
  const totalAbsentDays = staffMetrics.reduce((sum, item) => sum + item.absentDays, 0);
  const totalHalfDays = staffMetrics.reduce((sum, item) => sum + item.halfDays, 0);
  const totalLateCount = staffMetrics.reduce((sum, item) => sum + item.lateCount, 0);
  const avgAttendancePercentage = round2(
    staffMetrics.reduce((sum, item) => sum + item.attendancePercentage, 0) / Math.max(1, staffMetrics.length),
  );

  return {
    staffMetrics,
    shopMetrics: {
      totalStaff: staffMetrics.length,
      avgAttendancePercentage,
      totalPresentDays,
      totalAbsentDays,
      totalHalfDays,
      totalLateCount,
    },
    trends: [
      ...Array.from(dailyTrendMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
      ...Array.from(monthlyTrendMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    ],
  };
};

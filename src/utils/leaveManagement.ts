import dayjs from 'dayjs';
import type {
  AttendanceRecord,
  HolidayCalendarEntry,
  HolidayType,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  StaffWeeklyShiftDay,
  WeeklyOffDay,
} from '../types/models';

export interface LeaveApplicationInput {
  staffId: string;
  shopId: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  reason: string;
  now?: string;
  restrictPastDates?: boolean;
}

export interface HolidayCreateInput {
  shopId: string;
  holidayName: string;
  date: string;
  type: HolidayType;
  now?: string;
}

export interface AttendanceCalendarDecision {
  blocked: boolean;
  status: 'leave' | 'holiday' | null;
  message: string;
  payableAs: 'present' | 'absent' | null;
  leave?: LeaveRequest;
  holiday?: HolidayCalendarEntry;
}

const DATE_FORMAT = 'YYYY-MM-DD';

const normalizeDate = (value: string) => dayjs(value).format(DATE_FORMAT);

const enumerateDates = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  let cursor = dayjs(startDate);
  const end = dayjs(endDate);
  while (cursor.isValid() && (cursor.isBefore(end, 'day') || cursor.isSame(end, 'day'))) {
    dates.push(cursor.format(DATE_FORMAT));
    cursor = cursor.add(1, 'day');
  }
  return dates;
};

const weekdayIndexFromDate = (date: string) => (dayjs(date).day() + 6) % 7;

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

export const isValidDateRange = (startDate: string, endDate: string) =>
  dayjs(startDate).isValid() && dayjs(endDate).isValid() && !dayjs(startDate).isAfter(dayjs(endDate), 'day');

export const doesLeaveOverlap = (
  request: Pick<LeaveRequest, 'staffId' | 'startDate' | 'endDate' | 'status'>,
  existingRequests: LeaveRequest[],
) =>
  existingRequests.some(item =>
    item.staffId === request.staffId
    && item.status !== 'rejected'
    && !dayjs(request.endDate).isBefore(dayjs(item.startDate), 'day')
    && !dayjs(request.startDate).isAfter(dayjs(item.endDate), 'day'),
  );

export const validateLeaveApplication = (
  input: LeaveApplicationInput,
  existingRequests: LeaveRequest[],
) => {
  if (!isValidDateRange(input.startDate, input.endDate)) {
    return { ok: false as const, message: 'Date range is invalid.' };
  }
  if (!String(input.reason ?? '').trim()) {
    return { ok: false as const, message: 'Leave reason is required.' };
  }
  if (input.restrictPastDates && dayjs(input.startDate).isBefore(dayjs(), 'day')) {
    return { ok: false as const, message: 'Past-date leave requests are not allowed.' };
  }
  if (
    doesLeaveOverlap(
      { staffId: input.staffId, startDate: input.startDate, endDate: input.endDate, status: 'pending' },
      existingRequests,
    )
  ) {
    return { ok: false as const, message: 'Overlapping leave request already exists.' };
  }
  return { ok: true as const };
};

export const buildPendingLeaveRequest = (input: LeaveApplicationInput, id: string): LeaveRequest => {
  const timestamp = input.now ?? new Date().toISOString();
  return {
    id,
    shopId: input.shopId,
    staffId: input.staffId,
    startDate: normalizeDate(input.startDate),
    endDate: normalizeDate(input.endDate),
    leaveType: input.leaveType,
    reason: input.reason.trim(),
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const applyLeaveDecision = (
  leave: LeaveRequest,
  status: Exclude<LeaveStatus, 'pending'>,
  actorId: string,
  now = new Date().toISOString(),
): LeaveRequest => ({
  ...leave,
  status,
  decidedAt: now,
  decidedBy: actorId,
  updatedAt: now,
});

export const validateHolidayInput = (
  input: HolidayCreateInput,
  existingHolidays: HolidayCalendarEntry[],
) => {
  if (!dayjs(input.date).isValid()) {
    return { ok: false as const, message: 'Holiday date is invalid.' };
  }
  if (!String(input.holidayName ?? '').trim()) {
    return { ok: false as const, message: 'Holiday name is required.' };
  }
  if (existingHolidays.some(item => normalizeDate(item.date) === normalizeDate(input.date))) {
    return { ok: false as const, message: 'Holiday already exists for this date.' };
  }
  return { ok: true as const };
};

export const buildHolidayEntry = (input: HolidayCreateInput, id: string): HolidayCalendarEntry => {
  const timestamp = input.now ?? new Date().toISOString();
  return {
    id,
    shopId: input.shopId,
    name: input.holidayName.trim(),
    date: normalizeDate(input.date),
    type: input.type,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const findApprovedLeaveForDate = (staffId: string, date: string, leaves: LeaveRequest[]) =>
  leaves.find(item =>
    item.staffId === staffId
    && item.status === 'approved'
    && !dayjs(date).isBefore(dayjs(item.startDate), 'day')
    && !dayjs(date).isAfter(dayjs(item.endDate), 'day'),
  ) ?? null;

export const findHolidayForDate = (date: string, holidays: HolidayCalendarEntry[]) =>
  holidays.find(item => normalizeDate(item.date) === normalizeDate(date)) ?? null;

export const resolveAttendanceCalendarDecision = ({
  staffId,
  date,
  leaves,
  holidays,
  weeklyOff,
  weeklyAssignments,
}: {
  staffId: string;
  date: string;
  leaves: LeaveRequest[];
  holidays: HolidayCalendarEntry[];
  weeklyOff?: WeeklyOffDay;
  weeklyAssignments?: StaffWeeklyShiftDay[];
}): AttendanceCalendarDecision => {
  const holiday = findHolidayForDate(date, holidays);
  const leave = findApprovedLeaveForDate(staffId, date, leaves);
  const isOff = isOffDate(date, weeklyOff, weeklyAssignments);

  if (holiday) {
    return {
      blocked: true,
      status: 'holiday',
      message: isOff ? 'Selected date is a holiday on weekly off.' : 'Attendance is blocked because this date is a holiday.',
      payableAs: holiday.type === 'paid' ? 'present' : 'absent',
      holiday,
    };
  }

  if (leave) {
    return {
      blocked: true,
      status: 'leave',
      message: isOff ? 'Selected date is covered by approved leave on weekly off.' : 'Attendance is blocked because approved leave exists for this date.',
      payableAs: leave.leaveType === 'unpaid' ? 'absent' : 'present',
      leave,
    };
  }

  return {
    blocked: false,
    status: null,
    message: '',
    payableAs: null,
  };
};

export const projectAttendanceWithCalendar = ({
  attendanceRecords,
  leaves,
  holidays,
  staffId,
  dateRange,
  weeklyOff,
  weeklyAssignments,
}: {
  attendanceRecords: AttendanceRecord[];
  leaves: LeaveRequest[];
  holidays: HolidayCalendarEntry[];
  staffId: string;
  dateRange: { startDate: string; endDate: string };
  weeklyOff?: WeeklyOffDay;
  weeklyAssignments?: StaffWeeklyShiftDay[];
}) => {
  const attendanceByDate = new Map(
    attendanceRecords
      .filter(record => record.employeeId === staffId)
      .map(record => [normalizeDate(record.date), record] as const),
  );

  const results: Array<AttendanceRecord | (Pick<AttendanceRecord, 'employeeId' | 'shopId' | 'date' | 'status' | 'notes'> & { synthetic: true })> = [];

  enumerateDates(dateRange.startDate, dateRange.endDate).forEach(date => {
    if (isOffDate(date, weeklyOff, weeklyAssignments)) {
      return;
    }

    const decision = resolveAttendanceCalendarDecision({
      staffId,
      date,
      leaves,
      holidays,
      weeklyOff,
      weeklyAssignments,
    });

    const existingRecord = attendanceByDate.get(date);
    if (decision.blocked) {
      results.push(
        existingRecord
          ? {
              ...existingRecord,
              status: decision.status === 'holiday' ? 'holiday' : 'leave',
              notes: decision.message,
            }
          : {
              employeeId: staffId,
              shopId: attendanceRecords[0]?.shopId ?? '',
              date,
              status: decision.status === 'holiday' ? 'holiday' : 'leave',
              notes: decision.message,
              synthetic: true,
            },
      );
      return;
    }

    if (existingRecord) {
      results.push(existingRecord);
    }
  });

  return results;
};

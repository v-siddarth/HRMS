import dayjs from 'dayjs';
import type {
  Employee,
  ShiftAssignmentMode,
  ShiftHistoryEntry,
  ShiftOverride,
  ShiftRotationWeek,
  ShiftTemplate,
  StaffWeeklyShiftDay,
  WeeklyOffConfig,
  WeeklyOffDay,
} from '../types/models';

export interface ResolvedShiftDecision {
  mode: ShiftAssignmentMode;
  shiftId: string | null;
  isOff: boolean;
  source: 'override' | 'fixed' | 'dynamic' | 'rotational' | 'weekly_off';
}

const weekDayKeys: Exclude<WeeklyOffDay, 'none'>[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const weekdayIndexFromDate = (date: string) => (dayjs(date).day() + 6) % 7;

export const weekStartMonday = (date: string) => dayjs(date).startOf('week').add(1, 'day').format('YYYY-MM-DD');

export const weeklyOffDayToIndex = (value?: WeeklyOffDay | string | null) => {
  const normalized = String(value ?? '').toLowerCase();
  const index = weekDayKeys.findIndex(item => item === normalized);
  return index >= 0 ? index : null;
};

const getShiftOverrideForDate = (overrides: ShiftOverride[] | undefined, date: string) =>
  overrides?.find(item => item.date === date) ?? null;

const matchesMonthlyRule = (date: string, config?: WeeklyOffConfig | null) => {
  if (!config?.monthlyRules?.length) {
    return false;
  }

  const value = dayjs(date);
  const dayOfWeekKey = weekDayKeys[weekdayIndexFromDate(date)];
  const dayOfMonth = value.date();
  const weekOrdinal = Math.floor((dayOfMonth - 1) / 7) + 1;
  const isLastOccurrence = value.add(7, 'day').month() !== value.month();

  return config.monthlyRules.some(rule => {
    if (rule.dayOfWeek !== dayOfWeekKey) {
      return false;
    }
    if (rule.weekOrdinal === -1) {
      return isLastOccurrence;
    }
    return rule.weekOrdinal === weekOrdinal;
  });
};

export const isWeeklyOffDate = ({
  date,
  weeklyOff,
  weeklyOffConfig,
  weeklyAssignments,
}: {
  date: string;
  weeklyOff?: WeeklyOffDay | string | null;
  weeklyOffConfig?: WeeklyOffConfig | null;
  weeklyAssignments?: StaffWeeklyShiftDay[];
}) => {
  const dayIndex = weekdayIndexFromDate(date);
  const assignment = weeklyAssignments?.find(item => item.dayOfWeek === dayIndex);
  if (assignment?.isOff) {
    return true;
  }

  const daysOfWeek = weeklyOffConfig?.daysOfWeek?.length
    ? weeklyOffConfig.daysOfWeek
    : weeklyOff && weeklyOff !== 'none'
      ? [weeklyOff as Exclude<WeeklyOffDay, 'none'>]
      : [];

  if (daysOfWeek.some(item => weeklyOffDayToIndex(item) === dayIndex)) {
    return true;
  }

  return matchesMonthlyRule(date, weeklyOffConfig);
};

const resolveRotationDecision = (
  date: string,
  employee: Pick<Employee, 'joiningDate' | 'rotationStartDate' | 'rotationPattern'>,
): ResolvedShiftDecision | null => {
  const pattern = employee.rotationPattern ?? [];
  if (!pattern.length) {
    return null;
  }

  const anchorDate = employee.rotationStartDate || employee.joiningDate || weekStartMonday(date);
  const currentWeekStart = dayjs(weekStartMonday(date));
  const anchorWeekStart = dayjs(weekStartMonday(anchorDate));
  const diffWeeks = Math.max(0, currentWeekStart.diff(anchorWeekStart, 'week'));
  const normalizedPattern = [...pattern].sort((a, b) => a.weekIndex - b.weekIndex);
  const selected = normalizedPattern[diffWeeks % normalizedPattern.length];

  return {
    mode: 'rotational',
    shiftId: selected?.isOff ? null : selected?.shiftId ?? null,
    isOff: Boolean(selected?.isOff),
    source: 'rotational',
  };
};

export const resolveShiftDecisionForDate = ({
  date,
  employee,
  weeklyAssignments,
}: {
  date: string;
  employee: Pick<
    Employee,
    'defaultShiftId' | 'shiftMode' | 'weeklyOff' | 'weeklyOffConfig' | 'rotationPattern' | 'rotationStartDate' | 'joiningDate' | 'shiftOverrides'
  >;
  weeklyAssignments?: StaffWeeklyShiftDay[];
}): ResolvedShiftDecision => {
  const override = getShiftOverrideForDate(employee.shiftOverrides, date);
  if (override) {
    return {
      mode: employee.shiftMode ?? 'dynamic',
      shiftId: override.isOff ? null : override.shiftId,
      isOff: override.isOff,
      source: 'override',
    };
  }

  const shiftMode = employee.shiftMode ?? (employee.defaultShiftId ? 'fixed' : 'dynamic');

  if (shiftMode === 'fixed') {
    const weeklyOff = isWeeklyOffDate({
      date,
      weeklyOff: employee.weeklyOff,
      weeklyOffConfig: employee.weeklyOffConfig,
    });
    return {
      mode: 'fixed',
      shiftId: weeklyOff ? null : employee.defaultShiftId ?? null,
      isOff: weeklyOff || !employee.defaultShiftId,
      source: weeklyOff ? 'weekly_off' : 'fixed',
    };
  }

  if (shiftMode === 'rotational') {
    const rotated = resolveRotationDecision(date, employee);
    if (rotated) {
      return rotated;
    }
  }

  const dayIndex = weekdayIndexFromDate(date);
  const assignment = weeklyAssignments?.find(item => item.dayOfWeek === dayIndex) ?? null;
  if (assignment) {
    return {
      mode: shiftMode === 'rotational' ? 'rotational' : 'dynamic',
      shiftId: assignment.isOff ? null : assignment.shiftId,
      isOff: assignment.isOff,
      source: shiftMode === 'rotational' ? 'rotational' : 'dynamic',
    };
  }

  const weeklyOff = isWeeklyOffDate({
    date,
    weeklyOff: employee.weeklyOff,
    weeklyOffConfig: employee.weeklyOffConfig,
  });
  return {
    mode: shiftMode === 'rotational' ? 'rotational' : 'dynamic',
    shiftId: weeklyOff ? null : employee.defaultShiftId ?? null,
    isOff: weeklyOff,
    source: weeklyOff ? 'weekly_off' : shiftMode === 'rotational' ? 'rotational' : 'dynamic',
  };
};

export const compareShiftDecisions = (left: ResolvedShiftDecision, right: ResolvedShiftDecision) =>
  left.mode === right.mode && left.shiftId === right.shiftId && left.isOff === right.isOff;

export const buildShiftHistoryEntry = ({
  id,
  shopId,
  staffId,
  date,
  oldDecision,
  newDecision,
  changedBy,
  note,
  createdAt,
}: {
  id: string;
  shopId: string;
  staffId: string;
  date: string;
  oldDecision: ResolvedShiftDecision;
  newDecision: ResolvedShiftDecision;
  changedBy: string;
  note?: string;
  createdAt: string;
}): ShiftHistoryEntry => ({
  id,
  shopId,
  staffId,
  date,
  mode: newDecision.mode,
  oldShiftId: oldDecision.shiftId,
  newShiftId: newDecision.shiftId,
  oldIsOff: oldDecision.isOff,
  newIsOff: newDecision.isOff,
  changedBy,
  note: note ?? '',
  createdAt,
});

export const cloneRotationPattern = (pattern: ShiftRotationWeek[] | undefined) =>
  (pattern ?? []).map(item => ({ ...item }));

export const getShiftLabelFromTemplates = (shiftId: string | null, shiftById: Map<string, ShiftTemplate>) =>
  shiftId ? shiftById.get(shiftId)?.name ?? shiftId : 'Off';

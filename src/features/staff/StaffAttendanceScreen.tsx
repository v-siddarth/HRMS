import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../../components/ui';
import {
  useGetStaffAttendanceHistoryQuery,
  useGetStaffAttendanceSummaryQuery,
  useGetStaffSelfProfileQuery,
  useGetStaffShiftOverviewQuery,
} from '../../store/hrmsApi';
import { colors } from '../../theme/colors';
import { currentMonth, todayDate } from '../../utils/date';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  ShiftMaster,
  StaffWeeklyShiftDay,
  WeeklyOffDay,
} from '../../types/models';

type FilterOption = 'all' | AttendanceStatus;
type DayVisualStatus =
  | AttendanceStatus
  | 'off_day'
  | 'no_record'
  | 'upcoming'
  | 'not_joined'
  | 'inactive';
type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

type AttendanceDayRow = {
  date: string;
  dayLabel: string;
  status: DayVisualStatus;
  statusLabel: string;
  tone: Tone;
  record: AttendanceRecord | null;
  shift: ShiftMaster | null;
  shiftLabel: string;
  shiftTimeLabel: string;
  hoursLabel: string;
  sourceLabel: string;
  notesLabel: string;
  isToday: boolean;
  isWeeklyOff: boolean;
};

const FILTERS: Array<{ key: FilterOption; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'leave', label: 'Leave' },
  { key: 'half_day', label: 'Half Day' },
  { key: 'late', label: 'Late' },
];

export function StaffAttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<FilterOption>('all');
  const [selectedDate, setSelectedDate] = useState(todayDate());

  useEffect(() => {
    if (!dayjs(selectedDate).isValid() || !selectedDate.startsWith(month)) {
      setSelectedDate(defaultSelectedDate(month));
    }
  }, [month, selectedDate]);

  const selectedWeekStartDate = useMemo(() => startOfWeekMonday(selectedDate), [selectedDate]);
  const isFutureMonthDisabled = month === currentMonth();

  const {
    data: profile,
    isLoading: loadingProfile,
    error: profileError,
  } = useGetStaffSelfProfileQuery();
  const {
    data: summary,
    isLoading: loadingSummary,
    error: summaryError,
  } = useGetStaffAttendanceSummaryQuery({ month });
  const {
    data: attendanceHistory,
    isLoading: loadingHistory,
    error: historyError,
  } = useGetStaffAttendanceHistoryQuery({ month, status: 'all' });
  const {
    data: shiftOverview,
    isLoading: loadingShift,
    error: shiftError,
  } = useGetStaffShiftOverviewQuery({ weekStartDate: selectedWeekStartDate });

  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    (attendanceHistory ?? []).forEach(item => {
      map.set(item.date, item);
    });
    return map;
  }, [attendanceHistory]);

  const shiftById = useMemo(() => {
    const map = new Map<string, ShiftMaster>();
    (shiftOverview?.shifts ?? []).forEach(item => {
      map.set(item.id, item);
    });
    return map;
  }, [shiftOverview?.shifts]);

  const monthDates = useMemo(() => buildEmploymentDatesForMonth(month, profile), [month, profile]);
  const resolvedRows = useMemo(
    () =>
      monthDates
        .map(date =>
          resolveAttendanceDay({
            date,
            profile,
            record: recordsByDate.get(date) ?? null,
            shiftOverview,
            shiftById,
          }),
        )
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [monthDates, profile, recordsByDate, shiftById, shiftOverview],
  );

  const filteredRows = useMemo(() => {
    if (filter === 'all') {
      return resolvedRows;
    }
    return resolvedRows.filter(row => row.status === filter);
  }, [filter, resolvedRows]);

  const selectedDay = useMemo(
    () =>
      resolveAttendanceDay({
        date: selectedDate,
        profile,
        record: recordsByDate.get(selectedDate) ?? null,
        shiftOverview,
        shiftById,
      }),
    [profile, recordsByDate, selectedDate, shiftById, shiftOverview],
  );

  const monthlyOffCount = useMemo(() => getMonthlyOffCount(profile, month), [month, profile]);
  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);
  const calendarCells = useMemo(() => buildCalendarCells(month), [month]);
  const visibleRowsCount = filteredRows.length;
  const totalRowsCount = resolvedRows.length;
  const isLoading = loadingProfile || loadingSummary || loadingHistory || loadingShift;
  const errorMessage =
    extractErrorMessage(profileError) ||
    extractErrorMessage(summaryError) ||
    extractErrorMessage(historyError) ||
    extractErrorMessage(shiftError);

  const summaryCards = [
    {
      label: 'Present',
      value: String(summary?.presentCount ?? 0),
      icon: 'checkmark-circle-outline',
      tone: 'success' as Tone,
    },
    {
      label: 'Absent',
      value: String(summary?.absentCount ?? 0),
      icon: 'close-circle-outline',
      tone: 'danger' as Tone,
    },
    {
      label: 'Half Day',
      value: String(summary?.halfDayCount ?? 0),
      icon: 'pie-chart-outline',
      tone: 'warning' as Tone,
    },
    {
      label: 'Leave/Off',
      value: String((summary?.leaveCount ?? 0) + monthlyOffCount),
      icon: 'cafe-outline',
      tone: 'info' as Tone,
    },
    {
      label: 'Late',
      value: String(summary?.lateCount ?? 0),
      icon: 'alert-circle-outline',
      tone: 'warning' as Tone,
    },
    {
      label: 'Checked In',
      value: String(summary?.checkedInDays ?? 0),
      icon: 'finger-print-outline',
      tone: 'neutral' as Tone,
    },
  ];

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Attendance</Text>
            </View>
            <View style={styles.heroMetaPill}>
              <Ionicons name="calendar-outline" size={14} color="#ffffff" />
              <Text style={styles.heroMetaPillText}>{monthLabel}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Attendance timeline</Text>
          <Text style={styles.heroSubtitle}>
            Review your full month attendance, inspect one date in detail, and track your attendance status without switching to manager views.
          </Text>

          <View style={styles.heroStatRow}>
            <HeroMetric label="Records" value={String(totalRowsCount)} />
            <HeroMetric label="Visible" value={String(visibleRowsCount)} />
            <HeroMetric label="Selected" value={dayjs(selectedDate).format('DD MMM')} />
          </View>
        </View>

        <View style={styles.body}>
          <Card>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Month Selector</Text>
                <Text style={styles.sectionText}>Move across months and keep the same attendance view structure.</Text>
              </View>
            </View>
            <View style={styles.monthSelectorRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => setMonth(prev => shiftMonth(prev, -1))}
                style={({ pressed }) => [styles.monthArrowBtn, pressed && styles.monthArrowBtnPressed]}>
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </Pressable>

              <View style={styles.monthSelectorCenter}>
                <Text style={styles.monthSelectorLabel}>{monthLabel}</Text>
                <Text style={styles.monthSelectorHint}>Tap calendar dates below to inspect a specific day</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={isFutureMonthDisabled}
                onPress={() => setMonth(prev => shiftMonth(prev, 1))}
                style={({ pressed }) => [
                  styles.monthArrowBtn,
                  isFutureMonthDisabled && styles.monthArrowBtnDisabled,
                  pressed && !isFutureMonthDisabled && styles.monthArrowBtnPressed,
                ]}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={isFutureMonthDisabled ? colors.textMuted : colors.textPrimary}
                />
              </Pressable>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Monthly Snapshot</Text>
            <Text style={styles.sectionText}>These totals stay read-only and match the staff attendance summary for the selected month.</Text>
            <View style={styles.summaryGrid}>
              {summaryCards.map(item => (
                <SummaryCard key={item.label} {...item} />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Filters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {FILTERS.map(item => {
                const active = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter ${item.label}`}
                    onPress={() => setFilter(item.key)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      active && styles.filterChipActive,
                      pressed && !active && styles.filterChipPressed,
                    ]}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Calendar</Text>
            <Text style={styles.sectionText}>Status colors make it easier to scan the month quickly from one compact grid.</Text>

            <View style={styles.calendarHeaderRow}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => (
                <Text key={label} style={styles.calendarDayLabel}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={styles.calendarSpacer} />;
                }

                const row = resolveAttendanceDay({
                  date: cell,
                  profile,
                  record: recordsByDate.get(cell) ?? null,
                  shiftOverview,
                  shiftById,
                });
                const toneStyle = toneBadgeStyle(row.tone);
                const selected = cell === selectedDate;

                return (
                  <Pressable
                    key={cell}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${dayjs(cell).format('DD MMMM YYYY')}`}
                    onPress={() => setSelectedDate(cell)}
                    style={({ pressed }) => [
                      styles.calendarCell,
                      toneStyle.soft,
                      selected && styles.calendarCellSelected,
                      pressed && styles.calendarCellPressed,
                    ]}>
                    <Text style={[styles.calendarDate, toneStyle.text, selected && styles.calendarDateSelected]}>
                      {dayjs(cell).format('D')}
                    </Text>
                    <View style={[styles.calendarDot, toneStyle.dot]} />
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Selected Day</Text>
                <Text style={styles.sectionText}>{dayjs(selectedDate).format('dddd, DD MMMM YYYY')}</Text>
              </View>
              <View style={[styles.detailStatusPill, toneBadgeStyle(selectedDay.tone).pill]}>
                <Text style={[styles.detailStatusText, toneBadgeStyle(selectedDay.tone).text]}>{selectedDay.statusLabel}</Text>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <DetailItem label="Check In" value={selectedDay.record?.checkInTime || '-'} icon="log-in-outline" tone={selectedDay.tone} />
              <DetailItem label="Check Out" value={selectedDay.record?.checkOutTime || '-'} icon="log-out-outline" tone={selectedDay.tone} />
              <DetailItem label="Worked Hours" value={selectedDay.hoursLabel} icon="time-outline" tone={selectedDay.tone} />
              <DetailItem label="Source" value={selectedDay.sourceLabel} icon="finger-print-outline" tone={selectedDay.tone} />
            </View>

            <View style={styles.detailPanel}>
              <DetailRow label="Shift" value={selectedDay.shiftLabel} />
              <DetailRow label="Shift Timing" value={selectedDay.shiftTimeLabel} />
              <DetailRow label="Weekly Off" value={selectedDay.isWeeklyOff ? 'Yes' : 'No'} />
              <DetailRow label="Notes" value={selectedDay.notesLabel} />
            </View>
          </Card>

          {isLoading ? (
            <Card>
              <Text style={styles.sectionTitle}>Loading Attendance</Text>
              <Text style={styles.sectionText}>Fetching your monthly summary, day history, and selected-week shift information.</Text>
            </Card>
          ) : null}

          {!isLoading && errorMessage ? (
            <Card>
              <Text style={styles.errorTitle}>Unable to load attendance</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </Card>
          ) : null}

          {!isLoading && !errorMessage && totalRowsCount === 0 ? (
            <Card>
              <Text style={styles.sectionTitle}>No Attendance Yet</Text>
              <Text style={styles.sectionText}>
                There are no attendance dates available for this month yet. When your manager or device sync records attendance, it will appear here automatically.
              </Text>
            </Card>
          ) : null}

          {!isLoading && !errorMessage && totalRowsCount > 0 ? (
            <Card>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Attendance Report</Text>
                  <Text style={styles.sectionText}>Scrollable table view for the selected month. Filter stays active below.</Text>
                </View>
                <View style={styles.reportMetaPill}>
                  <Text style={styles.reportMetaText}>
                    {visibleRowsCount}/{totalRowsCount}
                  </Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHeaderRow]}>
                    <HeaderCell title="Date" width={110} />
                    <HeaderCell title="Status" width={110} />
                    <HeaderCell title="Check In" width={90} />
                    <HeaderCell title="Check Out" width={90} />
                    <HeaderCell title="Hours" width={90} />
                    <HeaderCell title="Source" width={100} />
                    <HeaderCell title="Shift" width={170} />
                  </View>

                  {filteredRows.length ? (
                    filteredRows.map(row => (
                      <Pressable
                        key={row.date}
                        accessibilityRole="button"
                        accessibilityLabel={`Open attendance details for ${dayjs(row.date).format('DD MMMM YYYY')}`}
                        onPress={() => setSelectedDate(row.date)}
                        style={({ pressed }) => [
                          styles.tableRow,
                          row.date === selectedDate && styles.tableRowSelected,
                          pressed && styles.tableRowPressed,
                        ]}>
                        <BodyCell
                          width={110}
                          title={dayjs(row.date).format('DD MMM')}
                          subtitle={row.dayLabel}
                          emphasized={row.isToday}
                        />
                        <StatusCell width={110} label={row.statusLabel} tone={row.tone} />
                        <BodyCell width={90} title={row.record?.checkInTime || '-'} />
                        <BodyCell width={90} title={row.record?.checkOutTime || '-'} />
                        <BodyCell width={90} title={row.hoursLabel} />
                        <BodyCell width={100} title={row.sourceLabel} />
                        <BodyCell width={170} title={row.shiftLabel} subtitle={row.shiftTimeLabel} />
                      </Pressable>
                    ))
                  ) : (
                    <View style={styles.emptyTableState}>
                      <Ionicons name="search-outline" size={20} color={colors.textMuted} />
                      <Text style={styles.emptyTableTitle}>No rows match this filter</Text>
                      <Text style={styles.emptyTableText}>Try switching the filter back to `All` to view the full month timeline.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroMetricCard}>
      <Text style={styles.heroMetricValue}>{value}</Text>
      <Text style={styles.heroMetricLabel}>{label}</Text>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: Tone;
}) {
  const badgeStyle = toneBadgeStyle(tone);

  return (
    <View style={[styles.summaryCard, badgeStyle.soft]}>
      <View style={[styles.summaryIconWrap, badgeStyle.iconWrap]}>
        <Ionicons name={icon} size={18} color={badgeStyle.iconColor} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function DetailItem({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: Tone;
}) {
  const badgeStyle = toneBadgeStyle(tone);

  return (
    <View style={styles.detailCard}>
      <View style={[styles.summaryIconWrap, badgeStyle.iconWrap]}>
        <Ionicons name={icon} size={17} color={badgeStyle.iconColor} />
      </View>
      <Text style={styles.detailCardLabel}>{label}</Text>
      <Text style={styles.detailCardValue}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function HeaderCell({ title, width }: { title: string; width: number }) {
  return (
    <View style={[styles.headerCell, { width }]}>
      <Text style={styles.headerCellText}>{title}</Text>
    </View>
  );
}

function BodyCell({
  title,
  subtitle,
  width,
  emphasized,
}: {
  title: string;
  subtitle?: string;
  width: number;
  emphasized?: boolean;
}) {
  return (
    <View style={[styles.bodyCell, { width }]}>
      <Text style={[styles.bodyCellTitle, emphasized && styles.bodyCellTitleStrong]}>{title}</Text>
      {subtitle ? <Text style={styles.bodyCellSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function StatusCell({ label, width, tone }: { label: string; width: number; tone: Tone }) {
  const badgeStyle = toneBadgeStyle(tone);

  return (
    <View style={[styles.bodyCell, { width }]}>
      <View style={[styles.tableStatusPill, badgeStyle.pill]}>
        <Text style={[styles.tableStatusText, badgeStyle.text]}>{label}</Text>
      </View>
    </View>
  );
}

function buildEmploymentDatesForMonth(month: string, profile: Employee | null | undefined) {
  const start = dayjs(`${month}-01`).startOf('month');
  const end = dayjs(`${month}-01`).endOf('month');
  const joinDay = profile?.joiningDate ? dayjs(profile.joiningDate) : start;
  const deactivatedDay = profile?.deactivatedAt ? dayjs(profile.deactivatedAt) : null;
  const dates: string[] = [];
  let cursor = start;

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const activeFromJoin = cursor.isAfter(joinDay, 'day') || cursor.isSame(joinDay, 'day');
    const activeUntilDeactivated =
      !deactivatedDay || cursor.isBefore(deactivatedDay, 'day') || cursor.isSame(deactivatedDay, 'day');

    if (activeFromJoin && activeUntilDeactivated) {
      dates.push(cursor.format('YYYY-MM-DD'));
    }
    cursor = cursor.add(1, 'day');
  }

  return dates;
}

function buildAllDatesForMonth(month: string) {
  const start = dayjs(`${month}-01`).startOf('month');
  const end = dayjs(`${month}-01`).endOf('month');
  const dates: string[] = [];
  let cursor = start;

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }

  return dates;
}

function buildCalendarCells(month: string) {
  const firstDay = dayjs(`${month}-01`);
  const leadingSpaces = (firstDay.day() + 6) % 7;
  const cells: Array<string | null> = [];

  for (let index = 0; index < leadingSpaces; index += 1) {
    cells.push(null);
  }

  buildAllDatesForMonth(month).forEach(date => cells.push(date));
  return cells;
}

function resolveAttendanceDay({
  date,
  profile,
  record,
  shiftOverview,
  shiftById,
}: {
  date: string;
  profile: Employee | null | undefined;
  record: AttendanceRecord | null;
  shiftOverview: {
    weekStartDate: string;
    defaultShift: ShiftMaster | null;
    weeklyOff: WeeklyOffDay;
    weeklyAssignments: StaffWeeklyShiftDay[];
  } | null | undefined;
  shiftById: Map<string, ShiftMaster>;
}): AttendanceDayRow {
  const dateValue = dayjs(date);
  const dateKey = toWeeklyDay(dateValue);
  const isWeeklyOff = isDateWeeklyOff(date, profile?.weeklyOff ?? shiftOverview?.weeklyOff ?? 'none');
  const recordStatus = record?.status ?? null;
  const activeWindowState = getEmploymentStateForDate(date, profile);
  const shift = resolveShiftForDate(date, shiftOverview, shiftById);

  let status: DayVisualStatus = 'no_record';
  if (activeWindowState === 'not_joined') {
    status = 'not_joined';
  } else if (activeWindowState === 'inactive') {
    status = 'inactive';
  } else if (recordStatus) {
    status = recordStatus;
  } else if (isWeeklyOff) {
    status = 'off_day';
  } else if (dateValue.isAfter(dayjs(), 'day')) {
    status = 'upcoming';
  }

  return {
    date,
    dayLabel: dateValue.format('ddd'),
    status,
    statusLabel: visualStatusLabel(status),
    tone: visualStatusTone(status),
    record,
    shift,
    shiftLabel: shift?.name ?? (isWeeklyOff ? 'Weekly Off' : 'Not assigned'),
    shiftTimeLabel: shift ? `${shift.startTime} - ${shift.endTime}` : isWeeklyOff ? 'Off day' : 'Not available',
    hoursLabel: formatHours(calculateWorkedHours(record?.checkInTime, record?.checkOutTime)),
    sourceLabel: record?.source ? sentenceCase(record.source) : '-',
    notesLabel: record?.notes?.trim() || 'No notes',
    isToday: date === todayDate(),
    isWeeklyOff,
  };
}

function resolveShiftForDate(
  date: string,
  shiftOverview: {
    weekStartDate: string;
    defaultShift: ShiftMaster | null;
    weeklyAssignments: StaffWeeklyShiftDay[];
  } | null | undefined,
  shiftById: Map<string, ShiftMaster>,
) {
  if (!shiftOverview) {
    return null;
  }

  if (startOfWeekMonday(date) !== shiftOverview.weekStartDate) {
    return shiftOverview.defaultShift ?? null;
  }

  const matchingAssignment = shiftOverview.weeklyAssignments.find(
    item => item.dayOfWeek === ((dayjs(date).day() + 6) % 7),
  );
  if (matchingAssignment?.isOff) {
    return null;
  }
  if (matchingAssignment?.shiftId && shiftById.has(matchingAssignment.shiftId)) {
    return shiftById.get(matchingAssignment.shiftId) ?? null;
  }
  return shiftOverview.defaultShift ?? null;
}

function calculateWorkedHours(checkInTime?: string, checkOutTime?: string) {
  const inMinutes = timeToMinutes(checkInTime);
  const outMinutes = timeToMinutes(checkOutTime);

  if (inMinutes === null || outMinutes === null) {
    return 0;
  }
  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }
  if (diffMinutes <= 0) {
    return 0;
  }
  return Number(((diffMinutes) / 60).toFixed(2));
}

function timeToMinutes(value?: string) {
  if (!value) {
    return null;
  }
  const parts = value.split(':');
  if (parts.length < 2) {
    return null;
  }
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function getMonthlyOffCount(profile: Employee | null | undefined, month: string) {
  if (!profile?.weeklyOff || profile.weeklyOff === 'none') {
    return 0;
  }
  return buildEmploymentDatesForMonth(month, profile).filter(date => isDateWeeklyOff(date, profile.weeklyOff ?? 'none')).length;
}

function getEmploymentStateForDate(date: string, profile: Employee | null | undefined) {
  if (!profile) {
    return 'active';
  }
  const value = dayjs(date);
  const joinDay = profile.joiningDate ? dayjs(profile.joiningDate) : null;
  const deactivatedDay = profile.deactivatedAt ? dayjs(profile.deactivatedAt) : null;

  if (joinDay && value.isBefore(joinDay, 'day')) {
    return 'not_joined';
  }
  if (deactivatedDay && value.isAfter(deactivatedDay, 'day')) {
    return 'inactive';
  }
  return 'active';
}

function visualStatusLabel(status: DayVisualStatus) {
  switch (status) {
    case 'half_day':
      return 'Half Day';
    case 'off_day':
      return 'Off Day';
    case 'no_record':
      return 'No Record';
    case 'upcoming':
      return 'Upcoming';
    case 'not_joined':
      return 'Not Joined';
    case 'inactive':
      return 'Inactive';
    default:
      return sentenceCase(status);
  }
}

function visualStatusTone(status: DayVisualStatus): Tone {
  switch (status) {
    case 'present':
      return 'success';
    case 'late':
    case 'half_day':
      return 'warning';
    case 'absent':
      return 'danger';
    case 'leave':
    case 'off_day':
      return 'info';
    case 'no_record':
    case 'upcoming':
    case 'not_joined':
    case 'inactive':
    default:
      return 'neutral';
  }
}

function sentenceCase(value: string) {
  return value
    .split('_')
    .map(part => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function defaultSelectedDate(month: string) {
  return month === currentMonth() ? todayDate() : dayjs(`${month}-01`).startOf('month').format('YYYY-MM-DD');
}

function shiftMonth(month: string, direction: number) {
  return dayjs(`${month}-01`).add(direction, 'month').format('YYYY-MM');
}

function formatMonthLabel(month: string) {
  return dayjs(`${month}-01`).format('MMMM YYYY');
}

function startOfWeekMonday(date: string) {
  return dayjs(date).startOf('week').add(1, 'day').format('YYYY-MM-DD');
}

function toWeeklyDay(value: dayjs.Dayjs): WeeklyOffDay {
  return value.format('ddd').toLowerCase().slice(0, 3) as WeeklyOffDay;
}

function isDateWeeklyOff(date: string, weeklyOff: WeeklyOffDay) {
  if (weeklyOff === 'none') {
    return false;
  }
  return toWeeklyDay(dayjs(date)) === weeklyOff;
}

function formatHours(value: number) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

function extractErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return '';
  }
  return (
    (error as { data?: { message?: string }; message?: string }).data?.message ||
    (error as { message?: string }).message ||
    ''
  );
}

function toneBadgeStyle(tone: Tone) {
  switch (tone) {
    case 'success':
      return {
        soft: styles.toneSoftSuccess,
        pill: styles.tonePillSuccess,
        text: styles.toneTextSuccess,
        iconWrap: styles.toneIconSuccess,
        iconColor: colors.success,
        dot: styles.toneDotSuccess,
      };
    case 'danger':
      return {
        soft: styles.toneSoftDanger,
        pill: styles.tonePillDanger,
        text: styles.toneTextDanger,
        iconWrap: styles.toneIconDanger,
        iconColor: colors.danger,
        dot: styles.toneDotDanger,
      };
    case 'warning':
      return {
        soft: styles.toneSoftWarning,
        pill: styles.tonePillWarning,
        text: styles.toneTextWarning,
        iconWrap: styles.toneIconWarning,
        iconColor: colors.warning,
        dot: styles.toneDotWarning,
      };
    case 'info':
      return {
        soft: styles.toneSoftInfo,
        pill: styles.tonePillInfo,
        text: styles.toneTextInfo,
        iconWrap: styles.toneIconInfo,
        iconColor: colors.primary,
        dot: styles.toneDotInfo,
      };
    case 'neutral':
    default:
      return {
        soft: styles.toneSoftNeutral,
        pill: styles.tonePillNeutral,
        text: styles.toneTextNeutral,
        iconWrap: styles.toneIconNeutral,
        iconColor: colors.textSecondary,
        dot: styles.toneDotNeutral,
      };
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.success,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  heroGlowLarge: {
    position: 'absolute',
    top: -88,
    right: -46,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#33ba90',
    opacity: 0.22,
  },
  heroGlowSmall: {
    position: 'absolute',
    left: -42,
    bottom: -90,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: '#05654d',
    opacity: 0.22,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  heroMetaPillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#defbf1',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  heroStatRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  heroMetricValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  heroMetricLabel: {
    color: '#d2f5e8',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthArrowBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthArrowBtnPressed: {
    opacity: 0.8,
  },
  monthArrowBtnDisabled: {
    backgroundColor: '#eef3f8',
  },
  monthSelectorCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  monthSelectorLabel: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  monthSelectorHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  chipRow: {
    gap: 10,
    paddingRight: 4,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  filterChipPressed: {
    opacity: 0.75,
  },
  filterChipText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  calendarDayLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  calendarSpacer: {
    width: '12.5%',
  },
  calendarCell: {
    width: '12.5%',
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  calendarCellSelected: {
    borderColor: colors.textPrimary,
    borderWidth: 1.5,
    transform: [{ translateY: -1 }],
  },
  calendarCellPressed: {
    opacity: 0.8,
  },
  calendarDate: {
    fontSize: 14,
    fontWeight: '800',
  },
  calendarDateSelected: {
    color: colors.textPrimary,
  },
  calendarDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  detailStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailCard: {
    width: '48%',
    backgroundColor: colors.bgSoft,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  detailCardLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  detailCardValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  detailPanel: {
    backgroundColor: colors.bgSoft,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#dfe7f0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailRowLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    flex: 1,
  },
  detailRowValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1.2,
    textAlign: 'right',
  },
  reportMetaPill: {
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reportMetaText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  table: {
    minWidth: 760,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#e7edf5',
    backgroundColor: colors.surface,
  },
  tableHeaderRow: {
    backgroundColor: '#f5f8fc',
  },
  tableRowSelected: {
    backgroundColor: '#eef6ff',
  },
  tableRowPressed: {
    opacity: 0.85,
  },
  headerCell: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e7edf5',
  },
  headerCellText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  bodyCell: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e7edf5',
    gap: 3,
  },
  bodyCellTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  bodyCellTitleStrong: {
    color: colors.primary,
  },
  bodyCellSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  tableStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tableStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyTableState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 8,
  },
  emptyTableTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyTableText: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },
  toneSoftSuccess: {
    backgroundColor: colors.successSoft,
  },
  toneSoftDanger: {
    backgroundColor: colors.dangerSoft,
  },
  toneSoftWarning: {
    backgroundColor: colors.warningSoft,
  },
  toneSoftInfo: {
    backgroundColor: colors.primarySoft,
  },
  toneSoftNeutral: {
    backgroundColor: '#eef3f8',
  },
  tonePillSuccess: {
    backgroundColor: '#dff5ee',
  },
  tonePillDanger: {
    backgroundColor: '#fdecec',
  },
  tonePillWarning: {
    backgroundColor: '#fff3de',
  },
  tonePillInfo: {
    backgroundColor: '#dbe9fb',
  },
  tonePillNeutral: {
    backgroundColor: '#edf2f7',
  },
  toneTextSuccess: {
    color: colors.success,
  },
  toneTextDanger: {
    color: colors.danger,
  },
  toneTextWarning: {
    color: colors.warning,
  },
  toneTextInfo: {
    color: colors.primary,
  },
  toneTextNeutral: {
    color: colors.textSecondary,
  },
  toneIconSuccess: {
    backgroundColor: '#ffffff',
  },
  toneIconDanger: {
    backgroundColor: '#ffffff',
  },
  toneIconWarning: {
    backgroundColor: '#ffffff',
  },
  toneIconInfo: {
    backgroundColor: '#ffffff',
  },
  toneIconNeutral: {
    backgroundColor: '#ffffff',
  },
  toneDotSuccess: {
    backgroundColor: colors.success,
  },
  toneDotDanger: {
    backgroundColor: colors.danger,
  },
  toneDotWarning: {
    backgroundColor: colors.warning,
  },
  toneDotInfo: {
    backgroundColor: colors.primary,
  },
  toneDotNeutral: {
    backgroundColor: colors.textMuted,
  },
});

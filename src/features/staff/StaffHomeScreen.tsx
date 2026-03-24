import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useGetStaffAttendanceSummaryQuery,
  useGetStaffSelfProfileQuery,
  useGetStaffShiftOverviewQuery,
  useStaffCheckInMutation,
  useStaffCheckOutMutation,
} from '../../store/hrmsApi';
import { colors } from '../../theme/colors';
import { currentMonth, formatDisplayDate, monthDateRange, todayDate } from '../../utils/date';
import type { AttendanceRecord, Employee, ShiftMaster, WeeklyOffDay } from '../../types/models';

export function StaffHomeScreen() {
  const insets = useSafeAreaInsets();
  const user = useAppSelector(state => state.auth.user);
  const month = currentMonth();
  const weekStartDate = useMemo(() => dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'), []);

  const {
    data: profile,
    isLoading: loadingProfile,
    error: profileError,
  } = useGetStaffSelfProfileQuery();
  const {
    data: attendance,
    isLoading: loadingAttendance,
    error: attendanceError,
  } = useGetStaffAttendanceSummaryQuery({ month });
  const {
    data: shiftOverview,
    isLoading: loadingShift,
    error: shiftError,
  } = useGetStaffShiftOverviewQuery({ weekStartDate });
  const [staffCheckIn, { isLoading: checkingIn }] = useStaffCheckInMutation();
  const [staffCheckOut, { isLoading: checkingOut }] = useStaffCheckOutMutation();

  const isLoading = loadingProfile || loadingAttendance || loadingShift;
  const errorMessage = extractErrorMessage(profileError) || extractErrorMessage(attendanceError) || extractErrorMessage(shiftError);
  const todayRecord = attendance?.todayRecord ?? null;
  const todayShift = shiftOverview?.todayShift ?? null;
  const workedHours = attendance?.todayHours ?? 0;
  const overtimeHours = useMemo(() => {
    if (!todayShift) {
      return 0;
    }
    return Math.max(0, Number((workedHours - Number(todayShift.durationHours || 0)).toFixed(2)));
  }, [todayShift, workedHours]);
  const offCount = useMemo(() => getMonthlyOffCount(profile, month), [month, profile]);
  const todayStatus = useMemo(() => resolveTodayStatus(todayRecord, todayShift, profile?.weeklyOff ?? 'none'), [profile?.weeklyOff, todayRecord, todayShift]);
  const monthlyCards = [
    { label: 'Present', value: attendance?.presentCount ?? 0, tone: 'success' as const },
    { label: 'Off Days', value: offCount, tone: 'neutral' as const },
    { label: 'Half Day', value: attendance?.halfDayCount ?? 0, tone: 'warning' as const },
    { label: 'Absent', value: attendance?.absentCount ?? 0, tone: 'danger' as const },
    { label: 'Late', value: attendance?.lateCount ?? 0, tone: 'info' as const },
  ];
  const statusPillStyles = statusToneStyles(todayStatus.tone);
  const smartStates = buildSmartStates({
    record: todayRecord,
    shift: todayShift,
    weeklyOff: shiftOverview?.weeklyOff ?? profile?.weeklyOff ?? 'none',
  });

  const onPunchAction = async (action: 'checkin' | 'checkout') => {
    try {
      if (action === 'checkin') {
        const result = await staffCheckIn().unwrap();
        Alert.alert('Check In', result.message);
        return;
      }
      const result = await staffCheckOut().unwrap();
      Alert.alert('Check Out', result.message);
    } catch (error) {
      const message =
        (error as { data?: { message?: string }; message?: string })?.data?.message ||
        (error as Error).message ||
        'Request failed.';
      Alert.alert(action === 'checkin' ? 'Check In Failed' : 'Check Out Failed', message);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Staff Home</Text>
            </View>
            <View style={[styles.statusPill, statusPillStyles.pill]}>
              <Text style={[styles.statusPillText, statusPillStyles.text]}>{todayStatus.label}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{profile?.name || user?.displayName || 'Welcome back'}</Text>
          <Text style={styles.heroSubtitle}>{profile?.designation || user?.email || 'Staff member'}</Text>
          <Text style={styles.heroMeta}>
            {todayStatus.summary}
          </Text>

          <View style={styles.heroInfoCard}>
            <View style={styles.heroInfoItem}>
              <Text style={styles.heroInfoLabel}>Today</Text>
              <Text style={styles.heroInfoValue}>{formatDisplayDate(todayDate())}</Text>
            </View>
            <View style={styles.heroInfoDivider} />
            <View style={styles.heroInfoItem}>
              <Text style={styles.heroInfoLabel}>Shift</Text>
              <Text style={styles.heroInfoValue}>{todayShift?.name ?? 'Not assigned'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Card>
            <Text style={styles.sectionTitle}>Punch Actions</Text>
            <Text style={styles.sectionText}>
              Large quick actions are ready here so staff always knows where attendance actions live.
            </Text>
            <View style={styles.punchActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Check in"
                onPress={() => onPunchAction('checkin')}
                style={({ pressed }) => [
                  styles.punchActionBtn,
                  styles.checkInBtn,
                  (checkingIn || checkingOut) && styles.punchActionBtnDisabled,
                  pressed && styles.checkInBtnPressed,
                ]}
                disabled={checkingIn || checkingOut}>
                <Ionicons name="log-in-outline" size={22} color="#ffffff" />
                <Text style={styles.punchActionTitle}>{checkingIn ? 'Checking In...' : todayRecord?.checkInTime ? 'Checked In' : 'Check In'}</Text>
                <Text style={styles.punchActionMeta}>
                  {todayRecord?.checkInTime ? `At ${todayRecord.checkInTime}` : 'Tap here to mark your check-in'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Check out"
                onPress={() => onPunchAction('checkout')}
                style={({ pressed }) => [
                  styles.punchActionBtn,
                  styles.checkOutBtn,
                  (checkingIn || checkingOut) && styles.punchActionBtnDisabled,
                  pressed && styles.checkOutBtnPressed,
                ]}
                disabled={checkingIn || checkingOut}>
                <Ionicons name="log-out-outline" size={22} color={colors.textPrimary} />
                <Text style={[styles.punchActionTitle, styles.checkOutText]}>
                  {checkingOut ? 'Checking Out...' : todayRecord?.checkOutTime ? 'Checked Out' : 'Check Out'}
                </Text>
                <Text style={[styles.punchActionMeta, styles.checkOutMeta]}>
                  {todayRecord?.checkOutTime ? `At ${todayRecord.checkOutTime}` : 'Tap here after check-in to complete the day'}
                </Text>
              </Pressable>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Today Summary</Text>
            <View style={styles.todayGrid}>
              <TodayStatCard label="Worked Hours" value={formatHours(workedHours)} icon="time-outline" tone="success" />
              <TodayStatCard label="Check In" value={todayRecord?.checkInTime || '-'} icon="arrow-down-circle-outline" tone="info" />
              <TodayStatCard label="Check Out" value={todayRecord?.checkOutTime || '-'} icon="arrow-up-circle-outline" tone="warning" />
              <TodayStatCard label="Overtime" value={formatHours(overtimeHours)} icon="flash-outline" tone="danger" />
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Month Snapshot</Text>
            <Text style={styles.sectionText}>Track the key attendance totals for the current month without opening deeper reports.</Text>
            <View style={styles.monthGrid}>
              {monthlyCards.map(item => (
                <MonthStatCard key={item.label} label={item.label} value={String(item.value)} tone={item.tone} />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Shift Details</Text>
            <View style={styles.shiftInfoPanel}>
              <ShiftInfoRow label="Today Shift" value={todayShift?.name ?? 'No shift assigned'} />
              <ShiftInfoRow
                label="Shift Time"
                value={todayShift ? `${todayShift.startTime} - ${todayShift.endTime}` : 'Not available'}
              />
              <ShiftInfoRow label="Weekly Off" value={formatWeeklyOff(shiftOverview?.weeklyOff ?? profile?.weeklyOff ?? 'none')} />
              <ShiftInfoRow label="Hours Planned" value={todayShift ? formatHours(todayShift.durationHours) : '-'} />
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Smart States</Text>
            <Text style={styles.sectionText}>The home screen keeps first-login and attendance edge cases visible instead of hiding them.</Text>
            <View style={styles.smartStateList}>
              {smartStates.map(item => (
                <View key={item.title} style={styles.smartStateRow}>
                  <View style={[styles.smartStateIconWrap, toneIconWrap(item.tone)]}>
                    <Ionicons name={item.icon} size={18} color={toneIconColor(item.tone)} />
                  </View>
                  <View style={styles.smartStateTextBlock}>
                    <Text style={styles.smartStateTitle}>{item.title}</Text>
                    <Text style={styles.smartStateSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {isLoading ? (
            <Card>
              <Text style={styles.sectionTitle}>Loading</Text>
              <Text style={styles.sectionText}>Fetching your attendance, shift, and profile details.</Text>
            </Card>
          ) : null}

          {!isLoading && errorMessage ? (
            <Card>
              <Text style={styles.errorTitle}>Unable to load staff home</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function TodayStatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
}) {
  return (
    <View style={styles.todayStatCard}>
      <View style={[styles.todayStatIconWrap, toneIconWrap(tone)]}>
        <Ionicons name={icon} size={18} color={toneIconColor(tone)} />
      </View>
      <Text style={styles.todayStatLabel}>{label}</Text>
      <Text style={styles.todayStatValue}>{value}</Text>
    </View>
  );
}

function MonthStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info';
}) {
  return (
    <View style={[styles.monthStatCard, toneSurface(tone)]}>
      <Text style={styles.monthStatLabel}>{label}</Text>
      <Text style={styles.monthStatValue}>{value}</Text>
    </View>
  );
}

function ShiftInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.shiftInfoRow}>
      <Text style={styles.shiftInfoLabel}>{label}</Text>
      <Text style={styles.shiftInfoValue}>{value}</Text>
    </View>
  );
}

function getMonthlyOffCount(employee: Employee | null | undefined, month: string) {
  if (!employee || !employee.weeklyOff || employee.weeklyOff === 'none') {
    return 0;
  }

  const { start, end } = monthDateRange(month);
  let cursor = dayjs(start);
  const endDay = dayjs(end);
  const joinDay = employee.joiningDate ? dayjs(employee.joiningDate) : dayjs(start);
  const deactivatedDay = employee.deactivatedAt ? dayjs(employee.deactivatedAt) : null;
  let count = 0;

  while (cursor.isBefore(endDay) || cursor.isSame(endDay, 'day')) {
    const withinEmploymentWindow =
      (cursor.isAfter(joinDay) || cursor.isSame(joinDay, 'day')) &&
      (!deactivatedDay || cursor.isBefore(deactivatedDay) || cursor.isSame(deactivatedDay, 'day'));

    if (withinEmploymentWindow && toWeeklyDay(cursor) === employee.weeklyOff) {
      count += 1;
    }
    cursor = cursor.add(1, 'day');
  }

  return count;
}

function toWeeklyDay(value: dayjs.Dayjs): WeeklyOffDay {
  return value.format('ddd').toLowerCase().slice(0, 3) as WeeklyOffDay;
}

function resolveTodayStatus(record: AttendanceRecord | null, shift: ShiftMaster | null, weeklyOff: WeeklyOffDay) {
  const todayKey = toWeeklyDay(dayjs());
  const isWeeklyOff = weeklyOff !== 'none' && weeklyOff === todayKey;
  if (!shift && isWeeklyOff) {
    return {
      label: 'Weekly Off',
      summary: 'Today is marked as your weekly off. Attendance and shift actions stay relaxed for the day.',
      tone: 'warning' as const,
    };
  }
  if (!shift) {
    return {
      label: 'No Shift',
      summary: 'No shift is assigned for today yet. You can still review your attendance and profile details below.',
      tone: 'danger' as const,
    };
  }
  if (record?.checkInTime && record?.checkOutTime) {
    return {
      label: 'Checked Out',
      summary: `Your shift ${shift.name} is complete for today with both IN and OUT time recorded.`,
      tone: 'success' as const,
    };
  }
  if (record?.checkInTime) {
    return {
      label: record.status === 'late' ? 'Late In' : 'Checked In',
      summary: `You are already checked in for ${shift.name}${record.status === 'late' ? ' and marked late today' : ''}.`,
      tone: record.status === 'late' ? 'warning' as const : 'info' as const,
    };
  }
  return {
    label: record?.status === 'late' ? 'Late Marked' : 'Shift Assigned',
    summary: `Today you are assigned to ${shift.name} from ${shift.startTime} to ${shift.endTime}.`,
    tone: record?.status === 'late' ? 'warning' as const : 'info' as const,
  };
}

function buildSmartStates({
  record,
  shift,
  weeklyOff,
}: {
  record: AttendanceRecord | null;
  shift: ShiftMaster | null;
  weeklyOff: WeeklyOffDay;
}) {
  const todayKey = toWeeklyDay(dayjs());
  const items: Array<{ title: string; subtitle: string; icon: string; tone: 'success' | 'info' | 'warning' | 'danger' }> = [];

  if (!shift) {
    items.push({
      title: weeklyOff === todayKey ? 'Weekly off active' : 'No shift assigned',
      subtitle:
        weeklyOff === todayKey
          ? 'Your configured weekly off matches today.'
          : 'There is no fixed or weekly shift assigned for today yet.',
      icon: weeklyOff === todayKey ? 'cafe-outline' : 'calendar-clear-outline',
      tone: weeklyOff === todayKey ? 'warning' : 'danger',
    });
  } else {
    items.push({
      title: 'Shift assigned',
      subtitle: `${shift.name} is scheduled for ${shift.startTime} to ${shift.endTime}.`,
      icon: 'time-outline',
      tone: 'info',
    });
  }

  if (record?.checkInTime && !record?.checkOutTime) {
    items.push({
      title: 'Already checked in',
      subtitle: `IN time ${record.checkInTime} is present, but OUT time is still pending.`,
      icon: 'log-in-outline',
      tone: 'info',
    });
  }

  if (record?.checkInTime && record?.checkOutTime) {
    items.push({
      title: 'Already checked out',
      subtitle: `Attendance is complete with IN ${record.checkInTime} and OUT ${record.checkOutTime}.`,
      icon: 'checkmark-circle-outline',
      tone: 'success',
    });
  }

  if (!record?.checkInTime && record?.checkOutTime) {
    items.push({
      title: 'Punch mismatch',
      subtitle: 'OUT time exists without a matching IN time. This attendance record may need review.',
      icon: 'warning-outline',
      tone: 'danger',
    });
  }

  items.push({
    title: 'Attendance source',
    subtitle: record?.source ? `Today is marked from ${record.source}.` : 'No source label is available for today yet.',
    icon: record?.source === 'biometric' ? 'finger-print-outline' : 'create-outline',
    tone: record?.source === 'biometric' ? 'success' : 'warning',
  });

  return items;
}

function formatWeeklyOff(value: WeeklyOffDay) {
  if (value === 'none') {
    return 'None';
  }
  return value.toUpperCase();
}

function formatHours(value: number) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

function extractErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const maybeMessage = (error as { message?: string; data?: { message?: string } }).data?.message ?? (error as { message?: string }).message;
  return maybeMessage || '';
}

function toneIconWrap(tone: 'success' | 'info' | 'warning' | 'danger') {
  switch (tone) {
    case 'success':
      return styles.toneIconWrapSuccess;
    case 'info':
      return styles.toneIconWrapInfo;
    case 'warning':
      return styles.toneIconWrapWarning;
    case 'danger':
      return styles.toneIconWrapDanger;
    default:
      return styles.toneIconWrapInfo;
  }
}

function toneIconColor(tone: 'success' | 'info' | 'warning' | 'danger') {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'info':
      return colors.primary;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.danger;
    default:
      return colors.primary;
  }
}

function toneSurface(tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info') {
  switch (tone) {
    case 'success':
      return styles.monthStatCardSuccess;
    case 'warning':
      return styles.monthStatCardWarning;
    case 'danger':
      return styles.monthStatCardDanger;
    case 'info':
      return styles.monthStatCardInfo;
    case 'neutral':
    default:
      return styles.monthStatCardNeutral;
  }
}

function statusToneStyles(tone: 'success' | 'info' | 'warning' | 'danger') {
  switch (tone) {
    case 'success':
      return { pill: styles.statusPillSuccess, text: styles.statusPillTextSuccess };
    case 'warning':
      return { pill: styles.statusPillWarning, text: styles.statusPillTextWarning };
    case 'danger':
      return { pill: styles.statusPillDanger, text: styles.statusPillTextDanger };
    case 'info':
    default:
      return { pill: styles.statusPillInfo, text: styles.statusPillTextInfo };
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
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: colors.success,
    gap: 10,
  },
  heroGlowLarge: {
    position: 'absolute',
    top: -90,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#30b28b',
    opacity: 0.22,
  },
  heroGlowSmall: {
    position: 'absolute',
    bottom: -90,
    left: -36,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#05654d',
    opacity: 0.24,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#defbf1',
    fontSize: 16,
    fontWeight: '700',
  },
  heroMeta: {
    color: '#d4f6ea',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  heroInfoCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(6, 85, 64, 0.32)',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  heroInfoItem: {
    flex: 1,
    gap: 4,
  },
  heroInfoDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroInfoLabel: {
    color: '#c9f4e7',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  heroInfoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusPill: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusPillSuccess: {
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(7, 96, 71, 0.55)',
  },
  statusPillTextSuccess: {
    color: '#ffffff',
  },
  statusPillInfo: {
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(11, 78, 143, 0.38)',
  },
  statusPillTextInfo: {
    color: '#ffffff',
  },
  statusPillWarning: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(182, 117, 7, 0.28)',
  },
  statusPillTextWarning: {
    color: '#fff4d6',
  },
  statusPillDanger: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(196, 57, 57, 0.3)',
  },
  statusPillTextDanger: {
    color: '#ffe5e5',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  punchActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  punchActionBtn: {
    flex: 1,
    minHeight: 138,
    borderRadius: 18,
    padding: 16,
    justifyContent: 'space-between',
  },
  punchActionBtnDisabled: {
    opacity: 0.6,
  },
  checkInBtn: {
    backgroundColor: colors.success,
  },
  checkInBtnPressed: {
    backgroundColor: '#097055',
  },
  checkOutBtn: {
    backgroundColor: '#f7fbff',
    borderWidth: 1,
    borderColor: '#d9e2ee',
  },
  checkOutBtnPressed: {
    backgroundColor: '#edf5fd',
  },
  punchActionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  punchActionMeta: {
    color: '#d4f6ea',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  checkOutText: {
    color: colors.textPrimary,
  },
  checkOutMeta: {
    color: colors.textMuted,
  },
  todayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  todayStatCard: {
    width: '47.5%',
    minHeight: 116,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 8,
  },
  todayStatIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayStatLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  todayStatValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthStatCard: {
    width: '47.5%',
    minHeight: 88,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  monthStatCardSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: '#c8ebdd',
  },
  monthStatCardNeutral: {
    backgroundColor: colors.bgSoft,
    borderColor: '#dbe6f1',
  },
  monthStatCardWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: '#f2dfb7',
  },
  monthStatCardDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#f5c8c8',
  },
  monthStatCardInfo: {
    backgroundColor: colors.primarySoft,
    borderColor: '#c8d9f0',
  },
  monthStatLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  monthStatValue: {
    marginTop: 10,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  shiftInfoPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#f8fbfe',
    overflow: 'hidden',
  },
  shiftInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e4edf6',
  },
  shiftInfoLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  shiftInfoValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  smartStateList: {
    gap: 10,
  },
  smartStateRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: '#dbe6f1',
  },
  smartStateIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneIconWrapSuccess: {
    backgroundColor: colors.successSoft,
  },
  toneIconWrapInfo: {
    backgroundColor: colors.primarySoft,
  },
  toneIconWrapWarning: {
    backgroundColor: colors.warningSoft,
  },
  toneIconWrapDanger: {
    backgroundColor: colors.dangerSoft,
  },
  smartStateTextBlock: {
    flex: 1,
    gap: 2,
  },
  smartStateTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  smartStateSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});

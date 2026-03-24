import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as RNHTMLtoPDF from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Field } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useGetAttendanceByDateQuery,
  useGetAttendanceReportQuery,
  useGetBiometricSettingsQuery,
  useGetEmployeesQuery,
  useGetShopByIdQuery,
  useUpsertBulkAttendanceMutation,
} from '../../store/hrmsApi';
import { formatDisplayDate, formatDisplayDateTime24H, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import type { AttendanceRecord, AttendanceStatus } from '../../types/models';

type AttendanceStackParamList = {
  AttendanceHome: undefined;
  BiometricEnrollment: undefined;
  AttendanceRegularise: undefined;
  IndividualAttendanceReport: undefined;
  AllAttendanceReport: undefined;
};

type AttendanceFilter = 'all' | AttendanceStatus;

const attendanceStatuses: AttendanceStatus[] = ['present', 'absent', 'late', 'half_day', 'leave'];

const Stack = createNativeStackNavigator<AttendanceStackParamList>();

export function AttendanceScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AttendanceHome" component={AttendanceHomeScreen} />
      <Stack.Screen name="BiometricEnrollment" component={BiometricEnrollmentScreen} />
      <Stack.Screen name="AttendanceRegularise" component={AttendanceRegulariseScreen} />
      <Stack.Screen name="IndividualAttendanceReport" component={IndividualAttendanceReportScreen} />
      <Stack.Screen name="AllAttendanceReport" component={AllAttendanceReportScreen} />
    </Stack.Navigator>
  );
}

function AttendanceHomeScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });

  const openDrawer = () => {
    const parent = navigation.getParent?.()?.getParent?.();
    if (parent?.openDrawer) {
      parent.openDrawer();
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.banner, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerGradientBase} />
          <View style={styles.headerGradientGlowTop} />
          <View style={styles.headerGradientGlowBottom} />

          <View style={styles.attendanceHeaderTopRow}>
            <View style={styles.attendanceHeaderBadge}>
              <Text style={styles.attendanceHeaderBadgeText}>Attendance Desk</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]} onPress={openDrawer}>
              <Ionicons name="menu" size={24} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.attendanceHeaderTextBlock}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              {shop?.shopName ?? 'Attendance'}
            </Text>
            <Text style={styles.bannerSub} numberOfLines={1}>
              {shop?.address ?? 'Address not available'}
            </Text>
            <Text style={styles.bannerPowered}>Powered Nexora RVM Infotech</Text>
          </View>

          <View style={styles.attendanceSummaryCard}>
            <Text style={styles.attendanceSummaryEyebrow}>Attendance Overview</Text>
            <Text style={styles.attendanceSummaryTitle}>Daily attendance tools in one place</Text>
            <Text style={styles.attendanceSummaryText}>
              Manage biometric readiness, correct attendance records, and open staff reports from a simple screen.
            </Text>
            <View style={styles.attendanceSummaryPoints}>
              <View style={styles.attendanceSummaryPoint}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#d6f8ed" />
                <Text style={styles.attendanceSummaryPointText}>Use regularise for daily corrections.</Text>
              </View>
              <View style={styles.attendanceSummaryPoint}>
                <Ionicons name="document-text-outline" size={16} color="#d6f8ed" />
                <Text style={styles.attendanceSummaryPointText}>Open reports for staff-wise and full attendance review.</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bodyWrap}>
          <View style={styles.attendanceActionGrid}>
            <ActionButton
              icon="finger-print-outline"
              tone="violet"
              title="Biometric Setup"
              description="Review biometric device status and registration readiness."
              onPress={() => navigation.navigate('BiometricEnrollment')}
            />
            <ActionButton
              icon="calendar-clear-outline"
              tone="emerald"
              title="Attendance Regularise"
              description="Update daily attendance records and correct manual entries."
              onPress={() => navigation.navigate('AttendanceRegularise')}
            />
            <ActionButton
              icon="person-text-outline"
              tone="blue"
              title="Individual Report"
              description="Generate attendance history for a selected staff member."
              onPress={() => navigation.navigate('IndividualAttendanceReport')}
            />
            <ActionButton
              icon="people-outline"
              tone="teal"
              title="All Staff Report"
              description="Review and export attendance records for the full team."
              onPress={() => navigation.navigate('AllAttendanceReport')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function BiometricEnrollmentScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const { data: biometric } = useGetBiometricSettingsQuery(shopId, { skip: !shopId });

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.innerContent, { paddingTop: Math.max(insets.top + 38, 66) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.staffFormHero}>
          <View style={styles.staffFormHeroTop}>
            <View style={styles.staffFormBadge}>
              <Text style={styles.staffFormBadgeText}>Biometric Setup</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.formTitle}>Staff Fingerprint Setup</Text>
          <Text style={styles.staffFormIntro}>
            Review biometric device status and keep attendance hardware information ready for future integration.
          </Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Biometric Integration</Text>
          <Text style={styles.helperText}>
            External device connectivity is intentionally empty for now. We will connect hardware integration in the next phase.
          </Text>

          <View style={styles.infoGrid}>
            <InfoPill label="Enabled" value={biometric?.enabled ? 'Yes' : 'No'} />
            <InfoPill label="Mode" value={biometric?.integrationMode ?? 'pull_agent'} />
            <InfoPill label="Device" value={biometric?.deviceName || 'Not Connected'} />
            <InfoPill label="Device ID" value={biometric?.deviceId || '-'} />
            <InfoPill label="Last Sync" value={biometric?.lastSyncedAt || '-'} />
            <InfoPill label="Status" value="Pending Connectivity" warning />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.noteText}>1. New fingerprint registration flow will open after external device connection.</Text>
          <Text style={styles.noteText}>2. Attendance regularise remains available for correction.</Text>
          <Text style={styles.noteText}>3. Multi-hardware for different locations will be added in integration phase.</Text>
          <Text style={styles.noteText}>4. Reports are available with date-duration filters.</Text>
        </Card>
      </ScrollView>
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function AttendanceRegulariseScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(todayDate());
  const [liveMode, setLiveMode] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AttendanceFilter>('all');
  const [localStatusByEmployee, setLocalStatusByEmployee] = useState<Record<string, AttendanceStatus>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState('');

  const { data: employees = [], isLoading: loadingEmployees } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: attendance = [], refetch, isFetching } = useGetAttendanceByDateQuery(
    { shopId, date },
    { skip: !shopId || !date },
  );
  const [upsertAttendance] = useUpsertBulkAttendanceMutation();
  const activeEmployees = useMemo(() => employees.filter(employee => employee.status === 'active'), [employees]);

  const syncToTodayIfLive = useCallback(() => {
    if (!liveMode) {
      return;
    }
    const nextDate = todayDate();
    setDate(prev => (prev === nextDate ? prev : nextDate));
  }, [liveMode]);

  useEffect(() => {
    setLocalStatusByEmployee({});
    setSavingEmployeeId('');
  }, [date]);

  useEffect(() => {
    const timer = setInterval(syncToTodayIfLive, 30000);
    return () => clearInterval(timer);
  }, [syncToTodayIfLive]);

  useEffect(() => {
    syncToTodayIfLive();
  }, [syncToTodayIfLive]);

  useFocusEffect(
    useCallback(() => {
      syncToTodayIfLive();
    }, [syncToTodayIfLive]),
  );

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        syncToTodayIfLive();
      }
    });
    return () => appStateSubscription.remove();
  }, [syncToTodayIfLive]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeEmployees
      .map(employee => {
        const existing = attendance.find(a => a.employeeId === employee.id);
        const selected = localStatusByEmployee[employee.id] ?? existing?.status ?? 'present';
        return { employee, selected };
      })
      .filter(item => {
        const employeeName = safeLower(item.employee.name);
        const employeeDesignation = safeLower(item.employee.designation);
        const employeePhone = safeLower(item.employee.phone);
        const employeeCode = safeLower(item.employee.employeeCode);
        const matchesSearch =
          !q ||
          employeeName.includes(q) ||
          employeeDesignation.includes(q) ||
          employeePhone.includes(q) ||
          employeeCode.includes(q);
        const matchesFilter = filter === 'all' ? true : item.selected === filter;
        return matchesSearch && matchesFilter;
      });
  }, [activeEmployees, attendance, filter, localStatusByEmployee, query]);

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      half_day: 0,
      leave: 0,
    };
    activeEmployees.forEach(employee => {
      const existing = attendance.find(a => a.employeeId === employee.id);
      const selected = localStatusByEmployee[employee.id] ?? existing?.status ?? 'present';
      counts[selected] += 1;
    });
    return counts;
  }, [activeEmployees, attendance, localStatusByEmployee]);

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length > 0;
  const activeFilterCount = filter === 'all' ? activeEmployees.length : summary[filter];
  const statusFilterOptions = useMemo(
    () => [
      { key: 'all' as const, label: 'All Staff', count: activeEmployees.length, accent: '#334155' },
      { key: 'present' as const, label: 'Present', count: summary.present, accent: '#0f9f63' },
      { key: 'absent' as const, label: 'Absent', count: summary.absent, accent: '#c22a2a' },
      { key: 'late' as const, label: 'Late', count: summary.late, accent: '#ba7a1d' },
      { key: 'half_day' as const, label: 'Half Day', count: summary.half_day, accent: '#475569' },
      { key: 'leave' as const, label: 'Leave', count: summary.leave, accent: '#1458bf' },
    ],
    [activeEmployees.length, summary],
  );

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    setLiveMode(false);
    setDate(dayjs(selectedDate).format('YYYY-MM-DD'));
  };

  const resumeAutoReset = () => {
    setLiveMode(true);
    setDate(todayDate());
  };

  const saveStatus = async (employeeId: string, status: AttendanceStatus) => {
    if (!shopId || !user || !date) {
      return;
    }

    const previous = localStatusByEmployee[employeeId];
    setLocalStatusByEmployee(prev => ({ ...prev, [employeeId]: status }));
    setSavingEmployeeId(employeeId);

    try {
      await upsertAttendance({
        shopId,
        date,
        createdBy: user.uid,
        records: [
          {
            employeeId,
            status,
            source: 'manual',
            punchTime: new Date().toISOString(),
          },
        ],
      }).unwrap();
      await refetch();
    } catch (error) {
      setLocalStatusByEmployee(prev => {
        const next = { ...prev };
        if (previous) {
          next[employeeId] = previous;
        } else {
          delete next[employeeId];
        }
        return next;
      });
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingEmployeeId('');
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={rows}
        keyExtractor={item => item.employee.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.staffFormHero}>
              <View style={styles.staffFormHeroTop}>
                <View style={styles.staffFormBadge}>
                  <Text style={styles.staffFormBadgeText}>Attendance Update</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.formTitle}>Attendance Regularise</Text>
              <Text style={styles.staffFormIntro}>
                Review daily attendance, switch date when needed, and update each staff record with the correct status.
              </Text>
              <View style={styles.regulariseHeroStatsGrid}>
                <View style={styles.regulariseHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel} numberOfLines={2}>
                    Active Staff
                  </Text>
                  <Text style={styles.staffFormHeroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    {activeEmployees.length}
                  </Text>
                </View>
                <View style={styles.regulariseHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel} numberOfLines={2}>
                    Visible Now
                  </Text>
                  <Text style={styles.staffFormHeroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    {loadingEmployees || isFetching ? '...' : rows.length}
                  </Text>
                </View>
                <View style={styles.regulariseHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel} numberOfLines={2}>
                    Mode
                  </Text>
                  <Text style={styles.staffFormHeroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    {liveMode ? 'Live' : 'Manual'}
                  </Text>
                </View>
              </View>
            </View>

            <Card>
              <View style={styles.regulariseControlHeader}>
                <View style={styles.regularisePanelTitleBlock}>
                  <Text style={styles.sectionTitle}>Daily Controls</Text>
                  <Text style={styles.regulariseFilterMeta}>Choose a date, search faster, and keep manual corrections consistent.</Text>
                </View>
                <View style={[styles.liveModeBadge, liveMode ? styles.liveModeBadgeActive : styles.liveModeBadgeMuted]}>
                  <Text style={[styles.liveModeBadgeText, liveMode ? styles.liveModeBadgeTextActive : styles.liveModeBadgeTextMuted]}>
                    {liveMode ? 'Auto Today' : 'Manual Date'}
                  </Text>
                </View>
              </View>
              <View style={styles.dateFieldWrap}>
                <Text style={styles.dateLabel}>Attendance Date</Text>
                <Pressable
                  style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
                  onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.dateValueText}>{formatDisplayDate(date)}</Text>
                </Pressable>
                {showDatePicker && (
                  <View style={styles.datePickerWrap}>
                    <DateTimePicker
                      value={parseDate(date)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onDateChange}
                    />
                    {Platform.OS === 'ios' && (
                      <Pressable style={styles.dateDoneBtn} onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.dateDoneText}>Done</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Code / name / role / phone" />
              <View style={styles.collectModeRow}>
                <Text style={styles.collectHintText}>
                  {liveMode ? 'Auto reset enabled at each new day (24-hour cycle).' : 'Manual date mode active. Auto reset paused.'}
                </Text>
                {!liveMode ? (
                  <Pressable style={({ pressed }) => [styles.autoResetBtn, pressed && styles.autoResetBtnPressed]} onPress={resumeAutoReset}>
                    <Text style={styles.autoResetBtnText}>Use Today (Auto)</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>

            <Card>
              <View style={styles.regularisePanelHeader}>
                <View style={styles.regularisePanelTitleBlock}>
                  <Text style={styles.sectionTitle}>Attendance Snapshot</Text>
                  <Text style={styles.regulariseFilterMeta}>
                    {filter === 'all'
                      ? 'A clean one-line summary of today’s attendance mix.'
                      : `${statusLabel(filter)} filter active with ${activeFilterCount} staff in this status.`}
                  </Text>
                </View>
                {(filter !== 'all' || isSearchActive) && (
                  <Pressable
                    style={({ pressed }) => [styles.clearFilterBtn, pressed && styles.clearFilterBtnPressed]}
                    onPress={() => {
                      setFilter('all');
                      setQuery('');
                    }}>
                    <Text style={styles.clearFilterBtnText}>Reset</Text>
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryRowSingle}>
                <SummaryCardCompact label="Present" value={`${summary.present}`} tone="green" />
                <SummaryCardCompact label="Absent" value={`${summary.absent}`} tone="red" />
                <SummaryCardCompact label="Late" value={`${summary.late}`} tone="amber" />
                <SummaryCardCompact label="Half Day" value={`${summary.half_day}`} tone="slate" />
                <SummaryCardCompact label="Leave" value={`${summary.leave}`} tone="blue" />
              </ScrollView>
            </Card>

            <Card>
              <View style={styles.regularisePanelHeader}>
                <View style={styles.regularisePanelTitleBlock}>
                  <Text style={styles.sectionTitle}>Filter By Status</Text>
                  <Text style={styles.regulariseFilterMeta}>
                    Search by person details and narrow the list with count-aware attendance status filters.
                  </Text>
                </View>
                <View style={styles.resultsPill}>
                  <Text style={styles.resultsPillLabel}>Results</Text>
                  <Text style={styles.resultsPillValue}>{loadingEmployees || isFetching ? '...' : rows.length}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regulariseFilterRow}>
                {statusFilterOptions.map(option => (
                  <StatusFilterCard
                    key={option.key}
                    label={option.label}
                    count={option.count}
                    accent={option.accent}
                    active={filter === option.key}
                    onPress={() => setFilter(option.key)}
                  />
                ))}
              </ScrollView>
              <View style={styles.regulariseToolbar}>
                <View style={styles.activeStatePill}>
                  <Text style={styles.activeStateLabel}>Current View</Text>
                  <Text style={styles.activeStateValue}>{filter === 'all' ? 'All Staff' : statusLabel(filter)}</Text>
                </View>
                {isSearchActive ? (
                  <View style={styles.activeStatePill}>
                    <Text style={styles.activeStateLabel}>Search</Text>
                    <Text style={styles.activeStateValue} numberOfLines={1}>
                      {trimmedQuery}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>

            <Text style={styles.sectionCount}>
              {loadingEmployees || isFetching
                ? 'Loading attendance...'
                : `${rows.length} staff members ready for update${filter === 'all' ? '' : ` | ${statusLabel(filter)} view`}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !(loadingEmployees || isFetching) ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Staff Found</Text>
              <Text style={styles.emptySub}>Try changing filters or search text.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isSaving = savingEmployeeId === item.employee.id;
          return (
            <View style={styles.staffCard}>
              <View style={styles.staffHead}>
                <View style={styles.staffIdentityBlock}>
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>{item.employee.name.trim().charAt(0).toUpperCase() || '?'}</Text>
                  </View>
                  <View style={styles.staffIdentityText}>
                    <Text style={styles.staffName} numberOfLines={1}>
                      {item.employee.employeeCode ? `${item.employee.employeeCode} - ` : ''}
                      {item.employee.name}
                    </Text>
                    <Text style={styles.staffMeta} numberOfLines={1}>
                      {safeText(item.employee.designation, 'Unknown Role')} | {safeText(item.employee.phone, 'No Phone')}
                    </Text>
                  </View>
                </View>
                <View style={styles.currentStatusBadge}>
                  <Text style={styles.currentStatusLabel}>Current</Text>
                  <Text style={styles.currentStatusText}>{statusLabel(item.selected)}</Text>
                </View>
              </View>

              <View style={styles.staffCardDivider} />

              <View style={styles.staffCardActionHeader}>
                <Text style={styles.staffCardActionTitle}>Set Attendance Status</Text>
                <Text style={styles.staffCardActionHint}>{isSaving ? 'Saving selection...' : 'Tap once to update instantly'}</Text>
              </View>

              <View style={styles.filterWrap}>
                {attendanceStatuses.map(status => {
                  const selected = item.selected === status;
                  return (
                    <Pressable
                      key={status}
                      style={[styles.filterChip, selected ? styles.filterChipSelected : undefined, isSaving && styles.disabledChip]}
                      onPress={() => saveStatus(item.employee.id, status)}
                      disabled={isSaving}>
                      <Text style={[styles.filterChipText, selected ? styles.filterChipTextSelected : undefined]}>{statusLabel(status)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {isSaving ? <Text style={styles.savingText}>Saving...</Text> : null}
            </View>
          );
        }}
      />
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function IndividualAttendanceReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false);
  const [staffSearchInput, setStaffSearchInput] = useState('');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [pickerMode, setPickerMode] = useState<'from' | 'to' | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: rows = [], isLoading } = useGetAttendanceReportQuery(
    { shopId, fromDate, toDate },
    { skip: !shopId || !isValidRange(fromDate, toDate) },
  );

  const filtered = useMemo(() => {
    if (!selectedEmployeeId) {
      return [] as AttendanceRecord[];
    }
    return rows.filter(row => row.employeeId === selectedEmployeeId);
  }, [rows, selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find(employee => employee.id === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );
  const staffOptions = useMemo(() => {
    const q = staffSearchQuery.trim().toLowerCase();
    if (!q) {
      return employees;
    }
    return employees.filter(employee => {
      const employeeName = safeLower(employee.name);
      const employeePhone = safeLower(employee.phone);
      const employeeDesignation = safeLower(employee.designation);
      const employeeCode = safeLower(employee.employeeCode);
      return (
        employeeName.includes(q) ||
        employeePhone.includes(q) ||
        employeeDesignation.includes(q) ||
        employeeCode.includes(q)
      );
    });
  }, [employees, staffSearchQuery]);

  const onDatePick = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setPickerMode(null);
    }
    if (event.type !== 'set' || !selectedDate || !pickerMode) {
      return;
    }
    const value = dayjs(selectedDate).format('YYYY-MM-DD');
    if (pickerMode === 'from') {
      setFromDate(value);
      return;
    }
    setToDate(value);
  };

  const onExportPdf = async () => {
    if (!selectedEmployee) {
      Alert.alert('Select Staff', 'Please select a staff member first.');
      return;
    }
    if (filtered.length === 0) {
      Alert.alert('No Data', 'No attendance rows available for selected filters.');
      return;
    }
    const htmlRows = filtered
      .map(
        row =>
          `<tr><td>${safeHtml(formatDisplayDate(row.date))}</td><td>${safeHtml(statusLabel(row.status))}</td><td>${safeHtml(
            row.source ?? 'manual',
          )}</td><td>${safeHtml(formatDisplayDateTime24H(row.punchTime))}</td></tr>`,
      )
      .join('');
    const html = buildReportHtml(
      `Individual Attendance Report - ${selectedEmployee.name}`,
      [
        `Staff: ${selectedEmployee.name}`,
        `Code: ${selectedEmployee.employeeCode ?? '-'}`,
        `Duration: ${fromDate} to ${toDate}`,
      ],
      ['Date', 'Status', 'Source', 'Punch Time'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: `attendance_individual_${selectedEmployee.id}`,
      label: 'Individual Attendance',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.innerContent, { paddingTop: Math.max(insets.top + 38, 66) }]} showsVerticalScrollIndicator={false}>
      <View style={styles.staffFormHero}>
        <View style={styles.staffFormHeroTop}>
          <View style={styles.staffFormBadge}>
            <Text style={styles.staffFormBadgeText}>Attendance Report</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.formTitle}>Individual Attendance Report</Text>
        <Text style={styles.staffFormIntro}>
          Select a staff member and date range to review detailed attendance history and export a report.
        </Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Duration Filter</Text>
        <View style={styles.dateRow}>
          <DatePickField label="From" value={fromDate} onPress={() => setPickerMode('from')} />
          <DatePickField label="To" value={toDate} onPress={() => setPickerMode('to')} />
        </View>
        {!isValidRange(fromDate, toDate) ? <Text style={styles.rangeError}>Invalid date range. Keep From {'<='} To.</Text> : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Select Staff</Text>
        <Pressable
          style={({ pressed }) => [styles.dropdownTrigger, pressed && styles.dropdownTriggerPressed]}
          onPress={() => setStaffDropdownOpen(prev => !prev)}>
          <Text style={selectedEmployee ? styles.dropdownTriggerValue : styles.dropdownTriggerPlaceholder} numberOfLines={1}>
            {selectedEmployee
              ? `${selectedEmployee.employeeCode ? `${selectedEmployee.employeeCode} - ` : ''}${selectedEmployee.name}`
              : 'Select staff'}
          </Text>
          <Text style={styles.dropdownChevron}>{staffDropdownOpen ? '▴' : '▾'}</Text>
        </Pressable>

        {staffDropdownOpen ? (
          <View style={styles.dropdownMenu}>
            <View style={styles.dropdownSearchRow}>
              <TextInput
                style={styles.dropdownSearchInput}
                value={staffSearchInput}
                onChangeText={setStaffSearchInput}
                placeholder="Search code / name / phone / role"
                placeholderTextColor="#7b8798"
              />
              <Pressable style={styles.dropdownSearchButton} onPress={() => setStaffSearchQuery(staffSearchInput.trim())}>
                <Text style={styles.dropdownSearchButtonText}>Search</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.dropdownList} nestedScrollEnabled>
              {staffOptions.length === 0 ? (
                <Text style={styles.dropdownEmptyText}>No staff found for this search.</Text>
              ) : (
                staffOptions.map(employee => (
                  <Pressable
                    key={employee.id}
                    style={[styles.dropdownOption, selectedEmployeeId === employee.id ? styles.dropdownOptionSelected : undefined]}
                    onPress={() => {
                      setSelectedEmployeeId(employee.id);
                      setStaffDropdownOpen(false);
                    }}>
                    <Text style={[styles.dropdownOptionTitle, selectedEmployeeId === employee.id ? styles.dropdownOptionTitleSelected : undefined]} numberOfLines={1}>
                      {employee.employeeCode ? `${employee.employeeCode} - ` : ''}
                      {employee.name}
                    </Text>
                    <Text style={styles.dropdownOptionMeta} numberOfLines={1}>
                      {safeText(employee.designation, 'Unknown Role')} | {safeText(employee.phone, 'No Phone')}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={styles.reportActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.reportActionBtn, pressed && !exporting ? styles.reportActionBtnPressed : undefined]}
            onPress={onExportPdf}
            disabled={exporting}>
            <Text style={styles.reportActionBtnText}>{exporting ? 'Generating PDF...' : 'Generate PDF'}</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionTitle}>Report Table</Text>
        <Text style={styles.helperText}>{selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.designation})` : 'Select a staff member first.'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.tableHeaderRow}>
              <TableCell text="Date" width={110} header />
              <TableCell text="Status" width={120} header />
              <TableCell text="Source" width={110} header />
              <TableCell text="Punch Time" width={170} header />
            </View>
            {isLoading ? (
              <View style={styles.tableInfoWrap}>
                <Text style={styles.tableInfoText}>Loading report...</Text>
              </View>
            ) : selectedEmployeeId === '' ? (
              <View style={styles.tableInfoWrap}>
                <Text style={styles.tableInfoText}>Please select staff.</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={styles.tableInfoWrap}>
                <Text style={styles.tableInfoText}>No attendance rows in selected duration.</Text>
              </View>
            ) : (
              filtered.map(item => (
                <View key={item.id} style={styles.tableRow}>
                  <TableCell text={formatDisplayDate(item.date)} width={110} />
                  <TableCell text={statusLabel(item.status)} width={120} />
                  <TableCell text={item.source ?? 'manual'} width={110} />
                  <TableCell text={formatDisplayDateTime24H(item.punchTime)} width={170} />
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </Card>

      {pickerMode ? (
        <DateTimePicker
          value={parseDate(pickerMode === 'from' ? fromDate : toDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDatePick}
        />
      ) : null}
      </ScrollView>
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function AllAttendanceReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [pickerMode, setPickerMode] = useState<'from' | 'to' | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: rows = [], isLoading } = useGetAttendanceReportQuery(
    { shopId, fromDate, toDate },
    { skip: !shopId || !isValidRange(fromDate, toDate) },
  );

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; designation: string; code: string }>();
    employees.forEach(employee => {
      map.set(employee.id, {
        name: employee.name,
        designation: employee.designation,
        code: employee.employeeCode ?? '-',
      });
    });
    return map;
  }, [employees]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] += 1;
        return acc;
      },
      {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        half_day: 0,
        leave: 0,
      },
    );
  }, [rows]);

  const onDatePick = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setPickerMode(null);
    }
    if (event.type !== 'set' || !selectedDate || !pickerMode) {
      return;
    }
    const value = dayjs(selectedDate).format('YYYY-MM-DD');
    if (pickerMode === 'from') {
      setFromDate(value);
      return;
    }
    setToDate(value);
  };

  const onExportPdf = async () => {
    if (rows.length === 0) {
      Alert.alert('No Data', 'No attendance rows available for selected duration.');
      return;
    }
    const htmlRows = rows
      .map(row => {
        const employee = employeeById.get(row.employeeId);
        return `<tr><td>${safeHtml(formatDisplayDate(row.date))}</td><td>${safeHtml(employee?.code ?? '-')}</td><td>${safeHtml(
          employee?.name ?? row.employeeId,
        )}</td><td>${safeHtml(employee?.designation ?? '-')}</td><td>${safeHtml(statusLabel(row.status))}</td><td>${safeHtml(
          row.source ?? 'manual',
        )}</td><td>${safeHtml(formatDisplayDateTime24H(row.punchTime))}</td></tr>`;
      })
      .join('');
    const html = buildReportHtml(
      'All Staff Attendance Report',
      [`Duration: ${fromDate} to ${toDate}`, `Rows: ${rows.length}`],
      ['Date', 'Code', 'Staff', 'Role', 'Status', 'Source', 'Punch Time'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: 'attendance_all_staff',
      label: 'All Staff Attendance',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.staffFormHero}>
              <View style={styles.staffFormHeroTop}>
                <View style={styles.staffFormBadge}>
                  <Text style={styles.staffFormBadgeText}>Attendance Report</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.formTitle}>All Staff Attendance Report</Text>
              <Text style={styles.staffFormIntro}>
                Review attendance summary for the full team, filter by date range, and export the final report when needed.
              </Text>
              <View style={styles.reportHeroStatsGrid}>
                <View style={styles.reportHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Rows</Text>
                  <Text style={styles.staffFormHeroStatValue}>{isLoading ? '...' : rows.length}</Text>
                </View>
                <View style={styles.reportHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Present</Text>
                  <Text style={styles.staffFormHeroStatValue}>{summary.present}</Text>
                </View>
                <View style={styles.reportHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Late + Half Day</Text>
                  <Text style={styles.staffFormHeroStatValue}>{summary.late + summary.half_day}</Text>
                </View>
                <View style={styles.reportHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Absent + Leave</Text>
                  <Text style={styles.staffFormHeroStatValue}>{summary.absent + summary.leave}</Text>
                </View>
              </View>
            </View>

            <Card>
              <Text style={styles.sectionTitle}>Duration Filter</Text>
              <View style={styles.dateRow}>
                <DatePickField label="From" value={fromDate} onPress={() => setPickerMode('from')} />
                <DatePickField label="To" value={toDate} onPress={() => setPickerMode('to')} />
              </View>
              {!isValidRange(fromDate, toDate) ? <Text style={styles.rangeError}>Invalid date range. Keep From {'<='} To.</Text> : null}
            </Card>

            <Card>
              <View style={styles.reportActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.reportActionBtn, pressed && !exporting ? styles.reportActionBtnPressed : undefined]}
                  onPress={onExportPdf}
                  disabled={exporting}>
                  <Text style={styles.reportActionBtnText}>{exporting ? 'Generating PDF...' : 'Generate PDF'}</Text>
                </Pressable>
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Attendance Table</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={styles.tableHeaderRow}>
                  <TableCell text="Date" width={105} header />
                  <TableCell text="Code" width={90} header />
                  <TableCell text="Staff" width={180} header />
                  <TableCell text="Role" width={120} header />
                  <TableCell text="Status" width={110} header />
                  <TableCell text="Source" width={100} header />
                  <TableCell text="Punch" width={170} header />
                </View>
              </ScrollView>
            </Card>
            <Text style={styles.sectionCount}>{isLoading ? 'Loading report...' : `${rows.length} attendance rows`}</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Attendance Rows</Text>
              <Text style={styles.emptySub}>No data found in selected duration.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const employee = employeeById.get(item.employeeId);
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.tableRow}>
                <TableCell text={formatDisplayDate(item.date)} width={105} />
                <TableCell text={employee?.code ?? '-'} width={90} />
                <TableCell text={employee?.name ?? item.employeeId} width={180} />
                <TableCell text={employee?.designation ?? '-'} width={120} />
                <TableCell text={statusLabel(item.status)} width={110} />
                <TableCell text={item.source ?? 'manual'} width={100} />
                <TableCell text={formatDisplayDateTime24H(item.punchTime)} width={170} />
              </View>
            </ScrollView>
          );
        }}
      />
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>

      {pickerMode ? (
        <DateTimePicker
          value={parseDate(pickerMode === 'from' ? fromDate : toDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDatePick}
        />
      ) : null}
    </View>
  );
}

function ActionButton({
  icon,
  tone,
  title,
  description,
  onPress,
}: {
  icon: string;
  tone: 'emerald' | 'blue' | 'violet' | 'teal';
  title: string;
  description: string;
  onPress: () => void;
}) {
  const palette = attendanceActionPalette(tone);
  return (
    <Pressable style={({ pressed }) => [styles.actionSquare, pressed && styles.actionSquarePressed]} onPress={onPress}>
      <View style={[styles.actionAccent, { backgroundColor: palette.fg }]} />
      <View style={[styles.actionIconWrap, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <Ionicons name={icon} size={20} color={palette.fg} />
      </View>
      <Text style={styles.actionTileTitle}>{title}</Text>
      <Text style={styles.actionTileDescription}>{description}</Text>
    </Pressable>
  );
}

function attendanceActionPalette(tone: 'emerald' | 'blue' | 'violet' | 'teal') {
  const palette = {
    emerald: { bg: '#e8fbf2', border: '#bfead4', fg: '#0f9f63' },
    blue: { bg: '#eaf1ff', border: '#c8d8ff', fg: '#1d4ed8' },
    violet: { bg: '#f2ecff', border: '#d9c7ff', fg: '#6d28d9' },
    teal: { bg: '#e6f8f8', border: '#bae9e9', fg: '#0f766e' },
  } as const;
  return palette[tone];
}

function StatusFilterCard({
  label,
  count,
  accent,
  active,
  onPress,
}: {
  label: string;
  count: number;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.statusFilterCard,
        active && styles.statusFilterCardActive,
        pressed && !active ? styles.statusFilterCardPressed : undefined,
      ]}
      onPress={onPress}>
      <View style={[styles.statusFilterAccent, { backgroundColor: accent }]} />
      <Text style={[styles.statusFilterCount, { color: accent }]}>{count}</Text>
      <Text style={[styles.statusFilterLabel, active && styles.statusFilterLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function InfoPill({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={[styles.infoPill, warning ? styles.infoPillWarning : undefined]}>
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={[styles.infoPillValue, warning ? styles.infoPillValueWarning : undefined]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SummaryCardCompact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'red' | 'amber' | 'slate' | 'blue';
}) {
  const palette = {
    green: { bg: '#e8f9f1', fg: '#0f9f63', border: '#bde6d0' },
    red: { bg: '#fdeeee', fg: '#c22a2a', border: '#f5caca' },
    amber: { bg: '#fff4df', fg: '#ba7a1d', border: '#f1ddb4' },
    slate: { bg: '#eef2f7', fg: '#334155', border: '#d8e1ea' },
    blue: { bg: '#e6effd', fg: '#1458bf', border: '#c8dafe' },
  } as const;

  return (
    <View style={[styles.summaryCompactCard, { backgroundColor: palette[tone].bg, borderColor: palette[tone].border }]}>
      <Text style={styles.summaryCompactLabel}>{label}</Text>
      <Text style={[styles.summaryCompactValue, { color: palette[tone].fg }]}>{value}</Text>
    </View>
  );
}

function DatePickField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.datePickField, pressed && styles.datePickFieldPressed]} onPress={onPress}>
      <Text style={styles.datePickLabel}>{label}</Text>
      <Text style={styles.datePickValue}>{formatDisplayDate(value)}</Text>
    </Pressable>
  );
}

function TableCell({ text, width, header }: { text: string; width: number; header?: boolean }) {
  return (
    <View style={[styles.tableCell, { width }, header && styles.tableCellHeader]}>
      <Text style={[styles.tableCellText, header && styles.tableCellTextHeader]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function statusLabel(status: AttendanceStatus) {
  if (status === 'half_day') {
    return 'Half Day';
  }
  if (status === 'leave') {
    return 'Leave';
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function parseDate(value: string) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toDate() : new Date();
}

function isValidRange(fromDate: string, toDate: string) {
  const from = dayjs(fromDate);
  const to = dayjs(toDate);
  return from.isValid() && to.isValid() && !from.isAfter(to);
}

async function exportPdfReport({
  filePrefix,
  label,
  html,
  setExporting,
}: {
  filePrefix: string;
  label: string;
  html: string;
  setExporting: (value: boolean) => void;
}) {
  setExporting(true);
  try {
    const pdf = await RNHTMLtoPDF.generatePDF({
      html,
      fileName: `${filePrefix}_${Date.now()}`,
      directory: 'Documents',
    });
    if (!pdf.filePath) {
      throw new Error('Unable to create PDF file.');
    }
    await Share.open({
      url: `file://${pdf.filePath}`,
      failOnCancel: false,
      title: `${label} PDF`,
      type: 'application/pdf',
    });
    Alert.alert('PDF Ready', `${label} PDF generated in Documents folder.`);
  } catch (error) {
    Alert.alert('PDF Error', (error as Error).message);
  } finally {
    setExporting(false);
  }
}

function buildReportHtml(title: string, metaLines: string[], headers: string[], rowHtml: string) {
  const headerHtml = headers.map(item => `<th>${safeHtml(item)}</th>`).join('');
  const metaHtml = metaLines.map(item => `<p>${safeHtml(item)}</p>`).join('');
  return `<html><head>${reportPdfCss()}</head><body><h1>${safeHtml(title)}</h1>${metaHtml}<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table></body></html>`;
}

function reportPdfCss() {
  return `<style>
  body { font-family: Arial, sans-serif; color: #0f172a; padding: 16px; }
  h1 { margin: 0 0 10px; font-size: 20px; }
  p { margin: 0 0 4px; font-size: 12px; color: #334155; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #d7dee8; padding: 7px; font-size: 11px; text-align: left; }
  th { background: #eef2f7; font-weight: 700; }
  </style>`;
}

function safeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeLower(value?: string | null) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function safeText(value?: string | null, fallback = '-') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f3f6fb',
  },
  content: {
    paddingBottom: 24,
  },
  innerContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 14,
  },
  editListContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 14,
  },
  headerBlock: {
    gap: 14,
  },
  banner: {
    backgroundColor: colors.success,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 14,
    overflow: 'hidden',
  },
  headerGradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b8f6d',
  },
  headerGradientGlowTop: {
    position: 'absolute',
    top: -90,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#30b28b',
    opacity: 0.26,
  },
  headerGradientGlowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#06644d',
    opacity: 0.3,
  },
  attendanceHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  attendanceHeaderBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  attendanceHeaderBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  menuBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 82, 64, 0.9)',
  },
  menuBtnPressed: {
    backgroundColor: '#085542',
  },
  attendanceHeaderTextBlock: {
    gap: 4,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  bannerSub: {
    color: '#defbf1',
    fontSize: 17,
    fontWeight: '700',
  },
  bannerPowered: {
    color: '#c8f3e8',
    fontSize: 14,
    fontWeight: '600',
  },
  attendanceSummaryCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(6, 85, 64, 0.32)',
    gap: 8,
  },
  attendanceSummaryEyebrow: {
    color: '#d6f8ed',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  attendanceSummaryTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  attendanceSummaryText: {
    color: '#e8fff7',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  attendanceSummaryPoints: {
    marginTop: 4,
    gap: 8,
  },
  attendanceSummaryPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  attendanceSummaryPointText: {
    flex: 1,
    color: '#dffbf1',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  bodyWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  formTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  closeBtn: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  closeText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  helperText: {
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
    fontSize: 13,
  },
  noteText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 20,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  attendanceActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionSquare: {
    width: '47.5%',
    minHeight: 188,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  actionSquarePressed: {
    backgroundColor: '#f8fbff',
    borderColor: '#c9d6e6',
  },
  actionAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionTileTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 24,
    marginTop: 14,
  },
  actionTileDescription: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoPill: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  infoPillWarning: {
    borderColor: '#f3d59f',
    backgroundColor: '#fff8eb',
  },
  infoPillLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  infoPillValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  infoPillValueWarning: {
    color: '#b26f14',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryCard: {
    width: '48.5%',
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dee8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  filterTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  filterChipSelected: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  filterChipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  filterChipTextSelected: {
    color: colors.success,
  },
  disabledChip: {
    opacity: 0.6,
  },
  sectionCount: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  formStatusTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.success,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 20,
  },
  formStatusTextureGlowTop: {
    position: 'absolute',
    top: -42,
    right: -18,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#30b28b',
    opacity: 0.24,
  },
  formStatusTextureGlowBottom: {
    position: 'absolute',
    bottom: -54,
    left: -24,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#05654d',
    opacity: 0.22,
  },
  staffFormHero: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d8e2ed',
    backgroundColor: '#f7fbff',
    padding: 16,
    gap: 12,
  },
  staffFormHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  staffFormBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  staffFormBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  staffFormIntro: {
    color: colors.textSecondary,
    lineHeight: 21,
    fontWeight: '500',
  },
  staffFormHeroStats: {
    flexDirection: 'row',
    gap: 10,
  },
  staffFormHeroStatsScroll: {
    paddingRight: 4,
  },
  regulariseHeroStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 10,
  },
  regulariseHeroStatCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  reportHeroStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  reportHeroStatCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  staffFormHeroStatCard: {
    flex: 1,
    minWidth: 112,
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  staffFormHeroStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  staffFormHeroStatValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  dateFieldWrap: {
    gap: 6,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dateInputButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dateInputButtonPressed: {
    backgroundColor: '#f8fafc',
  },
  dateValueText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  datePickerWrap: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 6,
  },
  dateDoneBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  dateDoneText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  collectHintText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  regulariseControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 2,
  },
  regularisePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  regularisePanelTitleBlock: {
    flex: 1,
    gap: 4,
  },
  regulariseFilterMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  liveModeBadge: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveModeBadgeActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  liveModeBadgeMuted: {
    borderColor: '#d9e2ee',
    backgroundColor: '#f8fafc',
  },
  liveModeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  liveModeBadgeTextActive: {
    color: '#0a7559',
  },
  liveModeBadgeTextMuted: {
    color: '#475569',
  },
  collectModeRow: {
    gap: 8,
  },
  autoResetBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#b7ead3',
    borderRadius: 999,
    backgroundColor: '#e8f9f1',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  autoResetBtnPressed: {
    backgroundColor: '#d6f4e7',
  },
  autoResetBtnText: {
    color: '#0a7559',
    fontWeight: '700',
    fontSize: 12,
  },
  summaryRowSingle: {
    gap: 8,
    paddingRight: 4,
  },
  summaryCompactCard: {
    minWidth: 110,
    minHeight: 66,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  summaryCompactLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  summaryCompactValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  clearFilterBtn: {
    minHeight: 34,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  clearFilterBtnPressed: {
    backgroundColor: '#f8fafc',
  },
  clearFilterBtnText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },
  regulariseFilterRow: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 4,
  },
  statusFilterCard: {
    width: 112,
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  statusFilterCardActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#f4fcf8',
  },
  statusFilterCardPressed: {
    backgroundColor: '#f8fafc',
  },
  statusFilterAccent: {
    width: 24,
    height: 4,
    borderRadius: 999,
    marginBottom: 2,
  },
  statusFilterCount: {
    fontSize: 24,
    fontWeight: '900',
  },
  statusFilterLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  statusFilterLabelActive: {
    color: colors.textPrimary,
  },
  resultsPill: {
    minWidth: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  resultsPillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultsPillValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  regulariseToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  activeStatePill: {
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeStateLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  activeStateValue: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  staffCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 16,
    padding: 12,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 1,
  },
  staffHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  staffIdentityBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  staffIdentityText: {
    flex: 1,
    gap: 3,
  },
  staffAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#e8f1ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cdddfc',
  },
  staffAvatarText: {
    color: '#1458bf',
    fontSize: 16,
    fontWeight: '800',
  },
  staffName: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  staffMeta: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  staffCardDivider: {
    height: 1,
    backgroundColor: '#e7edf4',
  },
  staffCardActionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  staffCardActionTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  staffCardActionHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  currentStatusBadge: {
    borderWidth: 1,
    borderColor: '#b7ead3',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#e8f9f1',
    minWidth: 82,
    alignItems: 'center',
    gap: 2,
  },
  currentStatusLabel: {
    color: '#4d7c68',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  currentStatusText: {
    color: '#0a7559',
    fontWeight: '800',
    fontSize: 12,
  },
  savingText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  datePickField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#fff',
  },
  datePickFieldPressed: {
    backgroundColor: '#f8fafc',
  },
  datePickLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  datePickValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
    marginTop: 2,
  },
  dropdownTrigger: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropdownTriggerPressed: {
    backgroundColor: '#f8fafc',
  },
  dropdownTriggerValue: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  dropdownTriggerPlaceholder: {
    flex: 1,
    color: '#7b8798',
    fontWeight: '600',
    fontSize: 14,
  },
  dropdownChevron: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 10,
    gap: 8,
  },
  dropdownSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownSearchInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    color: colors.textPrimary,
    fontWeight: '600',
  },
  dropdownSearchButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dropdownSearchButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  dropdownList: {
    maxHeight: 220,
  },
  dropdownEmptyText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
    paddingVertical: 6,
  },
  dropdownOption: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#fff',
    gap: 2,
    marginBottom: 8,
  },
  dropdownOptionSelected: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  dropdownOptionTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  dropdownOptionTitleSelected: {
    color: colors.success,
  },
  dropdownOptionMeta: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 11,
  },
  rangeError: {
    color: '#c22a2a',
    fontWeight: '700',
    fontSize: 12,
  },
  reportActionsRow: {
    marginBottom: 6,
  },
  reportActionBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9daf7',
    backgroundColor: '#e6effd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  reportActionBtnPressed: {
    opacity: 0.9,
  },
  reportActionBtnText: {
    color: '#1458bf',
    fontWeight: '800',
    fontSize: 13,
  },
  tableHeaderRow: {
    flexDirection: 'row',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCell: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  tableCellHeader: {
    backgroundColor: '#f1f5f9',
  },
  tableCellText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  tableCellTextHeader: {
    fontWeight: '800',
    fontSize: 11,
  },
  tableInfoWrap: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  tableInfoText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 4,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
  },
  emptySub: {
    color: colors.textMuted,
    fontWeight: '500',
  },
});

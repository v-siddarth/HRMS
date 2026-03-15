import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { Card, Field, PrimaryButton } from '../../components/ui';
import { shiftsCol } from '../../services/firebase';
import { useAppSelector } from '../../store/hooks';
import {
  useDeleteEmployeeMutation,
  useGetEmployeesQuery,
  useGetShopByIdQuery,
  useGetShiftsQuery,
  useGetWeeklyShiftPlanQuery,
  useUpsertEmployeeMutation,
  useUpsertShiftMutation,
  useUpsertWeeklyShiftPlanMutation,
} from '../../store/hrmsApi';
import { formatDisplayDate, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import type { Employee, EmployeeStatus, WeeklyOffDay } from '../../types/models';

type StaffStackParamList = {
  StaffList: undefined;
  StaffEditTable: undefined;
  StaffDeactivateTable: undefined;
  StaffShiftScreen: undefined;
  WeeklyShiftPlanner: undefined;
  AllStaffList: undefined;
  StaffForm: { mode: 'new' | 'edit'; employee?: Employee };
};

interface EmployeeForm {
  id?: string;
  employeeCode: string;
  name: string;
  phone: string;
  addressLine1: string;
  taluka: string;
  district: string;
  organization: string;
  designation: string;
  aadhaarNo: string;
  biometricUserId: string;
  biometricConsent: boolean;
  biometricRegisteredAt: string;
  joiningDate: string;
  defaultShiftId: string;
  weeklyOff: WeeklyOffDay;
  basicSalary: string;
  pfAmount: string;
  overtimeRatePerHour: string;
  status: EmployeeStatus;
  activatedAt: string;
  deactivatedAt: string;
}

const initialForm: EmployeeForm = {
  employeeCode: '',
  name: '',
  phone: '',
  addressLine1: '',
  taluka: '',
  district: '',
  organization: '',
  designation: '',
  aadhaarNo: '',
  biometricUserId: '',
  biometricConsent: false,
  biometricRegisteredAt: '',
  joiningDate: '',
  defaultShiftId: '',
  weeklyOff: 'none',
  basicSalary: '',
  pfAmount: '0',
  overtimeRatePerHour: '0',
  status: 'active',
  activatedAt: '',
  deactivatedAt: '',
};

const statusFilters: Array<{ key: 'all' | EmployeeStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

const weekDays: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];
const weekDayLabel: Record<(typeof weekDays)[number], string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const Stack = createNativeStackNavigator<StaffStackParamList>();

export function StaffScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffList" component={StaffListScreen} />
      <Stack.Screen name="StaffEditTable" component={StaffEditTableScreen} />
      <Stack.Screen name="StaffDeactivateTable" component={StaffDeactivateTableScreen} />
      <Stack.Screen name="StaffShiftScreen" component={StaffShiftScreen} />
      <Stack.Screen name="WeeklyShiftPlanner" component={WeeklyShiftPlannerScreen} />
      <Stack.Screen name="AllStaffList" component={AllStaffListScreen} />
      <Stack.Screen name="StaffForm" component={StaffFormScreen} />
    </Stack.Navigator>
  );
}

function StaffListScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });

  return (
    <View style={styles.page}>
      <StatusBar backgroundColor="#0b8f6d" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <View style={styles.staffHeaderCard}>
            <View style={styles.staffHeaderGradientBase} />
            <View style={styles.staffHeaderGradientMid} />
            <View style={styles.staffHeaderGradientGlowTop} />
            <View style={styles.staffHeaderGradientGlowBottom} />
            <Text style={styles.staffHeaderTitle}>{shop?.shopName ?? 'Staff'}</Text>
            <Text style={styles.staffHeaderMeta} numberOfLines={2}>
              {shop?.address ?? '-'}
            </Text>
            <Text style={styles.staffHeaderMeta}>Powered by RVM Attend</Text>
            <View style={styles.staffHeaderDivider} />
            <Text style={styles.staffHeaderSubTitle}>Staff</Text>
            <Text style={styles.staffHeaderSubMeta}>Choose an action to open the required staff module.</Text>
          </View>

          <View style={styles.actionGrid}>
            <ActionTile icon="⊕" tone="emerald" label="Create New Staff" onPress={() => navigation.navigate('StaffForm', { mode: 'new' })} active={false} />
            <ActionTile icon="✎" tone="blue" label="Edit Staff Details" onPress={() => navigation.navigate('StaffEditTable')} active={false} />
            <ActionTile icon="⊘" tone="red" label="Mark De-activate Staff" onPress={() => navigation.navigate('StaffDeactivateTable')} active={false} />
            <ActionTile icon="◷" tone="violet" label="Create Shifts" onPress={() => navigation.navigate('StaffShiftScreen')} active={false} />
            <ActionTile icon="◫" tone="amber" label="Weekly Shift Planner" onPress={() => navigation.navigate('WeeklyShiftPlanner')} active={false} />
            <ActionTile icon="▦" tone="teal" label="All Staff List" onPress={() => navigation.navigate('AllStaffList')} active={false} />
          </View>

          <Card>
            <Text style={styles.policyTitle}>Shift Planning Rule</Text>
            <Text style={styles.policyText}>1. Weekly shift planning is for rotational staff.</Text>
            <Text style={styles.policyText}>2. Fixed shift staff should be configured in Staff Profile as Default Shift.</Text>
            <Text style={styles.policyText}>3. Use Weekly Shift Planner to update weekly assignments for non-fixed staff.</Text>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionTile({
  icon,
  tone,
  label,
  onPress,
  active,
}: {
  icon: string;
  tone: 'emerald' | 'blue' | 'red' | 'violet' | 'amber' | 'teal';
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  const palette = actionTonePalette(tone);
  return (
    <Pressable style={({ pressed }) => [styles.actionTile, active ? styles.actionTileActive : undefined, pressed && styles.actionTilePressed]} onPress={onPress}>
      <View
        style={[
          styles.actionTileIconWrap,
          { backgroundColor: palette.bg, borderColor: palette.border },
          active ? styles.actionTileIconWrapActive : undefined,
        ]}>
        <Text style={[styles.actionTileIcon, { color: palette.fg }, active ? styles.actionTileIconActive : undefined]}>{icon}</Text>
      </View>
      <Text style={[styles.actionTileText, active ? styles.actionTileTextActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

function actionTonePalette(tone: 'emerald' | 'blue' | 'red' | 'violet' | 'amber' | 'teal') {
  const palette = {
    emerald: { bg: '#e8fbf2', border: '#bfead4', fg: '#0f9f63' },
    blue: { bg: '#eaf1ff', border: '#c8d8ff', fg: '#1d4ed8' },
    red: { bg: '#ffefef', border: '#f7c7c7', fg: '#b42323' },
    violet: { bg: '#f2ecff', border: '#d9c7ff', fg: '#6d28d9' },
    amber: { bg: '#fff4df', border: '#f6ddac', fg: '#b7791f' },
    teal: { bg: '#e6f8f8', border: '#bae9e9', fg: '#0f766e' },
  } as const;
  return palette[tone];
}

function WeeklyShiftPlannerScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [weekStartDate, setWeekStartDate] = useState(dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'));
  const [showWeekDatePicker, setShowWeekDatePicker] = useState(false);
  const [planEmployeeId, setPlanEmployeeId] = useState('');
  const [planShiftId, setPlanShiftId] = useState('');
  const [planDay, setPlanDay] = useState<(typeof weekDays)[number]>('mon');
  const [savingPlan, setSavingPlan] = useState(false);
  const [modeFilter, setModeFilter] = useState<'all' | 'weekly' | 'fixed'>('all');
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shifts = [] } = useGetShiftsQuery(shopId, { skip: !shopId });
  const { data: weeklyPlans = [], refetch: refetchWeeklyPlans } = useGetWeeklyShiftPlanQuery(
    { shopId, weekStartDate },
    { skip: !shopId || !weekStartDate },
  );
  const [upsertWeeklyPlan] = useUpsertWeeklyShiftPlanMutation();

  const activeShifts = useMemo(() => shifts.filter(shift => shift.active), [shifts]);
  const activeEmployees = useMemo(() => employees.filter(employee => employee.status === 'active'), [employees]);
  const weeklyPlanningEmployees = useMemo(
    () => activeEmployees.filter(employee => !employee.defaultShiftId),
    [activeEmployees],
  );
  const fixedShiftEmployees = useMemo(
    () => activeEmployees.filter(employee => !!employee.defaultShiftId),
    [activeEmployees],
  );
  const shiftById = useMemo(() => new Map(shifts.map(shift => [shift.id, shift])), [shifts]);

  const planByEmployeeAndDay = useMemo(() => {
    return weeklyPlans.reduce<Record<string, string>>((acc, item) => {
      acc[`${item.employeeId}-${item.dayOfWeek}`] = item.shiftId;
      return acc;
    }, {});
  }, [weeklyPlans]);

  const plannerRows = useMemo(() => {
    if (modeFilter === 'weekly') {
      return weeklyPlanningEmployees;
    }
    if (modeFilter === 'fixed') {
      return fixedShiftEmployees;
    }
    return activeEmployees;
  }, [activeEmployees, fixedShiftEmployees, modeFilter, weeklyPlanningEmployees]);

  const selectedEmployee = useMemo(
    () => activeEmployees.find(employee => employee.id === planEmployeeId),
    [activeEmployees, planEmployeeId],
  );
  const selectedShift = useMemo(() => activeShifts.find(shift => shift.id === planShiftId), [activeShifts, planShiftId]);

  const onSaveWeeklyPlan = async () => {
    if (!shopId) {
      return;
    }
    if (!planEmployeeId || !planShiftId || !weekStartDate) {
      Alert.alert('Validation', 'Select week start date, staff, shift and day.');
      return;
    }
    if (selectedEmployee?.defaultShiftId) {
      Alert.alert('Fixed Shift Staff', 'This staff has a fixed shift. Update shift in Staff Profile instead of weekly planner.');
      return;
    }
    try {
      setSavingPlan(true);
      await upsertWeeklyPlan({
        shopId,
        weekStartDate,
        employeeId: planEmployeeId,
        shiftId: planShiftId,
        dayOfWeek: planDay,
      }).unwrap();
      await refetchWeeklyPlans();
      Alert.alert('Saved', 'Weekly shift plan updated.');
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingPlan(false);
    }
  };

  const onWeekDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowWeekDatePicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    const monday = dayjs(selectedDate).startOf('week').add(1, 'day').format('YYYY-MM-DD');
    setWeekStartDate(monday);
  };

  return (
    <View style={styles.page}>
      <FlatList
        data={plannerRows}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Weekly Shift Planner</Text>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.countRow}>
              <CountChip label="Active Staff" value={`${activeEmployees.length}`} />
              <CountChip label="Weekly Planning" value={`${weeklyPlanningEmployees.length}`} />
              <CountChip label="Fixed Shift" value={`${fixedShiftEmployees.length}`} />
            </View>

            <Card>
              <Text style={styles.shiftTitle}>Plan Shift Day</Text>
              <View style={styles.dateFieldWrap}>
                <Text style={styles.dateLabel}>Week Start Date (Monday)</Text>
                <Pressable
                  style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
                  onPress={() => setShowWeekDatePicker(true)}>
                  <Text style={styles.dateValueText}>{formatDisplayDate(weekStartDate)}</Text>
                </Pressable>
                {showWeekDatePicker && (
                  <View style={styles.datePickerWrap}>
                    <DateTimePicker
                      value={parseDate(weekStartDate)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onWeekDateChange}
                    />
                    {Platform.OS === 'ios' && (
                      <Pressable style={styles.dateDoneBtn} onPress={() => setShowWeekDatePicker(false)}>
                        <Text style={styles.dateDoneText}>Done</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              <Text style={styles.shiftLabel}>Select Staff (weekly planning staff)</Text>
              <View style={styles.selectionList}>
                {weeklyPlanningEmployees.length === 0 ? (
                  <Text style={styles.shiftHint}>No rotational staff found. Configure shifts in profile for fixed mode.</Text>
                ) : (
                  weeklyPlanningEmployees.map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.selectionRow, planEmployeeId === emp.id ? styles.selectionRowSelected : undefined]}
                      onPress={() => setPlanEmployeeId(emp.id)}>
                      <Text style={[styles.selectionRowTitle, planEmployeeId === emp.id ? styles.selectionRowTitleSelected : undefined]}>
                        {emp.employeeCode ? `${emp.employeeCode} - ` : ''}
                        {emp.name}
                      </Text>
                      <Text style={styles.selectionRowMeta}>{emp.designation}</Text>
                    </Pressable>
                  ))
                )}
              </View>

              <Text style={styles.shiftLabel}>Select Shift</Text>
              <View style={styles.shiftGrid}>
                {activeShifts.map(shift => (
                  <Pressable
                    key={shift.id}
                    style={[styles.shiftOptionCard, planShiftId === shift.id ? styles.shiftOptionCardSelected : undefined]}
                    onPress={() => setPlanShiftId(shift.id)}>
                    <Text style={[styles.shiftOptionName, planShiftId === shift.id ? styles.shiftOptionNameSelected : undefined]} numberOfLines={2}>
                      {shift.name}
                    </Text>
                    <Text style={styles.shiftOptionTime}>{shift.startTime}-{shift.endTime}</Text>
                  </Pressable>
                ))}
              </View>
              {selectedShift ? (
                <Text style={styles.shiftHint}>{`Selected Shift: ${selectedShift.name} (${selectedShift.startTime}-${selectedShift.endTime})`}</Text>
              ) : (
                <Text style={styles.shiftHint}>Choose one shift to assign for selected day.</Text>
              )}

              <Text style={styles.shiftLabel}>Select Day</Text>
              <View style={styles.dayGrid}>
                {weekDays.map(day => (
                  <Pressable
                    key={day}
                    style={[styles.dayPill, planDay === day ? styles.dayPillSelected : undefined]}
                    onPress={() => setPlanDay(day)}>
                    <Text style={[styles.dayPillText, planDay === day ? styles.dayPillTextSelected : undefined]}>
                      {day.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <PrimaryButton title={savingPlan ? 'Saving...' : 'Save Weekly Plan'} onPress={onSaveWeeklyPlan} loading={savingPlan} />
              <Text style={styles.shiftHint}>{`${weeklyPlans.length} weekly rows available for selected week.`}</Text>
            </Card>

            <Card>
              <Text style={styles.filterTitle}>View Mode</Text>
              <View style={styles.modeColumn}>
                <Pressable
                  style={[styles.modeRow, modeFilter === 'all' ? styles.modeRowSelected : undefined]}
                  onPress={() => setModeFilter('all')}>
                  <Text style={[styles.modeRowTitle, modeFilter === 'all' ? styles.modeRowTitleSelected : undefined]}>All Staff</Text>
                  <Text style={styles.modeRowMeta}>Shows both fixed and weekly planning staff.</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeRow, modeFilter === 'weekly' ? styles.modeRowSelected : undefined]}
                  onPress={() => setModeFilter('weekly')}>
                  <Text style={[styles.modeRowTitle, modeFilter === 'weekly' ? styles.modeRowTitleSelected : undefined]}>Weekly Planning</Text>
                  <Text style={styles.modeRowMeta}>Staff without fixed shift in profile.</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeRow, modeFilter === 'fixed' ? styles.modeRowSelected : undefined]}
                  onPress={() => setModeFilter('fixed')}>
                  <Text style={[styles.modeRowTitle, modeFilter === 'fixed' ? styles.modeRowTitleSelected : undefined]}>Fixed Shift</Text>
                  <Text style={styles.modeRowMeta}>Staff with default shift defined in profile.</Text>
                </Pressable>
              </View>
            </Card>

            <Card>
              <Text style={styles.reportTitle}>Weekly Coverage</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.weekGridHeaderRow}>
                  <Text style={[styles.tableHead, styles.weekStaffCell]}>Staff</Text>
                  {weekDays.map(day => (
                    <Text key={day} style={[styles.tableHead, styles.weekDayCellHeader]}>
                      {weekDayLabel[day]}
                    </Text>
                  ))}
                  <Text style={[styles.tableHead, styles.weekModeCellHeader]}>Mode</Text>
                </View>
              </ScrollView>
            </Card>
            <Text style={styles.sectionCount}>{`${plannerRows.length} staff in selected mode`}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No Staff Found</Text>
            <Text style={styles.emptySub}>Add active staff to start shift planning.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isFixed = !!item.defaultShiftId;
          return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.weekGridBodyRow}>
                <View style={styles.weekStaffCell}>
                  <Text style={styles.tableCell} numberOfLines={1}>
                    {item.employeeCode ? `${item.employeeCode} - ` : ''}
                    {item.name}
                  </Text>
                  <Text style={styles.weekSubCell} numberOfLines={1}>
                    {item.designation}
                  </Text>
                </View>
                {weekDays.map(day => {
                  const weeklyShiftId = planByEmployeeAndDay[`${item.id}-${day}`];
                  const effectiveShiftId = weeklyShiftId || item.defaultShiftId || '';
                  const shiftName = effectiveShiftId ? shiftById.get(effectiveShiftId)?.name ?? effectiveShiftId : '-';
                  return (
                    <Text key={`${item.id}-${day}`} style={styles.weekDayCell} numberOfLines={2}>
                      {compactShiftLabel(shiftName)}
                    </Text>
                  );
                })}
                <View style={styles.weekModeCellBody}>
                  <Text style={[styles.modeChipText, isFixed ? styles.modeChipFixed : styles.modeChipWeekly]}>
                    {isFixed ? 'FIXED' : 'WEEKLY'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          );
        }}
      />
    </View>
  );
}

function AllStaffListScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const [shiftTypeFilter, setShiftTypeFilter] = useState<'all' | 'weekly' | 'fixed'>('all');
  const { data: employees = [], isLoading } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shifts = [] } = useGetShiftsQuery(shopId, { skip: !shopId });
  const shiftById = useMemo(() => new Map(shifts.map(shift => [shift.id, shift])), [shifts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(employee => {
      const matchesSearch =
        !q ||
        employee.name.toLowerCase().includes(q) ||
        employee.phone.toLowerCase().includes(q) ||
        employee.designation.toLowerCase().includes(q) ||
        (employee.employeeCode ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' ? true : employee.status === statusFilter;
      const isFixed = !!employee.defaultShiftId;
      const matchesShiftType =
        shiftTypeFilter === 'all'
          ? true
          : shiftTypeFilter === 'fixed'
            ? isFixed
            : !isFixed;
      return matchesSearch && matchesStatus && matchesShiftType;
    });
  }, [employees, query, shiftTypeFilter, statusFilter]);

  const activeCount = employees.filter(item => item.status === 'active').length;
  const fixedCount = employees.filter(item => !!item.defaultShiftId).length;
  const weeklyCount = employees.length - fixedCount;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>All Staff List</Text>
            <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.countRow}>
            <CountChip label="Total" value={`${employees.length}`} />
            <CountChip label="Active" value={`${activeCount}`} />
            <CountChip label="Fixed Shift" value={`${fixedCount}`} />
          </View>

          <Card>
            <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Code / name / phone / designation" />
            <Text style={styles.filterTitle}>Status Filter</Text>
            <View style={styles.filterWrap}>
              {statusFilters.map(option => (
                <Pressable
                  key={option.key}
                  style={[styles.filterChip, statusFilter === option.key ? styles.filterChipSelected : undefined]}
                  onPress={() => setStatusFilter(option.key)}>
                  <Text style={[styles.filterChipText, statusFilter === option.key ? styles.filterChipTextSelected : undefined]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.filterTitle}>Shift Type Filter</Text>
            <View style={styles.filterWrap}>
              <Pressable
                style={[styles.filterChip, shiftTypeFilter === 'all' ? styles.filterChipSelected : undefined]}
                onPress={() => setShiftTypeFilter('all')}>
                <Text style={[styles.filterChipText, shiftTypeFilter === 'all' ? styles.filterChipTextSelected : undefined]}>All</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, shiftTypeFilter === 'fixed' ? styles.filterChipSelected : undefined]}
                onPress={() => setShiftTypeFilter('fixed')}>
                <Text style={[styles.filterChipText, shiftTypeFilter === 'fixed' ? styles.filterChipTextSelected : undefined]}>
                  Fixed Shift
                </Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, shiftTypeFilter === 'weekly' ? styles.filterChipSelected : undefined]}
                onPress={() => setShiftTypeFilter('weekly')}>
                <Text style={[styles.filterChipText, shiftTypeFilter === 'weekly' ? styles.filterChipTextSelected : undefined]}>
                  Weekly Plan
                </Text>
              </Pressable>
            </View>
          </Card>

          <Text style={styles.sectionCount}>
            {isLoading ? 'Loading staff...' : `${filtered.length} staff members | ${weeklyCount} on weekly planning`}
          </Text>
        </View>

        <View style={styles.fullTableWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.fullTableGrid}>
              <View style={styles.fullTableHeaderRow}>
                <Text style={[styles.tableHead, styles.fullColCode]}>Code</Text>
                <Text style={[styles.tableHead, styles.fullColName]}>Name</Text>
                <Text style={[styles.tableHead, styles.fullColRole]}>Role</Text>
                <Text style={[styles.tableHead, styles.fullColStatus]}>Status</Text>
                <Text style={[styles.tableHead, styles.fullColShift]}>Shift</Text>
                <Text style={[styles.tableHead, styles.fullColService]}>Service</Text>
                <Text style={[styles.tableHead, styles.fullColAction]}>Edit</Text>
              </View>

              {!isLoading &&
                filtered.map(item => {
                  const isFixed = !!item.defaultShiftId;
                  const service = getServiceDuration(item);
                  const shiftName = item.defaultShiftId ? shiftById.get(item.defaultShiftId)?.name ?? item.defaultShiftId : 'Weekly Planner';
                  return (
                    <View key={item.id} style={styles.fullTableBodyRow}>
                      <Text style={[styles.tableCell, styles.fullColCode]} numberOfLines={1}>
                        {item.employeeCode || '-'}
                      </Text>
                      <View style={styles.fullColName}>
                        <Text style={styles.tableCell} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.weekSubCell} numberOfLines={1}>
                          {item.phone}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, styles.fullColRole]} numberOfLines={1}>
                        {item.designation}
                      </Text>
                      <Text style={[styles.tableCell, styles.fullColStatus, item.status === 'active' ? styles.activeText : styles.inactiveText]} numberOfLines={1}>
                        {item.status.toUpperCase()}
                      </Text>
                      <View style={styles.fullColShift}>
                        <Text style={styles.tableCell} numberOfLines={1}>
                          {shiftName}
                        </Text>
                        <Text style={[styles.weekSubCell, isFixed ? styles.modeChipFixed : styles.modeChipWeekly]} numberOfLines={1}>
                          {isFixed ? 'Fixed' : 'Weekly'}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, styles.fullColService]} numberOfLines={1}>
                        {service}
                      </Text>
                      <View style={[styles.fullColAction, styles.rowActions]}>
                        <Pressable style={styles.iconActionBtn} onPress={() => navigation.navigate('StaffForm', { mode: 'edit', employee: item })}>
                          <Text style={styles.iconActionText}>✎</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
            </View>
          </ScrollView>
        </View>

        {!isLoading && filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No Staff Found</Text>
            <Text style={styles.emptySub}>Try different search or filters.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function StaffEditTableScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const { data: employees = [], isLoading } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const [deleteEmployee, { isLoading: deleting }] = useDeleteEmployeeMutation();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(employee => {
      const matchesSearch =
        !q ||
        employee.name.toLowerCase().includes(q) ||
        employee.phone.toLowerCase().includes(q) ||
        employee.designation.toLowerCase().includes(q) ||
        (employee.employeeCode ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' ? true : employee.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [employees, query, statusFilter]);

  const onDelete = (employee: Employee) => {
    if (!shopId) {
      return;
    }
    Alert.alert('Delete Staff', `Delete ${employee.name}? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEmployee({ shopId, employeeId: employee.id }).unwrap();
          } catch (error) {
            Alert.alert('Delete failed', (error as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.page}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Edit Staff Details</Text>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <Card>
              <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Code / name / phone / designation" />
              <Text style={styles.filterTitle}>Status Filter</Text>
              <View style={styles.filterWrap}>
                {statusFilters.map(option => (
                  <Pressable
                    key={option.key}
                    style={[styles.filterChip, statusFilter === option.key ? styles.filterChipSelected : undefined]}
                    onPress={() => setStatusFilter(option.key)}>
                    <Text style={[styles.filterChipText, statusFilter === option.key ? styles.filterChipTextSelected : undefined]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
            <Card>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHead, styles.colCode]}>No.</Text>
                <Text style={[styles.tableHead, styles.colName]}>Name</Text>
                <Text style={[styles.tableHead, styles.colStatus]}>Status</Text>
                <Text style={[styles.tableHead, styles.colAction]}>Actions</Text>
              </View>
            </Card>
            <Text style={styles.sectionCount}>
              {isLoading ? 'Loading staff...' : `${filtered.length} staff members`}
              {deleting ? ' | Deleting...' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Staff Found</Text>
              <Text style={styles.emptySub}>Try different search or filter.</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.staffTableRow}>
            <Text style={[styles.tableCell, styles.colCode]} numberOfLines={1}>
              {index + 1}
            </Text>
            <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.tableCell, styles.colStatus, item.status === 'active' ? styles.activeText : styles.inactiveText]} numberOfLines={1}>
              {item.status.toUpperCase()}
            </Text>
            <View style={[styles.colAction, styles.rowActions]}>
              <Pressable style={styles.iconActionBtn} onPress={() => navigation.navigate('StaffForm', { mode: 'edit', employee: item })}>
                <Text style={styles.iconActionText}>✎</Text>
              </Pressable>
              <Pressable style={[styles.iconActionBtn, styles.iconDeleteBtn]} onPress={() => onDelete(item)}>
                <Text style={[styles.iconActionText, styles.iconDeleteText]}>🗑</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function StaffDeactivateTableScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const { data: employees = [], isLoading } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const [upsertEmployee, { isLoading: updating }] = useUpsertEmployeeMutation();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(employee => {
      const matchesSearch =
        !q ||
        employee.name.toLowerCase().includes(q) ||
        employee.phone.toLowerCase().includes(q) ||
        employee.designation.toLowerCase().includes(q) ||
        (employee.employeeCode ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' ? true : employee.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [employees, query, statusFilter]);

  const onToggleStatus = (employee: Employee, nextStatus: EmployeeStatus) => {
    if (!shopId) {
      return;
    }
    const title = nextStatus === 'inactive' ? 'De-activate Staff' : 'Activate Staff';
    const msg = nextStatus === 'inactive' ? `De-activate ${employee.name}?` : `Activate ${employee.name}?`;
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            const currentDate = todayDate();
            const nextActivatedAt =
              nextStatus === 'active' ? currentDate : employee.activatedAt || employee.joiningDate || currentDate;
            const nextDeactivatedAt = nextStatus === 'inactive' ? currentDate : '';
            await upsertEmployee({
              ...employee,
              shopId,
              status: nextStatus,
              activatedAt: nextActivatedAt,
              deactivatedAt: nextDeactivatedAt,
            }).unwrap();
          } catch (error) {
            Alert.alert('Status update failed', (error as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.page}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Mark De-activate Staff</Text>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <Card>
              <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Code / name / phone / designation" />
              <Text style={styles.filterTitle}>Status Filter</Text>
              <View style={styles.filterWrap}>
                {statusFilters.map(option => (
                  <Pressable
                    key={option.key}
                    style={[styles.filterChip, statusFilter === option.key ? styles.filterChipSelected : undefined]}
                    onPress={() => setStatusFilter(option.key)}>
                    <Text style={[styles.filterChipText, statusFilter === option.key ? styles.filterChipTextSelected : undefined]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
            <Card>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHead, styles.colCode]}>No.</Text>
                <Text style={[styles.tableHead, styles.colName]}>Name</Text>
                <Text style={[styles.tableHead, styles.colStatus]}>Status</Text>
                <Text style={[styles.tableHead, styles.colAction]}>Actions</Text>
              </View>
            </Card>
            <Text style={styles.sectionCount}>
              {isLoading ? 'Loading staff...' : `${filtered.length} staff members`}
              {updating ? ' | Updating...' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Staff Found</Text>
              <Text style={styles.emptySub}>Try different search or filter.</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.staffTableRow}>
            <Text style={[styles.tableCell, styles.colCode]} numberOfLines={1}>
              {index + 1}
            </Text>
            <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.tableCell, styles.colStatus, item.status === 'active' ? styles.activeText : styles.inactiveText]} numberOfLines={1}>
              {item.status.toUpperCase()}
            </Text>
            <View style={[styles.colAction, styles.rowActions]}>
              {item.status === 'active' ? (
                <Pressable style={[styles.iconActionBtn, styles.iconDeactivateBtn]} onPress={() => onToggleStatus(item, 'inactive')}>
                  <Text style={[styles.iconActionText, styles.iconDeactivateText]}>⛔</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.iconActionBtn, styles.iconActivateBtn]} onPress={() => onToggleStatus(item, 'active')}>
                  <Text style={[styles.iconActionText, styles.iconActivateText]}>✓</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function StaffShiftScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('07:00');
  const [shiftEnd, setShiftEnd] = useState('15:30');
  const [showShiftStartPicker, setShowShiftStartPicker] = useState(false);
  const [showShiftEndPicker, setShowShiftEndPicker] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const { data: shifts = [], isLoading, refetch: refetchShifts } = useGetShiftsQuery(shopId, { skip: !shopId });
  const [upsertShift] = useUpsertShiftMutation();

  const durationLabel = useMemo(() => {
    const d = calculateShiftHours(shiftStart, shiftEnd);
    return d === null ? '-' : `${d} hrs`;
  }, [shiftStart, shiftEnd]);

  const onCreateShift = async () => {
    if (!shopId) {
      return;
    }
    if (!shiftName.trim()) {
      Alert.alert('Validation', 'Shift name is required.');
      return;
    }
    const duration = calculateShiftHours(shiftStart, shiftEnd);
    if (duration === null || duration <= 0) {
      Alert.alert('Validation', 'Enter valid Start and End time in 24-hour format.');
      return;
    }
    try {
      setSavingShift(true);
      const shiftId = buildShiftId(shiftName, shiftStart, shiftEnd);
      const saveStatus = await withActionDeadline(
        upsertShiftWithRetry(
          upsertShift,
          {
            id: shiftId,
            shopId,
            name: shiftName.trim(),
            startTime: shiftStart.trim(),
            endTime: shiftEnd.trim(),
            durationHours: duration,
            active: true,
          },
          { maxAttempts: 2, attemptTimeoutMs: 7000, retryDelayMs: 600 },
        ),
        12000,
        'pending',
      );
      refetchShifts();
      setShiftName('');
      Alert.alert(
        saveStatus === 'saved' ? 'Saved' : 'Syncing',
        saveStatus === 'saved'
          ? 'Shift created successfully.'
          : 'Shift request queued. It will sync automatically when Firestore is reachable.',
      );
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingShift(false);
    }
  };

  const onLoadDefaultShifts = async () => {
    if (!shopId) {
      return;
    }
    const defaults = [
      { name: 'I Shift', startTime: '07:00', endTime: '15:30' },
      { name: 'II Shift', startTime: '15:30', endTime: '24:00' },
      { name: 'III Shift', startTime: '24:00', endTime: '07:00' },
      { name: 'General-8 Shift', startTime: '09:00', endTime: '17:00' },
      { name: 'General-12 Shift', startTime: '09:00', endTime: '21:00' },
    ];
    try {
      setSavingShift(true);
      const results = await Promise.allSettled(
        defaults.map(shift =>
          withActionDeadline(
            upsertShiftWithRetry(
              upsertShift,
              {
                id: buildShiftId(shift.name, shift.startTime, shift.endTime),
                shopId,
                ...shift,
                durationHours: calculateShiftHours(shift.startTime, shift.endTime) ?? 0,
                active: true,
              },
              { maxAttempts: 2, attemptTimeoutMs: 7000, retryDelayMs: 600 },
            ),
            12000,
            'pending',
          ),
        ),
      );
      refetchShifts();

      const failed = defaults.filter((_, i) => results[i]?.status === 'rejected').map(s => s.name);
      const pending = defaults
        .filter((_, i) => results[i]?.status === 'fulfilled' && results[i]?.value === 'pending')
        .map(s => s.name);

      if (failed.length === 0 && pending.length === 0) {
        Alert.alert('Saved', 'Standard shifts loaded successfully.');
      } else if (failed.length === 0) {
        Alert.alert('Syncing', `Queued ${pending.length} shifts. They will appear automatically after sync.`);
      } else if (failed.length === defaults.length) {
        Alert.alert('Save failed', 'Could not save standard shifts. Check your connection and retry.');
      } else {
        Alert.alert('Partial Success', `Failed to save: ${failed.join(', ')}.`);
      }
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingShift(false);
    }
  };

  const onToggleShiftActive = async (shift: { id: string; shopId: string; name: string; startTime: string; endTime: string; durationHours: number; active: boolean }) => {
    try {
      await upsertShift({
        ...shift,
        active: !shift.active,
      }).unwrap();
      refetchShifts();
    } catch (error) {
      Alert.alert('Update failed', (error as Error).message);
    }
  };

  const onShiftStartChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowShiftStartPicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    setShiftStart(dayjs(selectedDate).format('HH:mm'));
  };

  const onShiftEndChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowShiftEndPicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    setShiftEnd(dayjs(selectedDate).format('HH:mm'));
  };

  return (
    <View style={styles.page}>
      <FlatList
        data={shifts}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Create Shifts</Text>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <Card>
              <Text style={styles.shiftTitle}>Shift Master Entry</Text>
              <Field label="Shift Name" value={shiftName} onChangeText={setShiftName} placeholder="e.g. I Shift" />
              <View style={styles.shiftTimeRow}>
                <View style={styles.shiftField}>
                  <View style={styles.dateFieldWrap}>
                    <Text style={styles.dateLabel}>Start Time (24H)</Text>
                    <Pressable
                      style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
                      onPress={() => setShowShiftStartPicker(true)}>
                      <Text style={styles.dateValueText}>{shiftStart}</Text>
                    </Pressable>
                    {showShiftStartPicker && (
                      <View style={styles.datePickerWrap}>
                        <DateTimePicker
                          value={parseTimeToDate(shiftStart)}
                          mode="time"
                          is24Hour
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={onShiftStartChange}
                        />
                        {Platform.OS === 'ios' && (
                          <Pressable style={styles.dateDoneBtn} onPress={() => setShowShiftStartPicker(false)}>
                            <Text style={styles.dateDoneText}>Done</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.shiftField}>
                  <View style={styles.dateFieldWrap}>
                    <Text style={styles.dateLabel}>End Time (24H)</Text>
                    <Pressable
                      style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
                      onPress={() => setShowShiftEndPicker(true)}>
                      <Text style={styles.dateValueText}>{shiftEnd}</Text>
                    </Pressable>
                    {showShiftEndPicker && (
                      <View style={styles.datePickerWrap}>
                        <DateTimePicker
                          value={parseTimeToDate(shiftEnd)}
                          mode="time"
                          is24Hour
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={onShiftEndChange}
                        />
                        {Platform.OS === 'ios' && (
                          <Pressable style={styles.dateDoneBtn} onPress={() => setShowShiftEndPicker(false)}>
                            <Text style={styles.dateDoneText}>Done</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Field label="Duration (Auto)" value={durationLabel} editable={false} />
              <View style={styles.shiftBtnRow}>
                <View style={styles.shiftBtn}>
                  <PrimaryButton title={savingShift ? 'Saving...' : 'Save Shift'} onPress={onCreateShift} loading={savingShift} />
                </View>
                <Pressable style={[styles.defaultShiftBtn, savingShift && styles.defaultShiftBtnDisabled]} onPress={onLoadDefaultShifts} disabled={savingShift}>
                  <Text style={styles.defaultShiftBtnText}>Load Standard Shifts</Text>
                </Pressable>
              </View>
              <Text style={styles.shiftHint}>Standard: I, II, III, General-8, General-12.</Text>
            </Card>

            <Card>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHead, styles.colCode]}>No.</Text>
                <Text style={[styles.tableHead, styles.colName]}>Shift</Text>
                <Text style={[styles.tableHead, styles.colStatus]}>Time</Text>
                <Text style={[styles.tableHead, styles.colAction]}>Active</Text>
              </View>
            </Card>
            <Text style={styles.sectionCount}>{isLoading ? 'Loading shifts...' : `${shifts.length} shifts`}</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Shifts</Text>
              <Text style={styles.emptySub}>Create a shift or load standard shifts.</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.staffTableRow}>
            <Text style={[styles.tableCell, styles.colCode]}>{index + 1}</Text>
            <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.tableCell, styles.colStatus]} numberOfLines={1}>
              {item.startTime} - {item.endTime}
            </Text>
            <View style={[styles.colAction, styles.rowActions]}>
              <ShiftActiveToggle active={item.active} onPress={() => onToggleShiftActive(item)} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

function ShiftActiveToggle({ active, onPress }: { active: boolean; onPress: () => void }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      friction: 9,
      tension: 95,
    }).start();
  }, [active, progress]);

  const thumbTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 24],
  });

  return (
    <Pressable
      style={styles.shiftToggle}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      hitSlop={6}>
      <View style={[styles.shiftToggleTrack, active ? styles.shiftToggleTrackActive : styles.shiftToggleTrackInactive]}>
        <Animated.View
          style={[
            styles.shiftToggleThumb,
            active ? styles.shiftToggleThumbActive : styles.shiftToggleThumbInactive,
            { transform: [{ translateX: thumbTranslateX }] },
          ]}
        />
      </View>
      <Text style={[styles.shiftToggleLabel, active ? styles.shiftToggleLabelActive : styles.shiftToggleLabelInactive]}>{active ? 'ON' : 'OFF'}</Text>
    </Pressable>
  );
}

function StaffFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const employee = route.params?.employee as Employee | undefined;
  const mode = route.params?.mode as 'new' | 'edit';

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shifts = [] } = useGetShiftsQuery(shopId, { skip: !shopId });
  const nextEmployeeCode = useMemo(() => generateNextEmployeeCode(employees), [employees]);

  const [form, setForm] = useState<EmployeeForm>(() => {
    if (!employee) {
      return {
        ...initialForm,
        joiningDate: todayDate(),
        activatedAt: todayDate(),
      };
    }
    return {
      id: employee.id,
      employeeCode: employee.employeeCode ?? '',
      name: employee.name,
      phone: employee.phone,
      addressLine1: employee.addressLine1 ?? employee.address ?? '',
      taluka: employee.taluka ?? '',
      district: employee.district ?? '',
      organization: employee.organization ?? '',
      designation: employee.designation,
      aadhaarNo: employee.aadhaarNo ?? '',
      biometricUserId: employee.biometricUserId ?? '',
      biometricConsent: !!employee.biometricConsent,
      biometricRegisteredAt: employee.biometricRegisteredAt ?? '',
      joiningDate: employee.joiningDate,
      defaultShiftId: employee.defaultShiftId ?? '',
      weeklyOff: employee.weeklyOff ?? 'none',
      basicSalary: String(employee.basicSalary),
      pfAmount: String(employee.pfAmount ?? 0),
      overtimeRatePerHour: String(employee.overtimeRatePerHour),
      status: employee.status,
      activatedAt: employee.activatedAt ?? employee.joiningDate,
      deactivatedAt: employee.deactivatedAt ?? '',
    };
  });

  useEffect(() => {
    if (mode === 'new' && !form.employeeCode) {
      setForm(prev => ({ ...prev, employeeCode: nextEmployeeCode }));
    }
  }, [form.employeeCode, mode, nextEmployeeCode]);

  const [upsertEmployee, { isLoading: saving }] = useUpsertEmployeeMutation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const autoBiometricUserId = useMemo(
    () =>
      generateUniqueBiometricUserId({
        employees,
        excludeEmployeeId: form.id || employee?.id,
        employeeCode: form.employeeCode,
        phone: form.phone,
        currentBiometricUserId: mode === 'edit' ? form.biometricUserId : undefined,
      }),
    [employee?.id, employees, form.biometricUserId, form.employeeCode, form.id, form.phone, mode],
  );

  useEffect(() => {
    setForm(prev => {
      if (mode === 'new') {
        if (prev.biometricUserId === autoBiometricUserId) {
          return prev;
        }
        return { ...prev, biometricUserId: autoBiometricUserId };
      }
      if (mode === 'edit' && !prev.biometricUserId.trim() && autoBiometricUserId) {
        return { ...prev, biometricUserId: autoBiometricUserId };
      }
      return prev;
    });
  }, [autoBiometricUserId, mode]);

  const computedService = useMemo(() => {
    const start = form.activatedAt || form.joiningDate;
    const end = form.status === 'inactive' ? form.deactivatedAt || todayDate() : todayDate();
    return getDurationFromDates(start, end);
  }, [form.activatedAt, form.deactivatedAt, form.joiningDate, form.status]);

  const onRegisterBiometric = () => {
    if (!form.biometricConsent) {
      Alert.alert('Biometric Consent Required', 'Please accept biometric consent before registration.');
      return;
    }
    const finalBiometricId = generateUniqueBiometricUserId({
      employees,
      excludeEmployeeId: form.id || employee?.id,
      employeeCode: form.employeeCode,
      phone: form.phone,
      currentBiometricUserId: form.biometricUserId || autoBiometricUserId,
    });
    if (!finalBiometricId) {
      Alert.alert('Registration Failed', 'Unable to generate biometric user ID. Please check staff details.');
      return;
    }
    setForm(prev => ({ ...prev, biometricUserId: finalBiometricId, biometricRegisteredAt: todayDate() }));
    Alert.alert('Registered', `Biometric ID ${finalBiometricId} registered for attendance matching.`);
  };

  const onSave = async () => {
    if (!shopId) {
      Alert.alert('Error', 'Shop is not linked.');
      return;
    }
    if (!form.employeeCode || !form.name || !form.phone || !form.designation || !form.joiningDate || !form.basicSalary) {
      Alert.alert('Validation', 'Please fill all required fields.');
      return;
    }
    if (!form.taluka || !form.district) {
      Alert.alert('Validation', 'Taluka and District are required.');
      return;
    }
    if (!form.aadhaarNo || !/^\d{12}$/.test(form.aadhaarNo.trim())) {
      Alert.alert('Validation', 'Aadhaar number must be 12 digits.');
      return;
    }
    const finalBiometricUserId = generateUniqueBiometricUserId({
      employees,
      excludeEmployeeId: form.id || employee?.id,
      employeeCode: form.employeeCode,
      phone: form.phone,
      currentBiometricUserId: form.biometricUserId || autoBiometricUserId,
    });
    if (form.biometricConsent && !finalBiometricUserId) {
      Alert.alert('Validation', 'Biometric User ID is required when biometric is accepted.');
      return;
    }

    const previousStatus = employee?.status;
    const today = todayDate();
    let activatedAt = form.activatedAt || form.joiningDate || today;
    let deactivatedAt = form.deactivatedAt || '';

    if (!employee) {
      if (form.status === 'inactive') {
        deactivatedAt = today;
      }
    } else {
      if (previousStatus === 'active' && form.status === 'inactive') {
        deactivatedAt = today;
      }
      if (previousStatus === 'inactive' && form.status === 'active') {
        activatedAt = today;
        deactivatedAt = '';
      }
    }

    const address = [form.addressLine1.trim(), form.taluka.trim(), form.district.trim()]
      .filter(Boolean)
      .join(', ');

    try {
      const stableEmployeeId = form.id || `emp_${form.employeeCode.trim()}`;
      const saveStatus = await withActionDeadline(
        upsertEmployee({
          id: stableEmployeeId,
          shopId,
          employeeCode: form.employeeCode.trim(),
          name: form.name.trim(),
          phone: form.phone.trim(),
          address,
          addressLine1: form.addressLine1.trim(),
          taluka: form.taluka.trim(),
          district: form.district.trim(),
          organization: form.organization.trim(),
          designation: form.designation.trim(),
          aadhaarNo: form.aadhaarNo.trim(),
          biometricUserId: finalBiometricUserId,
          biometricConsent: form.biometricConsent,
          biometricRegisteredAt: form.biometricRegisteredAt || '',
          joiningDate: form.joiningDate.trim(),
          defaultShiftId: form.defaultShiftId || '',
          weeklyOff: form.weeklyOff,
          salaryType: 'monthly',
          basicSalary: Number(form.basicSalary),
          pfAmount: Number(form.pfAmount || 0),
          overtimeRatePerHour: Number(form.overtimeRatePerHour || 0),
          status: form.status,
          activatedAt,
          deactivatedAt,
        })
          .unwrap()
          .then(() => 'saved' as const),
        12000,
        'pending' as const,
      );

      Alert.alert(
        saveStatus === 'saved' ? 'Success' : 'Syncing',
        saveStatus === 'saved'
          ? `Staff member ${mode === 'edit' ? 'updated' : 'created'} successfully.`
          : 'Staff details queued and syncing in background. It will reflect automatically.',
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.formScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>{mode === 'edit' ? 'Edit Staff' : 'Create New Staff'}</Text>
          <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.formSubtitle}>Unique staff number is auto generated and cannot be edited.</Text>

        <Card>
          <Text style={styles.formSectionTitle}>Basic Details</Text>
          <Field label="Unique Number" value={form.employeeCode} editable={false} />
          <Field label="Full Name" value={form.name} onChangeText={v => setForm(prev => ({ ...prev, name: v }))} />
          <Field label="Phone Number" value={form.phone} onChangeText={v => setForm(prev => ({ ...prev, phone: v }))} keyboardType="phone-pad" />
          <Field label="Address Line 1" value={form.addressLine1} onChangeText={v => setForm(prev => ({ ...prev, addressLine1: v }))} />
          <Field label="Taluka" value={form.taluka} onChangeText={v => setForm(prev => ({ ...prev, taluka: v }))} />
          <Field label="District" value={form.district} onChangeText={v => setForm(prev => ({ ...prev, district: v }))} />
          <Field label="Organization" value={form.organization} onChangeText={v => setForm(prev => ({ ...prev, organization: v }))} placeholder="Required for labor contractors" />
          <Field label="Designation" value={form.designation} onChangeText={v => setForm(prev => ({ ...prev, designation: v }))} />
          <Field
            label="Aadhaar Number"
            value={form.aadhaarNo}
            onChangeText={v => setForm(prev => ({ ...prev, aadhaarNo: v.replace(/[^0-9]/g, '').slice(0, 12) }))}
            keyboardType="numeric"
            placeholder="12-digit Aadhaar"
          />

          <Text style={styles.formSectionTitle}>Joining & Shift</Text>
          <View style={styles.dateFieldWrap}>
            <Text style={styles.dateLabel}>Joining Date (DD.MM.YYYY)</Text>
            <Pressable
              style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
              onPress={() => setShowDatePicker(true)}>
              <Text style={form.joiningDate ? styles.dateValueText : styles.datePlaceholderText}>
                {form.joiningDate ? formatDisplayDate(form.joiningDate) : 'Select joining date'}
              </Text>
            </Pressable>
            {showDatePicker && (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={parseDate(form.joiningDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onChange={(event, selectedDate) => onDateChange(event, selectedDate, setShowDatePicker, setForm)}
                />
                {Platform.OS === 'ios' && (
                  <Pressable style={styles.dateDoneBtn} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.dateDoneText}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
          <Text style={styles.shiftLabel}>Default Shift</Text>
          <View style={styles.planWrap}>
            {shifts.length === 0 ? (
              <Text style={styles.shiftHint}>No shifts available. Create shifts first from Staff section.</Text>
            ) : (
              shifts.map(shift => (
                <Pressable
                  key={shift.id}
                  style={[styles.planChip, form.defaultShiftId === shift.id ? styles.planChipSelected : undefined]}
                  onPress={() => setForm(prev => ({ ...prev, defaultShiftId: shift.id }))}>
                  <Text style={[styles.planChipText, form.defaultShiftId === shift.id ? styles.planChipTextSelected : undefined]}>
                    {shift.name}
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          <Text style={styles.shiftLabel}>Weekly Off (or None)</Text>
          <View style={styles.planWrap}>
            {(['none', ...weekDays] as WeeklyOffDay[]).map(day => (
              <Pressable
                key={day}
                style={[styles.planChipSmall, form.weeklyOff === day ? styles.planChipSelected : undefined]}
                onPress={() => setForm(prev => ({ ...prev, weeklyOff: day }))}>
                <Text style={[styles.planChipText, form.weeklyOff === day ? styles.planChipTextSelected : undefined]}>
                  {day === 'none' ? 'NONE' : day.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.shiftHint}>Weekly off is considered PH (Paid Holiday) in salary calendar.</Text>

          <Text style={styles.formSectionTitle}>Biometric Mapping</Text>
          <Field
            label="Biometric User ID (Auto)"
            value={form.biometricUserId || autoBiometricUserId}
            editable={false}
          />
          <Text style={styles.shiftHint}>Auto-generated unique ID based on staff profile.</Text>
          <Pressable
            style={[styles.consentRow, form.biometricConsent ? styles.consentRowActive : undefined]}
            onPress={() => setForm(prev => ({ ...prev, biometricConsent: !prev.biometricConsent }))}>
            <View style={[styles.checkbox, form.biometricConsent ? styles.checkboxChecked : undefined]}>
              <Text style={styles.checkboxTick}>{form.biometricConsent ? '✓' : ''}</Text>
            </View>
            <Text style={styles.consentText}>I accept biometric consent for attendance matching.</Text>
          </Pressable>
          <View style={styles.biometricActionRow}>
            <Pressable style={styles.registerBioBtn} onPress={onRegisterBiometric}>
              <Text style={styles.registerBioBtnText}>Register Biometric ID</Text>
            </Pressable>
            <Text style={styles.biometricMetaText}>
              Registered On: {form.biometricRegisteredAt ? formatDisplayDate(form.biometricRegisteredAt) : '-'}
            </Text>
          </View>

          <Text style={styles.formSectionTitle}>Salary Details</Text>
          <Field label="Basic Salary" value={form.basicSalary} onChangeText={v => setForm(prev => ({ ...prev, basicSalary: v }))} keyboardType="numeric" />
          <Field label="PF" value={form.pfAmount} onChangeText={v => setForm(prev => ({ ...prev, pfAmount: v }))} keyboardType="numeric" />
          <Field
            label="Overtime Rate / Hour"
            value={form.overtimeRatePerHour}
            onChangeText={v => setForm(prev => ({ ...prev, overtimeRatePerHour: v }))}
            keyboardType="numeric"
          />

          <Text style={styles.formSectionTitle}>Activation</Text>
          <View style={styles.statusRow}>
            <Pressable
              style={[styles.statusChip, form.status === 'active' ? styles.statusChipActive : undefined]}
              onPress={() => setForm(prev => ({ ...prev, status: 'active' }))}>
              <Text style={[styles.statusText, form.status === 'active' ? styles.statusTextActive : undefined]}>Active</Text>
            </Pressable>
            <Pressable
              style={[styles.statusChip, form.status === 'inactive' ? styles.statusChipInactive : undefined]}
              onPress={() => setForm(prev => ({ ...prev, status: 'inactive' }))}>
              <Text style={[styles.statusText, form.status === 'inactive' ? styles.statusTextInactive : undefined]}>
                De-activate
              </Text>
            </Pressable>
          </View>
          <Field label="Active Date" value={formatDisplayDate(form.activatedAt || form.joiningDate || todayDate())} editable={false} />
          <Field
            label="De-activate Date"
            value={form.status === 'inactive' ? formatDisplayDate(form.deactivatedAt || todayDate()) : '-'}
            editable={false}
          />
          <Field label="Total Service" value={computedService} editable={false} />

          <PrimaryButton title={mode === 'edit' ? 'Update Staff' : 'Create Staff'} onPress={onSave} loading={saving} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function parseDate(value: string) {
  if (!value) {
    return new Date();
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return new Date();
  }
  return parsed.toDate();
}

function onDateChange(
  event: DateTimePickerEvent,
  selectedDate: Date | undefined,
  setShowDatePicker: (value: boolean) => void,
  setForm: React.Dispatch<React.SetStateAction<EmployeeForm>>,
) {
  if (Platform.OS === 'android') {
    setShowDatePicker(false);
  }
  if (event.type !== 'set' || !selectedDate) {
    return;
  }
  setForm(prev => ({ ...prev, joiningDate: dayjs(selectedDate).format('YYYY-MM-DD') }));
}

function calculateShiftHours(startTime: string, endTime: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) {
    return null;
  }
  let diff = end - start;
  if (diff <= 0) {
    diff += 24 * 60;
  }
  return Number((diff / 60).toFixed(2));
}

function parseTimeToMinutes(value: string) {
  const trimmed = value.trim();
  if (trimmed === '24:00') {
    return 24 * 60;
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseTimeToDate(value: string) {
  const parsed = parseTimeToMinutes(value);
  const minutes = parsed === null ? 0 : Math.min(parsed, 23 * 60 + 59);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const date = new Date();
  date.setHours(hours, mins, 0, 0);
  return date;
}

function compactShiftLabel(value: string) {
  if (!value || value === '-') {
    return '-';
  }
  const normalized = value.trim();
  if (normalized.length <= 10) {
    return normalized;
  }
  return `${normalized.slice(0, 9)}…`;
}

async function upsertShiftWithRetry(
  upsertShift: ReturnType<typeof useUpsertShiftMutation>[0],
  payload: {
    id?: string;
    shopId: string;
    name: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    active: boolean;
  },
  options?: {
    maxAttempts?: number;
    attemptTimeoutMs?: number;
    retryDelayMs?: number;
  },
): Promise<'saved' | 'pending'> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 2);
  const attemptTimeoutMs = Math.max(1000, options?.attemptTimeoutMs ?? 6000);
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 400);
  const retryDelaysMs = Array.from({ length: maxAttempts }, (_, index) => (index === 0 ? 0 : retryDelayMs));
  let lastError: unknown;
  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), delayMs));
    }
    try {
      const request = upsertShift(payload).unwrap();
      const result = await Promise.race([
        request.then(() => 'saved' as const),
        waitMs(attemptTimeoutMs).then(() => 'pending' as const),
      ]);
      if (result === 'saved') {
        return 'saved';
      }
      request.catch(() => {
        // keep promise handled while sync continues in background
      });
      if (payload.id) {
        const confirmed = await confirmShiftPersisted(payload.shopId, payload.id);
        if (confirmed) {
          return 'saved';
        }
      }
      return 'pending';
    } catch (error) {
      lastError = error;
      const message = String((error as { message?: string })?.message ?? '').toLowerCase();
      if (message.includes('timed out') && payload.id) {
        const confirmed = await confirmShiftPersisted(payload.shopId, payload.id);
        if (confirmed) {
          return 'saved';
        }
      }
      const isTransient =
        message.includes('firestore/unavailable') ||
        message.includes('unavailable') ||
        message.includes('deadline') ||
        message.includes('network') ||
        message.includes('timed out');
      if (!isTransient) {
        throw error;
      }
      if (delayMs === retryDelaysMs[retryDelaysMs.length - 1]) {
        return 'pending';
      }
    }
  }
  if (lastError) {
    return 'pending';
  }
  return 'saved';
}

function waitMs(timeoutMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, timeoutMs));
}

function withActionDeadline<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([promise, waitMs(timeoutMs).then(() => fallback)]);
}

async function confirmShiftPersisted(shopId: string, shiftId: string) {
  const probeDelaysMs = [350, 900, 1600];
  for (const delayMs of probeDelaysMs) {
    if (delayMs > 0) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), delayMs));
    }
    try {
      const snap = await Promise.race([
        shiftsCol(shopId).doc(shiftId).get(),
        waitMs(1400).then(() => null),
      ]);
      if (snap && (snap as { exists: () => boolean }).exists()) {
        return true;
      }
    } catch {
      // keep probing
    }
  }
  return false;
}

function buildShiftId(name: string, startTime: string, endTime: string) {
  const key = `${name}|${startTime}|${endTime}`.trim().toLowerCase();
  const sanitized = key
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9:_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `shift_${sanitized || 'default'}`;
}

function CountChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.countChip}>
      <Text style={styles.countChipLabel}>{label}</Text>
      <Text style={styles.countChipValue}>{value}</Text>
    </View>
  );
}

function getServiceDuration(employee: Employee) {
  const start = employee.activatedAt || employee.joiningDate;
  const end = employee.status === 'inactive' ? employee.deactivatedAt || todayDate() : todayDate();
  return getDurationFromDates(start, end);
}

function getDurationFromDates(startDate: string, endDate: string) {
  if (!startDate) {
    return '-';
  }
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return '-';
  }

  const totalMonths = end.diff(start, 'month');
  const remainingDays = end.diff(start.add(totalMonths, 'month'), 'day');
  return `${totalMonths} month(s) ${Math.max(0, remainingDays)} day(s)`;
}

function generateNextEmployeeCode(employees: Employee[]) {
  const max = employees.reduce((acc, employee) => {
    const parsed = Number(employee.employeeCode ?? 0);
    if (!Number.isNaN(parsed) && parsed > acc) {
      return parsed;
    }
    return acc;
  }, 100100);

  return String(max + 1);
}

function sanitizeBiometricToken(value: string) {
  return value.replace(/[^0-9A-Za-z_-]/g, '').toUpperCase();
}

function generateUniqueBiometricUserId({
  employees,
  excludeEmployeeId,
  employeeCode,
  phone,
  currentBiometricUserId,
}: {
  employees: Employee[];
  excludeEmployeeId?: string;
  employeeCode: string;
  phone: string;
  currentBiometricUserId?: string;
}) {
  const used = new Set(
    employees
      .filter(employee => employee.id !== excludeEmployeeId)
      .map(employee => sanitizeBiometricToken(employee.biometricUserId ?? '').toLowerCase())
      .filter(Boolean),
  );

  const existing = sanitizeBiometricToken(currentBiometricUserId ?? '');
  if (existing && !used.has(existing.toLowerCase())) {
    return existing;
  }

  const code = sanitizeBiometricToken(employeeCode || 'STAFF');
  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const phoneSuffix = phoneDigits.slice(-4);
  const baseCandidates = [
    sanitizeBiometricToken(`BIO${code}${phoneSuffix}`),
    sanitizeBiometricToken(`BIO${code}`),
    sanitizeBiometricToken(phoneSuffix ? `BIO${phoneSuffix}` : ''),
    'BIOUSER',
  ].filter(Boolean);

  for (const candidate of baseCandidates) {
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
    for (let idx = 2; idx < 10000; idx += 1) {
      const next = sanitizeBiometricToken(`${candidate}_${idx}`);
      if (!used.has(next.toLowerCase())) {
        return next;
      }
    }
  }

  return sanitizeBiometricToken(`BIOUSER_${Date.now()}`);
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  headerBlock: {
    gap: 10,
  },
  staffHeaderCard: {
    marginHorizontal: -16,
    borderWidth: 1,
    borderColor: '#0f8f6f',
    backgroundColor: '#0c8a69',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 4,
    overflow: 'hidden',
  },
  staffHeaderGradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b8f6d',
  },
  staffHeaderGradientMid: {
    ...StyleSheet.absoluteFillObject,
    top: '34%',
    backgroundColor: '#0a7e60',
  },
  staffHeaderGradientGlowTop: {
    position: 'absolute',
    top: -90,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#3ac39f',
    opacity: 0.34,
  },
  staffHeaderGradientGlowBottom: {
    position: 'absolute',
    bottom: -105,
    left: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#06644d',
    opacity: 0.5,
  },
  staffHeaderTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
  },
  staffHeaderMeta: {
    color: '#d7fff1',
    fontSize: 15,
    fontWeight: '700',
  },
  staffHeaderDivider: {
    height: 1,
    backgroundColor: '#62c7ab',
    marginVertical: 6,
  },
  staffHeaderSubTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 19,
  },
  staffHeaderSubMeta: {
    color: '#dffaf0',
    fontWeight: '600',
    fontSize: 13,
  },
  policyTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  policyText: {
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
    fontSize: 13,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionTile: {
    width: '48%',
    minHeight: 126,
    borderWidth: 1.5,
    borderColor: '#cfd9e6',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 1,
  },
  actionTileActive: {
    backgroundColor: '#e9f8f1',
    borderColor: '#0f8f6f',
  },
  actionTilePressed: {
    backgroundColor: '#f2f8fd',
    borderColor: '#b7c8de',
  },
  actionTileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3f9',
    borderWidth: 1,
    borderColor: '#d8e2ed',
  },
  actionTileIconWrapActive: {
    backgroundColor: '#def4e9',
    borderColor: '#b7ead3',
  },
  actionTileIcon: {
    color: '#334155',
    fontSize: 18,
    fontWeight: '800',
  },
  actionTileIconActive: {
    color: '#0b6c54',
  },
  actionTileText: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
  },
  actionTileTextActive: {
    color: '#0b6c54',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 19,
    fontWeight: '500',
  },
  newButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonPressed: {
    backgroundColor: '#0a7559',
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  countRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countChip: {
    flex: 1,
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChipLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  countChipValue: {
    marginTop: 4,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 22,
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
  shiftTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  shiftTimeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shiftField: {
    flex: 1,
  },
  shiftBtnRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  shiftBtn: {
    flex: 1,
  },
  defaultShiftBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  defaultShiftBtnDisabled: {
    opacity: 0.6,
  },
  defaultShiftBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  shiftHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  shiftLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
    marginTop: 2,
  },
  selectionList: {
    gap: 8,
  },
  selectionRow: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  selectionRowSelected: {
    borderColor: '#a7dfca',
    backgroundColor: '#e8f9f1',
  },
  selectionRowTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  selectionRowTitleSelected: {
    color: '#0a7a5b',
  },
  selectionRowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  shiftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shiftOptionCard: {
    width: '48%',
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
  },
  shiftOptionCardSelected: {
    borderColor: '#a7dfca',
    backgroundColor: '#e8f9f1',
  },
  shiftOptionName: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  shiftOptionNameSelected: {
    color: '#0a7a5b',
  },
  shiftOptionTime: {
    marginTop: 4,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dayPill: {
    minWidth: 70,
    borderWidth: 1,
    borderColor: '#c7d3e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  dayPillSelected: {
    borderColor: '#7ed8ba',
    backgroundColor: '#d8f4e9',
  },
  dayPillText: {
    color: '#42546b',
    fontWeight: '800',
    fontSize: 14,
  },
  dayPillTextSelected: {
    color: '#0b7f5f',
  },
  modeColumn: {
    gap: 10,
  },
  modeRow: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    gap: 2,
  },
  modeRowSelected: {
    borderColor: '#a7dfca',
    backgroundColor: '#e8f9f1',
  },
  modeRowTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  modeRowTitleSelected: {
    color: '#0a7a5b',
  },
  modeRowMeta: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  planWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  planChip: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  planChipSmall: {
    minWidth: 56,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  planChipSelected: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  planChipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  planChipTextSelected: {
    color: '#0a7a5b',
  },
  reportTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 6,
  },
  weekGridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 6,
    minWidth: 840,
  },
  weekGridBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    minWidth: 840,
  },
  weekStaffCell: {
    width: 230,
  },
  weekDayCellHeader: {
    width: 72,
    textAlign: 'center',
    fontSize: 14,
  },
  weekDayCell: {
    width: 72,
    textAlign: 'center',
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  weekModeCellHeader: {
    width: 86,
    textAlign: 'center',
    fontSize: 14,
  },
  weekModeCellBody: {
    width: 86,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  weekSubCell: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  modeChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modeChipFixed: {
    color: '#0a7a5b',
  },
  modeChipWeekly: {
    color: '#245aa3',
  },
  fullTableWrap: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  fullTableGrid: {
    minWidth: 980,
    padding: 8,
    gap: 8,
  },
  fullTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
  },
  fullTableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  fullColCode: {
    width: 110,
  },
  fullColName: {
    width: 210,
  },
  fullColRole: {
    width: 140,
  },
  fullColStatus: {
    width: 110,
  },
  fullColShift: {
    width: 170,
  },
  fullColService: {
    width: 150,
  },
  fullColAction: {
    width: 80,
    alignItems: 'center',
  },
  staffListTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  staffListTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  staffColCode: {
    flex: 0.9,
  },
  staffColName: {
    flex: 2,
  },
  staffColRole: {
    flex: 1.4,
  },
  staffColStatus: {
    flex: 1,
  },
  staffColShift: {
    flex: 1.4,
  },
  staffColService: {
    flex: 1.2,
  },
  staffColAction: {
    flex: 0.8,
  },
  sectionCount: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableHead: {
    color: colors.textMuted,
    fontWeight: '800',
    fontSize: 14,
  },
  staffTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  tableCell: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  colCode: {
    flex: 0.5,
  },
  colName: {
    flex: 2,
  },
  colStatus: {
    flex: 0.9,
  },
  colDuration: {
    flex: 1,
  },
  colAction: {
    flex: 1.4,
  },
  activeText: {
    color: '#0a7a5b',
  },
  inactiveText: {
    color: '#c22a2a',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 11,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionText: {
    color: '#1f2937',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 17,
  },
  iconDeleteBtn: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
  },
  iconDeleteText: {
    color: '#c22a2a',
  },
  iconDeactivateBtn: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
  },
  iconDeactivateText: {
    color: '#c22a2a',
  },
  iconActivateBtn: {
    borderColor: '#cde5da',
    backgroundColor: '#e8f9f1',
  },
  iconActivateText: {
    color: '#0a7a5b',
  },
  shiftToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shiftToggleTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    position: 'relative',
  },
  shiftToggleTrackActive: {
    borderColor: '#91d7b7',
    backgroundColor: '#d8f4e7',
  },
  shiftToggleTrackInactive: {
    borderColor: '#e8b2b2',
    backgroundColor: '#fde8e8',
  },
  shiftToggleThumb: {
    position: 'absolute',
    top: 2,
    left: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  shiftToggleThumbActive: {
    backgroundColor: '#0a7a5b',
  },
  shiftToggleThumbInactive: {
    backgroundColor: '#c22a2a',
  },
  shiftToggleLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  shiftToggleLabelActive: {
    color: '#0a7a5b',
  },
  shiftToggleLabelInactive: {
    color: '#c22a2a',
  },
  deactivateBtn: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
  },
  deactivateBtnText: {
    color: '#c22a2a',
    fontWeight: '800',
    fontSize: 11,
  },
  activateBtn: {
    borderColor: '#cde5da',
    backgroundColor: '#e8f9f1',
  },
  activateBtnText: {
    color: '#0a7a5b',
    fontWeight: '800',
    fontSize: 11,
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
  formScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  formContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  formSubtitle: {
    color: colors.textSecondary,
    lineHeight: 19,
    fontWeight: '500',
  },
  formSectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
    marginTop: 2,
    marginBottom: -2,
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
  datePlaceholderText: {
    color: '#7b8798',
    fontWeight: '500',
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
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 10,
  },
  consentRowActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#c2ccd8',
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: '#0a7a5b',
    backgroundColor: '#0a7a5b',
  },
  checkboxTick: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 15,
  },
  consentText: {
    flex: 1,
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 19,
  },
  biometricActionRow: {
    gap: 8,
  },
  registerBioBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBioBtnText: {
    color: '#0a7a5b',
    fontWeight: '800',
    fontSize: 14,
  },
  biometricMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  statusChipActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  statusChipInactive: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
  },
  statusText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#0a7a5b',
  },
  statusTextInactive: {
    color: '#c22a2a',
  },
});

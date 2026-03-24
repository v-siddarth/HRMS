import React, { useEffect, useMemo, useState } from 'react';
import {
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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Field, PrimaryButton } from '../../components/ui';
import { createStaffAuthUserLocally, deleteStaffAuthUserLocally } from '../../services/authService';
import { useAppSelector } from '../../store/hooks';
import {
  useCreateShiftTemplateMutation,
  useDeleteShiftTemplateMutation,
  useDeleteEmployeeMutation,
  useGetEmployeesQuery,
  useGetShopByIdQuery,
  useGetShiftsQuery,
  useGetShiftTemplatesQuery,
  useGetStaffWeeklyShiftPlanByStaffQuery,
  useUpsertEmployeeMutation,
  useSaveStaffWeeklyShiftPlanV2Mutation,
  useUpdateShiftTemplateMutation,
} from '../../store/hrmsApi';
import { formatDisplayDate, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import type { Employee, EmployeeAuthStatus, EmployeeStatus, ShiftTemplate, StaffWeeklyShiftDay, WeeklyOffDay } from '../../types/models';

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
  loginEmail: string;
  loginPassword: string;
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
  loginEmail: '',
  loginPassword: '',
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

const plannerDays = [
  { dayOfWeek: 0, key: 'mon', label: 'Monday', short: 'Mon' },
  { dayOfWeek: 1, key: 'tue', label: 'Tuesday', short: 'Tue' },
  { dayOfWeek: 2, key: 'wed', label: 'Wednesday', short: 'Wed' },
  { dayOfWeek: 3, key: 'thu', label: 'Thursday', short: 'Thu' },
  { dayOfWeek: 4, key: 'fri', label: 'Friday', short: 'Fri' },
  { dayOfWeek: 5, key: 'sat', label: 'Saturday', short: 'Sat' },
  { dayOfWeek: 6, key: 'sun', label: 'Sunday', short: 'Sun' },
] as const;
const EMPTY_WEEKLY_SHIFT_DAYS: StaffWeeklyShiftDay[] = [];

const getEmployeeAuthStatus = (employee?: Pick<Employee, 'authStatus' | 'authUid'>): EmployeeAuthStatus => {
  if (!employee) {
    return 'not_created';
  }
  if (employee.authStatus) {
    return employee.authStatus;
  }
  return employee.authUid ? 'provisioned' : 'not_created';
};

const getEmployeeAuthStatusLabel = (employee?: Pick<Employee, 'authStatus' | 'authUid'>) => {
  const status = getEmployeeAuthStatus(employee);
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'provisioned':
      return 'Provisioned';
    case 'disabled':
      return 'Disabled';
    case 'error':
      return 'Error';
    case 'not_created':
    default:
      return 'Not Created';
  }
};

const getEmployeeAuthStatusVariant = (employee?: Pick<Employee, 'authStatus' | 'authUid'>) => {
  const status = getEmployeeAuthStatus(employee);
  if (status === 'provisioned') {
    return 'provisioned';
  }
  if (status === 'disabled') {
    return 'disabled';
  }
  if (status === 'error') {
    return 'error';
  }
  if (status === 'pending') {
    return 'pending';
  }
  return 'not_created';
};

const getEmployeeAuthStyleKeys = (employee?: Pick<Employee, 'authStatus' | 'authUid'>) => {
  const variant = getEmployeeAuthStatusVariant(employee);
  if (variant === 'provisioned') {
    return { pill: 'authPillProvisioned', text: 'authPillTextProvisioned' } as const;
  }
  if (variant === 'disabled') {
    return { pill: 'authPillDisabled', text: 'authPillTextDisabled' } as const;
  }
  if (variant === 'error') {
    return { pill: 'authPillError', text: 'authPillTextError' } as const;
  }
  if (variant === 'pending') {
    return { pill: 'authPillPending', text: 'authPillTextPending' } as const;
  }
  return { pill: 'authPillNotCreated', text: 'authPillTextNotCreated' } as const;
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
  const insets = useSafeAreaInsets();
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shifts = [] } = useGetShiftsQuery(shopId, { skip: !shopId });

  const activeStaffCount = useMemo(() => employees.filter(employee => employee.status === 'active').length, [employees]);
  const inactiveStaffCount = useMemo(() => employees.filter(employee => employee.status === 'inactive').length, [employees]);
  const plannerStaffCount = useMemo(() => employees.filter(employee => employee.status === 'active').length, [employees]);
  const accessReadyCount = useMemo(
    () => employees.filter(employee => getEmployeeAuthStatus(employee) === 'provisioned' || getEmployeeAuthStatus(employee) === 'pending').length,
    [employees],
  );
  const accessDisabledCount = useMemo(
    () => employees.filter(employee => getEmployeeAuthStatus(employee) === 'disabled').length,
    [employees],
  );

  const actionTiles = [
    {
      icon: 'person-add-outline',
      tone: 'emerald' as const,
      label: 'Add Staff Member',
      description: 'Create a new staff profile with salary and shift details.',
      onPress: () => navigation.navigate('StaffForm', { mode: 'new' }),
    },
    {
      icon: 'create-outline',
      tone: 'blue' as const,
      label: 'Update Staff Details',
      description: 'Edit personal details, salary, shift, and joining records.',
      onPress: () => navigation.navigate('StaffEditTable'),
    },
    {
      icon: 'person-off-outline',
      tone: 'red' as const,
      label: 'Activate or Deactivate',
      description: 'Update staff working status without deleting the record.',
      onPress: () => navigation.navigate('StaffDeactivateTable'),
    },
    {
      icon: 'alarm-outline',
      tone: 'violet' as const,
      label: 'Manage Shift Templates',
      description: 'Create and maintain standard shift timings for your team.',
      onPress: () => navigation.navigate('StaffShiftScreen'),
    },
    {
      icon: 'calendar-clear-outline',
      tone: 'amber' as const,
      label: 'Weekly Shift Planner',
      description: 'Assign existing shifts or off days for each weekday.',
      onPress: () => navigation.navigate('WeeklyShiftPlanner'),
    },
    {
      icon: 'list-outline',
      tone: 'teal' as const,
      label: 'View All Staff',
      description: 'Open the full staff list with status, role, and shift details.',
      onPress: () => navigation.navigate('AllStaffList'),
    },
  ];

  const openDrawer = () => {
    const parent = navigation.getParent?.();
    if (parent?.openDrawer) {
      parent.openDrawer();
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <View style={[styles.staffHeaderCard, { paddingTop: insets.top + 16 }]}>
            <View style={styles.staffHeaderGradientBase} />
            <View style={styles.staffHeaderGradientGlowTop} />
            <View style={styles.staffHeaderGradientGlowBottom} />

            <View style={styles.staffHeaderTopRow}>
              <View style={styles.staffHeaderBadge}>
                <Text style={styles.staffHeaderBadgeText}>Staff Management</Text>
              </View>
              <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]} onPress={openDrawer}>
                <Ionicons name="menu" size={24} color="#ffffff" />
              </Pressable>
            </View>

            <View style={styles.staffHeaderTextBlock}>
              <Text style={styles.staffHeaderTitle}>{shop?.shopName ?? 'Staff'}</Text>
              <Text style={styles.staffHeaderMeta} numberOfLines={1}>
                {shop?.address ?? 'Address not available'}
              </Text>
              <Text style={styles.staffHeaderPoweredBy}>Powered Nexora RVM Infotech</Text>
            </View>

            <View style={styles.staffSummaryCard}>
              <Text style={styles.staffSummaryEyebrow}>Staff Overview</Text>
              <View style={styles.staffSummaryGrid}>
                <View style={styles.staffSummaryCountCard}>
                  <Text style={styles.staffSummaryMetaLabel}>Active Staff</Text>
                  <Text style={styles.staffSummaryMetaValue}>{activeStaffCount}</Text>
                </View>
                <View style={styles.staffSummaryCountCard}>
                  <Text style={styles.staffSummaryMetaLabel}>Inactive Staff</Text>
                  <Text style={styles.staffSummaryMetaValue}>{inactiveStaffCount}</Text>
                </View>
                <View style={styles.staffSummaryCountCard}>
                  <Text style={styles.staffSummaryMetaLabel}>Active Shifts</Text>
                  <Text style={styles.staffSummaryMetaValue}>{shifts.length}</Text>
                </View>
                <View style={styles.staffSummaryCountCard}>
                  <Text style={styles.staffSummaryMetaLabel}>Planner Staff</Text>
                  <Text style={styles.staffSummaryMetaValue}>{plannerStaffCount}</Text>
                </View>
                <View style={styles.staffSummaryCountCard}>
                  <Text style={styles.staffSummaryMetaLabel}>Access Ready</Text>
                  <Text style={styles.staffSummaryMetaValue}>{accessReadyCount}</Text>
                </View>
                <View style={styles.staffSummaryCountCard}>
                  <Text style={styles.staffSummaryMetaLabel}>Access Disabled</Text>
                  <Text style={styles.staffSummaryMetaValue}>{accessDisabledCount}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.actionGrid}>
            {actionTiles.map(item => (
              <ActionTile
                key={item.label}
                icon={item.icon}
                tone={item.tone}
                label={item.label}
                description={item.description}
                onPress={item.onPress}
              />
            ))}
          </View>

          <View style={styles.sectionPad}>
            <Card>
              <Text style={styles.policyTitle}>Shift Planning Guidelines</Text>
              <Text style={styles.policyText}>1. Create reusable shift templates first in Shift Management.</Text>
              <Text style={styles.policyText}>2. Use Weekly Shift Planner only to map existing shifts or off days for Monday to Sunday.</Text>
              <Text style={styles.policyText}>3. Shift creation and weekly planning are separate modules and should be managed separately.</Text>
            </Card>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionTile({
  icon,
  tone,
  label,
  description,
  onPress,
}: {
  icon: string;
  tone: 'emerald' | 'blue' | 'red' | 'violet' | 'amber' | 'teal';
  label: string;
  description: string;
  onPress: () => void;
}) {
  const palette = actionTonePalette(tone);
  return (
    <Pressable style={({ pressed }) => [styles.actionTile, pressed && styles.actionTilePressed]} onPress={onPress}>
      <View style={[styles.actionTileAccent, { backgroundColor: palette.fg }]} />
      <View style={[styles.actionTileIconWrap, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <Ionicons name={icon} size={20} color={palette.fg} />
      </View>
      <Text style={styles.actionTileText}>{label}</Text>
      <Text style={styles.actionTileDescription}>{description}</Text>
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
  const insets = useSafeAreaInsets();
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [draftDays, setDraftDays] = useState<StaffWeeklyShiftDay[]>(() => buildEmptyWeeklyPlan('', ''));
  const [savingPlan, setSavingPlan] = useState(false);
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shiftTemplates = [] } = useGetShiftTemplatesQuery(shopId, { skip: !shopId });
  const activeEmployees = useMemo(() => employees.filter(employee => employee.status === 'active'), [employees]);
  const selectedEmployee = useMemo(
    () => activeEmployees.find(employee => employee.id === selectedStaffId),
    [activeEmployees, selectedStaffId],
  );
  const { data: savedDaysResponse, isFetching: loadingPlan } = useGetStaffWeeklyShiftPlanByStaffQuery(
    { shopId, staffId: selectedStaffId },
    { skip: !shopId || !selectedStaffId },
  );
  const [saveWeeklyPlan] = useSaveStaffWeeklyShiftPlanV2Mutation();
  const shiftById = useMemo(() => new Map(shiftTemplates.map(shift => [shift.id, shift])), [shiftTemplates]);
  const savedDays = savedDaysResponse ?? EMPTY_WEEKLY_SHIFT_DAYS;

  useEffect(() => {
    if (!selectedStaffId && activeEmployees.length) {
      setSelectedStaffId(activeEmployees[0].id);
    }
  }, [activeEmployees, selectedStaffId]);

  useEffect(() => {
    const nextDraftDays = !selectedStaffId
      ? buildEmptyWeeklyPlan(shopId, '')
      : !savedDays.length
        ? buildEmptyWeeklyPlan(shopId, selectedStaffId)
        : normalizeWeeklyPlanDays(savedDays, shopId, selectedStaffId);

    setDraftDays(current => (areWeeklyPlanDaysEqual(current, nextDraftDays) ? current : nextDraftDays));
  }, [savedDays, selectedStaffId, shopId]);

  const workingDayCount = useMemo(() => draftDays.filter(item => !item.isOff && item.shiftId).length, [draftDays]);
  const offDayCount = useMemo(() => draftDays.filter(item => item.isOff).length, [draftDays]);

  const updateDraftDay = (dayOfWeek: number, updater: (current: StaffWeeklyShiftDay) => StaffWeeklyShiftDay) => {
    setDraftDays(current =>
      current.map(item => (item.dayOfWeek === dayOfWeek ? updater(item) : item)),
    );
  };

  const onSelectShift = (dayOfWeek: number, shiftId: string) => {
    updateDraftDay(dayOfWeek, current => ({
      ...current,
      shiftId,
      isOff: false,
    }));
  };

  const onMarkOffDay = (dayOfWeek: number) => {
    updateDraftDay(dayOfWeek, current => ({
      ...current,
      shiftId: null,
      isOff: !current.isOff,
    }));
  };

  const onSaveWeeklyPlan = async () => {
    if (!shopId || !selectedStaffId) {
      Alert.alert('Validation', 'Select a staff member first.');
      return;
    }

    const hasWorkingDay = draftDays.some(item => !item.isOff && item.shiftId);
    if (!hasWorkingDay) {
      Alert.alert('Validation', 'Assign at least one working day before saving.');
      return;
    }

    const hasIncompleteDay = draftDays.some(item => !item.isOff && !item.shiftId);
    if (hasIncompleteDay) {
      Alert.alert('Validation', 'Each day must have a shift assigned or be marked as off.');
      return;
    }

    try {
      setSavingPlan(true);
      await saveWeeklyPlan({
        shopId,
        staffId: selectedStaffId,
        days: draftDays.map(item => ({
          dayOfWeek: item.dayOfWeek,
          shiftId: item.shiftId,
          isOff: item.isOff,
        })),
      }).unwrap();
      Alert.alert('Saved', 'Weekly Shift Plan Saved');
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <View style={styles.staffFormHero}>
            <View style={styles.staffFormHeroTop}>
              <View style={styles.staffFormBadge}>
                <Text style={styles.staffFormBadgeText}>Weekly Planner</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.formTitle}>Weekly Shift Planner</Text>
            <Text style={styles.staffFormIntro}>
              Select one staff member, then assign an existing shift or mark an off day for each weekday from Monday to Sunday.
            </Text>

            <View style={styles.staffFormHeroStats}>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Active Staff</Text>
                <Text style={styles.staffFormHeroStatValue}>{activeEmployees.length}</Text>
              </View>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Shift Templates</Text>
                <Text style={styles.staffFormHeroStatValue}>{shiftTemplates.length}</Text>
              </View>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Working Days</Text>
                <Text style={styles.staffFormHeroStatValue}>{workingDayCount}</Text>
              </View>
            </View>
          </View>

          <Card>
            <Text style={styles.shiftTitle}>Select Staff Member</Text>
            <View style={styles.selectionList}>
              {activeEmployees.length === 0 ? (
                <Text style={styles.shiftHint}>Add active staff before creating a weekly shift plan.</Text>
              ) : (
                activeEmployees.map(employee => (
                  <Pressable
                    key={employee.id}
                    style={[styles.selectionRow, selectedStaffId === employee.id ? styles.selectionRowSelected : undefined]}
                    onPress={() => setSelectedStaffId(employee.id)}>
                    <Text style={[styles.selectionRowTitle, selectedStaffId === employee.id ? styles.selectionRowTitleSelected : undefined]}>
                      {employee.employeeCode ? `${employee.employeeCode} - ` : ''}
                      {employee.name}
                    </Text>
                    <Text style={styles.selectionRowMeta}>{employee.designation}</Text>
                  </Pressable>
                ))
              )}
            </View>
          </Card>

          {selectedEmployee ? (
            <Card>
              <Text style={styles.shiftTitle}>Plan for {selectedEmployee.name}</Text>
              <Text style={styles.shiftHint}>
                Each day must have a shift assignment or be marked as off. At least one working day is required.
              </Text>
              {loadingPlan ? <Text style={styles.shiftHint}>Loading saved weekly plan...</Text> : null}

              <View style={styles.modeColumn}>
                {plannerDays.map(day => {
                  const currentDay = draftDays.find(item => item.dayOfWeek === day.dayOfWeek) ?? buildPlannerDay(shopId, selectedStaffId, day.dayOfWeek);
                  const selectedShift = currentDay.shiftId ? shiftById.get(currentDay.shiftId) ?? null : null;
                  return (
                    <View key={day.dayOfWeek} style={styles.modeRow}>
                      <View style={styles.topRow}>
                        <View style={styles.headerTextWrap}>
                          <Text style={styles.modeRowTitle}>{day.label}</Text>
                          <Text style={styles.modeRowMeta}>
                            {currentDay.isOff
                              ? 'Marked as off day'
                              : selectedShift
                                ? `${selectedShift.name} (${formatTime12Hour(selectedShift.startTime)}-${formatTime12Hour(selectedShift.endTime)})`
                                : 'No shift selected yet'}
                          </Text>
                        </View>
                        <Pressable
                          style={[styles.planChipSmall, currentDay.isOff ? styles.planChipSelected : undefined]}
                          onPress={() => onMarkOffDay(day.dayOfWeek)}>
                          <Text style={[styles.planChipText, currentDay.isOff ? styles.planChipTextSelected : undefined]}>
                            Off Day
                          </Text>
                        </Pressable>
                      </View>

                      {!currentDay.isOff ? (
                        <View style={styles.planWrap}>
                          {shiftTemplates.map(shift => {
                            const isSelected = currentDay.shiftId === shift.id;
                            return (
                              <Pressable
                                key={`${day.dayOfWeek}-${shift.id}`}
                                style={[styles.planChip, isSelected ? styles.planChipSelected : undefined]}
                                onPress={() => onSelectShift(day.dayOfWeek, shift.id)}>
                                <Text style={[styles.planChipText, isSelected ? styles.planChipTextSelected : undefined]}>
                                  {shift.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              <PrimaryButton title={savingPlan ? 'Saving...' : 'Save Weekly Plan'} onPress={onSaveWeeklyPlan} loading={savingPlan} />
              <Text style={styles.shiftHint}>{`${workingDayCount} working day(s) and ${offDayCount} off day(s) selected.`}</Text>
            </Card>
          ) : null}

          <Card>
            <Text style={styles.reportTitle}>Planner Rules</Text>
            <Text style={styles.policyText}>1. Weekly Shift Planner does not create shifts.</Text>
            <Text style={styles.policyText}>2. Only existing shift templates can be assigned.</Text>
            <Text style={styles.policyText}>3. Off days are stored separately from shift assignments.</Text>
          </Card>
        </View>
      </ScrollView>
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function AllStaffListScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
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
  const weeklyCount = employees.filter(item => !item.defaultShiftId).length;
  const accessReadyCount = employees.filter(item => getEmployeeAuthStatus(item) === 'provisioned').length;

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <View style={styles.staffFormHero}>
            <View style={styles.staffFormHeroTop}>
              <View style={styles.staffFormBadge}>
                <Text style={styles.staffFormBadgeText}>Staff Directory</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.formTitle}>All Staff List</Text>
            <Text style={styles.staffFormIntro}>
              Review the full staff directory with role, status, shift type, and service information in one place.
            </Text>

            <View style={styles.staffFormHeroStats}>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Total</Text>
                <Text style={styles.staffFormHeroStatValue}>{employees.length}</Text>
              </View>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Active</Text>
                <Text style={styles.staffFormHeroStatValue}>{activeCount}</Text>
              </View>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Login Ready</Text>
                <Text style={styles.staffFormHeroStatValue}>{accessReadyCount}</Text>
              </View>
            </View>
          </View>

          <Card>
            <Text style={styles.formSectionTitle}>Search & Filter</Text>
              <Text style={styles.formSectionSubtitle}>Use the filters below to narrow the staff directory by status and shift type.</Text>
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
                <Text style={[styles.tableHead, styles.fullColAuth]}>Login Access</Text>
                <Text style={[styles.tableHead, styles.fullColShift]}>Shift</Text>
                <Text style={[styles.tableHead, styles.fullColService]}>Service</Text>
                <Text style={[styles.tableHead, styles.fullColAction]}>Edit</Text>
              </View>

              {!isLoading &&
                filtered.map(item => {
                  const isFixed = !!item.defaultShiftId;
                  const service = getServiceDuration(item);
                  const shiftName = item.defaultShiftId ? shiftById.get(item.defaultShiftId)?.name ?? item.defaultShiftId : 'Weekly Planner';
                  const authStatusStyles = getEmployeeAuthStyleKeys(item);
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
                      <View style={styles.fullColAuth}>
                        <View style={[styles.authPill, styles[authStatusStyles.pill]]}>
                          <Text style={[styles.authPillText, styles[authStatusStyles.text]]} numberOfLines={1}>
                            {getEmployeeAuthStatusLabel(item)}
                          </Text>
                        </View>
                        <Text style={styles.weekSubCell} numberOfLines={1}>
                          {item.loginEmail?.trim() ? item.loginEmail : 'No login email'}
                        </Text>
                      </View>
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
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function StaffEditTableScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const { data: employees = [], isLoading } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const [deleteEmployee, { isLoading: deleting }] = useDeleteEmployeeMutation();
  const accessConfiguredCount = useMemo(
    () => employees.filter(item => getEmployeeAuthStatus(item) !== 'not_created').length,
    [employees],
  );

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
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.staffFormHero}>
              <View style={styles.staffFormHeroTop}>
                <View style={styles.staffFormBadge}>
                  <Text style={styles.staffFormBadgeText}>Staff Update</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <Text style={styles.formTitle}>Edit Staff Details</Text>
              <Text style={styles.staffFormIntro}>
                Search staff records, review status, and open a profile for updates without changing the existing workflow.
              </Text>

              <View style={styles.staffFormHeroStats}>
                <View style={styles.staffFormHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Total Staff</Text>
                  <Text style={styles.staffFormHeroStatValue}>{employees.length}</Text>
                </View>
                <View style={styles.staffFormHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Filtered Results</Text>
                  <Text style={styles.staffFormHeroStatValue}>{isLoading ? '...' : filtered.length}</Text>
                </View>
                <View style={styles.staffFormHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Access Setup</Text>
                  <Text style={styles.staffFormHeroStatValue}>{accessConfiguredCount}</Text>
                </View>
              </View>
            </View>

            <Card>
              <Text style={styles.formSectionTitle}>Search & Filter</Text>
              <Text style={styles.formSectionSubtitle}>Find the staff member you want to update using name, code, phone number, or role.</Text>
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
          <Card>
            <View style={styles.staffEditRowTop}>
              <View style={styles.staffEditIdentity}>
                <Text style={styles.staffEditCode}>#{item.employeeCode || index + 1}</Text>
                <Text style={styles.staffEditName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.staffEditMeta} numberOfLines={1}>
                  {item.designation} | {item.phone}
                </Text>
                <View style={styles.staffMetaPillRow}>
                  <View style={[styles.authPill, styles[getEmployeeAuthStyleKeys(item).pill]]}>
                    <Text style={[styles.authPillText, styles[getEmployeeAuthStyleKeys(item).text]]}>
                      {getEmployeeAuthStatusLabel(item)}
                    </Text>
                  </View>
                  <Text style={styles.staffMetaInlineText} numberOfLines={1}>
                    {item.loginEmail?.trim() ? item.loginEmail : 'No login email'}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.staffEditStatusPill,
                  item.status === 'active' ? styles.staffEditStatusPillActive : styles.staffEditStatusPillInactive,
                ]}>
                <Text
                  style={[
                    styles.staffEditStatusText,
                    item.status === 'active' ? styles.staffEditStatusTextActive : styles.staffEditStatusTextInactive,
                  ]}>
                  {item.status === 'active' ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>

            <View style={styles.staffEditActionRow}>
              <Pressable style={styles.staffEditPrimaryBtn} onPress={() => navigation.navigate('StaffForm', { mode: 'edit', employee: item })}>
                <Ionicons name="create-outline" size={18} color="#ffffff" />
                <Text style={styles.staffEditPrimaryBtnText}>Open Edit Form</Text>
              </Pressable>
              <Pressable style={styles.staffEditDeleteBtn} onPress={() => onDelete(item)}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={styles.staffEditDeleteBtnText}>Delete</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function StaffDeactivateTableScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
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
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.staffFormHero}>
              <View style={styles.staffFormHeroTop}>
                <View style={styles.staffFormBadge}>
                  <Text style={styles.staffFormBadgeText}>Status Control</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.formTitle}>Activate or Deactivate Staff</Text>
              <Text style={styles.staffFormIntro}>
                Review the current status of each staff member and update activation safely without changing any other profile data.
              </Text>

              <View style={styles.staffFormHeroStats}>
                <View style={styles.staffFormHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Total Staff</Text>
                  <Text style={styles.staffFormHeroStatValue}>{employees.length}</Text>
                </View>
                <View style={styles.staffFormHeroStatCard}>
                  <Text style={styles.staffFormHeroStatLabel}>Filtered Results</Text>
                  <Text style={styles.staffFormHeroStatValue}>{isLoading ? '...' : filtered.length}</Text>
                </View>
              </View>
            </View>
            <Card>
              <Text style={styles.formSectionTitle}>Search & Filter</Text>
              <Text style={styles.formSectionSubtitle}>Search staff and filter by status before changing activation.</Text>
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
          <Card>
            <View style={styles.staffEditRowTop}>
              <View style={styles.staffEditIdentity}>
                <Text style={styles.staffEditCode}>#{item.employeeCode || index + 1}</Text>
                <Text style={styles.staffEditName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.staffEditMeta} numberOfLines={1}>
                  {item.designation} | {item.phone}
                </Text>
              </View>
              <View
                style={[
                  styles.staffEditStatusPill,
                  item.status === 'active' ? styles.staffEditStatusPillActive : styles.staffEditStatusPillInactive,
                ]}>
                <Text
                  style={[
                    styles.staffEditStatusText,
                    item.status === 'active' ? styles.staffEditStatusTextActive : styles.staffEditStatusTextInactive,
                  ]}>
                  {item.status === 'active' ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
            <View style={styles.staffEditActionRow}>
              {item.status === 'active' ? (
                <Pressable style={styles.staffDeactivateBtnModern} onPress={() => onToggleStatus(item, 'inactive')}>
                  <Ionicons name="ban-outline" size={18} color="#ffffff" />
                  <Text style={styles.staffDeactivateBtnModernText}>Deactivate</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.staffActivateBtnModern} onPress={() => onToggleStatus(item, 'active')}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                  <Text style={styles.staffDeactivateBtnModernText}>Activate</Text>
                </Pressable>
              )}
            </View>
          </Card>
        )}
      />
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function StaffShiftScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('07:00');
  const [shiftEnd, setShiftEnd] = useState('15:30');
  const [durationHours, setDurationHours] = useState('8');
  const [graceTime, setGraceTime] = useState('10');
  const [lateRuleMinutes, setLateRuleMinutes] = useState('15');
  const [halfDayHours, setHalfDayHours] = useState('4');
  const [showShiftStartPicker, setShowShiftStartPicker] = useState(false);
  const [showShiftEndPicker, setShowShiftEndPicker] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const { data: shiftTemplates = [], isLoading } = useGetShiftTemplatesQuery(shopId, { skip: !shopId });
  const [createShiftTemplate] = useCreateShiftTemplateMutation();
  const [updateShiftTemplate] = useUpdateShiftTemplateMutation();
  const [deleteShiftTemplate] = useDeleteShiftTemplateMutation();

  const resetShiftForm = () => {
    setEditingShift(null);
    setShiftName('');
    setShiftStart('07:00');
    setShiftEnd('15:30');
    setDurationHours('8');
    setGraceTime('10');
    setLateRuleMinutes('15');
    setHalfDayHours('4');
  };

  const onCreateOrUpdateShift = async () => {
    if (!shopId) {
      return;
    }
    if (!shiftName.trim()) {
      Alert.alert('Validation', 'Shift name is required.');
      return;
    }
    const timeDuration = calculateTemplateShiftHours(shiftStart, shiftEnd);
    if (timeDuration === null || timeDuration <= 0) {
      Alert.alert('Validation', 'Start time and end time must define a valid shift duration.');
      return;
    }
    const computedEndTime = calculateEndTimeFromDuration(shiftStart, Number(durationHours));
    if (
      !isPositiveNumeric(durationHours) ||
      !isNonNegativeNumeric(graceTime) ||
      !isNonNegativeNumeric(lateRuleMinutes) ||
      !isNonNegativeNumeric(halfDayHours)
    ) {
      Alert.alert('Validation', 'Duration must be greater than 0, and the other rules must be valid non-negative numbers.');
      return;
    }
    if (!computedEndTime || computedEndTime !== shiftEnd) {
      Alert.alert('Validation', 'Duration must match the selected start and end time.');
      return;
    }
    try {
      setSavingShift(true);
      const payload = {
        id: editingShift?.id,
        shopId,
        name: shiftName.trim(),
        startTime: shiftStart.trim(),
        endTime: shiftEnd.trim(),
        durationHours: Number(durationHours),
        graceTime: Number(graceTime),
        lateRuleMinutes: Number(lateRuleMinutes),
        halfDayHours: Number(halfDayHours),
      };

      if (editingShift) {
        await updateShiftTemplate(payload).unwrap();
        Alert.alert('Saved', 'Shift updated successfully.');
      } else {
        await createShiftTemplate(payload).unwrap();
        Alert.alert('Saved', 'Shift Created Successfully');
      }
      resetShiftForm();
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingShift(false);
    }
  };

  const onEditShift = (shift: ShiftTemplate) => {
    setEditingShift(shift);
    setShiftName(shift.name);
    setShiftStart(shift.startTime);
    setShiftEnd(shift.endTime);
    setDurationHours(String(shift.durationHours));
    setGraceTime(String(shift.graceTime));
    setLateRuleMinutes(String(shift.lateRuleMinutes));
    setHalfDayHours(String(shift.halfDayHours));
  };

  const onDeleteShift = (shift: ShiftTemplate) => {
    if (!shopId) {
      return;
    }

    Alert.alert('Delete Shift', `Delete ${shift.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShiftTemplate({ shopId, shiftId: shift.id }).unwrap();
            if (editingShift?.id === shift.id) {
              resetShiftForm();
            }
            Alert.alert('Deleted', 'Shift deleted successfully.');
          } catch (error) {
            Alert.alert('Delete failed', (error as Error).message);
          }
        },
      },
    ]);
  };

  const onShiftStartChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowShiftStartPicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    const nextStart = dayjs(selectedDate).format('HH:mm');
    setShiftStart(nextStart);
    const nextDuration = calculateTemplateShiftHours(nextStart, shiftEnd);
    if (nextDuration !== null) {
      setDurationHours(formatDurationHours(nextDuration));
    }
  };

  const onShiftEndChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowShiftEndPicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    const nextEnd = dayjs(selectedDate).format('HH:mm');
    setShiftEnd(nextEnd);
    const nextDuration = calculateTemplateShiftHours(shiftStart, nextEnd);
    if (nextDuration !== null) {
      setDurationHours(formatDurationHours(nextDuration));
    }
  };

  const onDurationChange = (value: string) => {
    setDurationHours(value);
    if (!isPositiveNumeric(value)) {
      return;
    }

    const nextEnd = calculateEndTimeFromDuration(shiftStart, Number(value));
    if (nextEnd) {
      setShiftEnd(nextEnd);
    }
  };

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.editListContent, { paddingTop: Math.max(insets.top + 38, 66) }]}>
        <View style={styles.headerBlock}>
          <View style={styles.staffFormHero}>
            <View style={styles.staffFormHeroTop}>
              <View style={styles.staffFormBadge}>
                <Text style={styles.staffFormBadgeText}>Shift Setup</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.formTitle}>Create Shifts</Text>
            <Text style={styles.staffFormIntro}>
              Create reusable shift templates here. Weekly planner uses these templates later, but does not create or modify them.
            </Text>

            <View style={styles.staffFormHeroStats}>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Total Shifts</Text>
                <Text style={styles.staffFormHeroStatValue}>{isLoading ? '...' : shiftTemplates.length}</Text>
              </View>
              <View style={styles.staffFormHeroStatCard}>
                <Text style={styles.staffFormHeroStatLabel}>Default Duration</Text>
                <Text style={styles.staffFormHeroStatValue}>{durationHours || '8'} hr</Text>
              </View>
            </View>
          </View>

          <Card>
            <Text style={styles.shiftTitle}>{editingShift ? 'Edit Shift Template' : 'Shift Master Entry'}</Text>
            <Field label="Shift Name" value={shiftName} onChangeText={setShiftName} placeholder="e.g. Morning Shift" />
            <View style={styles.shiftTimeRow}>
              <View style={styles.shiftField}>
                <View style={styles.dateFieldWrap}>
                  <Text style={styles.dateLabel}>Start Time</Text>
                  <Pressable
                    style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
                    onPress={() => setShowShiftStartPicker(true)}>
                    <Text style={styles.dateValueText}>{formatTime12Hour(shiftStart)}</Text>
                  </Pressable>
                  {showShiftStartPicker && (
                    <View style={styles.datePickerWrap}>
                      <DateTimePicker
                        value={parseTimeToDate(shiftStart)}
                        mode="time"
                        is24Hour={false}
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
                  <Text style={styles.dateLabel}>End Time</Text>
                  <Pressable
                    style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
                    onPress={() => setShowShiftEndPicker(true)}>
                    <Text style={styles.dateValueText}>{formatTime12Hour(shiftEnd)}</Text>
                  </Pressable>
                  {showShiftEndPicker && (
                    <View style={styles.datePickerWrap}>
                      <DateTimePicker
                        value={parseTimeToDate(shiftEnd)}
                        mode="time"
                        is24Hour={false}
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
            <Field
              label="Duration (hours)"
              value={durationHours}
              onChangeText={onDurationChange}
              keyboardType="numeric"
              placeholder="8"
            />
            <View style={styles.shiftTimeRow}>
              <View style={styles.shiftField}>
                <Field
                  label="Grace Time (minutes)"
                  value={graceTime}
                  onChangeText={setGraceTime}
                  keyboardType="numeric"
                  placeholder="10"
                />
              </View>
              <View style={styles.shiftField}>
                <Field
                  label="Late Mark Rule (minutes)"
                  value={lateRuleMinutes}
                  onChangeText={setLateRuleMinutes}
                  keyboardType="numeric"
                  placeholder="15"
                />
              </View>
            </View>
            <Field
              label="Half Day Rule (hours)"
              value={halfDayHours}
              onChangeText={setHalfDayHours}
              keyboardType="numeric"
              placeholder="4"
            />
            <View style={styles.shiftBtnRow}>
              <View style={styles.shiftBtn}>
                <PrimaryButton
                  title={savingShift ? 'Saving...' : editingShift ? 'Update Shift' : 'Save Shift'}
                  onPress={onCreateOrUpdateShift}
                  loading={savingShift}
                />
              </View>
              {editingShift ? (
                <Pressable style={styles.defaultShiftBtn} onPress={resetShiftForm}>
                  <Text style={styles.defaultShiftBtnText}>Cancel Edit</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.shiftHint}>Duration defaults to 8 hours, and you can change it when needed.</Text>
          </Card>

          <Text style={styles.sectionCount}>{isLoading ? 'Loading shifts...' : `${shiftTemplates.length} shifts`}</Text>

          {!isLoading && !shiftTemplates.length ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Shifts</Text>
              <Text style={styles.emptySub}>Create a reusable shift template to get started.</Text>
            </View>
          ) : null}

          {shiftTemplates.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shiftTableScrollContent}>
              <View style={styles.shiftTableWrap}>
                <View style={styles.shiftTableHeaderRow}>
                  <Text style={[styles.tableHead, styles.shiftColIndex]}>No.</Text>
                  <Text style={[styles.tableHead, styles.shiftColName]}>Shift Name</Text>
                  <Text style={[styles.tableHead, styles.shiftColTime]}>Time</Text>
                  <Text style={[styles.tableHead, styles.shiftColRules]}>Rules</Text>
                  <Text style={[styles.tableHead, styles.shiftColActionsHeader]}>Actions</Text>
                </View>

                {shiftTemplates.map((item, index) => (
                  <View key={item.id} style={styles.shiftTableRow}>
                    <Text style={[styles.tableCell, styles.shiftColIndex]}>{index + 1}</Text>
                    <Text style={[styles.tableCell, styles.shiftColName]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.tableCell, styles.shiftColTime]} numberOfLines={1}>
                      {formatTime12Hour(item.startTime)} - {formatTime12Hour(item.endTime)}
                    </Text>
                    <Text style={[styles.weekSubCell, styles.shiftColRules]} numberOfLines={2}>
                      {`Dur ${item.durationHours}h | Grace ${item.graceTime}m | Late ${item.lateRuleMinutes}m | Half ${item.halfDayHours}h`}
                    </Text>
                    <View style={styles.shiftColActions}>
                      <Pressable style={styles.shiftIconBtn} onPress={() => onEditShift(item)}>
                        <Ionicons name="create-outline" size={18} color="#3554a5" />
                      </Pressable>
                      <Pressable style={[styles.shiftIconBtn, styles.shiftIconBtnDanger]} onPress={() => onDeleteShift(item)}>
                        <Ionicons name="trash-outline" size={18} color="#c22a2a" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </ScrollView>
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
    </View>
  );
}

function StaffFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const insets = useSafeAreaInsets();
  const employee = route.params?.employee as Employee | undefined;
  const mode = route.params?.mode as 'new' | 'edit';

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data: shifts = [] } = useGetShiftsQuery(shopId, { skip: !shopId });
  const currentEmployee = useMemo(
    () => (employee ? employees.find(item => item.id === employee.id) ?? employee : undefined),
    [employee, employees],
  );
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
      loginEmail: employee.loginEmail ?? '',
      loginPassword: '',
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
  const normalizedLoginEmail = useMemo(() => form.loginEmail.trim().toLowerCase(), [form.loginEmail]);
  const duplicateLoginEmployee = useMemo(() => {
    if (!normalizedLoginEmail) {
      return undefined;
    }
    return employees.find(item => {
      if (item.id === (form.id || currentEmployee?.id)) {
        return false;
      }
      return (item.loginEmail ?? '').trim().toLowerCase() === normalizedLoginEmail;
    });
  }, [currentEmployee?.id, employees, form.id, normalizedLoginEmail]);
  const shopEmailConflict = normalizedLoginEmail && (shop?.email ?? '').trim().toLowerCase() === normalizedLoginEmail;
  const authPreview = currentEmployee?.authUid
    ? currentEmployee
    : normalizedLoginEmail
      ? ({ authStatus: 'pending' as EmployeeAuthStatus, authUid: '' })
      : currentEmployee;
  const authStatusStyles = getEmployeeAuthStyleKeys(authPreview);
  const authStatusLabel = getEmployeeAuthStatusLabel(authPreview);

  const autoBiometricUserId = useMemo(
    () =>
      generateUniqueBiometricUserId({
        employees,
        excludeEmployeeId: form.id || currentEmployee?.id,
        employeeCode: form.employeeCode,
        phone: form.phone,
        currentBiometricUserId: mode === 'edit' ? form.biometricUserId : undefined,
      }),
    [currentEmployee?.id, employees, form.biometricUserId, form.employeeCode, form.id, form.phone, mode],
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
      excludeEmployeeId: form.id || currentEmployee?.id,
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

  const validateLoginFields = () => {
    if (!normalizedLoginEmail) {
      return true;
    }
    if (!normalizedLoginEmail.includes('@')) {
      throw new Error('Enter a valid staff email.');
    }
    if (duplicateLoginEmployee) {
      throw new Error(`${duplicateLoginEmployee.name} already uses this email.`);
    }
    if (shopEmailConflict) {
      throw new Error('Staff email cannot match the shop manager email.');
    }
    if (!currentEmployee?.authUid && form.loginPassword.trim().length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (currentEmployee?.authUid && currentEmployee.loginEmail && currentEmployee.loginEmail.trim().toLowerCase() !== normalizedLoginEmail) {
      throw new Error('Existing linked auth email cannot be changed from this form.');
    }
    return true;
  };

  const buildEmployeePayload = () => {
    if (!shopId) {
      throw new Error('Shop is not linked.');
    }
    if (!form.employeeCode || !form.name || !form.phone || !form.designation || !form.joiningDate || !form.basicSalary) {
      throw new Error('Please fill all required fields.');
    }
    if (!form.taluka || !form.district) {
      throw new Error('Taluka and District are required.');
    }
    if (!form.aadhaarNo || !/^\d{12}$/.test(form.aadhaarNo.trim())) {
      throw new Error('Aadhaar number must be 12 digits.');
    }

    const finalBiometricUserId = generateUniqueBiometricUserId({
      employees,
      excludeEmployeeId: form.id || currentEmployee?.id,
      employeeCode: form.employeeCode,
      phone: form.phone,
      currentBiometricUserId: form.biometricUserId || autoBiometricUserId,
    });
    if (form.biometricConsent && !finalBiometricUserId) {
      throw new Error('Biometric User ID is required when biometric is accepted.');
    }

    const previousStatus = currentEmployee?.status;
    const today = todayDate();
    let activatedAt = form.activatedAt || form.joiningDate || today;
    let deactivatedAt = form.deactivatedAt || '';

    if (!currentEmployee) {
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

    const address = [form.addressLine1.trim(), form.taluka.trim(), form.district.trim()].filter(Boolean).join(', ');
    const stableEmployeeId = form.id || `emp_${form.employeeCode.trim()}`;

    return {
      stableEmployeeId,
      payload: {
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
        salaryType: 'monthly' as const,
        basicSalary: Number(form.basicSalary),
        pfAmount: Number(form.pfAmount || 0),
        overtimeRatePerHour: Number(form.overtimeRatePerHour || 0),
        loginEmail: currentEmployee?.authUid || normalizedLoginEmail ? normalizedLoginEmail : '',
        authUid: currentEmployee?.authUid ?? '',
        authStatus: currentEmployee?.authUid ? currentEmployee.authStatus ?? 'provisioned' : normalizedLoginEmail ? 'provisioned' : 'not_created',
        status: form.status,
        activatedAt,
        deactivatedAt,
      },
    };
  };

  const onSave = async () => {
    let createdAuthForRollback = false;
    try {
      validateLoginFields();
      let createdAuthUid = currentEmployee?.authUid ?? '';
      if (!createdAuthUid && normalizedLoginEmail) {
        const created = await createStaffAuthUserLocally({
          email: normalizedLoginEmail,
          password: form.loginPassword.trim(),
          displayName: form.name.trim(),
        });
        createdAuthUid = created.uid;
        createdAuthForRollback = true;
      }

      const { payload } = buildEmployeePayload();
      payload.authUid = createdAuthUid;
      payload.authStatus = createdAuthUid ? (currentEmployee?.authStatus ?? 'provisioned') : 'not_created';
      payload.loginEmail = createdAuthUid ? normalizedLoginEmail : '';

      await upsertEmployee(payload).unwrap();

      Alert.alert(
        'Success',
        createdAuthUid
          ? `Staff member ${mode === 'edit' ? 'updated' : 'created'} and auth account saved successfully.`
          : `Staff member ${mode === 'edit' ? 'updated' : 'created'} successfully.`,
      );
      navigation.goBack();
    } catch (error) {
      if (createdAuthForRollback && normalizedLoginEmail && form.loginPassword.trim()) {
        try {
          await deleteStaffAuthUserLocally({
            email: normalizedLoginEmail,
            password: form.loginPassword.trim(),
          });
        } catch {
          // Best effort rollback only; preserve the original save error for the user.
        }
      }
      Alert.alert('Save failed', (error as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.formScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.formContent, { paddingTop: Math.max(insets.top + 38, 66) }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.staffFormHero}>
          <View style={styles.staffFormHeroTop}>
            <View style={styles.staffFormBadge}>
              <Text style={styles.staffFormBadgeText}>{mode === 'edit' ? 'Staff Update' : 'Staff Registration'}</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.formTitle}>{mode === 'edit' ? 'Edit Staff Member' : 'Register Staff Member'}</Text>
          <Text style={styles.staffFormIntro}>
            Use one clean form to register the staff member under this shop. Personal details, work setup, payroll settings, and app login are handled together here.
          </Text>

          <View style={styles.staffFormHeroStats}>
            <View style={styles.staffFormHeroStatCard}>
              <Text style={styles.staffFormHeroStatLabel}>Staff Code</Text>
              <Text style={styles.staffFormHeroStatValue}>{form.employeeCode || '-'}</Text>
            </View>
            <View style={styles.staffFormHeroStatCard}>
              <Text style={styles.staffFormHeroStatLabel}>Status</Text>
              <Text style={styles.staffFormHeroStatValue}>{form.status === 'active' ? 'Active' : 'Inactive'}</Text>
            </View>
            <View style={styles.staffFormHeroStatCard}>
              <Text style={styles.staffFormHeroStatLabel}>Access</Text>
              <Text style={styles.staffFormHeroStatValue}>{authStatusLabel}</Text>
            </View>
          </View>
        </View>

        <Card>
          <Text style={styles.formSectionTitle}>Basic Details</Text>
          <Text style={styles.formSectionSubtitle}>Employee code is auto-generated and kept read-only for consistency.</Text>
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

        </Card>

        <Card>
          <Text style={styles.formSectionTitle}>Joining & Shift</Text>
          <Text style={styles.formSectionSubtitle}>Set the joining date, assign a default shift, and choose the weekly off day.</Text>
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
        </Card>

        <Card>
          <Text style={styles.formSectionTitle}>Biometric Mapping</Text>
          <Text style={styles.formSectionSubtitle}>Use biometric only after staff consent is captured for attendance matching.</Text>
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
        </Card>

        <Card>
          <Text style={styles.formSectionTitle}>Salary Details</Text>
          <Text style={styles.formSectionSubtitle}>Enter the salary values used for monthly payroll calculations.</Text>
          <Field label="Basic Salary" value={form.basicSalary} onChangeText={v => setForm(prev => ({ ...prev, basicSalary: v }))} keyboardType="numeric" />
          <Field label="PF" value={form.pfAmount} onChangeText={v => setForm(prev => ({ ...prev, pfAmount: v }))} keyboardType="numeric" />
          <Field
            label="Overtime Rate / Hour"
            value={form.overtimeRatePerHour}
            onChangeText={v => setForm(prev => ({ ...prev, overtimeRatePerHour: v }))}
            keyboardType="numeric"
          />
        </Card>

        <Card>
          <Text style={styles.formSectionTitle}>Simple Sign Up</Text>
          <Text style={styles.formSectionSubtitle}>
            Create the staff login directly with email and password. The staff profile details and Authentication user will be saved together from this form.
          </Text>

          <View style={styles.accessSectionHeaderRow}>
            <Text style={styles.accessSectionTitle}>Authentication Status</Text>
            <View style={[styles.authPill, styles[authStatusStyles.pill]]}>
              <Text style={[styles.authPillText, styles[authStatusStyles.text]]}>{authStatusLabel}</Text>
            </View>
          </View>
          <Field
            label="Staff Email"
            value={form.loginEmail}
            onChangeText={value => setForm(prev => ({ ...prev, loginEmail: value }))}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="staff@example.com"
            editable={!currentEmployee?.authUid}
          />
          <Field
            label={currentEmployee?.authUid ? 'Password' : 'Create Password'}
            value={form.loginPassword}
            onChangeText={value => setForm(prev => ({ ...prev, loginPassword: value }))}
            secureTextEntry
            placeholder={currentEmployee?.authUid ? 'Already linked in Authentication' : 'Minimum 6 characters'}
            editable={!currentEmployee?.authUid}
          />
          <Field label="Auth UID" value={currentEmployee?.authUid?.trim() || '-'} editable={false} />
          <Text style={styles.shiftHint}>
            If email and password are entered for a new staff member, the user will be created directly in Firebase Authentication from this form.
          </Text>

          {duplicateLoginEmployee ? <Text style={styles.authWarningText}>{`${duplicateLoginEmployee.name} already uses this email.`}</Text> : null}
          {shopEmailConflict ? <Text style={styles.authWarningText}>Staff email cannot match the shop manager email.</Text> : null}
          {currentEmployee?.authLastError ? <Text style={styles.authErrorText}>{currentEmployee.authLastError}</Text> : null}
        </Card>

        <Card>
          <Text style={styles.formSectionTitle}>Activation</Text>
          <Text style={styles.formSectionSubtitle}>Choose whether the staff profile is active and review service dates.</Text>
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
        </Card>

        <Card>
          <Text style={styles.formSectionTitle}>Save Profile</Text>
          <Text style={styles.formSectionSubtitle}>Review the details once and save the staff profile.</Text>
          <PrimaryButton
            title={mode === 'edit' ? 'Update Staff' : 'Create Staff'}
            onPress={onSave}
            loading={saving}
          />
        </Card>
      </ScrollView>
      <View pointerEvents="none" style={[styles.formStatusTexture, { height: Math.max(insets.top + 26, 54) }]}>
        <View style={styles.formStatusTextureGlowTop} />
        <View style={styles.formStatusTextureGlowBottom} />
      </View>
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

function calculateTemplateShiftHours(startTime: string, endTime: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) {
    return null;
  }
  let diff = end - start;
  if (diff < 0) {
    diff += 24 * 60;
  }
  if (diff === 0) {
    return null;
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

function formatDurationHours(value: number) {
  if (!Number.isFinite(value)) {
    return '';
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function calculateEndTimeFromDuration(startTime: string, durationHours: number) {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null || !Number.isFinite(durationHours) || durationHours <= 0) {
    return null;
  }

  const durationMinutes = Math.round(durationHours * 60);
  if (durationMinutes >= 24 * 60) {
    return null;
  }
  const endMinutes = (startMinutes + durationMinutes) % (24 * 60);

  const hours = Math.floor(endMinutes / 60);
  const minutes = endMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTime12Hour(value: string) {
  const parsed = parseTimeToMinutes(value);
  if (parsed === null) {
    return value;
  }

  const normalizedMinutes = parsed % (24 * 60);
  const hours24 = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function isNonNegativeNumeric(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0;
}

function isPositiveNumeric(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function buildPlannerDay(shopId: string, staffId: string, dayOfWeek: number): StaffWeeklyShiftDay {
  return {
    id: `${staffId || 'staff'}_${dayOfWeek}`,
    shopId,
    staffId,
    dayOfWeek,
    shiftId: null,
    isOff: false,
    createdAt: '',
    updatedAt: '',
  };
}

function buildEmptyWeeklyPlan(shopId: string, staffId: string) {
  return plannerDays.map(day => buildPlannerDay(shopId, staffId, day.dayOfWeek));
}

function normalizeWeeklyPlanDays(days: StaffWeeklyShiftDay[], shopId: string, staffId: string) {
  const byDay = new Map(days.map(item => [item.dayOfWeek, item]));
  return plannerDays.map(day => byDay.get(day.dayOfWeek) ?? buildPlannerDay(shopId, staffId, day.dayOfWeek));
}

function areWeeklyPlanDaysEqual(left: StaffWeeklyShiftDay[], right: StaffWeeklyShiftDay[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other?.id &&
      item.shopId === other?.shopId &&
      item.staffId === other?.staffId &&
      item.dayOfWeek === other?.dayOfWeek &&
      item.shiftId === other?.shiftId &&
      item.isOff === other?.isOff
    );
  });
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
    backgroundColor: '#f3f6fb',
  },
  listContent: {
    gap: 14,
    paddingBottom: 24,
  },
  headerBlock: {
    gap: 14,
  },
  staffHeaderCard: {
    backgroundColor: colors.success,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 14,
    overflow: 'hidden',
  },
  staffHeaderGradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b8f6d',
  },
  staffHeaderGradientGlowTop: {
    position: 'absolute',
    top: -90,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#30b28b',
    opacity: 0.26,
  },
  staffHeaderGradientGlowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#06644d',
    opacity: 0.3,
  },
  staffHeaderTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  staffHeaderMeta: {
    color: '#defbf1',
    fontSize: 16,
    fontWeight: '700',
  },
  staffHeaderPoweredBy: {
    color: '#c8f3e8',
    fontSize: 14,
    fontWeight: '600',
  },
  staffHeaderBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  staffHeaderBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  staffHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  staffHeaderTextBlock: {
    gap: 4,
  },
  staffSummaryCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(6, 85, 64, 0.32)',
    gap: 6,
  },
  staffSummaryEyebrow: {
    color: '#d6f8ed',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  staffSummaryMetaLabel: {
    color: '#c9f4e7',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  staffSummaryMetaValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  staffSummaryGrid: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  staffSummaryCountCard: {
    width: '47.5%',
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  policyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
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
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionPad: {
    paddingHorizontal: 16,
  },
  actionTile: {
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
  actionTilePressed: {
    backgroundColor: '#f8fbff',
    borderColor: '#c9d6e6',
  },
  actionTileAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  actionTileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionTileText: {
    marginTop: 14,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  actionTileDescription: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
  fullColAuth: {
    width: 150,
    gap: 6,
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
  shiftTableScrollContent: {
    paddingRight: 16,
  },
  shiftTableWrap: {
    gap: 12,
  },
  shiftTableHeaderRow: {
    minWidth: 930,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  shiftTableRow: {
    minWidth: 930,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  shiftColIndex: {
    width: 48,
  },
  shiftColName: {
    width: 240,
  },
  shiftColTime: {
    width: 190,
  },
  shiftColRules: {
    width: 290,
  },
  shiftColActionsHeader: {
    width: 110,
    textAlign: 'center',
  },
  shiftColActions: {
    width: 110,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  shiftIconBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#cfd8f6',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftIconBtnDanger: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
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
  authPill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  authPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  authPillProvisioned: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  authPillTextProvisioned: {
    color: '#0a7a5b',
  },
  authPillDisabled: {
    borderColor: '#f2d7a7',
    backgroundColor: '#fff5df',
  },
  authPillTextDisabled: {
    color: '#8c5a00',
  },
  authPillError: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
  },
  authPillTextError: {
    color: '#c22a2a',
  },
  authPillPending: {
    borderColor: '#cfd8f6',
    backgroundColor: '#eef2ff',
  },
  authPillTextPending: {
    color: '#3554a5',
  },
  authPillNotCreated: {
    borderColor: '#d7dee8',
    backgroundColor: '#f8fafc',
  },
  authPillTextNotCreated: {
    color: '#526173',
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
  staffEditRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  staffEditIdentity: {
    flex: 1,
    gap: 4,
  },
  staffEditCode: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  staffEditName: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  staffEditMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  staffMetaPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  staffMetaInlineText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  staffEditStatusPill: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  staffEditStatusPillActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  staffEditStatusPillInactive: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
  },
  staffEditStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  staffEditStatusTextActive: {
    color: '#0a7a5b',
  },
  staffEditStatusTextInactive: {
    color: '#c22a2a',
  },
  staffEditActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  staffEditPrimaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  staffEditPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  staffEditDeleteBtn: {
    minWidth: 104,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f5c8c8',
    backgroundColor: '#fff5f5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  staffEditDeleteBtnText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  staffDeactivateBtnModern: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  staffActivateBtnModern: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  staffDeactivateBtnModernText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  formScreen: {
    flex: 1,
    backgroundColor: colors.bg,
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
  formContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  editListContent: {
    paddingHorizontal: 16,
    gap: 14,
    paddingBottom: 28,
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
  staffFormHeroStatCard: {
    flex: 1,
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
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  staffFormHeroStatValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
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
  formSectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 2,
  },
  authSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  accessHeroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#f7fbff',
    padding: 14,
    gap: 10,
  },
  accessHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  accessHeroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e7f3ff',
    alignSelf: 'flex-start',
  },
  accessHeroBadgeText: {
    color: '#1f5f9c',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  accessHeroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  accessHeroText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  accessHeroStats: {
    flexDirection: 'row',
    gap: 10,
  },
  accessHeroStatCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  accessHeroStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  accessHeroStatValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  accessSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  accessSectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  accessSectionMeta: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
  },
  authMetaText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  authWarningText: {
    color: '#8c5a00',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  authErrorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  accessInfoPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe8f4',
    backgroundColor: '#f8fbfe',
    padding: 12,
    gap: 4,
  },
  accessInfoTitle: {
    color: '#1f5f9c',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  accessInfoText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  authActionColumn: {
    gap: 8,
  },
  secondaryActionBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryActionBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  destructiveActionBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f5c8c8',
    backgroundColor: '#fff5f5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  destructiveActionBtnText: {
    color: colors.danger,
    fontSize: 14,
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

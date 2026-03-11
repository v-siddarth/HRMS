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
  StaffForm: { mode: 'new' | 'edit'; employee?: Employee };
};
type StaffPanel = 'weekly' | 'reports' | null;

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

const Stack = createNativeStackNavigator<StaffStackParamList>();

export function StaffScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffList" component={StaffListScreen} />
      <Stack.Screen name="StaffEditTable" component={StaffEditTableScreen} />
      <Stack.Screen name="StaffDeactivateTable" component={StaffDeactivateTableScreen} />
      <Stack.Screen name="StaffShiftScreen" component={StaffShiftScreen} />
      <Stack.Screen name="StaffForm" component={StaffFormScreen} />
    </Stack.Navigator>
  );
}

function StaffListScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [activePanel, setActivePanel] = useState<StaffPanel>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all');
  const [weekStartDate, setWeekStartDate] = useState(dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'));
  const [planEmployeeId, setPlanEmployeeId] = useState('');
  const [planShiftId, setPlanShiftId] = useState('');
  const [planDay, setPlanDay] = useState<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>('mon');
  const [savingPlan, setSavingPlan] = useState(false);

  const { data: employees = [], isLoading } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data: shifts = [] } = useGetShiftsQuery(shopId, { skip: !shopId });
  const { data: weeklyPlans = [], refetch: refetchWeeklyPlans } = useGetWeeklyShiftPlanQuery(
    { shopId, weekStartDate },
    { skip: !shopId || !weekStartDate },
  );
  const [upsertEmployee] = useUpsertEmployeeMutation();
  const [upsertWeeklyPlan] = useUpsertWeeklyShiftPlanMutation();

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

  const activeCount = employees.filter(item => item.status === 'active').length;
  const inactiveCount = Math.max(0, employees.length - activeCount);
  const showStaffRows = activePanel === 'reports';

  const onToggleStatus = async (employee: Employee, nextStatus: EmployeeStatus) => {
    if (!shopId) {
      return;
    }

    const currentDate = todayDate();
    const nextActivatedAt =
      nextStatus === 'active' ? currentDate : employee.activatedAt || employee.joiningDate || currentDate;
    const nextDeactivatedAt = nextStatus === 'inactive' ? currentDate : '';

    try {
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
  };

  const onSaveWeeklyPlan = async () => {
    if (!shopId) {
      return;
    }
    if (!planEmployeeId || !planShiftId || !weekStartDate) {
      Alert.alert('Validation', 'Select week start date, staff, shift and day.');
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

  return (
    <View style={styles.page}>
      <StatusBar backgroundColor="#0b8f6d" barStyle="light-content" />
      <FlatList
        data={showStaffRows ? filtered : []}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
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
              <ActionTile label="Create New Staff" onPress={() => navigation.navigate('StaffForm', { mode: 'new' })} active={false} />
              <ActionTile label="Edit Staff Details" onPress={() => navigation.navigate('StaffEditTable')} active={false} />
              <ActionTile label="Mark De-activate Staff" onPress={() => navigation.navigate('StaffDeactivateTable')} active={false} />
              <ActionTile label="Create Shifts" onPress={() => navigation.navigate('StaffShiftScreen')} active={false} />
              <ActionTile label="Weekly Shift Upload" onPress={() => setActivePanel('weekly')} active={activePanel === 'weekly'} />
              <ActionTile label="All Staff List" onPress={() => setActivePanel('reports')} active={activePanel === 'reports'} />
            </View>

            {showStaffRows ? (
              <>
                <View style={styles.countRow}>
                  <CountChip label="Total" value={`${employees.length}`} />
                  <CountChip label="Active" value={`${activeCount}`} />
                  <CountChip label="Inactive" value={`${inactiveCount}`} />
                </View>

                <Card>
                  <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Code / name / phone / designation" />
                </Card>

                <Card>
                  <Text style={styles.filterTitle}>Staff Status Filter</Text>
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
                  <Text style={styles.reportTitle}>All Staff List</Text>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHead, styles.colCode]}>Code</Text>
                    <Text style={[styles.tableHead, styles.colName]}>Name</Text>
                    <Text style={[styles.tableHead, styles.colStatus]}>Status</Text>
                    <Text style={[styles.tableHead, styles.colDuration]}>Service</Text>
                    <Text style={[styles.tableHead, styles.colAction]}>{activePanel === 'reports' ? 'View' : 'Action'}</Text>
                  </View>
                </Card>

                <Text style={styles.sectionCount}>{isLoading ? 'Loading staff...' : `${filtered.length} staff members`}</Text>
              </>
            ) : null}

            {activePanel === 'weekly' ? (
              <Card>
                <Text style={styles.shiftTitle}>Weekly Shift Plan Upload</Text>
                <Field
                  label="Week Start Date (YYYY-MM-DD)"
                  value={weekStartDate}
                  onChangeText={setWeekStartDate}
                  placeholder="Monday date"
                />
                <Text style={styles.shiftLabel}>Select Staff</Text>
                <View style={styles.planWrap}>
                  {employees.filter(emp => emp.status === 'active').map(emp => (
                    <Pressable
                      key={emp.id}
                      style={[styles.planChip, planEmployeeId === emp.id ? styles.planChipSelected : undefined]}
                      onPress={() => setPlanEmployeeId(emp.id)}>
                      <Text style={[styles.planChipText, planEmployeeId === emp.id ? styles.planChipTextSelected : undefined]}>
                        {emp.employeeCode ? `${emp.employeeCode} - ` : ''}
                        {emp.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.shiftLabel}>Select Shift</Text>
                <View style={styles.planWrap}>
                  {shifts.filter(shift => shift.active).map(shift => (
                    <Pressable
                      key={shift.id}
                      style={[styles.planChip, planShiftId === shift.id ? styles.planChipSelected : undefined]}
                      onPress={() => setPlanShiftId(shift.id)}>
                      <Text style={[styles.planChipText, planShiftId === shift.id ? styles.planChipTextSelected : undefined]}>
                        {shift.name} ({shift.startTime}-{shift.endTime})
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.shiftLabel}>Select Day</Text>
                <View style={styles.planWrap}>
                  {weekDays.map(day => (
                    <Pressable
                      key={day}
                      style={[styles.planChipSmall, planDay === day ? styles.planChipSelected : undefined]}
                      onPress={() => setPlanDay(day)}>
                      <Text style={[styles.planChipText, planDay === day ? styles.planChipTextSelected : undefined]}>
                        {day.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <PrimaryButton title={savingPlan ? 'Saving...' : 'Save Weekly Plan'} onPress={onSaveWeeklyPlan} loading={savingPlan} />
                <Text style={styles.shiftHint}>{`${weeklyPlans.length} planned rows for selected week`}</Text>
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !isLoading && showStaffRows ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Staff Found</Text>
              <Text style={styles.emptySub}>Try a different filter or add a new staff member.</Text>
            </View>
          ) : !activePanel ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Select Staff Action</Text>
              <Text style={styles.emptySub}>Tap any button above to open that section.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const service = getServiceDuration(item);
          return (
            <View style={styles.staffTableRow}>
              <Text style={[styles.tableCell, styles.colCode]} numberOfLines={1}>
                {item.employeeCode || '-'}
              </Text>
              <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.tableCell, styles.colStatus, item.status === 'active' ? styles.activeText : styles.inactiveText]} numberOfLines={1}>
                {item.status.toUpperCase()}
              </Text>
              <Text style={[styles.tableCell, styles.colDuration]} numberOfLines={1}>
                {service}
              </Text>
              {activePanel === 'reports' ? (
                <View style={[styles.colAction, styles.rowActions]}>
                  <Text style={styles.tableCell}>-</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

function ActionTile({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.actionTile, active ? styles.actionTileActive : undefined, pressed && styles.actionTilePressed]} onPress={onPress}>
      <Text style={[styles.actionTileText, active ? styles.actionTileTextActive : undefined]}>{label}</Text>
    </Pressable>
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
      void refetchShifts();
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
      void refetchShifts();

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
      void refetchShifts();
    } catch (error) {
      Alert.alert('Update failed', (error as Error).message);
    }
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
                  <Field label="Start (24H)" value={shiftStart} onChangeText={setShiftStart} placeholder="07:00" />
                </View>
                <View style={styles.shiftField}>
                  <Field label="End (24H)" value={shiftEnd} onChangeText={setShiftEnd} placeholder="15:30" />
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
              <Pressable
                style={[styles.iconActionBtn, item.active ? styles.iconActivateBtn : styles.iconDeactivateBtn]}
                onPress={() => onToggleShiftActive(item)}>
                <Text style={[styles.iconActionText, item.active ? styles.iconActivateText : styles.iconDeactivateText]}>
                  {item.active ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
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
    if (!form.biometricUserId.trim()) {
      Alert.alert('Biometric User ID Required', 'Enter biometric user ID before registration.');
      return;
    }
    setForm(prev => ({ ...prev, biometricRegisteredAt: todayDate() }));
    Alert.alert('Registered', 'Biometric ID registered for attendance matching.');
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
    if (form.biometricConsent && !form.biometricUserId.trim()) {
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
          biometricUserId: form.biometricUserId.trim(),
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
            label="Biometric User ID"
            value={form.biometricUserId}
            onChangeText={v => setForm(prev => ({ ...prev, biometricUserId: v.replace(/[^0-9A-Za-z_-]/g, '') }))}
            placeholder="e.g. 1001"
          />
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
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionTile: {
    width: '48%',
    minHeight: 110,
    borderWidth: 2,
    borderColor: '#111827',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  actionTileActive: {
    backgroundColor: '#e9f8f1',
    borderColor: '#0f8f6f',
  },
  actionTilePressed: {
    backgroundColor: '#f5f8fb',
  },
  actionTileText: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
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
    fontSize: 13,
    marginBottom: 6,
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

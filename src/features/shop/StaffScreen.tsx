import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useDeleteEmployeeMutation,
  useGetAttendanceByDateQuery,
  useGetEmployeesQuery,
  useUpsertEmployeeMutation,
} from '../../store/hrmsApi';
import { todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import type { AttendanceStatus, Employee, EmployeeStatus } from '../../types/models';

type StaffStackParamList = {
  StaffList: undefined;
  StaffForm: { mode: 'new' | 'edit'; employee?: Employee };
};

type StaffAttendanceFilter = 'all' | AttendanceStatus;

interface EmployeeForm {
  id?: string;
  name: string;
  phone: string;
  address: string;
  designation: string;
  biometricUserId: string;
  joiningDate: string;
  basicSalary: string;
  overtimeRatePerHour: string;
  status: EmployeeStatus;
}

const initialForm: EmployeeForm = {
  name: '',
  phone: '',
  address: '',
  designation: '',
  biometricUserId: '',
  joiningDate: '',
  basicSalary: '',
  overtimeRatePerHour: '0',
  status: 'active',
};

const filterOptions: Array<{ key: StaffAttendanceFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'late', label: 'Late' },
  { key: 'half_day', label: 'Half Day' },
];

const Stack = createNativeStackNavigator<StaffStackParamList>();

export function StaffScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffList" component={StaffListScreen} />
      <Stack.Screen name="StaffForm" component={StaffFormScreen} />
    </Stack.Navigator>
  );
}

function StaffListScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StaffAttendanceFilter>('all');

  const { data: employees = [], isLoading } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: todayAttendance = [] } = useGetAttendanceByDateQuery(
    { shopId, date: todayDate() },
    { skip: !shopId },
  );
  const [deleteEmployee] = useDeleteEmployeeMutation();

  const attendanceByEmployee = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    todayAttendance.forEach(item => map.set(item.employeeId, item.status));
    return map;
  }, [todayAttendance]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(employee => {
      const matchesSearch =
        !q ||
        employee.name.toLowerCase().includes(q) ||
        employee.phone.toLowerCase().includes(q) ||
        employee.designation.toLowerCase().includes(q);

      const attendance = attendanceByEmployee.get(employee.id);
      const matchesFilter = filter === 'all' ? true : attendance === filter;

      return matchesSearch && matchesFilter;
    });
  }, [attendanceByEmployee, employees, filter, query]);

  const onDelete = (employeeId: string) => {
    if (!shopId) {
      return;
    }
    Alert.alert('Delete Staff Member', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEmployee({ shopId, employeeId }).unwrap();
          } catch (error) {
            Alert.alert('Delete failed', (error as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.topRow}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.title}>Staff</Text>
                <Text style={styles.subtitle}>Manage team members with fast actions and reliable daily visibility.</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
                onPress={() => navigation.navigate('StaffForm', { mode: 'new' })}>
                <Text style={styles.newButtonText}>+ New</Text>
              </Pressable>
            </View>

            <View style={styles.countRow}>
              <CountChip label="Total" value={`${employees.length}`} />
              <CountChip
                label="Present"
                value={`${employees.filter(item => attendanceByEmployee.get(item.id) === 'present').length}`}
              />
              <CountChip
                label="Absent"
                value={`${employees.filter(item => attendanceByEmployee.get(item.id) === 'absent').length}`}
              />
            </View>

            <Card>
              <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Name / phone / designation" />
            </Card>

            <Card>
              <Text style={styles.filterTitle}>Attendance Filter</Text>
              <View style={styles.filterWrap}>
                {filterOptions.map(option => (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.filterChip,
                      filter === option.key ? styles.filterChipSelected : undefined,
                    ]}
                    onPress={() => setFilter(option.key)}>
                    <Text style={[styles.filterChipText, filter === option.key ? styles.filterChipTextSelected : undefined]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            <Text style={styles.sectionCount}>{isLoading ? 'Loading staff...' : `${filtered.length} staff members`}</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Staff Found</Text>
              <Text style={styles.emptySub}>Try a different filter or add a new staff member.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const attendance = attendanceByEmployee.get(item.id);
          return (
            <View style={styles.staffCard}>
              <View style={styles.cardTop}>
                <Text style={styles.staffName} numberOfLines={2} ellipsizeMode="tail">
                  {item.name}
                </Text>
                <View style={[styles.statusBadge, attendance ? styles.attendanceMarked : styles.attendancePending]}>
                  <Text style={styles.statusBadgeText}>{attendance ? attendance.toUpperCase() : 'UNMARKED'}</Text>
                </View>
              </View>

              <View style={styles.infoWrap}>
                <InfoRow label="Designation" value={item.designation} />
                <InfoRow label="Phone" value={item.phone} />
                <InfoRow label="Joining" value={item.joiningDate} />
                <InfoRow label="Biometric ID" value={item.biometricUserId || '-'} />
                <InfoRow label="Salary" value={`INR ${item.basicSalary}`} />
                <InfoRow label="Address" value={item.address || '-'} multiline />
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
                  onPress={() => navigation.navigate('StaffForm', { mode: 'edit', employee: item })}>
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                  onPress={() => onDelete(item.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

function StaffFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const employee = route.params?.employee as Employee | undefined;
  const mode = route.params?.mode as 'new' | 'edit';

  const [form, setForm] = useState<EmployeeForm>(() => {
    if (!employee) {
      return initialForm;
    }
    return {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      address: employee.address,
      designation: employee.designation,
      biometricUserId: employee.biometricUserId ?? '',
      joiningDate: employee.joiningDate,
      basicSalary: String(employee.basicSalary),
      overtimeRatePerHour: String(employee.overtimeRatePerHour),
      status: employee.status,
    };
  });

  const [upsertEmployee, { isLoading: saving }] = useUpsertEmployeeMutation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onSave = async () => {
    if (!shopId) {
      Alert.alert('Error', 'Shop is not linked.');
      return;
    }
    if (!form.name || !form.phone || !form.designation || !form.joiningDate || !form.basicSalary) {
      Alert.alert('Validation', 'Please fill all required fields.');
      return;
    }

    try {
      await upsertEmployee({
        id: form.id,
        shopId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        designation: form.designation.trim(),
        biometricUserId: form.biometricUserId.trim(),
        joiningDate: form.joiningDate.trim(),
        salaryType: 'monthly',
        basicSalary: Number(form.basicSalary),
        overtimeRatePerHour: Number(form.overtimeRatePerHour || 0),
        status: form.status,
      }).unwrap();
      Alert.alert('Success', `Staff member ${mode === 'edit' ? 'updated' : 'created'} successfully.`);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.formScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>{mode === 'edit' ? 'Edit Staff' : 'New Staff Member'}</Text>
          <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <Text style={styles.formSubtitle}>Fill details carefully to keep payroll and attendance records accurate.</Text>

        <Card>
          <Field label="Full Name" value={form.name} onChangeText={v => setForm(prev => ({ ...prev, name: v }))} />
          <Field label="Phone Number" value={form.phone} onChangeText={v => setForm(prev => ({ ...prev, phone: v }))} keyboardType="phone-pad" />
          <Field label="Address" value={form.address} onChangeText={v => setForm(prev => ({ ...prev, address: v }))} />
          <Field label="Designation" value={form.designation} onChangeText={v => setForm(prev => ({ ...prev, designation: v }))} />
          <Field
            label="Biometric User ID (Optional)"
            value={form.biometricUserId}
            onChangeText={v => setForm(prev => ({ ...prev, biometricUserId: v }))}
            placeholder="e.g. device-user-102"
          />
          <View style={styles.dateFieldWrap}>
            <Text style={styles.dateLabel}>Joining Date</Text>
            <Pressable
              style={({ pressed }) => [styles.dateInputButton, pressed && styles.dateInputButtonPressed]}
              onPress={() => setShowDatePicker(true)}>
              <Text style={form.joiningDate ? styles.dateValueText : styles.datePlaceholderText}>
                {form.joiningDate || 'Select joining date'}
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
          <Field
            label="Basic Salary"
            value={form.basicSalary}
            onChangeText={v => setForm(prev => ({ ...prev, basicSalary: v }))}
            keyboardType="numeric"
          />
          <Field
            label="Overtime Rate / Hour"
            value={form.overtimeRatePerHour}
            onChangeText={v => setForm(prev => ({ ...prev, overtimeRatePerHour: v }))}
            keyboardType="numeric"
          />
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
                Inactive
              </Text>
            </Pressable>
          </View>
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

function CountChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.countChip}>
      <Text style={styles.countChipLabel}>{label}</Text>
      <Text style={styles.countChipValue}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={multiline ? 3 : 1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: 12,
    paddingBottom: 24,
  },
  headerBlock: {
    gap: 12,
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
    minHeight: 84,
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
  sectionCount: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  staffCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 16,
    padding: 12,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.09,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  staffName: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
    lineHeight: 22,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  attendanceMarked: {
    backgroundColor: '#e8f9f1',
    borderColor: '#b7ead3',
  },
  attendancePending: {
    backgroundColor: '#eef2f7',
    borderColor: '#d3dbe6',
  },
  statusBadgeText: {
    color: '#0a7559',
    fontWeight: '800',
    fontSize: 10,
  },
  infoWrap: {
    borderWidth: 1,
    borderColor: '#e6ebf2',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoLabel: {
    width: 78,
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    paddingTop: 2,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cde5da',
    backgroundColor: '#e8f9f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnPressed: {
    backgroundColor: '#dbf3e7',
  },
  editText: {
    color: '#0a7a5b',
    fontWeight: '800',
  },
  deleteBtn: {
    minHeight: 44,
    minWidth: 98,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f3c2c2',
    backgroundColor: '#fdeeee',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  deleteBtnPressed: {
    backgroundColor: '#f9dddd',
  },
  deleteText: {
    color: '#c22a2a',
    fontWeight: '800',
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    paddingHorizontal: 14,
    gap: 6,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
  },
  emptySub: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  formScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  formContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
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
    borderWidth: 1,
    borderColor: '#d3dbe6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  closeText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  formSubtitle: {
    color: colors.textSecondary,
    lineHeight: 19,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  dateInputButtonPressed: {
    backgroundColor: '#f8fafc',
  },
  dateValueText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  datePlaceholderText: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  datePickerWrap: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    padding: 8,
    gap: 8,
  },
  dateDoneBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#d1d9e4',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateDoneText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
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
    borderColor: '#f3c2c2',
    backgroundColor: '#fdeeee',
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

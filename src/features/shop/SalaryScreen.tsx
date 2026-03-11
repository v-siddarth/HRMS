import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useAddEmployeeAdvanceMutation,
  useGenerateMonthlySalaryMutation,
  useGetEmployeeAdvancesQuery,
  useGetEmployeesQuery,
  useGetMonthlySalaryQuery,
  useMarkSalaryPaidMutation,
  useUpsertEmployeeMutation,
} from '../../store/hrmsApi';
import {
  currentMonth,
  formatDisplayDate,
  formatDisplayDateTime24H,
  normalizeDateInput,
  todayDate,
} from '../../utils/date';
import { colors } from '../../theme/colors';

export function SalaryScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';

  const [month, setMonth] = useState(currentMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [editableSalaryByEmployeeId, setEditableSalaryByEmployeeId] = useState<Record<string, string>>({});
  const [editableOtByEmployeeId, setEditableOtByEmployeeId] = useState<Record<string, string>>({});
  const [advanceEmployeeId, setAdvanceEmployeeId] = useState('');
  const [advanceType, setAdvanceType] = useState<'advance' | 'loan'>('advance');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDateInput, setAdvanceDateInput] = useState(formatDisplayDate(todayDate()));
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [updatingEmployeeId, setUpdatingEmployeeId] = useState('');
  const [markingPaidId, setMarkingPaidId] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: rows = [], refetch, isLoading } = useGetMonthlySalaryQuery({ shopId, month }, { skip: !shopId });
  const { data: advances = [], refetch: refetchAdvances } = useGetEmployeeAdvancesQuery(
    { shopId, month },
    { skip: !shopId },
  );

  const [generateSalary, { isLoading: generating }] = useGenerateMonthlySalaryMutation();
  const [updateEmployee] = useUpsertEmployeeMutation();
  const [markSalaryPaid] = useMarkSalaryPaidMutation();
  const [addEmployeeAdvance] = useAddEmployeeAdvanceMutation();

  useEffect(() => {
    const salaryMap: Record<string, string> = {};
    const otMap: Record<string, string> = {};
    employees.forEach(employee => {
      salaryMap[employee.id] = String(employee.basicSalary);
      otMap[employee.id] = String(employee.overtimeRatePerHour);
    });
    setEditableSalaryByEmployeeId(salaryMap);
    setEditableOtByEmployeeId(otMap);
  }, [employees]);

  const mapped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const employeeById = new Map(employees.map(employee => [employee.id, employee]));
    return rows
      .map(row => ({ row, employee: employeeById.get(row.employeeId) }))
      .filter(item => {
        const name = item.employee?.name ?? item.row.employeeId;
        const designation = item.employee?.designation ?? '';
        const phone = item.employee?.phone ?? '';
        if (!q) {
          return true;
        }
        return (
          name.toLowerCase().includes(q) || designation.toLowerCase().includes(q) || phone.toLowerCase().includes(q)
        );
      });
  }, [employees, query, rows]);

  const totalNet = useMemo(() => rows.reduce((acc, row) => acc + row.netSalary, 0), [rows]);
  const totalAdvanceDeducted = useMemo(() => rows.reduce((acc, row) => acc + (row.advanceDeduction ?? 0), 0), [rows]);
  const paidCount = useMemo(() => rows.filter(row => !!row.salaryPaidAt).length, [rows]);
  const totalPaidAmount = useMemo(
    () => rows.filter(row => !!row.salaryPaidAt).reduce((acc, row) => acc + row.netSalary, 0),
    [rows],
  );
  const totalPendingAmount = useMemo(
    () => rows.filter(row => !row.salaryPaidAt).reduce((acc, row) => acc + row.netSalary, 0),
    [rows],
  );
  const monthLocked = rows.length > 0;
  const totalAdvanceEntered = useMemo(() => advances.reduce((acc, entry) => acc + Number(entry.amount || 0), 0), [advances]);
  const advanceDate = normalizeDateInput(advanceDateInput);

  const onGenerate = async () => {
    if (!shopId) {
      return;
    }
    if (monthLocked) {
      Alert.alert('Locked', 'Salary generation is allowed once per month only.');
      return;
    }
    try {
      await generateSalary({ shopId, month }).unwrap();
      await refetch();
      Alert.alert('Success', 'Salary generated for selected month.');
    } catch (error) {
      Alert.alert('Failed', (error as Error).message);
    }
  };

  const onUpdateBaseAndOt = async (employeeId: string) => {
    if (!shopId) {
      return;
    }
    const employee = employees.find(item => item.id === employeeId);
    if (!employee) {
      return;
    }
    const nextSalary = Number(editableSalaryByEmployeeId[employeeId]);
    const nextOt = Number(editableOtByEmployeeId[employeeId]);

    if (Number.isNaN(nextSalary) || Number.isNaN(nextOt)) {
      Alert.alert('Validation', 'Please enter valid Base Salary and OT Rate.');
      return;
    }

    try {
      setUpdatingEmployeeId(employeeId);
      await updateEmployee({
        ...employee,
        id: employee.id,
        shopId,
        basicSalary: nextSalary,
        overtimeRatePerHour: nextOt,
      }).unwrap();
      Alert.alert('Updated', 'Base salary and OT rate updated. It will apply in next salary generation cycle.');
    } catch (error) {
      Alert.alert('Update failed', (error as Error).message);
    } finally {
      setUpdatingEmployeeId('');
    }
  };

  const onSaveAdvance = async () => {
    if (!shopId || !user) {
      return;
    }
    if (!advanceEmployeeId) {
      Alert.alert('Validation', 'Please select staff for advance/loan.');
      return;
    }
    const amount = Number(advanceAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Validation', 'Enter a valid advance amount.');
      return;
    }
    if (!advanceDate) {
      Alert.alert('Validation', 'Enter valid advance date in DD.MM.YYYY.');
      return;
    }
    try {
      setSavingAdvance(true);
      await addEmployeeAdvance({
        shopId,
        employeeId: advanceEmployeeId,
        month,
        amount,
        type: advanceType,
        notes: advanceNotes,
        paidAt: advanceDate,
        createdBy: user.uid,
      }).unwrap();
      await refetchAdvances();
      setAdvanceAmount('');
      setAdvanceNotes('');
      Alert.alert('Saved', `${advanceType === 'advance' ? 'Advance' : 'Loan'} entry recorded.`);
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSavingAdvance(false);
    }
  };

  const onMarkSalaryGiven = async (salaryId: string) => {
    if (!shopId || !user) {
      return;
    }
    try {
      setMarkingPaidId(salaryId);
      await markSalaryPaid({ shopId, salaryId, paidBy: user.uid }).unwrap();
      await refetch();
    } catch (error) {
      Alert.alert('Failed', (error as Error).message);
    } finally {
      setMarkingPaidId('');
    }
  };

  return (
    <Screen>
      <FlatList
        data={mapped}
        keyExtractor={item => item.row.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Salary</Text>
            <Text style={styles.subtitle}>Manage monthly payroll, update base/OT rates, and track salary given status.</Text>

            <Card>
              <View style={styles.monthRow}>
                <View style={styles.monthFieldWrap}>
                  <Text style={styles.monthLabel}>Month</Text>
                  <Pressable
                    style={({ pressed }) => [styles.monthButton, pressed && styles.monthButtonPressed]}
                    onPress={() => setShowMonthPicker(true)}>
                    <Text style={styles.monthText}>{month}</Text>
                  </Pressable>
                </View>
                <View style={styles.monthAction}>
                  <PrimaryButton title="Generate Salary" onPress={onGenerate} loading={generating} />
                </View>
              </View>
              {showMonthPicker && (
                <View style={styles.monthPickerWrap}>
                  <DateTimePicker
                    value={dayjs(`${month}-01`).toDate()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => onMonthPick(event, selectedDate, setMonth, setShowMonthPicker)}
                  />
                  {Platform.OS === 'ios' && (
                    <Pressable style={styles.doneBtn} onPress={() => setShowMonthPicker(false)}>
                      <Text style={styles.doneText}>Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Card>

            <View style={styles.summaryRow}>
              <SummaryCard label="Total Staff Nos" value={`${rows.length}`} tone="slate" />
              <SummaryCard label="Paid Staff Nos" value={`${paidCount}`} tone="green" />
              <SummaryCard label="Pending Staff Nos" value={`${Math.max(0, rows.length - paidCount)}`} tone="amber" />
              <SummaryCard label="Net Amount" value={shortCurrency(totalNet)} tone="blue" />
              <SummaryCard label="Paid Amount" value={shortCurrency(totalPaidAmount)} tone="green" />
              <SummaryCard label="Pending Amount" value={shortCurrency(totalPendingAmount)} tone="amber" />
            </View>

            <Card>
              <Text style={styles.advanceTitle}>Advance / Loan Entry</Text>
              <Text style={styles.advanceSub}>This amount is auto-deducted while monthly salary is generated.</Text>
              <Field label="Advance Date (DD.MM.YYYY)" value={advanceDateInput} onChangeText={setAdvanceDateInput} />
              <View style={styles.advanceTypeRow}>
                <Pressable
                  style={[styles.advanceTypeChip, advanceType === 'advance' ? styles.advanceTypeChipActive : undefined]}
                  onPress={() => setAdvanceType('advance')}>
                  <Text style={[styles.advanceTypeText, advanceType === 'advance' ? styles.advanceTypeTextActive : undefined]}>
                    Advance
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.advanceTypeChip, advanceType === 'loan' ? styles.advanceTypeChipActive : undefined]}
                  onPress={() => setAdvanceType('loan')}>
                  <Text style={[styles.advanceTypeText, advanceType === 'loan' ? styles.advanceTypeTextActive : undefined]}>Loan</Text>
                </Pressable>
              </View>
              <Field
                label="Amount"
                value={advanceAmount}
                onChangeText={setAdvanceAmount}
                keyboardType="numeric"
                placeholder="Enter amount"
              />
              <Field label="Notes (Optional)" value={advanceNotes} onChangeText={setAdvanceNotes} placeholder="Remarks" />
              <Text style={styles.advancePickLabel}>Select Staff</Text>
              <View style={styles.advanceEmployeeWrap}>
                {employees.map(emp => {
                  const selected = advanceEmployeeId === emp.id;
                  return (
                    <Pressable
                      key={emp.id}
                      style={[styles.advanceEmpChip, selected ? styles.advanceEmpChipSelected : undefined]}
                      onPress={() => setAdvanceEmployeeId(emp.id)}>
                      <Text style={[styles.advanceEmpChipText, selected ? styles.advanceEmpChipTextSelected : undefined]}>
                        {emp.employeeCode ? `${emp.employeeCode} - ` : ''}
                        {emp.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.advanceButtonWrap}>
                <PrimaryButton title={savingAdvance ? 'Saving...' : 'Save Advance/Loan'} onPress={onSaveAdvance} loading={savingAdvance} />
              </View>
              <View style={styles.advanceMetaRow}>
                <Text style={styles.advanceMetaText}>Total Entered: {shortCurrency(totalAdvanceEntered)}</Text>
                <Text style={styles.advanceMetaText}>Deducted In Salary: {shortCurrency(totalAdvanceDeducted)}</Text>
              </View>
            </Card>

            <Card>
              <Field label="Search Salary Records" value={query} onChangeText={setQuery} placeholder="Name / designation / phone" />
            </Card>

            <Text style={styles.sectionCount}>{isLoading ? 'Loading salary records...' : `${mapped.length} records`}</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Salary Records</Text>
              <Text style={styles.emptySub}>Generate salary for this month or change search criteria.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const employee = item.employee;
          const row = item.row;
          const canEditEmployee = !!employee;
          const isUpdating = updatingEmployeeId === row.employeeId;
          const isMarkingPaid = markingPaidId === row.id;
          const isPaid = !!row.salaryPaidAt;

          return (
            <View style={styles.salaryCard}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadText}>
                  <Text style={styles.employeeName} numberOfLines={2} ellipsizeMode="tail">
                    {employee?.name ?? row.employeeId}
                  </Text>
                  <Text style={styles.employeeSub} numberOfLines={1} ellipsizeMode="tail">
                    {employee?.designation ?? 'Employee'} {employee?.phone ? `| ${employee.phone}` : ''}
                  </Text>
                </View>
                <View style={[styles.badge, isPaid ? styles.badgePaid : styles.badgePending]}>
                  <Text style={[styles.badgeText, isPaid ? styles.badgeTextPaid : styles.badgeTextPending]}>
                    {isPaid ? 'PAID' : 'PENDING'}
                  </Text>
                </View>
              </View>

              <View style={styles.metricsGrid}>
                <Metric label="Present" value={`${row.presentDays}`} />
                <Metric label="Absent" value={`${row.absentDays}`} />
                <Metric label="Late" value={`${row.lateEntries}`} />
                <Metric label="Payable" value={`${row.payableDays}`} />
              </View>

              <View style={styles.moneyWrap}>
                <InfoRow label="Per Day Salary" value={`INR ${row.perDaySalary.toFixed(2)}`} />
                <InfoRow label="Overtime Amount" value={`INR ${row.overtimeAmount.toFixed(2)}`} />
                <InfoRow label="Gross Salary" value={`INR ${(row.grossSalary ?? row.netSalary).toFixed(2)}`} />
                <InfoRow label="Advance Deduction" value={`INR ${(row.advanceDeduction ?? 0).toFixed(2)}`} />
                <InfoRow label="Net Salary" value={`INR ${row.netSalary.toFixed(2)}`} strong />
                <InfoRow label="Generated At" value={formatDisplayDateTime24H(row.generatedAt)} />
                <InfoRow label="Paid At" value={formatDisplayDateTime24H(row.salaryPaidAt)} />
              </View>

              <View style={styles.editPanel}>
                <Text style={styles.editTitle}>Update Base Salary & OT Rate</Text>
                <View style={styles.editRow}>
                  <View style={styles.editField}>
                    <Field
                      label="Base Salary"
                      value={editableSalaryByEmployeeId[row.employeeId] ?? ''}
                      onChangeText={v => setEditableSalaryByEmployeeId(prev => ({ ...prev, [row.employeeId]: v }))}
                      keyboardType="numeric"
                      editable={canEditEmployee}
                    />
                  </View>
                  <View style={styles.editField}>
                    <Field
                      label="OT Rate / Hour"
                      value={editableOtByEmployeeId[row.employeeId] ?? ''}
                      onChangeText={v => setEditableOtByEmployeeId(prev => ({ ...prev, [row.employeeId]: v }))}
                      keyboardType="numeric"
                      editable={canEditEmployee}
                    />
                  </View>
                </View>
                <View style={styles.buttonRow}>
                  <Pressable
                    disabled={!canEditEmployee || isUpdating}
                    style={({ pressed }) => [
                      styles.updateBtn,
                      pressed && !isUpdating && canEditEmployee && styles.updateBtnPressed,
                      (!canEditEmployee || isUpdating) && styles.btnDisabled,
                    ]}
                    onPress={() => onUpdateBaseAndOt(row.employeeId)}>
                    <Text style={styles.updateBtnText}>{isUpdating ? 'Updating...' : 'Update Salary'}</Text>
                  </Pressable>
                  <Pressable
                    disabled={isMarkingPaid || isPaid}
                    style={({ pressed }) => [
                      styles.paidBtn,
                      pressed && !isMarkingPaid && !isPaid && styles.paidBtnPressed,
                      (isMarkingPaid || isPaid) && styles.btnDisabled,
                    ]}
                    onPress={() => onMarkSalaryGiven(row.id)}>
                    <Text style={styles.paidBtnText}>{isPaid ? 'Salary Given' : isMarkingPaid ? 'Saving...' : 'Mark Salary Given'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

function onMonthPick(
  event: DateTimePickerEvent,
  selectedDate: Date | undefined,
  setMonth: (value: string) => void,
  setShowMonthPicker: (value: boolean) => void,
) {
  if (Platform.OS === 'android') {
    setShowMonthPicker(false);
  }
  if (event.type !== 'set' || !selectedDate) {
    return;
  }
  setMonth(dayjs(selectedDate).format('YYYY-MM'));
}

function shortCurrency(value: number) {
  if (value >= 10000000) {
    return `INR ${(value / 10000000).toFixed(2)}Cr`;
  }
  if (value >= 100000) {
    return `INR ${(value / 100000).toFixed(2)}L`;
  }
  return `INR ${value.toFixed(0)}`;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'amber' | 'slate' | 'blue';
}) {
  const palette = {
    green: { bg: '#e8f9f1', fg: '#0f9f63' },
    amber: { bg: '#fff4df', fg: '#ba7a1d' },
    slate: { bg: '#eef2f7', fg: '#334155' },
    blue: { bg: '#e6effd', fg: '#1458bf' },
  } as const;
  return (
    <View style={[styles.summaryCard, { backgroundColor: palette[tone].bg }]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color: palette[tone].fg }]} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, strong && styles.infoValueStrong]} numberOfLines={2} ellipsizeMode="tail">
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
  headerWrap: {
    gap: 12,
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
  monthRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  monthFieldWrap: {
    width: 130,
    gap: 6,
  },
  monthLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  monthButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  monthButtonPressed: {
    backgroundColor: '#f8fafc',
  },
  monthText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  monthAction: {
    flex: 1,
  },
  monthPickerWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    padding: 8,
    gap: 8,
  },
  doneBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  doneText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    width: '48%',
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
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
    marginTop: 5,
    fontWeight: '800',
    fontSize: 20,
    maxWidth: '100%',
  },
  advanceTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  advanceSub: {
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 18,
    fontSize: 12,
  },
  advanceTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  advanceTypeChip: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  advanceTypeChipActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  advanceTypeText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  advanceTypeTextActive: {
    color: '#0a7a5b',
  },
  advancePickLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  advanceEmployeeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  advanceEmpChip: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  advanceEmpChipSelected: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  advanceEmpChipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  advanceEmpChipTextSelected: {
    color: '#0a7a5b',
  },
  advanceButtonWrap: {
    marginTop: 2,
  },
  advanceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  advanceMetaText: {
    flex: 1,
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  sectionCount: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  salaryCard: {
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
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeadText: {
    flex: 1,
    gap: 2,
  },
  employeeName: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
    lineHeight: 22,
  },
  employeeSub: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgePaid: {
    backgroundColor: '#e8f9f1',
    borderColor: '#b7ead3',
  },
  badgePending: {
    backgroundColor: '#fff4df',
    borderColor: '#f4dcaf',
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 10,
  },
  badgeTextPaid: {
    color: '#0a7a5b',
  },
  badgeTextPending: {
    color: '#a56a12',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricBox: {
    width: '48%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e9f1',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  metricLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  metricValue: {
    marginTop: 3,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  moneyWrap: {
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
    width: 102,
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
    fontSize: 13,
    lineHeight: 18,
  },
  infoValueStrong: {
    color: colors.success,
    fontWeight: '800',
  },
  editPanel: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 8,
  },
  editTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  editRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editField: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  updateBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#e8f9f1',
    borderWidth: 1,
    borderColor: '#cde5da',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  updateBtnPressed: {
    backgroundColor: '#d9f2e6',
  },
  updateBtnText: {
    color: '#0a7a5b',
    fontWeight: '800',
    fontSize: 12,
  },
  paidBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#e6effd',
    borderWidth: 1,
    borderColor: '#c9daf7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  paidBtnPressed: {
    backgroundColor: '#d6e6ff',
  },
  paidBtnText: {
    color: '#1458bf',
    fontWeight: '800',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.6,
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
});

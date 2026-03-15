import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import * as RNHTMLtoPDF from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { Card, Field, PrimaryButton } from '../../components/ui';
import { salaryCol } from '../../services/firebase';
import { useAppSelector } from '../../store/hooks';
import {
  useAddEmployeeAdvanceMutation,
  useGenerateMonthlySalaryMutation,
  useGetAttendanceReportQuery,
  useGetEmployeeAdvancesQuery,
  useGetEmployeesQuery,
  useGetMonthlySalaryQuery,
  useGetShopByIdQuery,
  useMarkSalaryPaidMutation,
} from '../../store/hrmsApi';
import { currentMonth, formatDisplayDate, formatDisplayDateTime24H, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import type { AttendanceStatus, SalaryMonthly } from '../../types/models';

type SalaryStackParamList = {
  SalaryHome: undefined;
  SalaryGenerate: undefined;
  AdvanceLoanEntry: undefined;
  SalaryMonthwiseReport: undefined;
  AllEmployeeSalaryReport: undefined;
  IndividualSalaryAnnualReport: undefined;
  AdvancePaidReport: undefined;
  MonthlyAttendanceReport: undefined;
};

const Stack = createNativeStackNavigator<SalaryStackParamList>();

export function SalaryScreen() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SalaryHome" component={SalaryHomeScreen} />
      <Stack.Screen name="SalaryGenerate" component={SalaryGenerateScreen} />
      <Stack.Screen name="AdvanceLoanEntry" component={AdvanceLoanEntryScreen} />
      <Stack.Screen name="SalaryMonthwiseReport" component={SalaryMonthwiseReportScreen} />
      <Stack.Screen name="AllEmployeeSalaryReport" component={AllEmployeeSalaryReportScreen} />
      <Stack.Screen name="IndividualSalaryAnnualReport" component={IndividualSalaryAnnualReportScreen} />
      <Stack.Screen name="AdvancePaidReport" component={AdvancePaidReportScreen} />
      <Stack.Screen name="MonthlyAttendanceReport" component={MonthlyAttendanceReportScreen} />
    </Stack.Navigator>
  );
}

function SalaryHomeScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });

  return (
    <View style={styles.page}>
      <StatusBar backgroundColor="#0b8f6d" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <View style={styles.headerGradientBase} />
          <View style={styles.headerGradientMid} />
          <View style={styles.headerGradientGlowTop} />
          <View style={styles.headerGradientGlowBottom} />
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {shop?.shopName ?? 'Salary'}
          </Text>
          <Text style={styles.bannerSub} numberOfLines={2}>
            {shop?.address ?? '-'}
          </Text>
          <Text style={styles.bannerSub}>Powered by RVM Attend</Text>
          <View style={styles.bannerDivider} />
          <Text style={styles.bannerSection}>Salary Desk</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Salary</Text>
          <View style={styles.actionGrid}>
            <ActionTile icon="₹" tone="emerald" title="Generate Salary" onPress={() => navigation.navigate('SalaryGenerate')} />
            <ActionTile icon="⊕" tone="amber" title="Pay Advance" onPress={() => navigation.navigate('AdvanceLoanEntry')} />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Reports</Text>
          <View style={styles.actionGrid}>
            <ActionTile icon="◷" tone="blue" title="Monthwise Report" onPress={() => navigation.navigate('SalaryMonthwiseReport')} />
            <ActionTile icon="▦" tone="teal" title="All Salary Report" onPress={() => navigation.navigate('AllEmployeeSalaryReport')} />
            <ActionTile icon="◎" tone="violet" title="Individual Annual" onPress={() => navigation.navigate('IndividualSalaryAnnualReport')} />
            <ActionTile icon="↦" tone="red" title="Advance Paid Report" onPress={() => navigation.navigate('AdvancePaidReport')} />
            <ActionTile icon="◫" tone="sky" title="Attendance Report" onPress={() => navigation.navigate('MonthlyAttendanceReport')} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function SalaryGenerateScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [month, setMonth] = useState(currentMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState('');

  const { data: rows = [], refetch, isLoading } = useGetMonthlySalaryQuery({ shopId, month }, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const [generateSalary, { isLoading: generating }] = useGenerateMonthlySalaryMutation();
  const [markSalaryPaid] = useMarkSalaryPaidMutation();

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; designation: string; phone: string; status: 'active' | 'inactive' }>();
    employees.forEach(item => {
      map.set(item.id, { name: item.name, designation: item.designation, phone: item.phone, status: item.status });
    });
    return map;
  }, [employees]);
  const displayRows = useMemo(() => {
    return rows.filter(row => {
      const employee = employeeById.get(row.employeeId);
      const isActive = employee?.status !== 'inactive';
      const isPending = !row.salaryPaidAt;
      // Show all active staff rows and any pending settlements.
      // Hide fully settled rows for deactivated staff.
      return isActive || isPending;
    });
  }, [employeeById, rows]);

  const paidCount = useMemo(() => displayRows.filter(row => !!row.salaryPaidAt).length, [displayRows]);
  const pendingCount = Math.max(0, displayRows.length - paidCount);
  const totalNet = useMemo(() => displayRows.reduce((acc, row) => acc + row.netSalary, 0), [displayRows]);
  const paidAmount = useMemo(
    () => displayRows.filter(row => !!row.salaryPaidAt).reduce((acc, row) => acc + row.netSalary, 0),
    [displayRows],
  );
  const pendingAmount = useMemo(
    () => displayRows.filter(row => !row.salaryPaidAt).reduce((acc, row) => acc + row.netSalary, 0),
    [displayRows],
  );
  const hasPaidRows = useMemo(() => rows.some(row => !!row.salaryPaidAt), [rows]);
  const canRepairZeroRows = useMemo(
    () => rows.length > 0 && rows.every(row => !row.salaryPaidAt && Number(row.netSalary ?? 0) === 0),
    [rows],
  );
  const monthLocked = rows.length > 0 && !canRepairZeroRows;

  const onGenerate = async () => {
    if (!shopId) {
      return;
    }
    if (month > currentMonth()) {
      Alert.alert('Invalid Month', 'Future month salary generation is not allowed.');
      return;
    }
    if (monthLocked) {
      Alert.alert(
        'Locked',
        hasPaidRows
          ? 'Salary already generated for this month and paid entries exist. Regeneration is blocked.'
          : 'Salary already generated for this month. Generation is allowed once per month only.',
      );
      return;
    }
    try {
      await generateSalary({ shopId, month }).unwrap();
      await refetch();
      Alert.alert('Success', 'Salary generated successfully for selected month.');
    } catch (error) {
      Alert.alert('Failed', (error as Error).message);
    }
  };

  const onMarkPaid = async (salaryId: string) => {
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

  const confirmMarkPaid = (salaryId: string, staffName: string) => {
    Alert.alert(
      'Confirm Payment',
      `Mark salary as given for ${staffName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () => {
            void onMarkPaid(salaryId);
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <View style={styles.page}>
      <FlatList
        data={displayRows}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenHeader title="Generate Salary" onClose={() => navigation.goBack()} />

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
                  <PrimaryButton title={generating ? 'Generating...' : 'Generate Salary'} onPress={onGenerate} loading={generating} />
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

              <Text style={styles.helperText}>
                {canRepairZeroRows
                  ? 'Zero-value unpaid rows detected. One-time repair generation is allowed.'
                  : 'Generation is allowed once per month only.'}
              </Text>
            </Card>

            <View style={styles.summaryRow}>
              <SummaryCard label="Total Staff Nos" value={`${rows.length}`} tone="slate" />
              <SummaryCard label="Paid Staff Nos" value={`${paidCount}`} tone="green" />
              <SummaryCard label="Pending Staff Nos" value={`${pendingCount}`} tone="amber" />
              <SummaryCard label="Net Amount" value={shortCurrency(totalNet)} tone="blue" />
              <SummaryCard label="Paid Amount" value={shortCurrency(paidAmount)} tone="green" />
              <SummaryCard label="Pending Amount" value={shortCurrency(pendingAmount)} tone="amber" />
            </View>

            <Card>
              <Text style={styles.sectionTitle}>Generated Salary Table</Text>
              <View style={styles.compactTableHeaderRow}>
                <View style={[styles.compactTableCell, styles.compactTableHeaderCell, styles.compactNameCol]}>
                  <Text style={[styles.compactTableText, styles.compactTableHeaderText]} numberOfLines={1}>
                    Name
                  </Text>
                </View>
                <View style={[styles.compactTableCell, styles.compactTableHeaderCell, styles.compactPayableCol]}>
                  <Text style={[styles.compactTableText, styles.compactTableHeaderText]} numberOfLines={1}>
                    Payable Amount
                  </Text>
                </View>
                <View style={[styles.compactTableCell, styles.compactTableHeaderCell, styles.compactGivenCol]}>
                  <Text style={[styles.compactTableText, styles.compactTableHeaderText]} numberOfLines={1}>
                    Given
                  </Text>
                </View>
              </View>
            </Card>
            <Text style={styles.sectionCount}>{isLoading ? 'Loading salary rows...' : `${displayRows.length} salary rows`}</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Salary Rows To Settle</Text>
              <Text style={styles.emptySub}>No active or pending salary rows for selected month.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const employee = employeeById.get(item.employeeId);
          const isPaid = !!item.salaryPaidAt;
          const isMarking = markingPaidId === item.id;
          return (
            <View style={styles.compactTableRow}>
              <View style={[styles.compactTableCell, styles.compactNameCol]}>
                <Text style={styles.compactTableText} numberOfLines={1}>
                  {employee?.name ?? item.employeeId}
                </Text>
              </View>
              <View style={[styles.compactTableCell, styles.compactPayableCol]}>
                <Text style={styles.compactTableText} numberOfLines={1}>
                  {shortCurrency(item.netSalary)}
                </Text>
              </View>
              <View style={[styles.compactTableCell, styles.compactGivenCol]}>
                <View style={styles.rowActionCell}>
                  <Pressable
                    style={[styles.rowActionBtn, (isPaid || isMarking) && styles.btnDisabled]}
                    onPress={() => confirmMarkPaid(item.id, employee?.name ?? item.employeeId)}
                    disabled={isPaid || isMarking}>
                    <Text style={styles.rowActionText}>{isPaid ? 'Given' : isMarking ? 'Saving...' : 'Give'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function AdvanceLoanEntryScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [month, setMonth] = useState(currentMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [entryType, setEntryType] = useState<'advance' | 'loan'>('advance');
  const [amount, setAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(todayDate());
  const [showAdvanceDatePicker, setShowAdvanceDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: advances = [], refetch } = useGetEmployeeAdvancesQuery({ shopId, month }, { skip: !shopId });
  const [addEmployeeAdvance] = useAddEmployeeAdvanceMutation();

  const totalEntered = useMemo(() => advances.reduce((acc, entry) => acc + Number(entry.amount || 0), 0), [advances]);

  const onSave = async () => {
    if (!shopId || !user) {
      return;
    }
    if (!employeeId) {
      Alert.alert('Validation', 'Please select staff.');
      return;
    }
    const value = Number(amount);
    if (Number.isNaN(value) || value <= 0) {
      Alert.alert('Validation', 'Enter valid amount.');
      return;
    }
    try {
      setSaving(true);
      await addEmployeeAdvance({
        shopId,
        employeeId,
        month,
        amount: value,
        type: entryType,
        notes,
        paidAt: advanceDate,
        createdBy: user.uid,
      }).unwrap();
      await refetch();
      setAmount('');
      setNotes('');
      Alert.alert('Saved', `${entryType === 'advance' ? 'Advance' : 'Loan'} entry saved.`);
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onAdvanceDatePick = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowAdvanceDatePicker(false);
    }
    if (event.type !== 'set' || !selectedDate) {
      return;
    }
    setAdvanceDate(dayjs(selectedDate).format('YYYY-MM-DD'));
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Pay Advance / Loan" onClose={() => navigation.goBack()} />

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

        <View style={styles.entryDateWrap}>
          <Text style={styles.monthLabel}>Advance Date</Text>
          <Pressable
            style={({ pressed }) => [styles.monthButton, pressed && styles.monthButtonPressed]}
            onPress={() => setShowAdvanceDatePicker(true)}>
            <Text style={styles.monthText}>{formatDisplayDate(advanceDate)}</Text>
          </Pressable>
          {showAdvanceDatePicker && (
            <View style={styles.monthPickerWrap}>
              <DateTimePicker
                value={dayjs(advanceDate).toDate()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onAdvanceDatePick}
              />
              {Platform.OS === 'ios' && (
                <Pressable style={styles.doneBtn} onPress={() => setShowAdvanceDatePicker(false)}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
        <View style={styles.advanceTypeRow}>
          <Pressable style={[styles.advanceTypeChip, entryType === 'advance' ? styles.advanceTypeChipActive : undefined]} onPress={() => setEntryType('advance')}>
            <Text style={[styles.advanceTypeText, entryType === 'advance' ? styles.advanceTypeTextActive : undefined]}>Advance</Text>
          </Pressable>
          <Pressable style={[styles.advanceTypeChip, entryType === 'loan' ? styles.advanceTypeChipActive : undefined]} onPress={() => setEntryType('loan')}>
            <Text style={[styles.advanceTypeText, entryType === 'loan' ? styles.advanceTypeTextActive : undefined]}>Loan</Text>
          </Pressable>
        </View>
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Field label="Notes (Optional)" value={notes} onChangeText={setNotes} placeholder="Remarks" />

        <Text style={styles.advancePickLabel}>Select Staff</Text>
        <View style={styles.advanceEmployeeWrap}>
          {employees.map(emp => {
            const selected = employeeId === emp.id;
            return (
              <Pressable
                key={emp.id}
                style={[styles.advanceEmpChip, selected ? styles.advanceEmpChipSelected : undefined]}
                onPress={() => setEmployeeId(emp.id)}>
                <Text style={[styles.advanceEmpChipText, selected ? styles.advanceEmpChipTextSelected : undefined]}>
                  {emp.employeeCode ? `${emp.employeeCode} - ` : ''}
                  {emp.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton title={saving ? 'Saving...' : 'Save Entry'} onPress={onSave} loading={saving} />
        <Text style={styles.advanceMetaText}>Total Entered This Month: {shortCurrency(totalEntered)}</Text>
        <Text style={styles.helperText}>This amount is auto-deducted when salary is generated at month end.</Text>
      </Card>

        <Card>
          <Text style={styles.sectionTitle}>Recent Entries</Text>
          <TableFrame>
            <View style={styles.tableHeaderRow}>
              <TableCell text="Date" width={110} header />
              <TableCell text="Type" width={90} header />
              <TableCell text="Staff" width={180} header />
              <TableCell text="Amount" width={120} header />
              <TableCell text="Notes" width={180} header />
            </View>
            {advances.slice(0, 80).map(entry => {
              const employee = employees.find(emp => emp.id === entry.employeeId);
              return (
                <View key={entry.id} style={styles.tableRow}>
                  <TableCell text={formatDisplayDate(entry.paidAt)} width={110} />
                  <TableCell text={entry.type.toUpperCase()} width={90} />
                  <TableCell text={employee?.name ?? entry.employeeId} width={180} />
                  <TableCell text={shortCurrency(entry.amount)} width={120} />
                  <TableCell text={entry.notes || '-'} width={180} />
                </View>
              );
            })}
          </TableFrame>
        </Card>
      </ScrollView>
    </View>
  );
}

function SalaryMonthwiseReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [month, setMonth] = useState(currentMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: rows = [], isLoading } = useGetMonthlySalaryQuery({ shopId, month }, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; code: string; designation: string }>();
    employees.forEach(emp => map.set(emp.id, { name: emp.name, code: emp.employeeCode ?? '-', designation: emp.designation }));
    return map;
  }, [employees]);

  const paidCount = useMemo(() => rows.filter(row => !!row.salaryPaidAt).length, [rows]);
  const pendingCount = Math.max(0, rows.length - paidCount);
  const paidAmount = useMemo(() => rows.filter(row => !!row.salaryPaidAt).reduce((acc, row) => acc + row.netSalary, 0), [rows]);
  const pendingAmount = useMemo(() => rows.filter(row => !row.salaryPaidAt).reduce((acc, row) => acc + row.netSalary, 0), [rows]);

  const onExportPdf = async () => {
    if (rows.length === 0) {
      Alert.alert('No Data', 'No salary rows available for selected month.');
      return;
    }
    const htmlRows = rows
      .map(row => {
        const employee = employeeById.get(row.employeeId);
        return `<tr><td>${safeHtml(month)}</td><td>${safeHtml(employee?.code ?? '-')}</td><td>${safeHtml(
          employee?.name ?? row.employeeId,
        )}</td><td>${safeHtml(employee?.designation ?? '-')}</td><td>${safeHtml(
          shortCurrency(row.grossSalary ?? row.netSalary),
        )}</td><td>${safeHtml(shortCurrency(row.advanceDeduction ?? 0))}</td><td>${safeHtml(
          shortCurrency(row.netSalary),
        )}</td><td>${safeHtml(row.salaryPaidAt ? 'PAID' : 'PENDING')}</td></tr>`;
      })
      .join('');
    const html = buildReportHtml(
      'Salary Report - Monthwise',
      [`Month: ${month}`, `Rows: ${rows.length}`],
      ['Month', 'Code', 'Staff', 'Role', 'Gross', 'Deduction', 'Net', 'Status'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: 'salary_monthwise',
      label: 'Salary Monthwise',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Salary Report Monthwise" onClose={() => navigation.goBack()} />

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
        <SummaryCard label="Pending Staff Nos" value={`${pendingCount}`} tone="amber" />
        <SummaryCard label="Paid Amount" value={shortCurrency(paidAmount)} tone="green" />
        <SummaryCard label="Pending Amount" value={shortCurrency(pendingAmount)} tone="amber" />
      </View>

        <Card>
          <View style={styles.reportActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.reportActionBtn, pressed && !exporting ? styles.reportActionBtnPressed : undefined]}
            onPress={onExportPdf}
            disabled={exporting}>
            <Text style={styles.reportActionBtnText}>{exporting ? 'Generating PDF...' : 'Generate PDF'}</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionTitle}>Salary Table</Text>
          <TableFrame>
            <View style={styles.tableHeaderRow}>
              <TableCell text="Month" width={90} header />
              <TableCell text="Code" width={90} header />
              <TableCell text="Staff" width={170} header />
              <TableCell text="Role" width={120} header />
              <TableCell text="Gross" width={110} header />
              <TableCell text="Deduction" width={110} header />
              <TableCell text="Net" width={110} header />
              <TableCell text="Status" width={90} header />
            </View>
            {rows.map(item => {
              const employee = employeeById.get(item.employeeId);
              return (
                <View key={item.id} style={styles.tableRow}>
                  <TableCell text={month} width={90} />
                  <TableCell text={employee?.code ?? '-'} width={90} />
                  <TableCell text={employee?.name ?? item.employeeId} width={170} />
                  <TableCell text={employee?.designation ?? '-'} width={120} />
                  <TableCell text={shortCurrency(item.grossSalary ?? item.netSalary)} width={110} />
                  <TableCell text={shortCurrency(item.advanceDeduction ?? 0)} width={110} />
                  <TableCell text={shortCurrency(item.netSalary)} width={110} />
                  <TableCell text={item.salaryPaidAt ? 'PAID' : 'PENDING'} width={90} />
                </View>
              );
            })}
          </TableFrame>
        <Text style={styles.sectionCount}>{isLoading ? 'Loading...' : `${rows.length} salary rows in ${month}`}</Text>
      </Card>
      </ScrollView>
    </View>
  );
}

function AllEmployeeSalaryReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [month, setMonth] = useState(currentMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: rows = [], isLoading } = useGetMonthlySalaryQuery({ shopId, month }, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; code: string; designation: string }>();
    employees.forEach(emp => map.set(emp.id, { name: emp.name, code: emp.employeeCode ?? '-', designation: emp.designation }));
    return map;
  }, [employees]);

  const onExportPdf = async () => {
    if (rows.length === 0) {
      Alert.alert('No Data', 'No salary rows available for selected month.');
      return;
    }
    const htmlRows = rows
      .map(item => {
        const employee = employeeById.get(item.employeeId);
        return `<tr><td>${safeHtml(employee?.code ?? '-')}</td><td>${safeHtml(employee?.name ?? item.employeeId)}</td><td>${safeHtml(
          employee?.designation ?? '-',
        )}</td><td>${safeHtml(shortCurrency(item.grossSalary ?? item.netSalary))}</td><td>${safeHtml(
          shortCurrency(item.advanceDeduction ?? 0),
        )}</td><td>${safeHtml(shortCurrency(item.netSalary))}</td><td>${safeHtml(item.salaryPaidAt ? 'PAID' : 'PENDING')}</td></tr>`;
      })
      .join('');
    const html = buildReportHtml(
      'All Employee Salary Report',
      [`Month: ${month}`, `Rows: ${rows.length}`],
      ['Code', 'Staff', 'Role', 'Gross', 'Deduction', 'Net', 'Status'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: 'salary_all_staff',
      label: 'All Employee Salary',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="All Employee Salary Report" onClose={() => navigation.goBack()} />
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

        <Card>
        <View style={styles.reportActionsRow}>
          <Pressable
            style={({ pressed }) => [styles.reportActionBtn, pressed && !exporting ? styles.reportActionBtnPressed : undefined]}
            onPress={onExportPdf}
            disabled={exporting}>
            <Text style={styles.reportActionBtnText}>{exporting ? 'Generating PDF...' : 'Generate PDF'}</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionTitle}>Salary Table</Text>
        <Text style={styles.sectionCount}>{isLoading ? 'Loading salary rows...' : `${rows.length} rows`}</Text>
          <TableFrame>
            <View style={styles.tableHeaderRow}>
              <TableCell text="Code" width={90} header />
              <TableCell text="Staff" width={170} header />
              <TableCell text="Role" width={120} header />
              <TableCell text="Gross" width={110} header />
              <TableCell text="Deduction" width={110} header />
              <TableCell text="Net" width={110} header />
              <TableCell text="Status" width={90} header />
            </View>
            {rows.map(item => {
              const employee = employeeById.get(item.employeeId);
              return (
                <View key={item.id} style={styles.tableRow}>
                  <TableCell text={employee?.code ?? '-'} width={90} />
                  <TableCell text={employee?.name ?? item.employeeId} width={170} />
                  <TableCell text={employee?.designation ?? '-'} width={120} />
                  <TableCell text={shortCurrency(item.grossSalary ?? item.netSalary)} width={110} />
                  <TableCell text={shortCurrency(item.advanceDeduction ?? 0)} width={110} />
                  <TableCell text={shortCurrency(item.netSalary)} width={110} />
                  <TableCell text={item.salaryPaidAt ? 'PAID' : 'PENDING'} width={90} />
                </View>
              );
            })}
          </TableFrame>
        {!isLoading && rows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No Salary Rows</Text>
            <Text style={styles.emptySub}>Generate salary first for selected month.</Text>
          </View>
        ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

function IndividualSalaryAnnualReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [employeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(dayjs().format('YYYY'));
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [rows, setRows] = useState<SalaryMonthly[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });

  const selectedEmployee = useMemo(() => employees.find(emp => emp.id === employeeId), [employees, employeeId]);

  const fetchAnnual = useCallback(async (targetYear: string, targetEmployeeId: string) => {
    if (!shopId || !targetEmployeeId) {
      setRows([]);
      return;
    }
    try {
      setLoading(true);
      const start = `${targetYear}-01`;
      const end = `${targetYear}-12`;
      const snap = await salaryCol(shopId)
        .where('month', '>=', start)
        .where('month', '<=', end)
        .get();
      const data = snap.docs
        .map(doc => doc.data() as SalaryMonthly)
        .filter(row => row.employeeId === targetEmployeeId)
        .sort((a, b) => a.month.localeCompare(b.month));
      setRows(data);
    } catch (error) {
      Alert.alert('Load failed', (error as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchAnnual(year, employeeId).catch(() => {
      // handled in fetchAnnual
    });
  }, [employeeId, fetchAnnual, year]);

  const annualNet = useMemo(() => rows.reduce((acc, row) => acc + row.netSalary, 0), [rows]);

  const onExportPdf = async () => {
    if (!selectedEmployee) {
      Alert.alert('Select Staff', 'Please select a staff member first.');
      return;
    }
    if (rows.length === 0) {
      Alert.alert('No Data', 'No annual salary rows available for selected employee.');
      return;
    }
    const htmlRows = rows
      .map(
        row =>
          `<tr><td>${safeHtml(row.month)}</td><td>${safeHtml(shortCurrency(row.grossSalary ?? row.netSalary))}</td><td>${safeHtml(
            shortCurrency(row.advanceDeduction ?? 0),
          )}</td><td>${safeHtml(shortCurrency(row.netSalary))}</td><td>${safeHtml(row.salaryPaidAt ? 'PAID' : 'PENDING')}</td></tr>`,
      )
      .join('');
    const html = buildReportHtml(
      `Individual Salary Annual Report - ${selectedEmployee.name}`,
      [`Year: ${year}`, `Staff Code: ${selectedEmployee.employeeCode ?? '-'}`, `Rows: ${rows.length}`],
      ['Month', 'Gross', 'Deduction', 'Net', 'Status'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: `salary_annual_${selectedEmployee.id}_${year}`,
      label: 'Individual Salary Annual',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Individual Salary Annual" onClose={() => navigation.goBack()} />

        <Card>
        <Text style={styles.sectionTitle}>Select Year and Staff</Text>
        <Pressable style={({ pressed }) => [styles.monthButton, pressed && styles.monthButtonPressed]} onPress={() => setShowYearPicker(true)}>
          <Text style={styles.monthText}>{year}</Text>
        </Pressable>

        {showYearPicker && (
          <View style={styles.monthPickerWrap}>
            <DateTimePicker
              value={dayjs(`${year}-01-01`).toDate()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') {
                  setShowYearPicker(false);
                }
                if (event.type !== 'set' || !selectedDate) {
                  return;
                }
                setYear(dayjs(selectedDate).format('YYYY'));
              }}
            />
            {Platform.OS === 'ios' && (
              <Pressable style={styles.doneBtn} onPress={() => setShowYearPicker(false)}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.advancePickLabel}>Select Staff</Text>
        <View style={styles.advanceEmployeeWrap}>
          {employees.map(emp => {
            const selected = employeeId === emp.id;
            return (
              <Pressable
                key={emp.id}
                style={[styles.advanceEmpChip, selected ? styles.advanceEmpChipSelected : undefined]}
                onPress={() => setEmployeeId(emp.id)}>
                <Text style={[styles.advanceEmpChipText, selected ? styles.advanceEmpChipTextSelected : undefined]}>
                  {emp.employeeCode ? `${emp.employeeCode} - ` : ''}
                  {emp.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
        <Text style={styles.sectionTitle}>Annual Salary Report</Text>
        <Text style={styles.helperText}>{selectedEmployee ? `${selectedEmployee.name} (${year})` : 'Select staff to view annual report.'}</Text>
        <Text style={styles.sectionCount}>{loading ? 'Loading...' : `Months: ${rows.length} | Net: ${shortCurrency(annualNet)}`}</Text>

          <TableFrame>
            <View style={styles.tableHeaderRow}>
              <TableCell text="Month" width={90} header />
              <TableCell text="Gross" width={120} header />
              <TableCell text="Deduction" width={120} header />
              <TableCell text="Net" width={120} header />
              <TableCell text="Status" width={90} header />
            </View>
            {rows.map(row => (
              <View key={row.id} style={styles.tableRow}>
                <TableCell text={row.month} width={90} />
                <TableCell text={shortCurrency(row.grossSalary ?? row.netSalary)} width={120} />
                <TableCell text={shortCurrency(row.advanceDeduction ?? 0)} width={120} />
                <TableCell text={shortCurrency(row.netSalary)} width={120} />
                <TableCell text={row.salaryPaidAt ? 'PAID' : 'PENDING'} width={90} />
              </View>
            ))}
          </TableFrame>
        </Card>
      </ScrollView>
    </View>
  );
}

function AdvancePaidReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [month, setMonth] = useState(currentMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: advances = [], isLoading } = useGetEmployeeAdvancesQuery({ shopId, month }, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; code: string }>();
    employees.forEach(emp => map.set(emp.id, { name: emp.name, code: emp.employeeCode ?? '-' }));
    return map;
  }, [employees]);

  const total = useMemo(() => advances.reduce((acc, entry) => acc + Number(entry.amount || 0), 0), [advances]);

  const onExportPdf = async () => {
    if (advances.length === 0) {
      Alert.alert('No Data', 'No advance rows available for selected month.');
      return;
    }
    const htmlRows = advances
      .map(entry => {
        const employee = employeeById.get(entry.employeeId);
        return `<tr><td>${safeHtml(formatDisplayDate(entry.paidAt))}</td><td>${safeHtml(entry.type.toUpperCase())}</td><td>${safeHtml(
          employee?.code ?? '-',
        )}</td><td>${safeHtml(employee?.name ?? entry.employeeId)}</td><td>${safeHtml(shortCurrency(entry.amount))}</td></tr>`;
      })
      .join('');
    const html = buildReportHtml(
      'Advance Paid Report',
      [`Month: ${month}`, `Entries: ${advances.length}`, `Total: ${shortCurrency(total)}`],
      ['Date', 'Type', 'Code', 'Staff', 'Amount'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: 'advance_paid_report',
      label: 'Advance Paid',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Advance Paid Report" onClose={() => navigation.goBack()} />

        <Card>
        <View style={styles.monthRow}>
          <View style={styles.monthFieldWrap}>
            <Text style={styles.monthLabel}>Month</Text>
            <Pressable style={({ pressed }) => [styles.monthButton, pressed && styles.monthButtonPressed]} onPress={() => setShowMonthPicker(true)}>
              <Text style={styles.monthText}>{month}</Text>
            </Pressable>
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

        <Text style={styles.sectionCount}>{isLoading ? 'Loading...' : `Entries: ${advances.length} | Total: ${shortCurrency(total)}`}</Text>
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
        <Text style={styles.sectionTitle}>Advance / Loan Table</Text>
          <TableFrame>
            <View style={styles.tableHeaderRow}>
              <TableCell text="Date" width={100} header />
              <TableCell text="Type" width={90} header />
              <TableCell text="Code" width={90} header />
              <TableCell text="Staff" width={180} header />
              <TableCell text="Amount" width={120} header />
            </View>
            {advances.map(entry => {
              const employee = employeeById.get(entry.employeeId);
              return (
                <View key={entry.id} style={styles.tableRow}>
                  <TableCell text={formatDisplayDate(entry.paidAt)} width={100} />
                  <TableCell text={entry.type.toUpperCase()} width={90} />
                  <TableCell text={employee?.code ?? '-'} width={90} />
                  <TableCell text={employee?.name ?? entry.employeeId} width={180} />
                  <TableCell text={shortCurrency(entry.amount)} width={120} />
                </View>
              );
            })}
          </TableFrame>
        </Card>
      </ScrollView>
    </View>
  );
}

function MonthlyAttendanceReportScreen({ navigation }: { navigation: any }) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const [fromDate, setFromDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [toDate, setToDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [pickerMode, setPickerMode] = useState<'from' | 'to' | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: rows = [], isLoading } = useGetAttendanceReportQuery(
    { shopId, fromDate, toDate },
    { skip: !shopId || !isValidDateRange(fromDate, toDate) },
  );
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; designation: string }>();
    employees.forEach(emp => map.set(emp.id, { name: emp.name, designation: emp.designation }));
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

  const onExportPdf = async () => {
    if (rows.length === 0) {
      Alert.alert('No Data', 'No attendance rows available for selected duration.');
      return;
    }
    const htmlRows = rows
      .map(row => {
        const employee = employeeById.get(row.employeeId);
        return `<tr><td>${safeHtml(formatDisplayDate(row.date))}</td><td>${safeHtml(
          employee?.name ?? row.employeeId,
        )}</td><td>${safeHtml(employee?.designation ?? '-')}</td><td>${safeHtml(
          attendanceStatusLabel(row.status),
        )}</td><td>${safeHtml(row.source ?? 'manual')}</td><td>${safeHtml(formatDisplayDateTime24H(row.punchTime))}</td></tr>`;
      })
      .join('');
    const html = buildReportHtml(
      'Monthly Attendance Report',
      [`Duration: ${fromDate} to ${toDate}`, `Rows: ${rows.length}`],
      ['Date', 'Staff', 'Role', 'Status', 'Source', 'Punch Time'],
      htmlRows,
    );
    await exportPdfReport({
      filePrefix: 'monthly_attendance_report',
      label: 'Monthly Attendance',
      html,
      setExporting,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Monthly Attendance Report" onClose={() => navigation.goBack()} />

        <Card>
          <Text style={styles.sectionTitle}>Select 2 Dates</Text>
          <View style={styles.dateRow}>
            <DatePickField label="From" value={fromDate} onPress={() => setPickerMode('from')} />
            <DatePickField label="To" value={toDate} onPress={() => setPickerMode('to')} />
          </View>
          {!isValidDateRange(fromDate, toDate) ? (
            <Text style={styles.rangeError}>Invalid range. Please keep From {'<='} To.</Text>
          ) : null}
        </Card>

        <View style={styles.summaryRow}>
          <SummaryCard label="Rows" value={`${summary.total}`} tone="slate" />
          <SummaryCard label="Present" value={`${summary.present}`} tone="green" />
          <SummaryCard label="Absent" value={`${summary.absent}`} tone="amber" />
          <SummaryCard label="Late" value={`${summary.late}`} tone="blue" />
          <SummaryCard label="Half Day" value={`${summary.half_day}`} tone="slate" />
          <SummaryCard label="Leave" value={`${summary.leave}`} tone="amber" />
        </View>

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
          <Text style={styles.sectionCount}>{isLoading ? 'Loading attendance rows...' : `${rows.length} rows`}</Text>
          <TableFrame>
              <View style={styles.tableHeaderRow}>
                <TableCell text="Date" width={105} header />
                <TableCell text="Staff" width={170} header />
                <TableCell text="Role" width={120} header />
                <TableCell text="Status" width={95} header />
                <TableCell text="Source" width={90} header />
                <TableCell text="Punch" width={160} header />
              </View>
              {rows.map(item => {
                const employee = employeeById.get(item.employeeId);
                return (
                  <View key={item.id} style={styles.tableRow}>
                    <TableCell text={formatDisplayDate(item.date)} width={105} />
                    <TableCell text={employee?.name ?? item.employeeId} width={170} />
                    <TableCell text={employee?.designation ?? '-'} width={120} />
                    <TableCell text={attendanceStatusLabel(item.status)} width={95} />
                    <TableCell text={item.source ?? 'manual'} width={90} />
                    <TableCell text={formatDisplayDateTime24H(item.punchTime)} width={160} />
                  </View>
                );
              })}
          </TableFrame>
          {!isLoading && rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Attendance Rows</Text>
              <Text style={styles.emptySub}>No rows found for selected duration.</Text>
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {pickerMode ? (
        <DateTimePicker
          value={dayjs(pickerMode === 'from' ? fromDate : toDate).toDate()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selectedDate) => {
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
          }}
        />
      ) : null}
    </View>
  );
}

function ScreenHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.formHeader}>
      <Text style={styles.formTitle}>{title}</Text>
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

function ActionTile({
  icon,
  tone,
  title,
  onPress,
}: {
  icon: string;
  tone: 'emerald' | 'amber' | 'blue' | 'teal' | 'violet' | 'red' | 'sky';
  title: string;
  onPress: () => void;
}) {
  const palette = salaryActionPalette(tone);
  return (
    <Pressable style={({ pressed }) => [styles.actionSquare, pressed && styles.actionSquarePressed]} onPress={onPress}>
      <View style={[styles.actionIconWrap, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <Text style={[styles.actionIconText, { color: palette.fg }]}>{icon}</Text>
      </View>
      <Text style={styles.actionSquareText}>{title}</Text>
    </Pressable>
  );
}

function salaryActionPalette(tone: 'emerald' | 'amber' | 'blue' | 'teal' | 'violet' | 'red' | 'sky') {
  const palette = {
    emerald: { bg: '#e8fbf2', border: '#bfead4', fg: '#0f9f63' },
    amber: { bg: '#fff4df', border: '#f6ddac', fg: '#b7791f' },
    blue: { bg: '#eaf1ff', border: '#c8d8ff', fg: '#1d4ed8' },
    teal: { bg: '#e6f8f8', border: '#bae9e9', fg: '#0f766e' },
    violet: { bg: '#f2ecff', border: '#d9c7ff', fg: '#6d28d9' },
    red: { bg: '#ffefef', border: '#f7c7c7', fg: '#b42323' },
    sky: { bg: '#e9f8ff', border: '#bfe9fb', fg: '#0369a1' },
  } as const;
  return palette[tone];
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
      <Text style={[styles.summaryValue, { color: palette[tone].fg }]} numberOfLines={1}>
        {value}
      </Text>
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

function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.tableFrame}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.tableFrameInner}>
        <ScrollView nestedScrollEnabled style={styles.tableVerticalScroll}>
          {children}
        </ScrollView>
      </ScrollView>
    </View>
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

function isValidDateRange(fromDate: string, toDate: string) {
  const from = dayjs(fromDate);
  const to = dayjs(toDate);
  return from.isValid() && to.isValid() && !from.isAfter(to);
}

function attendanceStatusLabel(status: AttendanceStatus) {
  if (status === 'half_day') {
    return 'Half Day';
  }
  if (status === 'leave') {
    return 'Leave';
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
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

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerBlock: {
    gap: 10,
  },
  banner: {
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
  headerGradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b8f6d',
  },
  headerGradientMid: {
    ...StyleSheet.absoluteFillObject,
    top: '34%',
    backgroundColor: '#0a7e60',
  },
  headerGradientGlowTop: {
    position: 'absolute',
    top: -90,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#3ac39f',
    opacity: 0.34,
  },
  headerGradientGlowBottom: {
    position: 'absolute',
    bottom: -105,
    left: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#06644d',
    opacity: 0.5,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 33,
    fontWeight: '900',
  },
  bannerSub: {
    color: '#d7fff1',
    fontSize: 15,
    fontWeight: '700',
  },
  bannerDivider: {
    height: 1,
    backgroundColor: '#62c7ab',
    marginVertical: 6,
  },
  bannerSection: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 20,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
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
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionSquare: {
    width: '48%',
    minHeight: 120,
    borderWidth: 1.5,
    borderColor: '#cfd9e6',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 1,
  },
  actionSquarePressed: {
    backgroundColor: '#f2f8fd',
    borderColor: '#b7c8de',
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3f9',
    borderWidth: 1,
    borderColor: '#d8e2ed',
  },
  actionIconText: {
    color: '#334155',
    fontSize: 18,
    fontWeight: '800',
  },
  actionSquareText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
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
  entryDateWrap: {
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
  helperText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 18,
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
  tableHeaderRow: {
    flexDirection: 'row',
  },
  tableRow: {
    flexDirection: 'row',
  },
  compactTableHeaderRow: {
    flexDirection: 'row',
  },
  compactTableRow: {
    flexDirection: 'row',
  },
  compactTableCell: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    backgroundColor: '#fff',
    minHeight: 42,
  },
  compactTableHeaderCell: {
    backgroundColor: '#f1f5f9',
  },
  compactNameCol: {
    flex: 1.8,
  },
  compactPayableCol: {
    flex: 1.15,
  },
  compactGivenCol: {
    flex: 0.9,
  },
  compactTableText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  compactTableHeaderText: {
    fontWeight: '800',
    fontSize: 11,
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
  tableFrame: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  tableFrameInner: {
    minWidth: '100%',
  },
  tableVerticalScroll: {
    maxHeight: 360,
  },
  rowActionCell: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  rowActionBtn: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cde5da',
    backgroundColor: '#e8f9f1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rowActionText: {
    color: '#0a7a5b',
    fontWeight: '800',
    fontSize: 11,
  },
  btnDisabled: {
    opacity: 0.6,
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
  advanceMetaText: {
    color: colors.textMuted,
    fontWeight: '700',
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
  sectionCount: {
    color: colors.textPrimary,
    fontWeight: '700',
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

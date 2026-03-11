import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import RNFS from 'react-native-fs';
import * as RNHTMLtoPDF from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import XLSX from 'xlsx';
import { Card, Screen, ValueRow } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useGetAttendanceReportQuery,
  useGetEmployeeAdvancesQuery,
  useGetEmployeesQuery,
  useGetSalaryReportQuery,
  useGetShiftsQuery,
  useGetWeeklyShiftPlanQuery,
} from '../../store/hrmsApi';
import { currentMonth, formatDisplayDate, formatDisplayDateTime24H, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';

type PickerMode = 'fromDate' | 'toDate' | 'month' | 'weekStart' | null;

interface GeneratedFile {
  label: string;
  path: string;
}

export function ReportsScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';

  const [fromDate, setFromDate] = useState(`${currentMonth()}-01`);
  const [toDate, setToDate] = useState(dayjs(`${currentMonth()}-01`).endOf('month').format('YYYY-MM-DD'));
  const [month, setMonth] = useState(currentMonth());
  const [weekStartDate, setWeekStartDate] = useState(dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'));
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [exporting, setExporting] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: attendance = [], isLoading: loadingAttendance } = useGetAttendanceReportQuery(
    { shopId, fromDate, toDate },
    { skip: !shopId || !isValidRange(fromDate, toDate) },
  );
  const { data: salaries = [], isLoading: loadingSalary } = useGetSalaryReportQuery({ shopId, month }, { skip: !shopId });
  const { data: advances = [], isLoading: loadingAdvances } = useGetEmployeeAdvancesQuery({ shopId, month }, { skip: !shopId });
  const { data: shifts = [], isLoading: loadingShifts } = useGetShiftsQuery(shopId, { skip: !shopId });
  const { data: weeklyPlans = [], isLoading: loadingWeeklyPlans } = useGetWeeklyShiftPlanQuery(
    { shopId, weekStartDate },
    { skip: !shopId || !weekStartDate },
  );

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; designation: string; code: string }>();
    employees.forEach(employee =>
      map.set(employee.id, {
        name: employee.name,
        designation: employee.designation,
        code: employee.employeeCode ?? '',
      }),
    );
    return map;
  }, [employees]);

  const shiftById = useMemo(() => {
    const map = new Map<string, { name: string; startTime: string; endTime: string }>();
    shifts.forEach(shift => map.set(shift.id, { name: shift.name, startTime: shift.startTime, endTime: shift.endTime }));
    return map;
  }, [shifts]);

  const attendanceSummary = useMemo(
    () =>
      attendance.reduce(
        (acc, item) => {
          acc[item.status] += 1;
          return acc;
        },
        { present: 0, absent: 0, late: 0, half_day: 0, leave: 0 },
      ),
    [attendance],
  );

  const salarySummary = useMemo(
    () =>
      salaries.reduce(
        (acc, item) => {
          acc.net += item.netSalary;
          acc.gross += item.grossSalary ?? item.netSalary;
          acc.advanceDeduction += item.advanceDeduction ?? 0;
          acc.paid += item.salaryPaidAt ? 1 : 0;
          acc.pending += item.salaryPaidAt ? 0 : 1;
          return acc;
        },
        { net: 0, gross: 0, advanceDeduction: 0, paid: 0, pending: 0 },
      ),
    [salaries],
  );

  const advanceSummary = useMemo(
    () =>
      advances.reduce(
        (acc, item) => {
          acc.total += item.amount;
          if (item.type === 'advance') {
            acc.advance += item.amount;
          } else {
            acc.loan += item.amount;
          }
          return acc;
        },
        { total: 0, advance: 0, loan: 0 },
      ),
    [advances],
  );

  const weeklyPlanSummary = useMemo(
    () => ({
      rows: weeklyPlans.length,
      assignedEmployees: new Set(weeklyPlans.map(item => item.employeeId)).size,
    }),
    [weeklyPlans],
  );

  const onPickDate = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setPickerMode(null);
    }
    if (event.type !== 'set' || !selectedDate || !pickerMode) {
      return;
    }

    if (pickerMode === 'month') {
      setMonth(dayjs(selectedDate).format('YYYY-MM'));
    } else if (pickerMode === 'fromDate') {
      setFromDate(dayjs(selectedDate).format('YYYY-MM-DD'));
    } else if (pickerMode === 'toDate') {
      setToDate(dayjs(selectedDate).format('YYYY-MM-DD'));
    } else {
      setWeekStartDate(dayjs(selectedDate).format('YYYY-MM-DD'));
    }
  };

  const exportAttendanceExcel = async () => {
    const rows = attendance.map(item => ({
      Date: dayjs(item.date).isValid() ? dayjs(item.date).format('DD.MM.YYYY') : item.date,
      StaffCode: employeeById.get(item.employeeId)?.code ?? '-',
      Staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
      Designation: employeeById.get(item.employeeId)?.designation ?? '-',
      Status: item.status,
      Source: item.source ?? 'manual',
      PunchTime: formatDisplayDateTime24H(item.punchTime),
    }));
    await exportExcel('Attendance Excel', `attendance_${fromDate}_to_${toDate}`, 'Attendance', rows);
  };

  const exportSalaryExcel = async () => {
    const rows = salaries.map(item => ({
      StaffCode: employeeById.get(item.employeeId)?.code ?? '-',
      Staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
      Present: item.presentDays,
      Leave: item.leaveDays ?? 0,
      Absent: item.absentDays,
      Late: item.lateEntries,
      GrossSalary: item.grossSalary ?? item.netSalary,
      AdvanceDeduction: item.advanceDeduction ?? 0,
      NetSalary: item.netSalary,
      Status: item.salaryPaidAt ? 'PAID' : 'PENDING',
    }));
    await exportExcel('Salary Excel', `salary_${month}`, 'Salary', rows);
  };

  const exportAdvancesExcel = async () => {
    const rows = advances.map(item => ({
      Date: dayjs(item.paidAt).isValid() ? dayjs(item.paidAt).format('DD.MM.YYYY') : item.paidAt,
      StaffCode: employeeById.get(item.employeeId)?.code ?? '-',
      Staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
      Type: item.type,
      Amount: item.amount,
      Notes: item.notes ?? '-',
    }));
    await exportExcel('Advance Excel', `advance_${month}`, 'Advance', rows);
  };

  const exportStaffExcel = async () => {
    const rows = employees.map(item => ({
      StaffCode: item.employeeCode ?? '-',
      Name: item.name,
      Phone: item.phone,
      Designation: item.designation,
      Status: item.status,
      BiometricUserId: item.biometricUserId ?? '-',
      JoiningDate: formatDisplayDate(item.joiningDate),
      ActiveDate: item.activatedAt ? formatDisplayDate(item.activatedAt) : '-',
      InactiveDate: item.deactivatedAt ? formatDisplayDate(item.deactivatedAt) : '-',
    }));
    await exportExcel('Staff Excel', `staff_${todayDate()}`, 'Staff', rows);
  };

  const exportShiftPlanExcel = async () => {
    const rows = weeklyPlans.map(item => ({
      WeekStartDate: item.weekStartDate,
      Day: item.dayOfWeek.toUpperCase(),
      StaffCode: employeeById.get(item.employeeId)?.code ?? '-',
      Staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
      Shift: shiftById.get(item.shiftId)?.name ?? item.shiftId,
      ShiftTime: shiftById.get(item.shiftId)
        ? `${shiftById.get(item.shiftId)?.startTime}-${shiftById.get(item.shiftId)?.endTime}`
        : '-',
    }));
    await exportExcel('Shift Plan Excel', `shift_plan_${weekStartDate}`, 'ShiftPlan', rows);
  };

  const exportAttendancePdf = async () => {
    await exportPdf('attendance_report', 'Attendance Report', buildAttendanceHtml(attendance, employeeById));
  };

  const exportSalaryPdf = async () => {
    await exportPdf('salary_report', 'Salary Report', buildSalaryHtml(salaries, employeeById));
  };

  const exportCompletePdf = async () => {
    const html = buildCompleteHtml({
      fromDate,
      toDate,
      month,
      weekStartDate,
      attendance,
      salaries,
      advances,
      weeklyPlans,
      employeeById,
      shiftById,
      attendanceSummary,
      salarySummary,
      advanceSummary,
    });
    await exportPdf('complete_report', 'Complete Report', html);
  };

  const exportExcel = async (
    label: string,
    fileName: string,
    sheetName: string,
    rows: Record<string, string | number>[],
  ) => {
    setExporting(true);
    try {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      const excelData = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}.xlsx`;
      await RNFS.writeFile(filePath, excelData, 'base64');
      await pushFile(label, filePath);
      Alert.alert('Exported', `${label} saved successfully.`);
    } catch (error) {
      Alert.alert('Export failed', (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async (fileName: string, label: string, html: string) => {
    setExporting(true);
    try {
      const pdf = await RNHTMLtoPDF.generatePDF({
        html,
        fileName: `${fileName}_${Date.now()}`,
        directory: 'Documents',
      });
      if (!pdf.filePath) {
        throw new Error('Unable to create PDF file.');
      }
      await pushFile(label, pdf.filePath);
      Alert.alert('Exported', `${label} PDF saved successfully.`);
    } catch (error) {
      Alert.alert('Export failed', (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const pushFile = async (label: string, path: string) => {
    setGeneratedFiles(prev => [{ label, path }, ...prev.filter(item => item.path !== path)]);
  };

  const shareFile = async (path: string) => {
    try {
      await Share.open({
        url: `file://${path}`,
        failOnCancel: false,
      });
    } catch (error) {
      Alert.alert('Share failed', (error as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Reports Center</Text>
          <Text style={styles.subtitle}>Excel-style table reports for attendance, salary, staff, advances and weekly shift plans.</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Filters</Text>
          <View style={styles.inputRow}>
            <DateField label="From" value={formatDisplayDate(fromDate)} onPress={() => setPickerMode('fromDate')} />
            <DateField label="To" value={formatDisplayDate(toDate)} onPress={() => setPickerMode('toDate')} />
          </View>
          <View style={styles.inputRow}>
            <DateField label="Month" value={month} onPress={() => setPickerMode('month')} />
            <DateField label="Week Start" value={formatDisplayDate(weekStartDate)} onPress={() => setPickerMode('weekStart')} />
          </View>
          {!isValidRange(fromDate, toDate) ? <Text style={styles.errorText}>Invalid date range. Please fix From/To dates.</Text> : null}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Attendance Summary</Text>
          <SummaryLine label="Rows" value={loadingAttendance ? '...' : `${attendance.length}`} />
          <SummaryLine label="Present" value={loadingAttendance ? '...' : `${attendanceSummary.present}`} />
          <SummaryLine label="Leave" value={loadingAttendance ? '...' : `${attendanceSummary.leave}`} />
          <SummaryLine label="Absent" value={loadingAttendance ? '...' : `${attendanceSummary.absent}`} />
          <SummaryLine label="Late" value={loadingAttendance ? '...' : `${attendanceSummary.late}`} />
          <SummaryLine label="Half Day" value={loadingAttendance ? '...' : `${attendanceSummary.half_day}`} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Salary Summary</Text>
          <SummaryLine label="Rows" value={loadingSalary ? '...' : `${salaries.length}`} />
          <SummaryLine label="Paid Staff" value={loadingSalary ? '...' : `${salarySummary.paid}`} />
          <SummaryLine label="Pending Staff" value={loadingSalary ? '...' : `${salarySummary.pending}`} />
          <SummaryLine label="Gross Amount" value={loadingSalary ? '...' : shortCurrency(salarySummary.gross)} />
          <SummaryLine label="Advance Deduction" value={loadingSalary ? '...' : shortCurrency(salarySummary.advanceDeduction)} />
          <SummaryLine label="Net Amount" value={loadingSalary ? '...' : shortCurrency(salarySummary.net)} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Advance / Loan Summary</Text>
          <SummaryLine label="Entries" value={loadingAdvances ? '...' : `${advances.length}`} />
          <SummaryLine label="Advance Total" value={loadingAdvances ? '...' : shortCurrency(advanceSummary.advance)} />
          <SummaryLine label="Loan Total" value={loadingAdvances ? '...' : shortCurrency(advanceSummary.loan)} />
          <SummaryLine label="Total" value={loadingAdvances ? '...' : shortCurrency(advanceSummary.total)} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Weekly Shift Plan Summary</Text>
          <SummaryLine label="Rows" value={loadingWeeklyPlans ? '...' : `${weeklyPlanSummary.rows}`} />
          <SummaryLine label="Assigned Staff" value={loadingWeeklyPlans ? '...' : `${weeklyPlanSummary.assignedEmployees}`} />
          <SummaryLine label="Shift Masters" value={loadingShifts ? '...' : `${shifts.length}`} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Attendance Table</Text>
          <ReportTable
            columns={[
              { key: 'date', title: 'Date', width: 100 },
              { key: 'code', title: 'Code', width: 95 },
              { key: 'staff', title: 'Staff', width: 170 },
              { key: 'designation', title: 'Designation', width: 120 },
              { key: 'status', title: 'Status', width: 100 },
              { key: 'source', title: 'Source', width: 90 },
            ]}
            rows={attendance.map(item => ({
              date: dayjs(item.date).isValid() ? dayjs(item.date).format('DD.MM.YYYY') : item.date,
              code: employeeById.get(item.employeeId)?.code ?? '-',
              staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
              designation: employeeById.get(item.employeeId)?.designation ?? '-',
              status: item.status,
              source: item.source ?? 'manual',
            }))}
            loading={loadingAttendance}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Salary Table</Text>
          <ReportTable
            columns={[
              { key: 'code', title: 'Code', width: 95 },
              { key: 'staff', title: 'Staff', width: 170 },
              { key: 'present', title: 'Present', width: 90 },
              { key: 'leave', title: 'Leave', width: 80 },
              { key: 'absent', title: 'Absent', width: 80 },
              { key: 'gross', title: 'Gross', width: 120 },
              { key: 'deduction', title: 'Deduction', width: 120 },
              { key: 'net', title: 'Net', width: 120 },
              { key: 'payStatus', title: 'Status', width: 100 },
            ]}
            rows={salaries.map(item => ({
              code: employeeById.get(item.employeeId)?.code ?? '-',
              staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
              present: `${item.presentDays}`,
              leave: `${item.leaveDays ?? 0}`,
              absent: `${item.absentDays}`,
              gross: shortCurrency(item.grossSalary ?? item.netSalary),
              deduction: shortCurrency(item.advanceDeduction ?? 0),
              net: shortCurrency(item.netSalary),
              payStatus: item.salaryPaidAt ? 'PAID' : 'PENDING',
            }))}
            loading={loadingSalary}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Advance / Loan Table</Text>
          <ReportTable
            columns={[
              { key: 'date', title: 'Date', width: 100 },
              { key: 'code', title: 'Code', width: 95 },
              { key: 'staff', title: 'Staff', width: 170 },
              { key: 'type', title: 'Type', width: 90 },
              { key: 'amount', title: 'Amount', width: 120 },
              { key: 'notes', title: 'Notes', width: 170 },
            ]}
            rows={advances.map(item => ({
              date: dayjs(item.paidAt).isValid() ? dayjs(item.paidAt).format('DD.MM.YYYY') : item.paidAt,
              code: employeeById.get(item.employeeId)?.code ?? '-',
              staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
              type: item.type,
              amount: shortCurrency(item.amount),
              notes: item.notes || '-',
            }))}
            loading={loadingAdvances}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Weekly Shift Plan Table</Text>
          <ReportTable
            columns={[
              { key: 'day', title: 'Day', width: 90 },
              { key: 'code', title: 'Code', width: 95 },
              { key: 'staff', title: 'Staff', width: 170 },
              { key: 'shift', title: 'Shift', width: 150 },
              { key: 'time', title: 'Time', width: 150 },
            ]}
            rows={weeklyPlans.map(item => ({
              day: item.dayOfWeek.toUpperCase(),
              code: employeeById.get(item.employeeId)?.code ?? '-',
              staff: employeeById.get(item.employeeId)?.name ?? item.employeeId,
              shift: shiftById.get(item.shiftId)?.name ?? item.shiftId,
              time: shiftById.get(item.shiftId)
                ? `${shiftById.get(item.shiftId)?.startTime}-${shiftById.get(item.shiftId)?.endTime}`
                : '-',
            }))}
            loading={loadingWeeklyPlans}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Export Reports</Text>
          <View style={styles.actionsWrap}>
            <ActionButton title="Attendance PDF" onPress={exportAttendancePdf} disabled={exporting} />
            <ActionButton title="Salary PDF" onPress={exportSalaryPdf} disabled={exporting} />
            <ActionButton title="Complete PDF" onPress={exportCompletePdf} disabled={exporting} strong />
            <ActionButton title="Attendance Excel" onPress={exportAttendanceExcel} disabled={exporting} />
            <ActionButton title="Salary Excel" onPress={exportSalaryExcel} disabled={exporting} />
            <ActionButton title="Advance Excel" onPress={exportAdvancesExcel} disabled={exporting} />
            <ActionButton title="Staff Excel" onPress={exportStaffExcel} disabled={exporting} />
            <ActionButton title="Shift Plan Excel" onPress={exportShiftPlanExcel} disabled={exporting} />
          </View>
          {exporting && <Text style={styles.exportingText}>Exporting report...</Text>}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Generated Files</Text>
          {generatedFiles.length === 0 ? (
            <Text style={styles.emptyText}>No files generated yet.</Text>
          ) : (
            <View style={styles.fileList}>
              {generatedFiles.map(file => (
                <View key={file.path} style={styles.fileRow}>
                  <View style={styles.fileTextWrap}>
                    <Text style={styles.fileLabel}>{file.label}</Text>
                    <Text style={styles.filePath} numberOfLines={2} ellipsizeMode="middle">
                      {file.path}
                    </Text>
                  </View>
                  <Pressable style={styles.shareBtn} onPress={() => shareFile(file.path)}>
                    <Text style={styles.shareBtnText}>Share</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      {pickerMode && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <DateTimePicker
              value={getPickerDate(pickerMode, fromDate, toDate, month, weekStartDate)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickDate}
            />
            {Platform.OS === 'ios' && (
              <Pressable style={styles.doneBtn} onPress={() => setPickerMode(null)}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}

function isValidRange(fromDate: string, toDate: string) {
  const from = dayjs(fromDate);
  const to = dayjs(toDate);
  return from.isValid() && to.isValid() && !from.isAfter(to);
}

function shortCurrency(value: number) {
  if (value >= 10000000) {
    return `INR ${(value / 10000000).toFixed(2)}Cr`;
  }
  if (value >= 100000) {
    return `INR ${(value / 100000).toFixed(2)}L`;
  }
  return `INR ${value.toFixed(2)}`;
}

function getPickerDate(mode: PickerMode, fromDate: string, toDate: string, month: string, weekStartDate: string) {
  if (mode === 'month') {
    return dayjs(`${month}-01`).toDate();
  }
  if (mode === 'fromDate') {
    return dayjs(fromDate || todayDate()).toDate();
  }
  if (mode === 'toDate') {
    return dayjs(toDate || todayDate()).toDate();
  }
  return dayjs(weekStartDate || todayDate()).toDate();
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]} onPress={onPress}>
        <Text style={styles.dateValue}>{value}</Text>
      </Pressable>
    </View>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <ValueRow label={label} value={value} />;
}

function ActionButton({
  title,
  onPress,
  disabled,
  strong,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  strong?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        strong ? styles.actionBtnStrong : undefined,
        pressed && !disabled ? styles.actionBtnPressed : undefined,
        disabled ? styles.actionBtnDisabled : undefined,
      ]}
      onPress={onPress}
      disabled={disabled}>
      <Text style={[styles.actionBtnText, strong ? styles.actionBtnTextStrong : undefined]}>{title}</Text>
    </Pressable>
  );
}

function ReportTable({
  columns,
  rows,
  loading,
}: {
  columns: Array<{ key: string; title: string; width: number }>;
  rows: Array<Record<string, string>>;
  loading: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableOuter}>
      <View>
        <View style={[styles.tableRow, styles.tableHeader]}>
          {columns.map(column => (
            <TableCell key={column.key} text={column.title} width={column.width} header />
          ))}
        </View>

        {loading ? (
          <View style={styles.tableLoadingWrap}>
            <Text style={styles.tableLoadingText}>Loading...</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.tableLoadingWrap}>
            <Text style={styles.tableLoadingText}>No data for selected filters.</Text>
          </View>
        ) : (
          rows.slice(0, 400).map((row, idx) => (
            <View key={`row-${idx}`} style={styles.tableRow}>
              {columns.map(column => (
                <TableCell key={`${idx}-${column.key}`} text={row[column.key] ?? '-'} width={column.width} />
              ))}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function TableCell({ text, width, header }: { text: string; width: number; header?: boolean }) {
  return (
    <View style={[styles.cell, { width }, header ? styles.headerCell : undefined]}>
      <Text style={[styles.cellText, header ? styles.headerCellText : undefined]} numberOfLines={1} ellipsizeMode="tail">
        {text}
      </Text>
    </View>
  );
}

function buildAttendanceHtml(attendance: any[], employeeById: Map<string, { name: string; designation: string; code: string }>) {
  const rows = attendance
    .map(
      item => `<tr><td>${item.date}</td><td>${safe(employeeById.get(item.employeeId)?.code ?? '-')}</td><td>${safe(
        employeeById.get(item.employeeId)?.name ?? item.employeeId,
      )}</td><td>${safe(employeeById.get(item.employeeId)?.designation ?? '-')}</td><td>${safe(item.status)}</td><td>${safe(
        item.source ?? 'manual',
      )}</td></tr>`,
    )
    .join('');
  return reportHtml('Attendance Report', ['Date', 'Code', 'Staff', 'Designation', 'Status', 'Source'], rows);
}

function buildSalaryHtml(salaries: any[], employeeById: Map<string, { name: string; designation: string; code: string }>) {
  const rows = salaries
    .map(
      item =>
        `<tr><td>${safe(employeeById.get(item.employeeId)?.code ?? '-')}</td><td>${safe(
          employeeById.get(item.employeeId)?.name ?? item.employeeId,
        )}</td><td>${item.presentDays}</td><td>${item.leaveDays ?? 0}</td><td>${item.absentDays}</td><td>${(
          item.grossSalary ?? item.netSalary
        ).toFixed(2)}</td><td>${(item.advanceDeduction ?? 0).toFixed(2)}</td><td>${item.netSalary.toFixed(2)}</td></tr>`,
    )
    .join('');
  return reportHtml(
    'Salary Report',
    ['Code', 'Staff', 'Present', 'Leave', 'Absent', 'Gross', 'Deduction', 'Net'],
    rows,
  );
}

function buildCompleteHtml(input: {
  fromDate: string;
  toDate: string;
  month: string;
  weekStartDate: string;
  attendance: any[];
  salaries: any[];
  advances: any[];
  weeklyPlans: any[];
  employeeById: Map<string, { name: string; designation: string; code: string }>;
  shiftById: Map<string, { name: string; startTime: string; endTime: string }>;
  attendanceSummary: { present: number; absent: number; late: number; half_day: number; leave: number };
  salarySummary: { net: number; gross: number; advanceDeduction: number; paid: number; pending: number };
  advanceSummary: { total: number; advance: number; loan: number };
}) {
  const attendanceRows = buildAttendanceHtml(input.attendance, input.employeeById);
  const salaryRows = buildSalaryHtml(input.salaries, input.employeeById);

  const advanceRows = input.advances
    .map(
      item =>
        `<tr><td>${safe(item.paidAt)}</td><td>${safe(input.employeeById.get(item.employeeId)?.code ?? '-')}</td><td>${safe(
          input.employeeById.get(item.employeeId)?.name ?? item.employeeId,
        )}</td><td>${safe(item.type)}</td><td>${Number(item.amount).toFixed(2)}</td></tr>`,
    )
    .join('');

  const shiftRows = input.weeklyPlans
    .map(
      item =>
        `<tr><td>${safe(item.dayOfWeek.toUpperCase())}</td><td>${safe(
          input.employeeById.get(item.employeeId)?.code ?? '-',
        )}</td><td>${safe(input.employeeById.get(item.employeeId)?.name ?? item.employeeId)}</td><td>${safe(
          input.shiftById.get(item.shiftId)?.name ?? item.shiftId,
        )}</td></tr>`,
    )
    .join('');

  return `
  <html><head>${baseCss()}</head><body>
  <h1>Complete Report</h1>
  <p><b>Attendance Range:</b> ${input.fromDate} to ${input.toDate}</p>
  <p><b>Salary Month:</b> ${input.month}</p>
  <p><b>Week Start:</b> ${input.weekStartDate}</p>
  <h2>Summary</h2>
  <ul>
    <li>Attendance: Present ${input.attendanceSummary.present}, Leave ${input.attendanceSummary.leave}, Absent ${input.attendanceSummary.absent}, Late ${input.attendanceSummary.late}, Half Day ${input.attendanceSummary.half_day}</li>
    <li>Salary: Gross INR ${input.salarySummary.gross.toFixed(2)}, Deduction INR ${input.salarySummary.advanceDeduction.toFixed(2)}, Net INR ${input.salarySummary.net.toFixed(2)}</li>
    <li>Salary Status: Paid ${input.salarySummary.paid}, Pending ${input.salarySummary.pending}</li>
    <li>Advance/Loan: Advance INR ${input.advanceSummary.advance.toFixed(2)}, Loan INR ${input.advanceSummary.loan.toFixed(2)}, Total INR ${input.advanceSummary.total.toFixed(2)}</li>
  </ul>
  ${stripHtml(attendanceRows)}
  ${stripHtml(salaryRows)}
  ${reportHtml('Advance Report', ['Date', 'Code', 'Staff', 'Type', 'Amount'], advanceRows)}
  ${reportHtml('Weekly Shift Plan', ['Day', 'Code', 'Staff', 'Shift'], shiftRows)}
  </body></html>`;
}

function reportHtml(title: string, headers: string[], bodyRows: string) {
  const head = headers.map(item => `<th>${safe(item)}</th>`).join('');
  return `
  <html><head>${baseCss()}</head><body>
  <h1>${safe(title)}</h1>
  <table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>
  </body></html>`;
}

function baseCss() {
  return `<style>
  body { font-family: Arial, sans-serif; color: #0f172a; padding: 18px; }
  h1 { margin: 0 0 12px; font-size: 24px; }
  h2 { margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #d7dee8; padding: 8px; font-size: 12px; text-align: left; }
  th { background: #eef2f7; }
  </style>`;
}

function safe(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripHtml(html: string) {
  return html.replace('<html><head>', '').replace('</head><body>', '').replace('</body></html>', '');
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 22,
  },
  headerWrap: {
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
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    gap: 6,
  },
  dateLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  dateButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dateButtonPressed: {
    backgroundColor: '#f8fafc',
  },
  dateValue: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  errorText: {
    color: '#c22a2a',
    fontWeight: '700',
    fontSize: 12,
  },
  tableOuter: {
    paddingTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeader: {
    backgroundColor: '#f1f5f9',
  },
  cell: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  headerCell: {
    backgroundColor: '#f1f5f9',
  },
  cellText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  headerCellText: {
    fontWeight: '800',
    fontSize: 11,
  },
  tableLoadingWrap: {
    borderWidth: 1,
    borderColor: '#d8e2ed',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  tableLoadingText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  actionsWrap: {
    gap: 8,
  },
  actionBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9daf7',
    backgroundColor: '#e6effd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnStrong: {
    backgroundColor: '#e8f9f1',
    borderColor: '#cde5da',
  },
  actionBtnPressed: {
    opacity: 0.9,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: '#1458bf',
    fontWeight: '800',
    fontSize: 13,
  },
  actionBtnTextStrong: {
    color: '#0a7a5b',
  },
  exportingText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fileList: {
    gap: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e6ebf2',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    padding: 10,
  },
  fileTextWrap: {
    flex: 1,
    gap: 2,
  },
  fileLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  filePath: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  shareBtn: {
    minWidth: 70,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cde5da',
    backgroundColor: '#e8f9f1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  shareBtnText: {
    color: '#0a7a5b',
    fontWeight: '800',
    fontSize: 12,
  },
  pickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(2,6,23,0.15)',
    padding: 12,
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dee8',
    padding: 8,
  },
  doneBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    marginTop: 6,
  },
  doneText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
});

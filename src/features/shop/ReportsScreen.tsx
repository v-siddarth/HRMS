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
import { useGetAttendanceReportQuery, useGetEmployeesQuery, useGetSalaryReportQuery } from '../../store/hrmsApi';
import { currentMonth, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';

type PickerMode = 'fromDate' | 'toDate' | 'month' | null;

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
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [exporting, setExporting] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);

  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: attendance = [], isLoading: loadingAttendance } = useGetAttendanceReportQuery(
    { shopId, fromDate, toDate },
    { skip: !shopId },
  );
  const { data: salaries = [], isLoading: loadingSalary } = useGetSalaryReportQuery({ shopId, month }, { skip: !shopId });

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(employee => map.set(employee.id, employee.name));
    return map;
  }, [employees]);

  const attendanceSummary = useMemo(
    () =>
      attendance.reduce(
        (acc, item) => {
          acc[item.status] += 1;
          return acc;
        },
        { present: 0, absent: 0, late: 0, half_day: 0 },
      ),
    [attendance],
  );

  const salarySummary = useMemo(
    () =>
      salaries.reduce(
        (acc, item) => {
          acc.net += item.netSalary;
          acc.paid += item.salaryPaidAt ? 1 : 0;
          acc.pending += item.salaryPaidAt ? 0 : 1;
          return acc;
        },
        { net: 0, paid: 0, pending: 0 },
      ),
    [salaries],
  );

  const salaryGivenRows = useMemo(() => salaries.filter(item => !!item.salaryPaidAt), [salaries]);

  const onPickDate = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setPickerMode(null);
    }
    if (event.type !== 'set' || !selectedDate || !pickerMode) {
      return;
    }

    if (pickerMode === 'month') {
      setMonth(dayjs(selectedDate).format('YYYY-MM'));
    } else {
      const value = dayjs(selectedDate).format('YYYY-MM-DD');
      if (pickerMode === 'fromDate') {
        setFromDate(value);
      } else {
        setToDate(value);
      }
    }
  };

  const saveExcelAttendance = async () => {
    setExporting(true);
    try {
      const rows = attendance.map(item => ({
        Date: item.date,
        Employee: employeeNameById.get(item.employeeId) ?? item.employeeId,
        Status: item.status,
        Source: item.source ?? 'manual',
        PunchTime: item.punchTime ?? '-',
        CheckIn: item.checkInTime ?? '-',
        Notes: item.notes ?? '-',
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

      const excelData = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const filePath = `${RNFS.DocumentDirectoryPath}/attendance_${fromDate}_to_${toDate}.xlsx`;
      await RNFS.writeFile(filePath, excelData, 'base64');
      await pushFile('Attendance Excel', filePath);
      Alert.alert('Exported', 'Attendance Excel report saved successfully.');
    } catch (error) {
      Alert.alert('Export failed', (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportAttendancePdf = async () => {
    await exportPdf('attendance_report', 'Attendance Report', buildAttendanceHtml(attendance, employeeNameById));
  };

  const exportSalaryPdf = async () => {
    await exportPdf('salary_report', 'Salary Report', buildSalaryHtml(salaries, employeeNameById));
  };

  const exportSalaryGivenPdf = async () => {
    await exportPdf('salary_given_report', 'Salary Given Report', buildSalaryGivenHtml(salaryGivenRows, employeeNameById));
  };

  const exportCompletePdf = async () => {
    const html = buildCompleteHtml({
      fromDate,
      toDate,
      month,
      attendance,
      salaries,
      salaryGivenRows,
      employeeNameById,
      attendanceSummary,
      salarySummary,
    });
    await exportPdf('complete_report', 'Complete Report', html);
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
          <Text style={styles.subtitle}>Attendance, salary, and salary-given reports with export-ready PDF and Excel.</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Attendance Filters</Text>
          <View style={styles.inputRow}>
            <DateField label="From Date" value={fromDate} onPress={() => setPickerMode('fromDate')} />
            <DateField label="To Date" value={toDate} onPress={() => setPickerMode('toDate')} />
          </View>
          <SummaryLine label="Records" value={loadingAttendance ? '...' : `${attendance.length}`} />
          <SummaryLine label="Present" value={loadingAttendance ? '...' : `${attendanceSummary.present}`} />
          <SummaryLine label="Absent" value={loadingAttendance ? '...' : `${attendanceSummary.absent}`} />
          <SummaryLine label="Late" value={loadingAttendance ? '...' : `${attendanceSummary.late}`} />
          <SummaryLine label="Half Day" value={loadingAttendance ? '...' : `${attendanceSummary.half_day}`} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Salary Filters</Text>
          <View style={styles.inputRow}>
            <DateField label="Month" value={month} onPress={() => setPickerMode('month')} />
          </View>
          <SummaryLine label="Records" value={loadingSalary ? '...' : `${salaries.length}`} />
          <SummaryLine label="Paid" value={loadingSalary ? '...' : `${salarySummary.paid}`} />
          <SummaryLine label="Pending" value={loadingSalary ? '...' : `${salarySummary.pending}`} />
          <SummaryLine label="Net Total" value={loadingSalary ? '...' : `INR ${salarySummary.net.toFixed(2)}`} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Export Reports</Text>
          <View style={styles.actionsWrap}>
            <ActionButton title="Attendance PDF" onPress={exportAttendancePdf} disabled={exporting} />
            <ActionButton title="Attendance Excel" onPress={saveExcelAttendance} disabled={exporting} />
            <ActionButton title="Salary PDF" onPress={exportSalaryPdf} disabled={exporting} />
            <ActionButton title="Salary Given PDF" onPress={exportSalaryGivenPdf} disabled={exporting} />
            <ActionButton title="Complete Report PDF" onPress={exportCompletePdf} disabled={exporting} strong />
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

        <Card>
          <Text style={styles.sectionTitle}>Salary Given Report Preview</Text>
          {salaryGivenRows.length === 0 ? (
            <Text style={styles.emptyText}>No paid salary records yet for this month.</Text>
          ) : (
            <View style={styles.previewList}>
              {salaryGivenRows.slice(0, 6).map(item => (
                <ValueRow
                  key={item.id}
                  label={employeeNameById.get(item.employeeId) ?? item.employeeId}
                  value={`${item.netSalary.toFixed(2)} | ${dayjs(item.salaryPaidAt).format('DD MMM')}`}
                />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      {pickerMode && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <DateTimePicker
              value={pickerMode === 'month' ? dayjs(`${month}-01`).toDate() : dayjs((pickerMode === 'fromDate' ? fromDate : toDate) || todayDate()).toDate()}
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

function buildAttendanceHtml(attendance: any[], employeeNameById: Map<string, string>) {
  const rows = attendance
    .map(
      item => `<tr><td>${item.date}</td><td>${safe(employeeNameById.get(item.employeeId) ?? item.employeeId)}</td><td>${safe(
        item.status,
      )}</td><td>${safe(item.source ?? 'manual')}</td><td>${safe(item.punchTime ?? '-')}</td><td>${safe(
        item.checkInTime ?? '-',
      )}</td><td>${safe(item.notes ?? '-')}</td></tr>`,
    )
    .join('');
  return reportHtml('Attendance Report', ['Date', 'Employee', 'Status', 'Source', 'Punch Time', 'Check In', 'Notes'], rows);
}

function buildSalaryHtml(salaries: any[], employeeNameById: Map<string, string>) {
  const rows = salaries
    .map(
      item =>
        `<tr><td>${safe(employeeNameById.get(item.employeeId) ?? item.employeeId)}</td><td>${item.presentDays}</td><td>${item.absentDays}</td><td>${item.halfDays}</td><td>${item.lateEntries}</td><td>${item.payableDays}</td><td>${item.netSalary.toFixed(
          2,
        )}</td></tr>`,
    )
    .join('');
  return reportHtml('Salary Report', ['Employee', 'Present', 'Absent', 'Half Day', 'Late', 'Payable', 'Net Salary'], rows);
}

function buildSalaryGivenHtml(salaryGivenRows: any[], employeeNameById: Map<string, string>) {
  const rows = salaryGivenRows
    .map(
      item =>
        `<tr><td>${safe(employeeNameById.get(item.employeeId) ?? item.employeeId)}</td><td>${item.netSalary.toFixed(
          2,
        )}</td><td>${safe(dayjs(item.salaryPaidAt).format('DD MMM YYYY, hh:mm A'))}</td></tr>`,
    )
    .join('');
  return reportHtml('Salary Given Report', ['Employee', 'Net Salary', 'Paid At'], rows);
}

function buildCompleteHtml(input: {
  fromDate: string;
  toDate: string;
  month: string;
  attendance: any[];
  salaries: any[];
  salaryGivenRows: any[];
  employeeNameById: Map<string, string>;
  attendanceSummary: { present: number; absent: number; late: number; half_day: number };
  salarySummary: { net: number; paid: number; pending: number };
}) {
  const attendanceRows = buildAttendanceHtml(input.attendance, input.employeeNameById);
  const salaryRows = buildSalaryHtml(input.salaries, input.employeeNameById);
  const givenRows = buildSalaryGivenHtml(input.salaryGivenRows, input.employeeNameById);
  return `
  <html><head>${baseCss()}</head><body>
  <h1>Complete Report</h1>
  <p><b>Attendance Range:</b> ${input.fromDate} to ${input.toDate}</p>
  <p><b>Salary Month:</b> ${input.month}</p>
  <h2>Summary</h2>
  <ul>
    <li>Attendance: Present ${input.attendanceSummary.present}, Absent ${input.attendanceSummary.absent}, Late ${input.attendanceSummary.late}, Half Day ${input.attendanceSummary.half_day}</li>
    <li>Salary Net Total: INR ${input.salarySummary.net.toFixed(2)}</li>
    <li>Paid: ${input.salarySummary.paid}, Pending: ${input.salarySummary.pending}</li>
  </ul>
  ${stripHtml(attendanceRows)}
  ${stripHtml(salaryRows)}
  ${stripHtml(givenRows)}
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
  previewList: {
    gap: 6,
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

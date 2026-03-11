import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { Card, Field, Screen } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useGetAttendanceByDateQuery,
  useGetAttendanceReportQuery,
  useGetBiometricSettingsQuery,
  useGetEmployeesQuery,
  useUpsertBulkAttendanceMutation,
} from '../../store/hrmsApi';
import {
  currentMonth,
  formatDisplayDate,
  formatDisplayDateTime24H,
  normalizeDateInput,
  todayDate,
} from '../../utils/date';
import { colors } from '../../theme/colors';
import type { AttendanceStatus } from '../../types/models';

const statuses: AttendanceStatus[] = ['present', 'absent', 'late', 'half_day', 'leave'];

export function AttendanceScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';

  const [dateInput, setDateInput] = useState(formatDisplayDate(todayDate()));
  const [fromDateInput, setFromDateInput] = useState(formatDisplayDate(`${currentMonth()}-01`));
  const [toDateInput, setToDateInput] = useState(
    formatDisplayDate(dayjs(`${currentMonth()}-01`).endOf('month').format('YYYY-MM-DD')),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | AttendanceStatus>('all');
  const [localStatusByEmployee, setLocalStatusByEmployee] = useState<Record<string, AttendanceStatus>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState('');

  const date = normalizeDateInput(dateInput);
  const fromDate = normalizeDateInput(fromDateInput);
  const toDate = normalizeDateInput(toDateInput);
  const validRange = !!(fromDate && toDate && isValidRange(fromDate, toDate));

  const { data: employees = [], isLoading: loadingStaff } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: biometric } = useGetBiometricSettingsQuery(shopId, { skip: !shopId });
  const { data: attendance = [], refetch, isFetching } = useGetAttendanceByDateQuery(
    { shopId, date: date ?? todayDate() },
    { skip: !shopId || !date },
  );
  const {
    data: attendanceRange = [],
    isLoading: loadingRange,
    isFetching: fetchingRange,
  } = useGetAttendanceReportQuery(
    { shopId, fromDate: fromDate ?? todayDate(), toDate: toDate ?? todayDate() },
    { skip: !shopId || !validRange },
  );

  const [upsertAttendance] = useUpsertBulkAttendanceMutation();

  const employeeById = useMemo(() => {
    const map = new Map<string, { name: string; designation: string }>();
    employees.forEach(item => {
      map.set(item.id, { name: item.name, designation: item.designation });
    });
    return map;
  }, [employees]);

  const merged = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .map(employee => {
        const existing = attendance.find(a => a.employeeId === employee.id);
        const selected = localStatusByEmployee[employee.id] ?? existing?.status ?? 'present';
        return { employee, selected };
      })
      .filter(item => {
        const matchesSearch =
          !q ||
          item.employee.name.toLowerCase().includes(q) ||
          item.employee.designation.toLowerCase().includes(q) ||
          item.employee.phone.toLowerCase().includes(q);
        const matchesFilter = filter === 'all' ? true : item.selected === filter;
        return matchesSearch && matchesFilter;
      });
  }, [attendance, employees, filter, localStatusByEmployee, query]);

  const summary = useMemo(() => {
    const counts: Record<'present' | 'absent' | 'late' | 'half_day' | 'leave', number> = {
      present: 0,
      absent: 0,
      late: 0,
      half_day: 0,
      leave: 0,
    };
    employees.forEach(employee => {
      const existing = attendance.find(a => a.employeeId === employee.id);
      const selected = localStatusByEmployee[employee.id] ?? existing?.status ?? 'present';
      counts[selected] += 1;
    });
    return counts;
  }, [attendance, employees, localStatusByEmployee]);

  const rangeSummary = useMemo(() => {
    return attendanceRange.reduce(
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
  }, [attendanceRange]);

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
    <Screen>
      <FlatList
        data={merged}
        keyExtractor={item => item.employee.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Attendance</Text>
            <Text style={styles.subtitle}>Daily marking with automatic save plus duration-based attendance report.</Text>

            <Card>
              <Text style={styles.sectionTitle}>Biometric Attendance</Text>
              <Text style={styles.helperText}>External device connectivity is intentionally empty for now. Integration will be connected in next step.</Text>
              <View style={styles.bioStatusRow}>
                <InfoPill label="Mode" value={biometric?.integrationMode ?? 'pull_agent'} />
                <InfoPill label="Device" value={biometric?.deviceName || 'Not Connected'} />
              </View>
              <View style={styles.bioStatusRow}>
                <InfoPill label="Sync Status" value="Pending Integration" warning />
                <InfoPill label="Source" value="Manual + Placeholder" />
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Daily Marking</Text>
              <Field label="Date (DD.MM.YYYY)" value={dateInput} onChangeText={setDateInput} />
              {!date ? <Text style={styles.rangeError}>Enter valid date in DD.MM.YYYY.</Text> : null}
              <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Name / role / phone" />
            </Card>

            <View style={styles.summaryRow}>
              <SummaryCard label="Present" value={`${summary.present}`} tone="green" />
              <SummaryCard label="Absent" value={`${summary.absent}`} tone="red" />
              <SummaryCard label="Late" value={`${summary.late}`} tone="amber" />
              <SummaryCard label="Half Day" value={`${summary.half_day}`} tone="slate" />
              <SummaryCard label="Leave" value={`${summary.leave}`} tone="blue" />
            </View>

            <Card>
              <Text style={styles.filterTitle}>Filter by status</Text>
              <View style={styles.filterRow}>
                <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
                <FilterChip label="Present" active={filter === 'present'} onPress={() => setFilter('present')} />
                <FilterChip label="Absent" active={filter === 'absent'} onPress={() => setFilter('absent')} />
                <FilterChip label="Late" active={filter === 'late'} onPress={() => setFilter('late')} />
                <FilterChip label="Half Day" active={filter === 'half_day'} onPress={() => setFilter('half_day')} />
                <FilterChip label="Leave" active={filter === 'leave'} onPress={() => setFilter('leave')} />
              </View>
            </Card>

            <Text style={styles.sectionText}>
              {loadingStaff || isFetching ? 'Loading attendance...' : `${merged.length} staff members`}
            </Text>

            <Card>
              <Text style={styles.sectionTitle}>Monthly Attendance Report (Select 2 Dates)</Text>
              <Field label="From Date (DD.MM.YYYY)" value={fromDateInput} onChangeText={setFromDateInput} />
              <Field label="To Date (DD.MM.YYYY)" value={toDateInput} onChangeText={setToDateInput} />

              {!validRange ? (
                <Text style={styles.rangeError}>Invalid date range. Use valid dates and keep From {'<='} To.</Text>
              ) : (
                <View style={styles.reportSummaryWrap}>
                  <ValueText label="Rows" value={`${rangeSummary.total}`} />
                  <ValueText label="Present" value={`${rangeSummary.present}`} />
                  <ValueText label="Absent" value={`${rangeSummary.absent}`} />
                  <ValueText label="Late" value={`${rangeSummary.late}`} />
                  <ValueText label="Half Day" value={`${rangeSummary.half_day}`} />
                  <ValueText label="Leave" value={`${rangeSummary.leave}`} />
                </View>
              )}

              {validRange ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableOuter}>
                  <View>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Cell text="Date" width={100} header />
                      <Cell text="Staff" width={180} header />
                      <Cell text="Designation" width={130} header />
                      <Cell text="Status" width={110} header />
                      <Cell text="Source" width={110} header />
                      <Cell text="Punch Time" width={180} header />
                    </View>
                    {loadingRange || fetchingRange ? (
                      <View style={styles.tableLoadingWrap}>
                        <Text style={styles.tableLoadingText}>Loading report...</Text>
                      </View>
                    ) : attendanceRange.length === 0 ? (
                      <View style={styles.tableLoadingWrap}>
                        <Text style={styles.tableLoadingText}>No attendance rows for selected duration.</Text>
                      </View>
                    ) : (
                      attendanceRange.slice(0, 300).map(item => {
                        const employee = employeeById.get(item.employeeId);
                        return (
                          <View key={item.id} style={styles.tableRow}>
                            <Cell text={formatDisplayDate(item.date)} width={100} />
                            <Cell text={employee?.name ?? item.employeeId} width={180} />
                            <Cell text={employee?.designation ?? '-'} width={130} />
                            <Cell text={statusLabel(item.status)} width={110} />
                            <Cell text={item.source ?? 'manual'} width={110} />
                            <Cell text={formatDisplayDateTime24H(item.punchTime)} width={180} />
                          </View>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
              ) : null}
            </Card>
          </View>
        }
        ListEmptyComponent={
          !(loadingStaff || isFetching) ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No Staff For Selected Filter</Text>
              <Text style={styles.emptySub}>Try changing date, search or status filter.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isSaving = savingEmployeeId === item.employee.id;
          return (
            <View style={styles.staffCard}>
              <View style={styles.staffHead}>
                <Text style={styles.staffName} numberOfLines={2} ellipsizeMode="tail">
                  {item.employee.name}
                </Text>
                <View style={styles.currentStatusBadge}>
                  <Text style={styles.currentStatusText}>{item.selected.replace('_', ' ').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.staffInfo}>
                <InfoRow label="Designation" value={item.employee.designation} />
                <InfoRow label="Phone" value={item.employee.phone} />
              </View>

              <View style={styles.statusRow}>
                {statuses.map(status => {
                  const selected = item.selected === status;
                  return (
                    <Pressable
                      key={status}
                      onPress={() => saveStatus(item.employee.id, status)}
                      disabled={isSaving}
                      style={[
                        styles.statusChip,
                        selected ? styles.statusChipSelected : undefined,
                        isSaving ? styles.statusChipDisabled : undefined,
                      ]}>
                      <Text style={[styles.statusChipText, selected ? styles.statusChipTextSelected : undefined]}>
                        {statusLabel(status)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isSaving && <Text style={styles.savingText}>Saving...</Text>}
            </View>
          );
        }}
      />
    </Screen>
  );
}

function isValidRange(fromDate: string, toDate: string) {
  const from = dayjs(fromDate);
  const to = dayjs(toDate);
  return from.isValid() && to.isValid() && !from.isAfter(to);
}

function Cell({ text, width, header }: { text: string; width: number; header?: boolean }) {
  return (
    <View style={[styles.cell, { width }, header && styles.headerCell]}>
      <Text style={[styles.cellText, header && styles.headerCellText]} numberOfLines={1} ellipsizeMode="tail">
        {text}
      </Text>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'red' | 'amber' | 'slate' | 'blue';
}) {
  const palette = {
    green: { bg: '#e8f9f1', fg: '#0f9f63' },
    red: { bg: '#fdeeee', fg: '#c22a2a' },
    amber: { bg: '#fff4df', fg: '#ba7a1d' },
    slate: { bg: '#eef2f7', fg: '#334155' },
    blue: { bg: '#e6effd', fg: '#1458bf' },
  } as const;

  return (
    <View style={[styles.summaryCard, { backgroundColor: palette[tone].bg }]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color: palette[tone].fg }]}>{value}</Text>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.filterChip, active ? styles.filterChipActive : undefined]} onPress={onPress}>
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : undefined]}>{label}</Text>
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

function ValueText({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueTextWrap}>
      <Text style={styles.valueTextLabel}>{label}</Text>
      <Text style={styles.valueTextValue}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
        {value}
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
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
    fontSize: 12,
  },
  bioStatusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  infoPill: {
    flex: 1,
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
    gap: 8,
  },
  summaryCard: {
    width: '48%',
    minHeight: 90,
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
    marginTop: 5,
    fontSize: 22,
    fontWeight: '800',
  },
  filterTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  filterRow: {
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
  filterChipActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  filterChipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.success,
  },
  sectionText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  reportSummaryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  valueTextWrap: {
    minWidth: 90,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueTextLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  valueTextValue: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    marginTop: 2,
  },
  rangeError: {
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
  staffHead: {
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
  currentStatusBadge: {
    borderWidth: 1,
    borderColor: '#b7ead3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#e8f9f1',
  },
  currentStatusText: {
    color: '#0a7559',
    fontWeight: '800',
    fontSize: 10,
  },
  staffInfo: {
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
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  statusChip: {
    minWidth: '23%',
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChipSelected: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  statusChipDisabled: {
    opacity: 0.7,
  },
  statusChipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  statusChipTextSelected: {
    color: colors.success,
  },
  savingText: {
    color: colors.textMuted,
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

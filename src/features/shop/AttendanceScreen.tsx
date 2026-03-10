import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Field, Screen } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useGetAttendanceByDateQuery,
  useGetEmployeesQuery,
  useUpsertBulkAttendanceMutation,
} from '../../store/hrmsApi';
import { todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';
import type { AttendanceStatus } from '../../types/models';

const statuses: AttendanceStatus[] = ['present', 'absent', 'late', 'half_day'];

export function AttendanceScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';

  const [date, setDate] = useState(todayDate());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | AttendanceStatus>('all');
  const [localStatusByEmployee, setLocalStatusByEmployee] = useState<Record<string, AttendanceStatus>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState('');

  const { data: employees = [], isLoading: loadingStaff } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: attendance = [], refetch, isFetching } = useGetAttendanceByDateQuery(
    { shopId, date },
    { skip: !shopId },
  );

  const [upsertAttendance] = useUpsertBulkAttendanceMutation();

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
    const counts: Record<'present' | 'absent' | 'late' | 'half_day', number> = {
      present: 0,
      absent: 0,
      late: 0,
      half_day: 0,
    };
    employees.forEach(employee => {
      const existing = attendance.find(a => a.employeeId === employee.id);
      const selected = localStatusByEmployee[employee.id] ?? existing?.status ?? 'present';
      counts[selected] += 1;
    });
    return counts;
  }, [attendance, employees, localStatusByEmployee]);

  const saveStatus = async (employeeId: string, status: AttendanceStatus) => {
    if (!shopId || !user) {
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
            <Text style={styles.subtitle}>Select status and it saves automatically. No extra save step required.</Text>

            <Card>
              <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
              <Field label="Search Staff" value={query} onChangeText={setQuery} placeholder="Name / role / phone" />
            </Card>

            <View style={styles.summaryRow}>
              <SummaryCard label="Present" value={`${summary.present}`} tone="green" />
              <SummaryCard label="Absent" value={`${summary.absent}`} tone="red" />
              <SummaryCard label="Late" value={`${summary.late}`} tone="amber" />
              <SummaryCard label="Half Day" value={`${summary.half_day}`} tone="slate" />
            </View>

            <Card>
              <Text style={styles.filterTitle}>Filter by status</Text>
              <View style={styles.filterRow}>
                <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
                <FilterChip label="Present" active={filter === 'present'} onPress={() => setFilter('present')} />
                <FilterChip label="Absent" active={filter === 'absent'} onPress={() => setFilter('absent')} />
                <FilterChip label="Late" active={filter === 'late'} onPress={() => setFilter('late')} />
                <FilterChip label="Half Day" active={filter === 'half_day'} onPress={() => setFilter('half_day')} />
              </View>
            </Card>

            <Text style={styles.sectionText}>
              {loadingStaff || isFetching ? 'Loading attendance...' : `${merged.length} staff members`}
            </Text>
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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'red' | 'amber' | 'slate';
}) {
  const palette = {
    green: { bg: '#e8f9f1', fg: '#0f9f63' },
    red: { bg: '#fdeeee', fg: '#c22a2a' },
    amber: { bg: '#fff4df', fg: '#ba7a1d' },
    slate: { bg: '#eef2f7', fg: '#334155' },
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
    backgroundColor: '#e8f9f1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentStatusText: {
    color: '#0a7a5b',
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
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    width: 76,
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusChipSelected: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  statusChipDisabled: {
    opacity: 0.6,
  },
  statusChipText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  statusChipTextSelected: {
    color: '#0a7a5b',
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

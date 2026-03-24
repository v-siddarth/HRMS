import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../../components/ui';
import {
  useGetStaffSalaryOverviewQuery,
  useGetStaffSelfProfileQuery,
} from '../../store/hrmsApi';
import { colors } from '../../theme/colors';
import { currentMonth } from '../../utils/date';
import type { EmployeeAdvance } from '../../types/models';

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export function StaffSalaryScreen() {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth());
  const isFutureMonthDisabled = month === currentMonth();

  const {
    data: overview,
    isLoading: loadingSalary,
    error: salaryError,
  } = useGetStaffSalaryOverviewQuery({ month });
  const {
    data: profile,
    isLoading: loadingProfile,
    error: profileError,
  } = useGetStaffSelfProfileQuery();

  const salary = overview?.salary ?? null;
  const advances = overview?.advances ?? [];
  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);
  const totalAdvanceAmount = Number(overview?.totalAdvanceAmount ?? 0);
  const totalAdvanceDeduction = Number(overview?.totalAdvanceDeduction ?? 0);
  const remainingPayable = Number(overview?.remainingPayableSalary ?? 0);
  const configuredPf = Number(profile?.pfAmount ?? 0);
  const grossSalary = Number(salary?.grossSalary ?? salary?.netSalary ?? 0);
  const overtimeAmount = Number(salary?.overtimeAmount ?? 0);
  const perDaySalary = Number(salary?.perDaySalary ?? 0);
  const isPaid = !!salary?.salaryPaidAt;
  const paidStatusLabel = salary ? (isPaid ? 'Paid' : 'Pending') : 'Not Generated';
  const paidTone = salary ? (isPaid ? 'success' : 'warning') : 'neutral';
  const advanceCount = advances.filter(item => item.type === 'advance').length;
  const loanCount = advances.filter(item => item.type === 'loan').length;
  const isLoading = loadingSalary || loadingProfile;
  const errorMessage = extractErrorMessage(salaryError) || extractErrorMessage(profileError);

  const insightCards: Array<{ label: string; value: string; icon: string; tone: Tone }> = [
    {
      label: 'Gross Salary',
      value: formatCurrency(grossSalary),
      icon: 'wallet-outline',
      tone: 'success' as Tone,
    },
    {
      label: 'OT Amount',
      value: formatCurrency(overtimeAmount),
      icon: 'flash-outline',
      tone: 'info' as Tone,
    },
    {
      label: 'PF Setting',
      value: configuredPf > 0 ? formatCurrency(configuredPf) : 'Not set',
      icon: 'shield-checkmark-outline',
      tone: 'warning' as Tone,
    },
    {
      label: 'Advance Deducted',
      value: formatCurrency(totalAdvanceDeduction),
      icon: 'remove-circle-outline',
      tone: 'danger' as Tone,
    },
    {
      label: 'Final Payable',
      value: formatCurrency(remainingPayable),
      icon: 'cash-outline',
      tone: 'success' as Tone,
    },
    {
      label: 'Status',
      value: paidStatusLabel,
      icon: isPaid ? 'checkmark-done-outline' : 'time-outline',
      tone: paidTone,
    },
  ];

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Salary</Text>
            </View>
            <View style={styles.heroMetaPill}>
              <Ionicons name="calendar-outline" size={14} color="#ffffff" />
              <Text style={styles.heroMetaPillText}>{monthLabel}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Salary overview</Text>
          <Text style={styles.heroSubtitle}>
            Review your monthly salary snapshot, payroll breakup, advance impact, and payment status from one clean read-only screen.
          </Text>

          <View style={styles.heroHeadlineCard}>
            <View style={styles.heroHeadlineTop}>
              <Text style={styles.heroHeadlineLabel}>Final Payable Salary</Text>
              <View style={[styles.statusPill, toneBadgeStyle(paidTone).pill]}>
                <Text style={[styles.statusPillText, toneBadgeStyle(paidTone).text]}>{paidStatusLabel}</Text>
              </View>
            </View>
            <Text style={styles.heroHeadlineValue}>{formatCurrency(remainingPayable)}</Text>
            <Text style={styles.heroHeadlineMeta}>
              {salary
                ? `${formatCurrency(grossSalary)} gross with ${formatCurrency(totalAdvanceDeduction)} advance deduction`
                : 'Salary is not generated yet for this month.'}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <Card>
            <Text style={styles.sectionTitle}>Month Selector</Text>
            <Text style={styles.sectionText}>Browse the current and previous months without changing your payroll context.</Text>
            <View style={styles.monthSelectorRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => setMonth(prev => shiftMonth(prev, -1))}
                style={({ pressed }) => [styles.monthArrowBtn, pressed && styles.monthArrowBtnPressed]}>
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </Pressable>

              <View style={styles.monthSelectorCenter}>
                <Text style={styles.monthSelectorLabel}>{monthLabel}</Text>
                <Text style={styles.monthSelectorHint}>Salary stays read-only and aligned with the generated monthly payroll row</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={isFutureMonthDisabled}
                onPress={() => setMonth(prev => shiftMonth(prev, 1))}
                style={({ pressed }) => [
                  styles.monthArrowBtn,
                  isFutureMonthDisabled && styles.monthArrowBtnDisabled,
                  pressed && !isFutureMonthDisabled && styles.monthArrowBtnPressed,
                ]}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={isFutureMonthDisabled ? colors.textMuted : colors.textPrimary}
                />
              </Pressable>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Monthly Snapshot</Text>
            <Text style={styles.sectionText}>These values reflect the current staff salary record and the linked advances for the selected month.</Text>
            <View style={styles.summaryGrid}>
              {insightCards.map(item => (
                <SummaryCard key={item.label} {...item} />
              ))}
            </View>
          </Card>

          <Card>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Salary Breakup</Text>
                <Text style={styles.sectionText}>A table-style payroll breakup so every amount remains readable on mobile.</Text>
              </View>
              <View style={[styles.statusPill, toneBadgeStyle(paidTone).pill]}>
                <Text style={[styles.statusPillText, toneBadgeStyle(paidTone).text]}>{paidStatusLabel}</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <HeaderCell title="Item" width={180} />
                  <HeaderCell title="Value" width={140} />
                  <HeaderCell title="Notes" width={240} />
                </View>

                <BreakupRow
                  label="Basic Salary"
                  value={formatCurrency(Number(profile?.basicSalary ?? 0))}
                  notes="Base monthly salary configured on the staff profile."
                />
                <BreakupRow
                  label="Per Day Salary"
                  value={salary ? formatCurrency(perDaySalary) : '-'}
                  notes="Derived from the generated salary row for the selected month."
                />
                <BreakupRow
                  label="Payable Days"
                  value={salary ? String(Number(salary.payableDays ?? 0).toFixed(2)) : '-'}
                  notes="Includes present, late, and half-day rules from the payroll engine."
                />
                <BreakupRow
                  label="Overtime Hours"
                  value={salary ? `${Number(salary.overtimeHours ?? 0).toFixed(2)} hrs` : '-'}
                  notes="Pulled directly from the generated monthly payroll row."
                />
                <BreakupRow
                  label="OT Amount"
                  value={formatCurrency(overtimeAmount)}
                  notes="Added on top of attendance-linked payable salary."
                />
                <BreakupRow
                  label="Gross Salary"
                  value={formatCurrency(grossSalary)}
                  notes="Current payroll engine stores this before advance deduction."
                />
                <BreakupRow
                  label="PF Setting"
                  value={configuredPf > 0 ? formatCurrency(configuredPf) : 'Not set'}
                  notes="Shown from staff profile settings. This is not deducted in the current stored salary row."
                />
                <BreakupRow
                  label="Advance Deduction"
                  value={formatCurrency(totalAdvanceDeduction)}
                  notes="Deducted from generated salary if monthly advances or loans are present."
                />
                <BreakupRow
                  label="Final Payable"
                  value={formatCurrency(remainingPayable)}
                  notes={salary ? (isPaid ? 'This month has already been marked as paid.' : 'This month is generated but not yet marked paid.') : 'Awaiting salary generation for this month.'}
                  strong
                />
              </View>
            </ScrollView>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Attendance and Payroll Inputs</Text>
            <Text style={styles.sectionText}>This section makes it easier to see why a month’s final payable amount looks the way it does.</Text>
            <View style={styles.detailPanel}>
              <DetailRow label="Present Days" value={salary ? `${salary.presentDays}` : '-'} />
              <DetailRow label="Absent Days" value={salary ? `${salary.absentDays}` : '-'} />
              <DetailRow label="Half Days" value={salary ? `${salary.halfDays}` : '-'} />
              <DetailRow label="Leave Days" value={salary ? `${salary.leaveDays ?? 0}` : '-'} />
              <DetailRow label="Late Entries" value={salary ? `${salary.lateEntries}` : '-'} />
              <DetailRow label="Late Deduction Days" value={salary ? `${Number(salary.lateDeductionDays ?? 0).toFixed(2)}` : '-'} />
              <DetailRow label="Generated At" value={salary?.generatedAt ? formatDateTime(salary.generatedAt) : '-'} />
              <DetailRow label="Paid At" value={salary?.salaryPaidAt ? formatDateTime(salary.salaryPaidAt) : 'Pending'} />
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Advance and Loan History</Text>
            <Text style={styles.sectionText}>Every payroll-linked advance or loan remains visible here for the selected month.</Text>

            <View style={styles.advanceStatsRow}>
              <MiniStat label="Entries" value={`${advances.length}`} tone="neutral" />
              <MiniStat label="Advance" value={`${advanceCount}`} tone="info" />
              <MiniStat label="Loan" value={`${loanCount}`} tone="warning" />
              <MiniStat label="Total" value={formatCurrency(totalAdvanceAmount)} tone="danger" />
            </View>

            {advances.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHeaderRow]}>
                    <HeaderCell title="Paid On" width={110} />
                    <HeaderCell title="Type" width={100} />
                    <HeaderCell title="Amount" width={120} />
                    <HeaderCell title="Notes" width={260} />
                  </View>
                  {advances.map(item => (
                    <AdvanceRow key={item.id} item={item} />
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No advance history</Text>
                <Text style={styles.emptyText}>No advance or loan entries are recorded for this month yet.</Text>
              </View>
            )}
          </Card>

          {isLoading ? (
            <Card>
              <Text style={styles.sectionTitle}>Loading Salary</Text>
              <Text style={styles.sectionText}>Fetching your salary row, profile payroll fields, and advance history for the selected month.</Text>
            </Card>
          ) : null}

          {!isLoading && errorMessage ? (
            <Card>
              <Text style={styles.errorTitle}>Unable to load salary</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </Card>
          ) : null}

          {!isLoading && !errorMessage && !salary ? (
            <Card>
              <Text style={styles.sectionTitle}>Salary Not Generated Yet</Text>
              <Text style={styles.sectionText}>
                There is no generated salary row for this month yet. Once payroll is generated from the shop side, this screen will show the full breakup and payment status automatically.
              </Text>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: Tone;
}) {
  const badgeStyle = toneBadgeStyle(tone);

  return (
    <View style={[styles.summaryCard, badgeStyle.soft]}>
      <View style={[styles.summaryIconWrap, badgeStyle.iconWrap]}>
        <Ionicons name={icon} size={18} color={badgeStyle.iconColor} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const badgeStyle = toneBadgeStyle(tone);
  return (
    <View style={[styles.miniStatCard, badgeStyle.soft]}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function BreakupRow({
  label,
  value,
  notes,
  strong,
}: {
  label: string;
  value: string;
  notes: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.tableRow}>
      <BodyCell width={180} title={label} emphasized={strong} />
      <BodyCell width={140} title={value} emphasized={strong} />
      <BodyCell width={240} title={notes} />
    </View>
  );
}

function AdvanceRow({ item }: { item: EmployeeAdvance }) {
  const tone = item.type === 'loan' ? 'warning' : 'info';
  return (
    <View style={styles.tableRow}>
      <BodyCell width={110} title={formatShortDate(item.paidAt)} />
      <StatusCell width={100} label={item.type === 'loan' ? 'Loan' : 'Advance'} tone={tone} />
      <BodyCell width={120} title={formatCurrency(Number(item.amount ?? 0))} />
      <BodyCell width={260} title={item.notes?.trim() || 'No notes'} />
    </View>
  );
}

function HeaderCell({ title, width }: { title: string; width: number }) {
  return (
    <View style={[styles.headerCell, { width }]}>
      <Text style={styles.headerCellText}>{title}</Text>
    </View>
  );
}

function BodyCell({
  title,
  width,
  emphasized,
}: {
  title: string;
  width: number;
  emphasized?: boolean;
}) {
  return (
    <View style={[styles.bodyCell, { width }]}>
      <Text style={[styles.bodyCellTitle, emphasized && styles.bodyCellTitleStrong]}>{title}</Text>
    </View>
  );
}

function StatusCell({ label, width, tone }: { label: string; width: number; tone: Tone }) {
  const badgeStyle = toneBadgeStyle(tone);

  return (
    <View style={[styles.bodyCell, { width }]}>
      <View style={[styles.tableStatusPill, badgeStyle.pill]}>
        <Text style={[styles.tableStatusText, badgeStyle.text]}>{label}</Text>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function extractErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return '';
  }
  return (
    (error as { data?: { message?: string }; message?: string }).data?.message ||
    (error as { message?: string }).message ||
    ''
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateTime(value: string) {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  return parsed.format('DD MMM YYYY, hh:mm A');
}

function formatShortDate(value: string) {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  return parsed.format('DD MMM YYYY');
}

function shiftMonth(month: string, direction: number) {
  return dayjs(`${month}-01`).add(direction, 'month').format('YYYY-MM');
}

function formatMonthLabel(month: string) {
  return dayjs(`${month}-01`).format('MMMM YYYY');
}

function toneBadgeStyle(tone: Tone) {
  switch (tone) {
    case 'success':
      return {
        soft: styles.toneSoftSuccess,
        pill: styles.tonePillSuccess,
        text: styles.toneTextSuccess,
        iconWrap: styles.toneIconSuccess,
        iconColor: colors.success,
      };
    case 'danger':
      return {
        soft: styles.toneSoftDanger,
        pill: styles.tonePillDanger,
        text: styles.toneTextDanger,
        iconWrap: styles.toneIconDanger,
        iconColor: colors.danger,
      };
    case 'warning':
      return {
        soft: styles.toneSoftWarning,
        pill: styles.tonePillWarning,
        text: styles.toneTextWarning,
        iconWrap: styles.toneIconWarning,
        iconColor: colors.warning,
      };
    case 'info':
      return {
        soft: styles.toneSoftInfo,
        pill: styles.tonePillInfo,
        text: styles.toneTextInfo,
        iconWrap: styles.toneIconInfo,
        iconColor: colors.primary,
      };
    case 'neutral':
    default:
      return {
        soft: styles.toneSoftNeutral,
        pill: styles.tonePillNeutral,
        text: styles.toneTextNeutral,
        iconWrap: styles.toneIconNeutral,
        iconColor: colors.textSecondary,
      };
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.success,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  heroGlowLarge: {
    position: 'absolute',
    top: -88,
    right: -46,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#33ba90',
    opacity: 0.22,
  },
  heroGlowSmall: {
    position: 'absolute',
    left: -42,
    bottom: -90,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: '#05654d',
    opacity: 0.22,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  heroMetaPillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#defbf1',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  heroHeadlineCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  heroHeadlineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroHeadlineLabel: {
    color: '#d5f6eb',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroHeadlineValue: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
  },
  heroHeadlineMeta: {
    color: '#d2f5e8',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  monthArrowBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthArrowBtnPressed: {
    opacity: 0.8,
  },
  monthArrowBtnDisabled: {
    backgroundColor: '#eef3f8',
  },
  monthSelectorCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  monthSelectorLabel: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  monthSelectorHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: '900',
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  table: {
    minWidth: 560,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#e7edf5',
    backgroundColor: colors.surface,
  },
  tableHeaderRow: {
    backgroundColor: '#f5f8fc',
  },
  headerCell: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e7edf5',
  },
  headerCellText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  bodyCell: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e7edf5',
  },
  bodyCellTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  bodyCellTitleStrong: {
    color: colors.primary,
  },
  tableStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tableStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  detailPanel: {
    backgroundColor: colors.bgSoft,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#dfe7f0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailRowLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    flex: 1,
  },
  detailRowValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1.2,
    textAlign: 'right',
  },
  advanceStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  miniStatCard: {
    width: '48%',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  miniStatValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  miniStatLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },
  toneSoftSuccess: {
    backgroundColor: colors.successSoft,
  },
  toneSoftDanger: {
    backgroundColor: colors.dangerSoft,
  },
  toneSoftWarning: {
    backgroundColor: colors.warningSoft,
  },
  toneSoftInfo: {
    backgroundColor: colors.primarySoft,
  },
  toneSoftNeutral: {
    backgroundColor: '#eef3f8',
  },
  tonePillSuccess: {
    backgroundColor: '#dff5ee',
  },
  tonePillDanger: {
    backgroundColor: '#fdecec',
  },
  tonePillWarning: {
    backgroundColor: '#fff3de',
  },
  tonePillInfo: {
    backgroundColor: '#dbe9fb',
  },
  tonePillNeutral: {
    backgroundColor: '#edf2f7',
  },
  toneTextSuccess: {
    color: colors.success,
  },
  toneTextDanger: {
    color: colors.danger,
  },
  toneTextWarning: {
    color: colors.warning,
  },
  toneTextInfo: {
    color: colors.primary,
  },
  toneTextNeutral: {
    color: colors.textSecondary,
  },
  toneIconSuccess: {
    backgroundColor: '#ffffff',
  },
  toneIconDanger: {
    backgroundColor: '#ffffff',
  },
  toneIconWarning: {
    backgroundColor: '#ffffff',
  },
  toneIconInfo: {
    backgroundColor: '#ffffff',
  },
  toneIconNeutral: {
    backgroundColor: '#ffffff',
  },
});

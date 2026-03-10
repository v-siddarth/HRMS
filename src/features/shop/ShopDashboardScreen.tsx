import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Card, Screen } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import { useGetShopAnalyticsQuery, useGetShopDashboardQuery } from '../../store/hrmsApi';
import { currentMonth, todayDate } from '../../utils/date';
import { colors } from '../../theme/colors';

export function ShopDashboardScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';

  const { data, isLoading } = useGetShopDashboardQuery(
    { shopId, todayDate: todayDate(), month: currentMonth() },
    { skip: !shopId },
  );
  const { data: analytics, isLoading: analyticsLoading } = useGetShopAnalyticsQuery(shopId, { skip: !shopId });

  const presentLike =
    (analytics?.todayBreakdown.present ?? 0) +
    (analytics?.todayBreakdown.late ?? 0) +
    (analytics?.todayBreakdown.halfDay ?? 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroGlowTop} />
          <View style={styles.heroGlowBottom} />
          <Text style={styles.heroTitle}>Shop Home</Text>
          <Text style={styles.heroSub}>Daily workforce pulse, attendance momentum, and salary trajectory in one view.</Text>
        </View>

        <View style={styles.statsGrid}>
          <MetricCard label="Today Staff" value={isLoading ? '...' : `${data?.todayAttendance ?? 0}`} tone="green" />
          <MetricCard label="Total Staff" value={isLoading ? '...' : `${data?.totalStaff ?? 0}`} tone="blue" />
          <MetricCard
            label="Monthly Salary"
            value={isLoading ? '...' : shortCurrency(data?.monthlyNetSalary ?? 0)}
            tone="slate"
          />
          <MetricCard
            label="Late Entries"
            value={isLoading ? '...' : `${data?.lateEntriesThisMonth ?? 0}`}
            tone="amber"
          />
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Attendance Snapshot</Text>
          <View style={styles.attendanceRow}>
            <MiniStat label="Present" value={analyticsLoading ? '...' : `${analytics?.todayBreakdown.present ?? 0}`} />
            <MiniStat label="Late" value={analyticsLoading ? '...' : `${analytics?.todayBreakdown.late ?? 0}`} />
          </View>
          <View style={styles.attendanceRow}>
            <MiniStat label="Half Day" value={analyticsLoading ? '...' : `${analytics?.todayBreakdown.halfDay ?? 0}`} />
            <MiniStat label="Absent" value={analyticsLoading ? '...' : `${analytics?.todayBreakdown.absent ?? 0}`} />
          </View>
          <ProgressBar
            label="Attendance Coverage"
            valueText={isLoading ? '...' : `${presentLike}/${data?.totalStaff ?? 0}`}
            ratio={data?.totalStaff ? (presentLike / data.totalStaff) * 100 : 0}
            color={colors.success}
          />
          <ProgressBar
            label="Active Staff Ratio"
            valueText={analyticsLoading ? '...' : `${analytics?.staffStatus.active ?? 0}/${data?.totalStaff ?? 0}`}
            ratio={data?.totalStaff ? ((analytics?.staffStatus.active ?? 0) / data.totalStaff) * 100 : 0}
            color={colors.primary}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Attendance Trend (7 Days)</Text>
          <AttendanceBarGraph loading={analyticsLoading} points={analytics?.attendanceTrend ?? []} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Salary Trend (6 Months)</Text>
          <SalaryLineGraph loading={analyticsLoading} points={analytics?.salaryTrend ?? []} />
        </Card>
      </ScrollView>
    </Screen>
  );
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

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'blue' | 'amber' | 'slate';
}) {
  const palette = {
    green: { bg: '#e8f9f1', fg: '#0f9f63' },
    blue: { bg: '#e6effd', fg: '#1458bf' },
    amber: { bg: '#fff4df', fg: '#ba7a1d' },
    slate: { bg: '#eef2f7', fg: '#334155' },
  } as const;

  return (
    <View style={[styles.metricCard, { backgroundColor: palette[tone].bg }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: palette[tone].fg }]} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function ProgressBar({
  label,
  valueText,
  ratio,
  color,
}: {
  label: string;
  valueText: string;
  ratio: number;
  color: string;
}) {
  const safeRatio = Math.max(0, Math.min(100, ratio));
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressHead}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{valueText}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${safeRatio}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function AttendanceBarGraph({
  loading,
  points,
}: {
  loading: boolean;
  points: { date: string; label: string; attendance: number }[];
}) {
  const { width } = useWindowDimensions();
  const graphWidth = Math.max(240, width - 80);

  if (loading) {
    return <Text style={styles.loadingText}>Loading attendance graph...</Text>;
  }
  if (!points.length) {
    return <Text style={styles.loadingText}>No attendance graph data yet.</Text>;
  }

  const max = Math.max(...points.map(p => p.attendance), 1);

  return (
    <View style={styles.graphBlock}>
      <View style={[styles.barZone, { width: graphWidth }]}>
        {points.map(point => {
          const h = Math.max(6, (point.attendance / max) * 110);
          return (
            <View key={point.date} style={styles.barCol}>
              <Text style={styles.barTopValue}>{point.attendance}</Text>
              <View style={[styles.bar, { height: h }]} />
              <Text style={styles.barLabel}>{point.label.slice(0, 5)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SalaryLineGraph({
  loading,
  points,
}: {
  loading: boolean;
  points: { month: string; label: string; total: number }[];
}) {
  const { width } = useWindowDimensions();
  const graphHeight = 170;
  const graphWidth = Math.max(220, Math.min(320, width - 130));

  if (loading) {
    return <Text style={styles.loadingText}>Loading salary graph...</Text>;
  }
  if (!points.length) {
    return <Text style={styles.loadingText}>No salary graph data yet.</Text>;
  }

  const max = Math.max(...points.map(point => point.total), 1);
  const normalized = points.map((point, index) => {
    const x = points.length > 1 ? (index / (points.length - 1)) * graphWidth : 0;
    const y = graphHeight - (point.total / max) * graphHeight;
    return { ...point, x, y };
  });

  return (
    <View style={styles.graphCard}>
      <View style={[styles.graphArea, { width: graphWidth + 10 }]}>
        <View style={[styles.axisY, { height: graphHeight }]} />
        <View style={[styles.axisX, { width: graphWidth }]} />
        {normalized.slice(1).map((point, index) => {
          const prev = normalized[index];
          const dx = point.x - prev.x;
          const dy = point.y - prev.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={`${point.month}-line`}
              style={[
                styles.lineSegment,
                {
                  left: prev.x,
                  top: prev.y,
                  width: distance,
                  transform: [{ rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        })}
        {normalized.map(point => (
          <View key={point.month} style={[styles.pointDot, { left: point.x - 4, top: point.y - 4 }]} />
        ))}
      </View>
      <View style={[styles.xLabels, { width: graphWidth + 12 }]}>
        {normalized.map(point => (
          <Text key={point.month} style={styles.xTick}>
            {point.label}
          </Text>
        ))}
      </View>
      <Text style={styles.salaryAxisHint}>X: Month | Y: Salary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 18,
  },
  hero: {
    borderRadius: 20,
    padding: 16,
    minHeight: 130,
    overflow: 'hidden',
    backgroundColor: colors.success,
    justifyContent: 'center',
    gap: 6,
  },
  heroGlowTop: {
    position: 'absolute',
    top: -42,
    right: -28,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#2aa882',
    opacity: 0.6,
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: -52,
    left: -28,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#0f6b52',
    opacity: 0.75,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  heroSub: {
    color: '#d6f7ea',
    lineHeight: 20,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7dee8',
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  metricValue: {
    marginTop: 7,
    fontSize: 22,
    fontWeight: '800',
    maxWidth: '100%',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 8,
  },
  attendanceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  miniLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  miniValue: {
    marginTop: 3,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 20,
  },
  progressWrap: {
    gap: 5,
    marginBottom: 8,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  progressValue: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  progressTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#e7edf4',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  loadingText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  graphBlock: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  barZone: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  barTopValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 11,
  },
  bar: {
    width: '100%',
    borderRadius: 6,
    backgroundColor: colors.success,
    minHeight: 6,
  },
  barLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 10,
  },
  graphCard: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 10,
  },
  graphArea: {
    height: 188,
    marginLeft: 22,
    marginTop: 4,
    position: 'relative',
  },
  axisY: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 2,
    backgroundColor: '#c5cfdb',
  },
  axisX: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: '#c5cfdb',
  },
  lineSegment: {
    position: 'absolute',
    height: 2.2,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  pointDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: '#fff',
  },
  xLabels: {
    marginLeft: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  xTick: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  salaryAxisHint: {
    textAlign: 'center',
    marginTop: 6,
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 11,
  },
});

import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Card, Screen } from '../../components/ui';
import { useGetAdminAnalyticsQuery, useGetAdminDashboardQuery } from '../../store/hrmsApi';
import { colors } from '../../theme/colors';

export function AdminDashboardScreen() {
  const { data, isLoading } = useGetAdminDashboardQuery();
  const { data: analytics, isLoading: analyticsLoading } = useGetAdminAnalyticsQuery();

  const totalAttendance =
    (analytics?.todayAttendance.present ?? 0) +
    (analytics?.todayAttendance.absent ?? 0) +
    (analytics?.todayAttendance.late ?? 0) +
    (analytics?.todayAttendance.halfDay ?? 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroGlowTop} />
          <View style={styles.heroGlowBottom} />
          <Text style={styles.title}>Super Admin Command Center</Text>
          <Text style={styles.subtitle}>Live business overview across shops, workforce, attendance, and payroll.</Text>
        </View>

        <View style={styles.statsGrid}>
          <MetricCard title="Total Shops" value={isLoading ? '...' : String(data?.totalShops ?? 0)} tone="blue" />
          <MetricCard title="Active Shops" value={isLoading ? '...' : String(data?.activeShops ?? 0)} tone="green" />
          <MetricCard title="Inactive Shops" value={isLoading ? '...' : String(data?.inactiveShops ?? 0)} tone="red" />
          <MetricCard title="Total Employees" value={isLoading ? '...' : String(data?.totalEmployees ?? 0)} tone="slate" />
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Shops Analytics</Text>
          <BarStat
            label="Active Shops"
            value={isLoading ? '...' : `${data?.activeShops ?? 0}`}
            ratio={data?.totalShops ? (data.activeShops / data.totalShops) * 100 : 0}
            fillColor="#0c8a69"
          />
          <BarStat
            label="Inactive Shops"
            value={isLoading ? '...' : `${data?.inactiveShops ?? 0}`}
            ratio={data?.totalShops ? (data.inactiveShops / data.totalShops) * 100 : 0}
            fillColor="#c43939"
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Attendance Analytics (Today)</Text>
          <View style={styles.analyticsRow}>
            <MiniMetric label="Present" value={analyticsLoading ? '...' : `${analytics?.todayAttendance.present ?? 0}`} />
            <MiniMetric label="Late" value={analyticsLoading ? '...' : `${analytics?.todayAttendance.late ?? 0}`} />
          </View>
          <View style={styles.analyticsRow}>
            <MiniMetric label="Absent" value={analyticsLoading ? '...' : `${analytics?.todayAttendance.absent ?? 0}`} />
            <MiniMetric label="Half Day" value={analyticsLoading ? '...' : `${analytics?.todayAttendance.halfDay ?? 0}`} />
          </View>
          <BarStat
            label="Attendance Capture"
            value={analyticsLoading ? '...' : `${totalAttendance}`}
            ratio={data?.totalEmployees ? (totalAttendance / data.totalEmployees) * 100 : 0}
            fillColor={colors.primary}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Salary Analytics (This Month)</Text>
          <View style={styles.salaryHeaderRow}>
            <View style={styles.salaryKpi}>
              <Text style={styles.salaryLabel}>Total Payout</Text>
              <Text style={styles.salaryValue}>{analyticsLoading ? '...' : shortCurrency(analytics?.monthlySalaryPayout ?? 0)}</Text>
            </View>
            <View style={styles.salaryKpi}>
              <Text style={styles.salaryLabel}>Avg / Shop</Text>
              <Text style={styles.salaryValue}>
                {analyticsLoading ? '...' : shortCurrency(analytics?.averageSalaryPerActiveShop ?? 0)}
              </Text>
            </View>
          </View>
          <SalaryTrendGraph
            loading={analyticsLoading}
            points={analytics?.salaryTrend ?? []}
            lineColor={colors.primary}
            yLabel="Salary"
            xLabel="Month"
          />
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

function SalaryTrendGraph({
  loading,
  points,
  lineColor,
  yLabel,
  xLabel,
}: {
  loading: boolean;
  points: { month: string; total: number }[];
  lineColor: string;
  yLabel: string;
  xLabel: string;
}) {
  const { width } = useWindowDimensions();

  if (loading) {
    return (
      <View style={styles.graphLoading}>
        <Text style={styles.graphHint}>Loading salary trend...</Text>
      </View>
    );
  }

  if (!points.length) {
    return (
      <View style={styles.graphLoading}>
        <Text style={styles.graphHint}>No salary data available yet.</Text>
      </View>
    );
  }

  const max = Math.max(...points.map(point => point.total), 1);
  const min = 0;
  const range = Math.max(max - min, 1);
  const graphHeight = 180;
  const graphWidth = Math.max(200, Math.min(300, width - 140));

  const normalized = points.map((point, index) => {
    const x = points.length > 1 ? (index / (points.length - 1)) * graphWidth : 0;
    const y = graphHeight - ((point.total - min) / range) * graphHeight;
    return { ...point, x, y };
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    y: graphHeight - ratio * graphHeight,
    value: min + ratio * range,
  }));

  return (
    <View style={styles.graphCard}>
      <Text style={styles.axisTitleY}>{yLabel}</Text>
      <View style={[styles.graphAreaWrap, { width: graphWidth + 14 }]}>
        <View style={[styles.axisY, { height: graphHeight }]} />
        <View style={[styles.axisX, { width: graphWidth }]} />
        {yTicks.map(tick => (
          <View key={tick.y} style={[styles.gridLine, { top: tick.y, width: graphWidth }]}>
            <Text style={styles.gridValue}>{shortCurrency(tick.value)}</Text>
          </View>
        ))}
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
                styles.segment,
                {
                  left: prev.x,
                  top: prev.y,
                  width: distance,
                  transform: [{ rotate: `${angle}deg` }],
                  backgroundColor: lineColor,
                },
              ]}
            />
          );
        })}
        {normalized.map(point => (
          <View key={point.month} style={[styles.dot, { left: point.x - 4, top: point.y - 4, borderColor: lineColor }]} />
        ))}
      </View>
      <View style={[styles.xLabels, { width: graphWidth + 14 }]}>
        {normalized.map(point => (
          <Text key={`${point.month}-x`} style={styles.xTick}>
            {point.month.slice(5)}
          </Text>
        ))}
      </View>
      <Text style={styles.axisTitleX}>{xLabel}</Text>
    </View>
  );
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: 'blue' | 'green' | 'red' | 'slate';
}) {
  const bgByTone = {
    blue: '#e6effd',
    green: '#e6f7f1',
    red: '#fdeeee',
    slate: '#eef2f7',
  } as const;

  const textByTone = {
    blue: '#0f4ea8',
    green: '#0c8a69',
    red: '#c43939',
    slate: '#1f2937',
  } as const;

  return (
    <View style={[styles.metricCard, { backgroundColor: bgByTone[tone] }]}>
      <Text style={styles.metricLabel}>{title}</Text>
      <Text style={[styles.metricValue, { color: textByTone[tone] }]}>{value}</Text>
    </View>
  );
}

function BarStat({
  label,
  value,
  ratio,
  fillColor,
}: {
  label: string;
  value: string;
  ratio: number;
  fillColor: string;
}) {
  const safeRatio = Math.max(0, Math.min(100, ratio));
  return (
    <View style={styles.barWrap}>
      <View style={styles.barTopRow}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>{value}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${safeRatio}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 20,
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 18,
    gap: 6,
    minHeight: 132,
    justifyContent: 'center',
  },
  heroGlowTop: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#447ed0',
    opacity: 0.65,
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: -60,
    left: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#215fb8',
    opacity: 0.8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    color: '#d7e7ff',
    lineHeight: 20,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe5f2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  metricValue: {
    marginTop: 8,
    fontWeight: '800',
    fontSize: 28,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
    marginBottom: 8,
  },
  barWrap: {
    gap: 6,
    marginBottom: 10,
  },
  barTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  barValue: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  track: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#e8edf4',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
  },
  analyticsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  miniCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  miniValue: {
    marginTop: 4,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 21,
  },
  salaryHeaderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  salaryKpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  salaryLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  salaryValue: {
    marginTop: 4,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
  },
  graphCard: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  graphLoading: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphHint: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  graphAreaWrap: {
    marginTop: 10,
    marginLeft: 32,
    height: 200,
    position: 'relative',
  },
  axisY: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 2,
    backgroundColor: '#c4ceda',
  },
  axisX: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: '#c4ceda',
  },
  axisTitleY: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  axisTitleX: {
    marginTop: 8,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    borderTopWidth: 1,
    borderTopColor: '#edf1f6',
  },
  gridValue: {
    position: 'absolute',
    left: -70,
    top: -8,
    width: 64,
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  segment: {
    position: 'absolute',
    height: 2.4,
    borderRadius: 2,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 2,
  },
  xLabels: {
    marginLeft: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  xTick: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
});

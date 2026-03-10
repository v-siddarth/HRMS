import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui';
import { useGetAdminDashboardQuery } from '../../store/hrmsApi';
import { colors } from '../../theme/colors';

export function AdminDashboardScreen() {
  const { data, isLoading } = useGetAdminDashboardQuery();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroGlowTop} />
          <View style={styles.heroGlowBottom} />
          <Text style={styles.title}>Super Admin Control Panel</Text>
          <Text style={styles.subtitle}>
            Centralized governance for shop onboarding, status control, and account-level operations.
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <MetricCard title="Total Shops" value={isLoading ? '...' : String(data?.totalShops ?? 0)} tone="blue" />
          <MetricCard title="Active Shops" value={isLoading ? '...' : String(data?.activeShops ?? 0)} tone="green" />
          <MetricCard title="Inactive Shops" value={isLoading ? '...' : String(data?.inactiveShops ?? 0)} tone="red" />
          <MetricCard title="Total Employees" value={isLoading ? '...' : String(data?.totalEmployees ?? 0)} tone="slate" />
        </View>
      </ScrollView>
    </Screen>
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
});

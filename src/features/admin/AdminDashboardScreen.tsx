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
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Admin Rules & Operational Standards</Text>
          <RuleRow text="Create shops only with verified owner name, contact number, and official email." />
          <RuleRow text="Keep inactive shops reviewed monthly and disable access immediately when needed." />
          <RuleRow text="Never share credentials in chat; reset credentials only via secure admin workflow." />
          <RuleRow text="Update shop contact details within 24 hours to keep payroll and attendance communication reliable." />
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
    blue: colors.primarySoft,
    green: colors.successSoft,
    red: colors.dangerSoft,
    slate: colors.surfaceMuted,
  } as const;

  const textByTone = {
    blue: colors.primary,
    green: colors.success,
    red: colors.danger,
    slate: colors.textPrimary,
  } as const;

  return (
    <View style={[styles.metricCard, { backgroundColor: bgByTone[tone] }]}>
      <Text style={styles.metricLabel}>{title}</Text>
      <Text style={[styles.metricValue, { color: textByTone[tone] }]}>{value}</Text>
    </View>
  );
}

function RuleRow({ text }: { text: string }) {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleDot} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 24,
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.primary,
    borderRadius: 22,
    padding: 20,
    gap: 8,
    minHeight: 132,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2f6ec6',
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
    fontSize: 24,
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
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '47.5%',
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
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
  rulesCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  rulesTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 2,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  ruleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  ruleText: {
    flex: 1,
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '600',
  },
});

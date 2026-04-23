import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui';
import { useGetAdminDashboardQuery } from '../../store/hrmsApi';
import { colors } from '../../theme/colors';
import { wp, hp, sp } from '../../utils/responsive';

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
    gap: hp(14),
    paddingBottom: hp(24),
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.primary,
    borderRadius: wp(22),
    padding: wp(20),
    gap: hp(8),
    minHeight: hp(132),
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2f6ec6',
  },
  heroGlowTop: {
    position: 'absolute',
    top: hp(-40),
    right: wp(-20),
    width: wp(150),
    height: wp(150),
    borderRadius: wp(75),
    backgroundColor: '#447ed0',
    opacity: 0.65,
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: hp(-60),
    left: wp(-30),
    width: wp(170),
    height: wp(170),
    borderRadius: wp(85),
    backgroundColor: '#215fb8',
    opacity: 0.8,
  },
  title: {
    fontSize: sp(24),
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    color: '#d7e7ff',
    lineHeight: sp(20),
    fontWeight: '500',
    fontSize: sp(14),
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(12),
    justifyContent: 'space-between',
  },
  metricCard: {
    flex: 1,
    minWidth: wp(100),
    minHeight: hp(112),
    borderRadius: wp(18),
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(12),
    paddingVertical: hp(12),
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: hp(4) },
    shadowRadius: wp(10),
    elevation: 2,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: sp(13),
  },
  metricValue: {
    marginTop: hp(8),
    fontWeight: '800',
    fontSize: sp(28),
    textAlign: 'center',
  },
  rulesCard: {
    backgroundColor: colors.surface,
    borderRadius: wp(18),
    borderWidth: 1,
    borderColor: colors.border,
    padding: wp(16),
    gap: hp(10),
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: hp(4) },
    shadowRadius: wp(10),
    elevation: 2,
  },
  rulesTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: sp(16),
    marginBottom: hp(2),
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(9),
  },
  ruleDot: {
    width: wp(7),
    height: wp(7),
    borderRadius: wp(3.5),
    backgroundColor: colors.primary,
    marginTop: hp(6),
  },
  ruleText: {
    flex: 1,
    color: colors.textSecondary,
    lineHeight: sp(20),
    fontWeight: '600',
    fontSize: sp(14),
  },
});

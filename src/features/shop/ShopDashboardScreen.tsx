import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import { useGetShopByIdQuery, useGetShopDashboardQuery } from '../../store/hrmsApi';
import {
  DATE_FORMAT,
  DISPLAY_DATE_FORMAT,
  DISPLAY_TIME_24H_FORMAT,
  MONTH_FORMAT,
  formatDisplayDate,
} from '../../utils/date';
import { colors } from '../../theme/colors';

type DashboardTone = 'neutral' | 'success' | 'danger' | 'info' | 'warning';

export function ShopDashboardScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = now.format(DATE_FORMAT);
  const monthKey = now.format(MONTH_FORMAT);

  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data, isLoading, refetch } = useGetShopDashboardQuery(
    { shopId, todayDate: todayKey, month: monthKey },
    { skip: !shopId, refetchOnFocus: true, refetchOnMountOrArgChange: true },
  );

  useFocusEffect(
    useCallback(() => {
      if (!shopId) {
        return undefined;
      }
      refetch();
      return undefined;
    }, [refetch, shopId]),
  );

  const activatedOn = shop?.createdAt ? formatDisplayDate(shop.createdAt) : '-';
  const todayLabel = now.format(DISPLAY_DATE_FORMAT);
  const dayName = now.format('dddd');
  const currentTime = now.format(DISPLAY_TIME_24H_FORMAT);
  const lastUpdatedLabel = `${dayName}, ${todayLabel} at ${currentTime}`;

  const openDrawer = () => {
    const parent = navigation.getParent?.();
    if (parent?.openDrawer) {
      parent.openDrawer();
    }
  };

  const stats = useMemo(
    () => [
      {
        label: 'Total Staff',
        value: `${data?.totalStaff ?? 0}`,
        note: 'Registered team members',
        icon: 'people-outline',
        tone: 'neutral' as const,
      },
      {
        label: 'Present Today',
        value: `${data?.presentStaff ?? 0}`,
        note: 'Marked present for today',
        icon: 'checkmark-circle-outline',
        tone: 'success' as const,
      },
      {
        label: 'Attendance Issues',
        value: `${data?.punchErrors ?? 0}`,
        note: 'Punch records needing review',
        icon: 'alert-circle-outline',
        tone: 'danger' as const,
      },
      {
        label: 'Projected Salary This Month',
        value: formatMoney(data?.currentMonthProjectedSalary ?? 0),
        note: 'Estimated monthly payroll',
        icon: 'wallet-outline',
        tone: 'info' as const,
      },
      {
        label: 'Salaries Paid',
        value: `${data?.salaryPaidCount ?? 0}`,
        note: 'Employees marked as paid this month',
        icon: 'receipt-outline',
        tone: 'warning' as const,
      },
      {
        label: 'Advance Payments',
        value: `${data?.advancePaidCount ?? 0}`,
        note: 'Advance payment entries recorded',
        icon: 'cash-outline',
        tone: 'info' as const,
      },
    ],
    [data],
  );

  return (
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.dashboardHeader, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerGlowLarge} />
          <View style={styles.headerGlowSmall} />

          <View style={styles.headerTopRow}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>Shop Dashboard</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]} onPress={openDrawer}>
              <Ionicons name="menu" size={24} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.headerTextBlock}>
            <Text style={styles.shopNameMain} numberOfLines={1}>
              {shop?.shopName ?? 'Shop'}
            </Text>
            <Text style={styles.shopAddressMain} numberOfLines={1}>
              {shop?.address ?? 'Address not available'}
            </Text>
            <Text style={styles.poweredByMain}>Powered Nexora RVM Infotech</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>Today&apos;s Overview</Text>
            <Text style={styles.summaryTitle}>Daily operations at a glance</Text>
            <Text style={styles.summaryText}>
              Review staffing, attendance, and salary highlights from one simple dashboard.
            </Text>

            <View style={styles.summaryMetaRow}>
              <View style={styles.summaryMetaItem}>
                <Text style={styles.summaryMetaLabel}>Active Since</Text>
                <Text style={styles.summaryMetaValue}>{activatedOn}</Text>
              </View>
              <View style={styles.summaryMetaDivider} />
              <View style={styles.summaryMetaItem}>
                <Text style={styles.summaryMetaLabel}>Last Updated</Text>
                <Text style={styles.summaryMetaValue}>{lastUpdatedLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bodyWrap}>
          <View style={styles.grid}>
            {stats.map(item => (
              <View key={item.label} style={styles.metricCard}>
                <View style={[styles.metricAccent, toneAccent(item.tone)]} />
                <View style={styles.metricHeader}>
                  <View style={[styles.metricIconWrap, toneIconWrap(item.tone)]}>
                    <Ionicons name={item.icon} size={18} color={toneIconColor(item.tone)} />
                  </View>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                </View>

                <Text style={[styles.metricValue, item.tone === 'danger' && styles.metricValueDanger]}>
                  {isLoading ? '...' : item.value}
                </Text>
                <Text style={styles.metricNote}>{item.note}</Text>
              </View>
            ))}

            <View style={[styles.metricCard, styles.metricActionCard]}>
              <View style={[styles.metricAccent, styles.metricAccentPrimary]} />
              <View style={styles.metricHeader}>
                <View style={[styles.metricIconWrap, styles.metricIconWrapPrimary]}>
                  <Ionicons name="card-outline" size={18} color={colors.primary} />
                </View>
                <Text style={styles.metricLabel}>Salary Actions</Text>
              </View>

              <Text style={styles.metricActionTitle}>Manage salary and advance records</Text>
              <Text style={styles.metricNote}>Open the salary section to review payments and advance entries.</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open salary"
                style={({ pressed }) => [styles.payAdvanceBtn, pressed && styles.payAdvanceBtnPressed]}
                onPress={() => navigation.navigate('Salary')}>
                <Text style={styles.payAdvanceBtnText}>Open Salary</Text>
              </Pressable>
            </View>

            <View style={[styles.metricCard, styles.metricActionCard]}>
              <View style={[styles.metricAccent, styles.metricAccentSuccess]} />
              <View style={styles.metricHeader}>
                <View style={[styles.metricIconWrap, styles.metricIconWrapSuccess]}>
                  <Ionicons name="calendar-outline" size={18} color={colors.success} />
                </View>
                <Text style={styles.metricLabel}>Attendance Actions</Text>
              </View>

              <Text style={styles.metricActionTitle}>Review attendance and punch updates</Text>
              <Text style={styles.metricNote}>Open attendance to manage daily records and correct punch timings.</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open attendance"
                style={({ pressed }) => [
                  styles.payAdvanceBtn,
                  styles.attendanceBtn,
                  pressed && styles.payAdvanceBtnPressed,
                  pressed && styles.attendanceBtnPressed,
                ]}
                onPress={() => navigation.navigate('Attendance')}>
                <Text style={styles.payAdvanceBtnText}>Open Attendance</Text>
              </Pressable>
            </View>
          </View>

          {!!(data?.punchErrors && data.punchErrors > 0) && (
            <Card>
              <View style={styles.noticeHeader}>
                <Ionicons name="warning-outline" size={18} color={colors.danger} />
                <Text style={styles.punchAlertTitle}>Attendance Attention Required</Text>
              </View>
              <Text style={styles.punchAlertText}>
                {data.punchErrors} staff records need punch correction. Open Attendance to review and update the missing OUT
                time.
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function formatMoney(value: number) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f3f6fb',
  },
  content: {
    paddingBottom: 24,
  },
  dashboardHeader: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: colors.success,
    gap: 14,
  },
  headerGlowLarge: {
    position: 'absolute',
    top: -90,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#30b28b',
    opacity: 0.26,
  },
  headerGlowSmall: {
    position: 'absolute',
    bottom: -120,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#05654d',
    opacity: 0.3,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  menuBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 82, 64, 0.9)',
  },
  menuBtnPressed: {
    backgroundColor: '#085542',
  },
  headerTextBlock: {
    gap: 4,
  },
  shopNameMain: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
  },
  shopAddressMain: {
    color: '#defbf1',
    fontSize: 17,
    fontWeight: '700',
  },
  poweredByMain: {
    color: '#c8f3e8',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(6, 85, 64, 0.32)',
    gap: 8,
  },
  summaryEyebrow: {
    color: '#d6f8ed',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  summaryText: {
    color: '#e8fff7',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  summaryMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  summaryMetaItem: {
    flex: 1,
    gap: 4,
  },
  summaryMetaDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  summaryMetaLabel: {
    color: '#c9f4e7',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryMetaValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  bodyWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '47.5%',
    minHeight: 170,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9e2ee',
    backgroundColor: '#ffffff',
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 2,
  },
  metricActionCard: {
    justifyContent: 'space-between',
  },
  metricAccentSuccess: {
    backgroundColor: colors.success,
  },
  metricAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  metricAccentPrimary: {
    backgroundColor: colors.primary,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconWrapPrimary: {
    backgroundColor: colors.primarySoft,
  },
  metricIconWrapSuccess: {
    backgroundColor: colors.successSoft,
  },
  metricLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  metricValueDanger: {
    color: colors.danger,
  },
  metricActionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  metricNote: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  payAdvanceBtn: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  payAdvanceBtnPressed: {
    backgroundColor: colors.primaryPressed,
  },
  payAdvanceBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  punchAlertTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  punchAlertText: {
    color: '#9f1239',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  attendanceBtn: {
    backgroundColor: colors.success,
  },
  attendanceBtnPressed: {
    backgroundColor: '#0b7258',
  },
});

function toneAccent(tone: DashboardTone) {
  switch (tone) {
    case 'success':
      return { backgroundColor: colors.success };
    case 'danger':
      return { backgroundColor: colors.danger };
    case 'info':
      return { backgroundColor: colors.primary };
    case 'warning':
      return { backgroundColor: colors.warning };
    default:
      return { backgroundColor: colors.borderStrong };
  }
}

function toneIconWrap(tone: DashboardTone) {
  switch (tone) {
    case 'success':
      return { backgroundColor: colors.successSoft };
    case 'danger':
      return { backgroundColor: colors.dangerSoft };
    case 'info':
      return { backgroundColor: colors.primarySoft };
    case 'warning':
      return { backgroundColor: colors.warningSoft };
    default:
      return { backgroundColor: colors.surfaceMuted };
  }
}

function toneIconColor(tone: DashboardTone) {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
    case 'info':
      return colors.primary;
    case 'warning':
      return colors.warning;
    default:
      return colors.textSecondary;
  }
}

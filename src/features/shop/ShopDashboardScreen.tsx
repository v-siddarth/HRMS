import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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

export function ShopDashboardScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const navigation = useNavigation<any>();
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
      void refetch();
      return undefined;
    }, [refetch, shopId]),
  );

  const activatedOn = shop?.createdAt ? formatDisplayDate(shop.createdAt) : '-';
  const todayLabel = now.format(DISPLAY_DATE_FORMAT);
  const dayName = now.format('dddd');
  const currentTime = now.format(DISPLAY_TIME_24H_FORMAT);
  const openDrawer = () => {
    const parent = navigation.getParent?.();
    if (parent?.openDrawer) {
      parent.openDrawer();
    }
  };

  const stats = useMemo(
    () => [
      { label: 'Total Staff', value: `${data?.totalStaff ?? 0}`, emphasis: 'normal' as const, tone: 'slate' as const },
      { label: 'Present Staff', value: `${data?.presentStaff ?? 0}`, emphasis: 'normal' as const, tone: 'green' as const },
      { label: 'Error in Punch', value: `${data?.punchErrors ?? 0}`, emphasis: 'danger' as const, tone: 'red' as const },
      {
        label: 'Current Month Projected Salary',
        value: formatMoney(data?.currentMonthProjectedSalary ?? 0),
        emphasis: 'normal' as const,
        tone: 'blue' as const,
      },
      {
        label: 'Advance Salary Paid',
        value: formatMoney(data?.advanceSalaryPaid ?? 0),
        emphasis: 'normal' as const,
        tone: 'amber' as const,
      },
    ],
    [data],
  );

  return (
    <View style={styles.page}>
      <StatusBar backgroundColor="#0b8f6d" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.dashboardHeader}>
          <View style={styles.headerGradientBase} />
          <View style={styles.headerGradientMid} />
          <View style={styles.headerGradientGlowTop} />
          <View style={styles.headerGradientGlowBottom} />
          <View style={styles.headerMainRow}>
            <View style={styles.headerMainTextWrap}>
              <Text style={styles.shopNameMain} numberOfLines={1}>
                {shop?.shopName ?? 'Shop'}
              </Text>
              <Text style={styles.shopAddressMain} numberOfLines={1}>
                {shop?.address ?? '-'}
              </Text>
              <Text style={styles.poweredByMain} numberOfLines={1}>
                Powered by RVM Attend
              </Text>
            </View>
            <Pressable style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]} onPress={openDrawer}>
              <Text style={styles.menuBtnText}>☰</Text>
            </Pressable>
          </View>

          <View style={styles.headerSubBlock}>
            <Text style={styles.smallTitle}>Home</Text>
            <Text style={styles.smallMeta}>Shop Activated: {activatedOn}</Text>
            <Text style={styles.smallMeta}>{`Date: ${todayLabel} | ${dayName} | ${currentTime}`}</Text>
          </View>
        </View>

        <View style={styles.bodyWrap}>
          <View style={styles.grid}>
            {stats.map(item => (
              <View key={item.label} style={[styles.metricCard, toneCard(item.tone)]}>
                <View style={styles.metricTop}>
                  <Text style={[styles.metricValue, item.emphasis === 'danger' ? styles.metricValueDanger : undefined]}>
                    {isLoading ? '...' : item.value}
                  </Text>
                </View>
                <View style={styles.metricBottom}>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                </View>
              </View>
            ))}

            <View style={[styles.metricCard, styles.metricCardPay]}>
              <View style={styles.metricTop}>
                <Text style={styles.metricValue}>PAY</Text>
              </View>
              <View style={styles.metricBottom}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Advance Paid"
                  style={({ pressed }) => [styles.payAdvanceBtn, pressed && styles.payAdvanceBtnPressed]}
                  onPress={() => navigation.navigate('Salary')}>
                  <Text style={styles.payAdvanceBtnText}>Advance Paid</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <Card>
            <Text style={styles.superAdminTitle}>Super Admin Message</Text>
            <Text style={styles.superAdminMessage}>No active message right now.</Text>
          </Card>

          {!!(data?.punchErrors && data.punchErrors > 0) && (
            <Card>
              <Text style={styles.punchAlertTitle}>Punch Error Alert</Text>
              <Text style={styles.punchAlertText}>
                {data.punchErrors} staff have missing punch OUT time. Please open Attendance and correct the punch record.
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
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 20,
  },
  dashboardHeader: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#0e8f6f',
    backgroundColor: '#0c8a69',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
    overflow: 'hidden',
  },
  bodyWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  headerGradientBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b8f6d',
  },
  headerGradientMid: {
    ...StyleSheet.absoluteFillObject,
    top: '36%',
    backgroundColor: '#0a7e60',
  },
  headerGradientGlowTop: {
    position: 'absolute',
    top: -80,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#3ac39f',
    opacity: 0.36,
  },
  headerGradientGlowBottom: {
    position: 'absolute',
    bottom: -95,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#06644d',
    opacity: 0.52,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMainTextWrap: {
    flex: 1,
    gap: 2,
  },
  shopNameMain: {
    fontSize: 34,
    fontWeight: '900',
    color: '#ffffff',
  },
  shopAddressMain: {
    color: '#d9fff2',
    fontSize: 16,
    fontWeight: '700',
  },
  poweredByMain: {
    color: '#c8f6e6',
    fontSize: 14,
    fontWeight: '700',
  },
  menuBtn: {
    backgroundColor: '#0a6f55',
    borderRadius: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnPressed: {
    backgroundColor: '#085542',
  },
  menuBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  headerSubBlock: {
    borderTopWidth: 1,
    borderTopColor: '#63c9aa',
    paddingTop: 10,
    gap: 3,
  },
  smallTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  smallMeta: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dffbf1',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '47.5%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    minHeight: 132,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 1,
  },
  metricCardPay: {
    backgroundColor: '#edf4ff',
  },
  metricTop: {
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  metricBottom: {
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  metricValue: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  metricValueDanger: {
    color: '#b42318',
  },
  metricLabel: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  payAdvanceBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    minHeight: 42,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payAdvanceBtnPressed: {
    backgroundColor: colors.primaryPressed,
  },
  payAdvanceBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  superAdminTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  superAdminMessage: {
    color: '#4b5563',
    fontWeight: '600',
  },
  punchAlertTitle: {
    color: '#991b1b',
    fontWeight: '900',
    fontSize: 15,
  },
  punchAlertText: {
    color: '#b42318',
    fontWeight: '600',
    lineHeight: 20,
  },
});

function toneCard(tone: 'slate' | 'green' | 'red' | 'blue' | 'amber') {
  switch (tone) {
    case 'green':
      return { backgroundColor: colors.successSoft };
    case 'red':
      return { backgroundColor: colors.dangerSoft };
    case 'blue':
      return { backgroundColor: '#edf4ff' };
    case 'amber':
      return { backgroundColor: colors.warningSoft };
    default:
      return { backgroundColor: '#f5f7fb' };
  }
}

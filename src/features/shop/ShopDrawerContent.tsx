import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logout } from '../../services/authService';
import { clearSession } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors } from '../../theme/colors';
import {
  hrmsApi,
  useGetAttendanceByDateQuery,
  useGetBiometricSettingsQuery,
  useGetEmployeesQuery,
  useGetShopByIdQuery,
} from '../../store/hrmsApi';
import { todayDate } from '../../utils/date';

export function ShopDrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const dispatch = useAppDispatch();
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: biometric } = useGetBiometricSettingsQuery(shopId, { skip: !shopId });
  const { data: todayAttendance = [] } = useGetAttendanceByDateQuery(
    { shopId, date: todayDate() },
    { skip: !shopId },
  );

  const todayMarked = todayAttendance.length;
  const activeRouteName = props.state.routeNames[props.state.index];
  const biometricStatus = biometric?.enabled ? 'Enabled' : 'Disabled';

  const navigateTo = (routeName: 'ShopProfile' | 'ShopSettings' | 'ShopSupport') => {
    props.navigation.navigate(routeName);
    props.navigation.closeDrawer();
  };

  const handleLogout = async () => {
    try {
      dispatch(hrmsApi.util.resetApiState());
      await logout();
      dispatch(clearSession());
    } catch (error) {
      Alert.alert('Logout failed', (error as Error).message);
    }
  };

  return (
    <DrawerContentScrollView
      {...props}
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: 0,
          paddingBottom: Math.max(insets.bottom, 18),
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.drawerShell}>
        <View
          style={[
            styles.heroCard,
            {
              paddingTop: insets.top + 18,
            },
          ]}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <View style={styles.heroTopRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>{(shop?.shopName?.[0] ?? user?.email?.[0] ?? 'S').toUpperCase()}</Text>
            </View>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#d7fff2" />
              <Text style={styles.roleBadgeText}>Shop Manager</Text>
            </View>
          </View>
          <Text style={styles.heading}>{shop?.shopName ?? 'Shop Panel'}</Text>
          <Text style={styles.subText}>{user?.email ?? 'Manager'}</Text>
          <Text style={styles.subtleText}>Shop ID: {user?.shopId ?? '-'}</Text>

          <View style={styles.heroMetaRow}>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Team</Text>
              <Text style={styles.metricValue}>{employees.length}</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Marked</Text>
              <Text style={styles.metricValue}>{todayMarked}</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Bio</Text>
              <Text style={styles.metricValue}>{biometric?.enabled ? 'On' : 'Off'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionEyebrow}>Workspace</Text>
          <Text style={styles.sectionTitle}>Manage your account and store tools</Text>

          <MenuTile
            icon="person-circle-outline"
            title="Profile"
            subtitle="Update business details and account security"
            active={activeRouteName === 'ShopProfile'}
            onPress={() => navigateTo('ShopProfile')}
          />
          <MenuTile
            icon="settings-outline"
            title="Settings"
            subtitle="Control payroll, biometric, and shop preferences"
            active={activeRouteName === 'ShopSettings'}
            onPress={() => navigateTo('ShopSettings')}
          />
          <MenuTile
            icon="headset-outline"
            title="Support & Security"
            subtitle="Get help, access guidance, and protect operations"
            active={activeRouteName === 'ShopSupport'}
            onPress={() => navigateTo('ShopSupport')}
          />
        </View>

        <View style={styles.sectionBlock}>
          <MenuTile
            icon="finger-print-outline"
            title="Biometric Sync"
            subtitle={`Status: ${biometricStatus}`}
            active={false}
            onPress={() => navigateTo('ShopSettings')}
          />
        </View>

        <View style={styles.footerBlock}>
          <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
          <Text style={styles.footerNote}>Bottom tabs handle Home, Staff, Attendance, Salary, and Reports.</Text>
        </View>
      </View>
    </DrawerContentScrollView>
  );
}

function MenuTile({
  active,
  icon,
  onPress,
  subtitle,
  title,
}: {
  active?: boolean;
  icon: string;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.menuTile, active && styles.menuTileActive, pressed && styles.menuTilePressed]}>
      <View style={[styles.menuIconWrap, active && styles.menuIconWrapActive]}>
        <Ionicons name={icon} size={20} color={active ? colors.success : colors.textSecondary} />
      </View>
      <View style={styles.menuBody}>
        <Text style={[styles.menuTitle, active && styles.menuTitleActive]}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={18} color={active ? colors.success : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: 'transparent',
  },
  drawerShell: {
    flex: 1,
    gap: 16,
    backgroundColor: '#eef5fb',
    paddingBottom: 18,
  },
  heroCard: {
    overflow: 'hidden',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 30,
    backgroundColor: '#0a6c57',
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 8,
  },
  heroGlowOne: {
    position: 'absolute',
    top: -30,
    right: -18,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroGlowTwo: {
    position: 'absolute',
    bottom: -38,
    left: -20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(17, 94, 74, 0.46)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  roleBadgeText: {
    color: '#e9fff8',
    fontSize: 11,
    fontWeight: '800',
  },
  heading: {
    fontSize: 25,
    color: '#fff',
    fontWeight: '900',
    lineHeight: 29,
  },
  subText: {
    color: '#dcfff3',
    fontWeight: '700',
    fontSize: 14,
  },
  subtleText: {
    color: '#b9efe0',
    fontWeight: '600',
    fontSize: 12,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  metricPill: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
  },
  metricLabel: {
    color: '#c8f5e7',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '900',
  },
  sectionBlock: {
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  sectionEyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  menuTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dde7f1',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 96,
  },
  menuTileActive: {
    borderColor: '#a9dfcb',
    backgroundColor: '#f2fbf7',
  },
  menuTilePressed: {
    opacity: 0.88,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  menuIconWrapActive: {
    backgroundColor: '#dcf5ec',
  },
  menuBody: {
    flex: 1,
  },
  menuTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  menuTitleActive: {
    color: colors.success,
  },
  menuSubtitle: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 17,
  },
  footerBlock: {
    gap: 10,
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 0,
  },
  logoutButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButtonPressed: {
    backgroundColor: '#ab2626',
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  footerNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
});
